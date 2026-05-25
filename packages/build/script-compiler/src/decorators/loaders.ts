import type { DecoratorMapping } from '../core/types'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { getDiscoveredDecoratorMappings } from '@quajs/plugin-discovery'

const requireFromFile = createRequire(import.meta.url)

export function loadPackageDecoratorMappingsSync(projectRoot?: string): DecoratorMapping {
  const root = projectRoot || process.cwd()
  const packageJson = readJSONFile(resolve(root, 'package.json'))
  if (!packageJson) {
    return {}
  }

  const dependencies = collectDependencies(packageJson)
  const mappings: DecoratorMapping = {}

  Object.keys(dependencies)
    .forEach((packageName) => {
      const packageDecoratorMappings = readPackageDecoratorMappings(packageName, root)
      Object.assign(mappings, packageDecoratorMappings)
    })

  return mappings
}

export async function loadProjectDecoratorMappings(projectRoot?: string): Promise<DecoratorMapping> {
  const packageMappings = loadPackageDecoratorMappingsSync(projectRoot)

  try {
    const discoveredMappings = await getDiscoveredDecoratorMappings(projectRoot)
    return {
      ...packageMappings,
      ...discoveredMappings,
    }
  }
  catch {
    return packageMappings
  }
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
