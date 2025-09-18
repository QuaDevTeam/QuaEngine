import type { Plugin } from 'vite'
import type { QuaEngineVitePluginOptions } from '../core/types'

import { shouldTransform } from '../core/utils'

/**
 * Enhanced Vite plugin for QuaScript compilation with plugin integration
 *
 * This wraps the existing script-compiler Vite plugin with additional
 * QuaEngine-specific features and better integration.
 */
export async function quaScriptCompilerPlugin(options: QuaEngineVitePluginOptions['scriptCompiler'] = {}): Promise<Plugin> {
  const {
    enabled = true,
    include = /\.(ts|tsx|js|jsx)$/,
    exclude = /node_modules/,
    decoratorMappings,
    projectRoot,
  } = options

  if (!enabled) {
    return {
      name: 'qua-script-disabled',
      apply: () => false,
    }
  }

  // Use the existing script-compiler plugin as the base
  let basePlugin: any = null
  try {
    const scriptCompilerModule = await import('@quajs/script-compiler')
    const quaScriptPlugin = scriptCompilerModule.quaScriptPlugin || scriptCompilerModule.default?.quaScriptPlugin
    if (quaScriptPlugin) {
      basePlugin = quaScriptPlugin({
        include,
        exclude,
        decoratorMappings,
        projectRoot,
      })
    }
  }
  catch {
    // Script compiler not available - proceed without it
  }

  // Create enhanced plugin to avoid Vite version conflicts
  const enhancedPlugin: Plugin = {
    name: 'qua-script-compiler',

    transform(code: string, id: string) {
      // Check if file should be processed
      if (!shouldTransform(id, include, exclude)) {
        return null
      }

      // Only process files with qs`` template literals
      if (!code.includes('qs`')) {
        return null
      }

      // Use the base plugin's transform method if available
      if (basePlugin && typeof basePlugin.transform === 'function') {
        return basePlugin.transform.call(this, code, id)
      }
      return null
    },

    handleHotUpdate({ file, server }) {
      // Custom HMR for QuaScript files
      if (shouldTransform(file, include, exclude)) {
        server.ws.send({
          type: 'custom',
          event: 'qua-script-update',
          data: {
            file,
            timestamp: Date.now(),
          },
        })
      }
    },
  }

  return enhancedPlugin
}
