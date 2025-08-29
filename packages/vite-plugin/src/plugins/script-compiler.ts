import type { Plugin } from 'vite'
import { quaScriptPlugin, type QuaScriptPluginOptions } from '@quajs/script-compiler'
import type { QuaEngineVitePluginOptions } from '../core/types'
import { shouldTransform } from '../core/utils'

/**
 * Enhanced Vite plugin for QuaScript compilation with plugin integration
 * 
 * This wraps the existing script-compiler Vite plugin with additional
 * QuaEngine-specific features and better integration.
 */
export function quaScriptCompilerPlugin(options: QuaEngineVitePluginOptions['scriptCompiler'] = {}): Plugin {
  const {
    enabled = true,
    include = /\.(ts|tsx|js|jsx)$/,
    exclude = /node_modules/,
    decoratorMappings,
    projectRoot
  } = options

  if (!enabled) {
    return {
      name: 'qua-script-disabled',
      apply: () => false
    }
  }

  // Use the existing script-compiler plugin as the base
  const basePlugin = quaScriptPlugin({
    include,
    exclude,
    decoratorMappings,
    projectRoot
  } as QuaScriptPluginOptions)

  // Enhance with additional QuaEngine features
  return {
    ...basePlugin,
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

      // Use the base plugin's transform method
      return basePlugin.transform?.call(this, code, id)
    },

    handleHotUpdate({ file, server }) {
      // Custom HMR for QuaScript files
      if (shouldTransform(file, include, exclude)) {
        server.ws.send({
          type: 'custom',
          event: 'qua-script-update',
          data: {
            file,
            timestamp: Date.now()
          }
        })
      }
    }
  }
}