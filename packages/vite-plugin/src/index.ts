import type { Plugin } from 'vite'
import type { QuaEngineVitePluginOptions } from './core/types'
import { quaEnginePlugin } from './plugins/engine'
import { quackPlugin } from './plugins/quack'
import { quaScriptCompilerPlugin } from './plugins/script-compiler'
import { logPluginMessage } from './core/utils'

/**
 * Main QuaEngine Vite plugin that integrates all QuaEngine build pipeline components
 * 
 * This plugin provides:
 * - QuaScript compilation with plugin support
 * - Automatic plugin discovery and bundling
 * - Asset bundling with Quack
 * - Development server enhancements
 * - Hot module replacement for game assets and scripts
 */
export function quaEngine(options: QuaEngineVitePluginOptions = {}): Plugin[] {
  const {
    scriptCompiler = { enabled: true },
    pluginDiscovery = { enabled: true },
    assetBundling = { enabled: true },
    devServer = { hotReloadScripts: true, watchAssets: true }
  } = options

  logPluginMessage('Initializing QuaEngine build pipeline', 'info')

  const plugins: Plugin[] = []

  // Script compiler plugin (always first to transform qs`` literals)
  if (scriptCompiler.enabled !== false) {
    plugins.push(quaScriptCompilerPlugin(scriptCompiler))
  }

  // Engine plugin for plugin discovery and bundling
  if (pluginDiscovery.enabled !== false) {
    plugins.push(quaEnginePlugin(pluginDiscovery))
  }

  // Quack asset bundling plugin
  if (assetBundling.enabled !== false) {
    plugins.push(quackPlugin(assetBundling))
  }

  // Development server enhancements
  if (devServer.hotReloadScripts || devServer.watchAssets) {
    plugins.push(createDevServerPlugin(devServer))
  }

  logPluginMessage(`Enabled ${plugins.length} QuaEngine plugins`, 'info')

  return plugins
}

/**
 * Development server enhancement plugin
 */
function createDevServerPlugin(devOptions: NonNullable<QuaEngineVitePluginOptions['devServer']>): Plugin {
  return {
    name: 'qua-dev-server',
    configureServer(server) {
      if (process.env.NODE_ENV === 'production') return

      // Enhanced HMR for QuaEngine
      server.ws.on('connection', (ws) => {
        ws.send(JSON.stringify({
          type: 'custom',
          event: 'qua-engine-connected',
          data: {
            timestamp: Date.now(),
            features: {
              hotReloadScripts: devOptions.hotReloadScripts,
              watchAssets: devOptions.watchAssets
            }
          }
        }))
      })

      logPluginMessage('Development server enhanced for QuaEngine', 'info')
    }
  }
}

// Re-export individual plugins for advanced users
export { quaEnginePlugin, quackPlugin, quaScriptCompilerPlugin }

// Re-export types
export type { QuaEngineVitePluginOptions, VirtualPluginRegistryEntry, AssetBundleManifest } from './core/types'

// Default export
export default quaEngine