import type { DecoratorMapping } from '../core/types'
import type { DecoratorCompiler, DecoratorCompilerContribution } from './types'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import {
  discoverPluginsSync,
  getDiscoveredDecoratorMappingsSync,
  mergeDecoratorMappings as mergeDiscoveredDecoratorMappings,
} from '@quajs/plugin-discovery'

const requireFromFile = createRequire(import.meta.url)

export function loadPackageDecoratorMappingsSync(projectRoot?: string): DecoratorMapping {
  const root = projectRoot || process.cwd()
  const packageJson = readJSONFile(resolve(root, 'package.json'))
  if (!packageJson) {
    return {}
  }

  const dependencies = collectDependencies(packageJson)
  const mappings: DecoratorMapping[] = []

  Object.keys(dependencies)
    .forEach((packageName) => {
      const packageDecoratorMappings = readPackageDecoratorMappings(packageName, root)
      if (Object.keys(packageDecoratorMappings).length > 0) {
        mappings.push(packageDecoratorMappings)
      }
    })

  return mergeDiscoveredDecoratorMappings(...mappings)
}

export async function loadProjectDecoratorMappings(projectRoot?: string): Promise<DecoratorMapping> {
  return loadProjectDecoratorMappingsSync(projectRoot)
}

export function loadProjectDecoratorMappingsSync(projectRoot?: string): DecoratorMapping {
  const packageMappings = loadPackageDecoratorMappingsSync(projectRoot)
  const discoveredMappings = getDiscoveredDecoratorMappingsSync(projectRoot)
  return mergeDiscoveredDecoratorMappings(packageMappings, discoveredMappings)
}

export async function loadProjectDecoratorCompilers(projectRoot?: string): Promise<DecoratorCompiler[]> {
  const root = projectRoot || process.cwd()
  const modules = collectScriptCompilerModules(root)
  const compilers: DecoratorCompiler[] = []

  for (const moduleName of modules) {
    try {
      const contribution = await import(moduleName) as DecoratorCompilerContribution
      compilers.push(...readContributionCompilers(contribution))
    }
    catch {
      // Decorator mappings still work through generic runtime calls when a
      // package has no package-local compiler or cannot be loaded in tooling.
    }
  }

  return compilers
}

export function loadProjectDecoratorCompilersSync(projectRoot?: string): DecoratorCompiler[] {
  const root = projectRoot || process.cwd()
  const modules = collectScriptCompilerModules(root)
  const compilers: DecoratorCompiler[] = []

  for (const moduleName of modules) {
    try {
      const contribution = requireFromFile(moduleName) as DecoratorCompilerContribution
      compilers.push(...readContributionCompilers(contribution))
    }
    catch {
      // See async loader comment.
    }
  }

  return compilers
}

function collectDependencies(packageJson: any): Record<string, string> {
  return {
    ...(packageJson.dependencies || {}),
    ...(packageJson.devDependencies || {}),
    ...(packageJson.peerDependencies || {}),
    ...(packageJson.optionalDependencies || {}),
  }
}

function readPackageDecoratorMappings(packageName: string, projectRoot: string): DecoratorMapping {
  const packageJsonPath = resolvePackageJsonPath(packageName, projectRoot)
  if (!packageJsonPath) {
    return {}
  }

  try {
    const packageJson = readJSONFile(packageJsonPath)
    const decorators = packageJson?.quajs?.decorators
    return isDecoratorMapping(decorators) ? decorators : {}
  }
  catch {
    return {}
  }
}

function collectScriptCompilerModules(projectRoot: string): string[] {
  const modules = new Set<string>()
  const plugins = discoverPluginsSync(projectRoot)
  plugins.forEach((plugin) => {
    if (!plugin.name || !plugin.decorators || Object.keys(plugin.decorators).length === 0) {
      return
    }
    modules.add(`${plugin.name}/script-compiler`)
  })
  return [...modules]
}

function readContributionCompilers(contribution: DecoratorCompilerContribution): DecoratorCompiler[] {
  return [
    ...asCompilerArray(contribution.compilers),
    ...asCompilerArray(contribution.scriptCompiler?.compilers),
  ]
}

function asCompilerArray(compilers: DecoratorCompilerContribution['compilers']): DecoratorCompiler[] {
  return Array.isArray(compilers) ? [...compilers] : []
}

function resolvePackageJsonPath(packageName: string, projectRoot: string): string | undefined {
  let current = projectRoot

  while (true) {
    const candidate = resolve(current, 'node_modules', packageName, 'package.json')
    if (existsSync(candidate)) {
      return candidate
    }

    const parent = dirname(current)
    if (parent === current) {
      break
    }
    current = parent
  }

  try {
    return requireFromFile.resolve(`${packageName}/package.json`)
  }
  catch {
    return undefined
  }
}

function readJSONFile(path: string): any | undefined {
  if (!existsSync(path)) {
    return undefined
  }

  try {
    return JSON.parse(readFileSync(path, 'utf-8'))
  }
  catch {
    return undefined
  }
}

function isDecoratorMapping(value: unknown): value is DecoratorMapping {
  return typeof value === 'object' && value !== null
}
