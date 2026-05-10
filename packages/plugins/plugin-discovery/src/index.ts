import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import process from 'node:process'

/**
 * Decorator mapping interface
 */
export interface DecoratorMapping {
  [decoratorName: string]: {
    function: string
    module: string
    [key: string]: any
  }
}

/**
 * Renderer entry mapping interface
 */
export interface RendererEntryMap {
  [renderer: string]: string
}

/**
 * Plugin metadata shared across package.json and custom registries.
 */
export interface QuaPluginMetadata {
  type?: 'plugin' | 'feature' | string
  category?: string
  description?: string
  engineVersion?: string
  entry?: string
  decorators?: DecoratorMapping
  apis?: string[]
  provides?: string[]
  requires?: string[]
  renderer?: RendererEntryMap
  [key: string]: any
}

/**
 * Plugin configuration interface
 */
export interface PluginConfig {
  source?: 'custom' | 'package'
  name: string
  version?: string
  main?: string
  entry?: string
  decorators?: DecoratorMapping
  apis?: string[]
  provides?: string[]
  requires?: string[]
  renderer?: RendererEntryMap
  quajs?: QuaPluginMetadata
  dependencies?: string[]
  description?: string
  category?: string
  packageJsonPath?: string
  [key: string]: any
}

/**
 * Plugin discovery configuration
 */
export interface PluginDiscoveryConfig {
  plugins: PluginConfig[]
  [key: string]: any
}

/**
 * Default plugin discovery locations
 */
const DEFAULT_PLUGIN_PATHS = [
  'qua.plugins.json',
  'plugins/qua.plugins.json',
  '.qua/plugins.json',
]

/**
 * Discover and load plugin configurations
 */
export async function discoverPlugins(projectRoot?: string): Promise<PluginConfig[]> {
  const root = projectRoot || process.cwd()
  const discovered = new Map<string, PluginConfig>()

  for (const pluginPath of DEFAULT_PLUGIN_PATHS) {
    const configPath = resolve(root, pluginPath)
    if (!existsSync(configPath)) {
      continue
    }

    try {
      const configContent = readFileSync(configPath, 'utf-8')
      const config: PluginDiscoveryConfig = JSON.parse(configContent)
      if (config.plugins && Array.isArray(config.plugins)) {
        for (const plugin of config.plugins) {
          const normalized = normalizePluginConfig(plugin, 'custom')
          discovered.set(normalized.name, normalized)
        }
      }
    }
    catch (error) {
      console.warn(`Failed to parse plugin config at ${configPath}:`, error)
    }
  }

  const packageJsonPath = resolve(root, 'package.json')
  if (existsSync(packageJsonPath)) {
    try {
      const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'))
      const pluginDeps = findPluginDependencies(packageJson, root)
      for (const plugin of pluginDeps) {
        discovered.set(plugin.name, plugin)
      }
    }
    catch (error) {
      console.warn(`Failed to parse package.json at ${packageJsonPath}:`, error)
    }
  }

  return sortPluginsByDependencies([...discovered.values()])
}

/**
 * Extract decorator mappings from discovered plugins
 */
export async function getDiscoveredDecoratorMappings(projectRoot?: string): Promise<DecoratorMapping> {
  const plugins = await discoverPlugins(projectRoot)
  const mappings: DecoratorMapping = {}

  for (const plugin of plugins) {
    if (plugin.decorators) {
      Object.assign(mappings, plugin.decorators)
    }
  }

  return mappings
}

/**
 * Load a specific plugin by name
 */
export async function loadPlugin(pluginName: string, projectRoot?: string): Promise<PluginConfig | null> {
  const plugins = await discoverPlugins(projectRoot)
  return plugins.find(plugin => plugin.name === pluginName) || null
}

/**
 * Get all available plugin names
 */
export async function getAvailablePlugins(projectRoot?: string): Promise<string[]> {
  const plugins = await discoverPlugins(projectRoot)
  return plugins.map(plugin => plugin.name)
}

/**
 * Validate capability requirements declared through quajs.requires/provides.
 */
export function validatePluginDependencies(plugins: readonly PluginConfig[]): void {
  const providers = createCapabilityProviderMap(plugins)
  const missing: Array<{ plugin: string, capability: string }> = []

  for (const plugin of plugins) {
    for (const capability of plugin.requires || []) {
      if (!providers.has(capability)) {
        missing.push({ plugin: plugin.name, capability })
      }
    }
  }

  if (missing.length > 0) {
    throw new Error([
      'Missing Qua plugin capabilities:',
      ...missing.map(item => `- ${item.plugin} requires ${item.capability}`),
    ].join('\n'))
  }
}

/**
 * Sort plugins so capability providers are initialized before consumers.
 */
export function sortPluginsByDependencies(plugins: readonly PluginConfig[]): PluginConfig[] {
  validatePluginDependencies(plugins)

  const providers = createCapabilityProviderMap(plugins)
  const remaining = [...plugins]
  const ordered: PluginConfig[] = []
  const orderedNames = new Set<string>()

  while (remaining.length > 0) {
    let progressed = false

    for (let index = 0; index < remaining.length; index++) {
      const plugin = remaining[index]
      const ready = (plugin.requires || []).every((capability) => {
        const provider = providers.get(capability)
        return !provider || provider.name === plugin.name || orderedNames.has(provider.name)
      })

      if (!ready) {
        continue
      }

      ordered.push(plugin)
      orderedNames.add(plugin.name)
      remaining.splice(index, 1)
      progressed = true
      index -= 1
    }

    if (!progressed) {
      throw new Error(`Circular Qua plugin capability dependency detected: ${remaining.map(plugin => plugin.name).join(', ')}`)
    }
  }

  return ordered
}

