import type { DecoratorMapping } from '../core/types'
import type { DecoratorCompiler } from './types'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { getDiscoveredDecoratorMappings } from '@quajs/engine'
import { mergeDecoratorMappings } from '../core/types'
import { createDefaultDecoratorCompilerRegistry, DecoratorCompilerRegistry } from './registry'

const requireFromFile = createRequire(import.meta.url)

const DECORATOR_PACKAGE_PATTERNS = [
  /^@quajs\/plugin-/,
  /^quajs-plugin-/,
  /^@quajs\/character$/,
]

const compilerModuleCache = new Map<string, DecoratorCompiler[]>()

export function loadPackageDecoratorMappingsSync(projectRoot?: string): DecoratorMapping {
  const root = projectRoot || process.cwd()
  const packageJson = readJSONFile(resolve(root, 'package.json'))
  if (!packageJson) {
    return {}
  }

  const dependencies = collectDependencies(packageJson)
  const mappings: DecoratorMapping = {}

  Object.keys(dependencies)
    .filter(shouldInspectPackage)
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
    return mergeDecoratorMappings({
      ...packageMappings,
      ...discoveredMappings,
    })
  }
  catch {
    return mergeDecoratorMappings(packageMappings)
  }
}

export async function loadDecoratorCompilerRegistry(
  decoratorMappings: DecoratorMapping = {},
  options: {
    includeDefaultCompilers?: boolean
  } = {},
): Promise<DecoratorCompilerRegistry> {
  const registry = options.includeDefaultCompilers === false
    ? new DecoratorCompilerRegistry()
    : createDefaultDecoratorCompilerRegistry()

  const moduleNames = new Set<string>()

  Object.values(decoratorMappings).forEach((mapping) => {
    if (mapping.module && mapping.module !== '@quajs/engine') {
      moduleNames.add(mapping.module)
    }
  })

  for (const moduleName of moduleNames) {
    if (registry.hasCompilerModule(moduleName)) {
      continue
    }

    const compilers = await loadDecoratorCompilersFromModule(moduleName)
    compilers.forEach(compiler => registry.register(compiler))
  }

  return registry
}

export function clearDecoratorCompilerCache(): void {
  compilerModuleCache.clear()
}

function collectDependencies(packageJson: any): Record<string, string> {
  return {
    ...(packageJson.dependencies || {}),
    ...(packageJson.devDependencies || {}),
    ...(packageJson.peerDependencies || {}),
    ...(packageJson.optionalDependencies || {}),
  }
}

function shouldInspectPackage(packageName: string): boolean {
  return DECORATOR_PACKAGE_PATTERNS.some(pattern => pattern.test(packageName))
}

function readPackageDecoratorMappings(packageName: string, projectRoot: string): DecoratorMapping {
  const packageJsonPath = resolvePackageJsonPath(packageName, projectRoot)
  if (!packageJsonPath) {
    return {}
  }

  try {
    const packageJson = readJSONFile(packageJsonPath)
    const decorators = packageJson?.quajs?.decorators || packageJson?.decorators
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

async function loadDecoratorCompilersFromModule(moduleName: string): Promise<DecoratorCompiler[]> {
  const cached = compilerModuleCache.get(moduleName)
  if (cached) {
    return cached
  }

  const candidates = [
    `${moduleName}/script-compiler`,
    moduleName,
  ]

  for (const candidate of candidates) {
    try {
      const moduleExports = await import(candidate)
      const compilers = extractDecoratorCompilers(moduleExports)
      if (compilers.length > 0) {
        compilerModuleCache.set(moduleName, compilers)
        return compilers
      }
    }
    catch {
      // Try the next candidate
    }
  }

  compilerModuleCache.set(moduleName, [])
  return []
}

function extractDecoratorCompilers(moduleExports: any): DecoratorCompiler[] {
  const compilers: DecoratorCompiler[] = []

  collectCompilerCandidates(compilers, moduleExports?.default)
  collectCompilerCandidates(compilers, moduleExports?.scriptCompiler)
  collectCompilerCandidates(compilers, moduleExports?.decoratorCompiler)
  collectCompilerCandidates(compilers, moduleExports?.decoratorCompilers)
  collectCompilerCandidates(compilers, typeof moduleExports?.createScriptCompiler === 'function'
    ? moduleExports.createScriptCompiler()
    : undefined)
  collectCompilerCandidates(compilers, typeof moduleExports?.createDecoratorCompiler === 'function'
    ? moduleExports.createDecoratorCompiler()
    : undefined)

  return compilers
}

function collectCompilerCandidates(target: DecoratorCompiler[], value: unknown): void {
  if (!value) {
    return
  }

  if (Array.isArray(value)) {
    value.forEach(item => collectCompilerCandidates(target, item))
    return
  }

  if (isDecoratorCompiler(value)) {
    target.push(value)
    return
  }

  if (typeof value === 'object') {
    const maybeContainer = value as {
      compilers?: unknown[]
      compiler?: unknown
      scriptCompiler?: unknown
      decoratorCompiler?: unknown
      decoratorCompilers?: unknown
    }
    if (maybeContainer.compilers) {
      collectCompilerCandidates(target, maybeContainer.compilers)
    }
    if (maybeContainer.compiler) {
      collectCompilerCandidates(target, maybeContainer.compiler)
    }
    if (maybeContainer.scriptCompiler) {
      collectCompilerCandidates(target, maybeContainer.scriptCompiler)
    }
    if (maybeContainer.decoratorCompiler) {
      collectCompilerCandidates(target, maybeContainer.decoratorCompiler)
    }
    if (maybeContainer.decoratorCompilers) {
      collectCompilerCandidates(target, maybeContainer.decoratorCompilers)
    }
  }
}

function isDecoratorCompiler(value: unknown): value is DecoratorCompiler {
  return Boolean(
    typeof value === 'object'
    && value !== null
    && 'supports' in value
    && 'compile' in value,
  )
}
