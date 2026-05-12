import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
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

export interface LanguageCompletionValue {
  detail?: string
  insertText?: string
  label: string
}

export interface DecoratorArgumentLanguageContribution {
  assetExtensions?: string[]
  assetRoots?: string[]
  characterNames?: boolean
  detail?: string
  name?: string
  values?: Array<string | LanguageCompletionValue>
}

export interface DecoratorLanguageContribution {
  args?: DecoratorArgumentLanguageContribution[]
  description?: string
}

export interface QuaPluginLanguageContribution {
  decorators?: Record<string, DecoratorLanguageContribution>
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
  language?: QuaPluginLanguageContribution
  apis?: string[]
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
  language?: QuaPluginLanguageContribution
  apis?: string[]
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

  return [...discovered.values()]
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
 * Extract language contributions from discovered plugins.
 */
export async function getDiscoveredLanguageContributions(projectRoot?: string): Promise<QuaPluginLanguageContribution> {
  const plugins = await discoverPlugins(projectRoot)
  const language: QuaPluginLanguageContribution = {
    decorators: {},
  }

  for (const plugin of plugins) {
    if (plugin.language?.decorators) {
      Object.assign(language.decorators!, plugin.language.decorators)
    }
  }

  return language.decorators && Object.keys(language.decorators).length > 0
    ? language
    : {}
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
 * Find plugin dependencies in package.json dependency fields.
 */
function findPluginDependencies(packageJson: any, projectRoot: string): PluginConfig[] {
  const plugins: PluginConfig[] = []
  const dependencies = {
    ...packageJson.dependencies,
    ...packageJson.devDependencies,
    ...packageJson.peerDependencies,
    ...packageJson.optionalDependencies,
  }

  for (const [name, version] of Object.entries(dependencies)) {
    const packageConfig = readPluginPackageConfig(name, projectRoot)
    if (packageConfig) {
      plugins.push(normalizePluginConfig({
        name,
        version: version as string,
        ...packageConfig,
      }, 'package'))
    }
  }

  return plugins
}

function readPluginPackageConfig(packageName: string, projectRoot: string): Partial<PluginConfig> | null {
  const packageJsonPath = resolvePackageJson(packageName, projectRoot)
  if (!packageJsonPath) {
    return null
  }

  try {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'))
    const quajs = normalizeQuaPluginMetadata(packageJson.quajs)
    if (!quajs) {
      return null
    }

    return {
      version: typeof packageJson.version === 'string' ? packageJson.version : undefined,
      main: normalizePackageEntrySpecifier(packageName, quajs.entry || packageJson.main || packageJson.module),
      decorators: quajs.decorators,
      language: quajs.language,
      renderer: quajs.renderer,
      description: quajs.description || packageJson.description,
      category: quajs.category,
      apis: quajs.apis,
      quajs,
      packageJsonPath,
    }
  }
  catch (error) {
    console.warn(`Failed to parse plugin package metadata for ${packageName}:`, error)
    return null
  }
}

function resolvePackageJson(packageName: string, projectRoot: string): string | null {
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
    const requireFromProject = createRequire(resolve(projectRoot, 'package.json'))
    return requireFromProject.resolve(`${packageName}/package.json`)
  }
  catch {
    return null
  }
}

function normalizePluginConfig(config: PluginConfig, source: 'custom' | 'package'): PluginConfig {
  const { provides: _provides, requires: _requires, quajs: rawQuajs, ...rest } = config
  const quajs = normalizeQuaPluginMetadata(rawQuajs)
  const main = config.main || config.entry || quajs?.entry

  return {
    ...rest,
    source: config.source || source,
    main,
    entry: config.entry || main,
    decorators: normalizeDecoratorMapping(config.decorators || quajs?.decorators),
    language: normalizeLanguageContribution(config.language || quajs?.language),
    apis: normalizeStringArray(config.apis || quajs?.apis),
    renderer: normalizeRendererMap(config.renderer || quajs?.renderer),
    quajs,
  }
}

function normalizePackageEntrySpecifier(packageName: string, entry: unknown): string {
  if (typeof entry !== 'string' || entry.length === 0) {
    return packageName
  }

  if (entry === packageName || entry.startsWith(`${packageName}/`) || entry.startsWith('/')) {
    return entry
  }

  return `${packageName}/${entry.replace(/^\.?\//, '')}`
}

function normalizeQuaPluginMetadata(value: unknown): QuaPluginMetadata | undefined {
  if (!isPlainObject(value)) {
    return undefined
  }

  const { provides: _provides, requires: _requires, ...rest } = value
  return rest as QuaPluginMetadata
}

function normalizeDecoratorMapping(mapping: unknown): DecoratorMapping | undefined {
  if (!isPlainObject(mapping)) {
    return undefined
  }

  const entries = Object.entries(mapping).filter((entry): entry is [string, DecoratorMapping[string]] => {
    const [, decorator] = entry
    return isPlainObject(decorator)
      && typeof decorator.function === 'string'
      && typeof decorator.module === 'string'
  })

  return entries.length > 0 ? Object.fromEntries(entries) : undefined
}

function normalizeRendererMap(renderer: unknown): RendererEntryMap | undefined {
  if (!isPlainObject(renderer)) {
    return undefined
  }

  const entries = Object.entries(renderer).filter((entry): entry is [string, string] => typeof entry[0] === 'string' && typeof entry[1] === 'string')
  return entries.length > 0 ? Object.fromEntries(entries) : undefined
}

function normalizeLanguageContribution(language: unknown): QuaPluginLanguageContribution | undefined {
  if (!isPlainObject(language)) {
    return undefined
  }

  const decorators = isPlainObject(language.decorators)
    ? Object.fromEntries(
        Object.entries(language.decorators)
          .filter((entry): entry is [string, DecoratorLanguageContribution] => typeof entry[0] === 'string' && isPlainObject(entry[1]))
          .map(([decoratorName, contribution]) => [
            decoratorName,
            {
              description: typeof contribution.description === 'string' ? contribution.description : undefined,
              args: normalizeDecoratorLanguageArgs(contribution.args),
            },
          ]),
      )
    : undefined

  return decorators && Object.keys(decorators).length > 0
    ? { decorators }
    : undefined
}

function normalizeDecoratorLanguageArgs(args: unknown): DecoratorArgumentLanguageContribution[] | undefined {
  if (!Array.isArray(args)) {
    return undefined
  }

  const normalized = args
    .filter(isPlainObject)
    .map((arg) => {
      const values = Array.isArray(arg.values)
        ? arg.values.filter((value): value is string | LanguageCompletionValue =>
            typeof value === 'string'
            || (
              isPlainObject(value)
              && typeof value.label === 'string'
            ),
          )
        : undefined
      return {
        assetExtensions: normalizeStringArray(arg.assetExtensions),
        assetRoots: normalizeStringArray(arg.assetRoots),
        characterNames: arg.characterNames === true,
        detail: typeof arg.detail === 'string' ? arg.detail : undefined,
        name: typeof arg.name === 'string' ? arg.name : undefined,
        values,
      }
    })

  return normalized.length > 0 ? normalized : undefined
}

function normalizeStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined
  }

  const normalized = [...new Set(value.filter((item): item is string => typeof item === 'string' && item.length > 0))]
  return normalized.length > 0 ? normalized : undefined
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
