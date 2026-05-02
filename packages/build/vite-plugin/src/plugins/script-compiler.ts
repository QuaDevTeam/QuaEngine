import type { Plugin, TransformResult } from 'vite'
import type { QuaEngineVitePluginOptions } from '../core/types'
import { quaScriptPlugin } from '@quajs/script-compiler'

import { shouldTransform } from '../core/utils'

/**
 * Enhanced Vite plugin for QuaScript compilation with plugin integration
 *
 * This wraps the existing script-compiler Vite plugin with additional
 * QuaEngine-specific features and better integration.
 */
type TransformContext = ThisParameterType<NonNullable<Plugin['transform']>>
type TransformOptions = {
  moduleType: string
  ssr?: boolean
}
type BaseScriptPlugin = Plugin & {
  transform?: (
    this: TransformContext,
    code: string,
    id: string,
    options?: TransformOptions
  ) => TransformResult | Promise<TransformResult>
}

export function quaScriptCompilerPlugin(options: QuaEngineVitePluginOptions['scriptCompiler'] = {}): Plugin {
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

  const basePlugin = quaScriptPlugin({
    include,
    exclude,
    decoratorMappings,
    projectRoot,
  }) as BaseScriptPlugin

  // Create enhanced plugin to avoid Vite version conflicts
  const enhancedPlugin: Plugin = {
    name: 'qua-script-compiler',

    async transform(code: string, id: string, options) {
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
        return basePlugin.transform.call(this, code, id, options)
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
