import type { DecoratorMapping } from '../core/types'
import type { DecoratorCompiler, DecoratorCompilerContribution } from './types'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { scriptCompiler as characterScriptCompiler } from '@quajs/character/script-compiler'
import { scriptCompiler as achievementScriptCompiler } from '@quajs/plugin-achievement/script-compiler'
import { scriptCompiler as animationScriptCompiler } from '@quajs/plugin-animation/script-compiler'
import { scriptCompiler as audioScriptCompiler } from '@quajs/plugin-audio/script-compiler'
import { scriptCompiler as backgroundScriptCompiler } from '@quajs/plugin-background/script-compiler'
import { scriptCompiler as backlogScriptCompiler } from '@quajs/plugin-backlog/script-compiler'
import { scriptCompiler as galleryScriptCompiler } from '@quajs/plugin-gallery/script-compiler'
import { scriptCompiler as storyGraphScriptCompiler } from '@quajs/story-graph/script-compiler'
import {
  getDiscoveredDecoratorMappingsSync,
  mergeDecoratorMappings as mergeDiscoveredDecoratorMappings,
} from '@quajs/plugin-discovery'

const requireFromFile = createRequire(import.meta.url)
const BUILTIN_DECORATOR_COMPILERS = new Map<string, readonly DecoratorCompiler[]>([
  ['@quajs/character/script-compiler', characterScriptCompiler.compilers],
  ['@quajs/story-graph/script-compiler', storyGraphScriptCompiler.compilers],
  ['@quajs/plugin-achievement/script-compiler', achievementScriptCompiler.compilers],
  ['@quajs/plugin-animation/script-compiler', animationScriptCompiler.compilers],
  ['@quajs/plugin-audio/script-compiler', audioScriptCompiler.compilers],
  ['@quajs/plugin-background/script-compiler', backgroundScriptCompiler.compilers],
  ['@quajs/plugin-backlog/script-compiler', backlogScriptCompiler.compilers],
  ['@quajs/plugin-gallery/script-compiler', galleryScriptCompiler.compilers],
])

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
    const builtin = BUILTIN_DECORATOR_COMPILERS.get(moduleName)
    if (builtin) {
      compilers.push(...builtin)
      continue
    }
    try {
      const contribution = await import(moduleName) as DecoratorCompilerContribution
      if (Array.isArray(contribution.compilers)) {
        compilers.push(...contribution.compilers)
      }
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
    const builtin = BUILTIN_DECORATOR_COMPILERS.get(moduleName)
    if (builtin) {
      compilers.push(...builtin)
      continue
    }
    try {
      const contribution = requireFromFile(moduleName) as DecoratorCompilerContribution
      if (Array.isArray(contribution.compilers)) {
        compilers.push(...contribution.compilers)
      }
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
  const packageJson = readJSONFile(resolve(projectRoot, 'package.json'))
  const modules = new Set([
    '@quajs/character/script-compiler',
    '@quajs/story-graph/script-compiler',
  ])
  if (!packageJson) {
    return defaultScriptCompilerModules()
  }

  const dependencies = collectDependencies(packageJson)
  Object.keys(dependencies).forEach((packageName) => {
    const moduleName = readPackageScriptCompilerModule(packageName, projectRoot)
    if (moduleName) {
      modules.add(moduleName)
    }
  })
  return [...modules]
}

function defaultScriptCompilerModules(): string[] {
  return [
    '@quajs/character/script-compiler',
    '@quajs/story-graph/script-compiler',
    '@quajs/plugin-achievement/script-compiler',
    '@quajs/plugin-animation/script-compiler',
    '@quajs/plugin-audio/script-compiler',
    '@quajs/plugin-background/script-compiler',
    '@quajs/plugin-backlog/script-compiler',
    '@quajs/plugin-gallery/script-compiler',
  ]
}

function readPackageScriptCompilerModule(packageName: string, projectRoot: string): string | undefined {
  const packageJsonPath = resolvePackageJsonPath(packageName, projectRoot)
  if (!packageJsonPath) {
    return undefined
  }
  const packageJson = readJSONFile(packageJsonPath)
  if (!packageJson?.quajs?.decorators) {
    return undefined
  }
  return `${packageName}/script-compiler`
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
