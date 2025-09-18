// Import types only to avoid bundling Node.js code in browser builds
import type { DecoratorMapping } from './registry'

// Import plugin-discovery dynamically to handle Node.js vs Browser environments
let pluginDiscoveryModule: any = null

async function getPluginDiscoveryModule() {
  if (pluginDiscoveryModule === null) {
    try {
      pluginDiscoveryModule = await import('@quajs/plugin-discovery')
    } catch (error) {
      console.warn('Plugin discovery not available (likely browser environment):', error)
      pluginDiscoveryModule = {
        discoverPlugins: async () => [],
        getDiscoveredDecoratorMappings: async () => ({}),
        loadPlugin: async () => null,
        getAvailablePlugins: async () => [],
        validatePluginConfig: () => false,
        mergeDecoratorMappings: (...mappings: any[]) => Object.assign({}, ...mappings)
      }
    }
  }
  return pluginDiscoveryModule
}

/**
 * Plugin discovery service that delegates to the standalone plugin-discovery package
 * This maintains backward compatibility while using the centralized discovery logic
 */
export class PluginDiscovery {
  private projectRoot: string

  constructor(projectRoot?: string) {
    this.projectRoot = projectRoot || (typeof process !== 'undefined' ? process.cwd() : '')
  }

  /**
   * Discover all available plugins
   * Delegates to the standalone plugin-discovery package
   */
  async discoverPlugins() {
    try {
      const module = await getPluginDiscoveryModule()
      const plugins = await module.discoverPlugins(this.projectRoot)
      
      // Convert to the format expected by the engine
      return plugins.map((plugin: any) => ({
        source: 'package' as const,
        name: plugin.name,
        version: plugin.version || '1.0.0',
        entry: plugin.main || `${plugin.name}/dist/index.js`,
        metadata: {
          description: plugin.name,
          category: 'plugin'
        },
        decorators: plugin.decorators || {},
        apis: [],
        enabled: true
      }))
    } catch (error) {
      console.warn('Plugin discovery failed:', error)
      return []
    }
  }

  /**
   * Get decorator mappings from all discovered plugins
   */
  async getDecoratorMappings(): Promise<DecoratorMapping> {
    const module = await getPluginDiscoveryModule()
    return await module.getDiscoveredDecoratorMappings(this.projectRoot)
  }
}

/**
 * Singleton instance for plugin discovery
 */
let discoveryInstance: PluginDiscovery | null = null

/**
 * Get or create plugin discovery instance
 */
export function getPluginDiscovery(projectRoot?: string): PluginDiscovery {
  if (!discoveryInstance || projectRoot) {
    discoveryInstance = new PluginDiscovery(projectRoot)
  }
  return discoveryInstance
}

/**
 * Get decorator mappings from discovered plugins
 * This is the main function used by script-compiler and other packages
 */
export async function getDiscoveredDecoratorMappings(projectRoot?: string): Promise<DecoratorMapping> {
  const module = await getPluginDiscoveryModule()
  return await module.getDiscoveredDecoratorMappings(projectRoot)
}

// Re-export functions that delegate to the standalone package
export const discoverPlugins = async (projectRoot?: string) => {
  const module = await getPluginDiscoveryModule()
  return await module.discoverPlugins(projectRoot)
}

export const loadPlugin = async (pluginName: string, projectRoot?: string) => {
  const module = await getPluginDiscoveryModule()
  return await module.loadPlugin(pluginName, projectRoot)
}

export const getAvailablePlugins = async (projectRoot?: string) => {
  const module = await getPluginDiscoveryModule()
  return await module.getAvailablePlugins(projectRoot)
}

export const validatePluginConfig = (config: any) => {
  // This can be synchronous since it's just validation
  return (
    typeof config === 'object' &&
    config !== null &&
    typeof config.name === 'string' &&
    config.name.length > 0
  )
}

export const mergeDecoratorMappings = (...mappings: DecoratorMapping[]): DecoratorMapping => {
  const result: DecoratorMapping = {}
  for (const mapping of mappings) {
    Object.assign(result, mapping)
  }
  return result
}

// Re-export types (these will be available since they're from this package)
export type { DecoratorMapping } from './registry'