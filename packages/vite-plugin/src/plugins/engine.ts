import type { Plugin } from 'vite'
import type { QuaEngineVitePluginOptions, VirtualPluginRegistryEntry } from '../core/types'
import { logPluginMessage, generatePluginModuleId } from '../core/utils'

/**
 * Vite plugin for QuaJS engine plugin discovery and bundling
 * 
 * This plugin:
 * 1. Discovers plugins from package.json dependencies
 * 2. Generates virtual modules for static imports
 * 3. Ensures plugins are bundled correctly
 */
export function quaEnginePlugin(options: QuaEngineVitePluginOptions['pluginDiscovery'] = {}): Plugin {
  const {
    enabled = true,
    generateVirtualRegistry = true,
    autoBundlePlugins = true
  } = options

  if (!enabled) {
    return {
      name: 'qua-engine-disabled',
      apply: () => false
    }
  }

  const VIRTUAL_PLUGIN_REGISTRY_ID = 'virtual:qua-plugins'
  const RESOLVED_VIRTUAL_ID = '\0' + VIRTUAL_PLUGIN_REGISTRY_ID

  let discoveredPlugins: VirtualPluginRegistryEntry[] = []

  return {
    name: 'qua-engine',
    configResolved(config) {
      logPluginMessage('QuaEngine plugin initialized', 'info')
      if (config.command === 'build') {
        logPluginMessage('Production build mode - plugins will be statically bundled', 'info')
      }
    },

    async buildStart() {
      if (!autoBundlePlugins) return

      try {
        // Import plugin discovery at runtime with fallback
        let getDiscoveredDecoratorMappings: any
        try {
          const pluginDiscoveryModule = await import('@quajs/plugin-discovery')
          getDiscoveredDecoratorMappings = pluginDiscoveryModule.getDiscoveredDecoratorMappings
        } catch {
          // Fallback - no plugin discovery available
          getDiscoveredDecoratorMappings = async () => ({})
        }
        
        const decoratorMappings = await getDiscoveredDecoratorMappings()
        
        // Convert decorator mappings to plugin format for backwards compatibility
        discoveredPlugins = Object.entries(decoratorMappings).map(([name, decorator]) => ({
          name: `plugin-${name}`,
          entry: (decorator as any).module || '@quajs/engine',
          decorators: { [name]: decorator },
          apis: []
        }))

        logPluginMessage(`Discovered ${discoveredPlugins.length} plugins for bundling`, 'info')
        
        // Mark plugin packages as external dependencies that should be included
        for (const plugin of discoveredPlugins) {
          this.addWatchFile(plugin.entry)
        }
      } catch (error) {
        logPluginMessage(`Plugin discovery failed: ${error}`, 'warn')
        discoveredPlugins = []
      }
    },

    resolveId(id) {
      if (generateVirtualRegistry && id === VIRTUAL_PLUGIN_REGISTRY_ID) {
        return RESOLVED_VIRTUAL_ID
      }
    },

    load(id) {
      if (generateVirtualRegistry && id === RESOLVED_VIRTUAL_ID) {
        return generateVirtualPluginRegistry(discoveredPlugins)
      }
    },

    generateBundle() {
      if (discoveredPlugins.length > 0) {
        logPluginMessage(`Bundled ${discoveredPlugins.length} QuaJS plugins`, 'info')
      }
    }
  }
}

/**
 * Generate virtual plugin registry module code
 */
function generateVirtualPluginRegistry(plugins: VirtualPluginRegistryEntry[]): string {
  if (plugins.length === 0) {
    return `
export const plugins = {}
export const pluginMeta = []
export const hasPlugins = false
`
  }

  const imports = plugins
    .map(plugin => {
      const moduleId = generatePluginModuleId(plugin.name)
      return `import * as ${moduleId} from '${plugin.entry}'`
    })
    .join('\n')

  const pluginExports = plugins
    .map(plugin => {
      const moduleId = generatePluginModuleId(plugin.name)
      return `  '${plugin.name}': ${moduleId}`
    })
    .join(',\n')

  const metadata = JSON.stringify(
    plugins.map(plugin => ({
      name: plugin.name,
      decorators: plugin.decorators,
      apis: plugin.apis
    })),
    null,
    2
  )

  return `${imports}

export const plugins = {
${pluginExports}
}

export const pluginMeta = ${metadata}

export const hasPlugins = true

/**
 * Get a plugin by name
 */
export function getPlugin(name: string) {
  return plugins[name]
}

/**
 * Get all plugin names
 */
export function getPluginNames(): string[] {
  return Object.keys(plugins)
}

/**
 * Check if a plugin is available
 */
export function hasPlugin(name: string): boolean {
  return name in plugins
}
`
}