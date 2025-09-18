import { readFileSync, existsSync } from 'node:fs'
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
 * Plugin configuration interface
 */
export interface PluginConfig {
  name: string
  version?: string
  main?: string
  decorators?: DecoratorMapping
  dependencies?: string[]
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
  '.qua/plugins.json'
]

/**
 * Discover and load plugin configurations
 */
export async function discoverPlugins(projectRoot?: string): Promise<PluginConfig[]> {
  const root = projectRoot || process.cwd()
  const plugins: PluginConfig[] = []
  
  // Try to find plugin configuration files
  for (const pluginPath of DEFAULT_PLUGIN_PATHS) {
    const configPath = resolve(root, pluginPath)
    
    if (existsSync(configPath)) {
      try {
        const configContent = readFileSync(configPath, 'utf-8')
        const config: PluginDiscoveryConfig = JSON.parse(configContent)
        
        if (config.plugins && Array.isArray(config.plugins)) {
          plugins.push(...config.plugins)
        }
      } catch (error) {
        console.warn(`Failed to parse plugin config at ${configPath}:`, error)
      }
    }
  }
  
  // Also check package.json for plugin dependencies
  const packageJsonPath = resolve(root, 'package.json')
  if (existsSync(packageJsonPath)) {
    try {
      const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'))
      const pluginDeps = findPluginDependencies(packageJson)
      plugins.push(...pluginDeps)
    } catch (error) {
      console.warn(`Failed to parse package.json at ${packageJsonPath}:`, error)
    }
  }
  
  return plugins
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
 * Find plugin dependencies in package.json
 */
function findPluginDependencies(packageJson: any): PluginConfig[] {
  const plugins: PluginConfig[] = []
  const dependencies = {
    ...packageJson.dependencies,
    ...packageJson.devDependencies,
    ...packageJson.peerDependencies
  }
  
  // Look for packages that follow QuaEngine plugin naming convention
  for (const [name, version] of Object.entries(dependencies)) {
    if (name.startsWith('@quajs/plugin-') || name.includes('qua-plugin')) {
      plugins.push({
        name: name,
        version: version as string,
        // Try to resolve plugin configuration from the package
        main: resolvePluginMain(name)
      })
    }
  }
  
  return plugins
}

/**
 * Resolve the main entry point for a plugin package
 */
function resolvePluginMain(packageName: string): string | undefined {
  try {
    // This would typically use require.resolve in a Node.js environment
    // For now, return a standard convention
    return `${packageName}/dist/index.js`
  } catch {
    return undefined
  }
}

/**
 * Validate plugin configuration
 */
export function validatePluginConfig(config: any): config is PluginConfig {
  return (
    typeof config === 'object' &&
    config !== null &&
    typeof config.name === 'string' &&
    config.name.length > 0
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