/**
 * Find plugin dependencies in package.json
 */
function findPluginDependencies(packageJson: any, projectRoot: string): PluginConfig[] {
  const plugins: PluginConfig[] = []
  const dependencies = {
    ...packageJson.dependencies,
    ...packageJson.devDependencies,
    ...packageJson.peerDependencies,
  }

  for (const [name, version] of Object.entries(dependencies)) {
    const packageConfig = readPluginPackageConfig(name, projectRoot)
    if (packageConfig) {
      plugins.push(normalizePluginConfig({
        name,
        version: version as string,
        ...packageConfig,
        main: packageConfig.main || resolvePluginMain(name),
      }, 'package'))
    }
  }

  return plugins
}

function readPluginPackageConfig(packageName: string, projectRoot: string): Partial<PluginConfig> | null {
  const packageJsonPath = resolvePackageJson(packageName, projectRoot)
  if (!packageJsonPath) {
    return isQuaPackageName(packageName)
      ? {
          main: resolvePluginMain(packageName),
        }
      : null
  }

  try {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'))
    if (!packageJson.quajs && !isQuaPackageName(packageName)) {
      return null
    }

    return {
      main: packageJson.quajs?.entry || packageJson.main || packageJson.module,
      decorators: packageJson.quajs?.decorators || packageJson.decorators,
      renderer: packageJson.quajs?.renderer || packageJson.renderer,
      description: packageJson.quajs?.description || packageJson.description,
      category: packageJson.quajs?.category || packageJson.category,
      apis: packageJson.quajs?.apis,
      provides: packageJson.quajs?.provides,
      requires: packageJson.quajs?.requires,
      quajs: packageJson.quajs,
      packageJsonPath,
    }
  }
  catch (error) {
    console.warn(`Failed to parse plugin package metadata for ${packageName}:`, error)
    return isQuaPackageName(packageName)
      ? {
          main: resolvePluginMain(packageName),
        }
      : null
  }
}

function resolvePackageJson(packageName: string, projectRoot: string): string | null {
  try {
    const requireFromProject = createRequire(resolve(projectRoot, 'package.json'))
    return requireFromProject.resolve(`${packageName}/package.json`)
  }
  catch {
    return null
  }
}

function createCapabilityProviderMap(plugins: readonly PluginConfig[]): Map<string, PluginConfig> {
  const providers = new Map<string, PluginConfig>()
  for (const plugin of plugins) {
    for (const capability of plugin.provides || []) {
      if (!providers.has(capability)) {
        providers.set(capability, plugin)
      }
    }
  }
  return providers
}

function normalizePluginConfig(config: PluginConfig, source: 'custom' | 'package'): PluginConfig {
  const quajs = isPlainObject(config.quajs) ? config.quajs as QuaPluginMetadata : undefined
  const main = config.main || config.entry || quajs?.entry

  return {
    ...config,
    source: config.source || source,
    main,
    entry: config.entry || main,
    decorators: normalizeDecoratorMapping(config.decorators || quajs?.decorators),
    apis: normalizeStringArray(config.apis || quajs?.apis),
    provides: normalizeStringArray(config.provides || quajs?.provides),
    requires: normalizeStringArray(config.requires || quajs?.requires),
    renderer: normalizeRendererMap(config.renderer || quajs?.renderer),
    quajs,
  }
}

function normalizeDecoratorMapping(mapping: unknown): DecoratorMapping | undefined {
  return isPlainObject(mapping) ? mapping as DecoratorMapping : undefined
}

function normalizeRendererMap(renderer: unknown): RendererEntryMap | undefined {
  if (!isPlainObject(renderer)) {
    return undefined
  }

  const entries = Object.entries(renderer).filter((entry): entry is [string, string] => typeof entry[0] === 'string' && typeof entry[1] === 'string')
  return entries.length > 0 ? Object.fromEntries(entries) : undefined
}

function normalizeStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined
  }

  const normalized = [...new Set(value.filter((item): item is string => typeof item === 'string' && item.length > 0))]
  return normalized.length > 0 ? normalized : undefined
}

function isQuaPackageName(packageName: string): boolean {
  return packageName.startsWith('@quajs/plugin-') || packageName.startsWith('quajs-plugin-')
}

/**
 * Resolve the main entry point for a plugin package
 */
function resolvePluginMain(packageName: string): string | undefined {
  try {
    return `${packageName}/dist/index.js`
  }
  catch {
    return undefined
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Validate plugin configuration
 */
export function validatePluginConfig(config: any): config is PluginConfig {
  return (
    typeof config === 'object'
    && config !== null
    && typeof config.name === 'string'
    && config.name.length > 0
  )
}

/**
 * Merge multiple decorator mappings
 */
export function mergeDecoratorMappings(...mappings: DecoratorMapping[]): DecoratorMapping {
  const result: DecoratorMapping = {}

  for (const mapping of mappings) {
    Object.assign(result, mapping)
  }

  return result
}
