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
interface TransformOptions {
  moduleType: string
  ssr?: boolean
}

interface BaseScriptPlugin extends Plugin {
  transform?: (
    this: TransformContext,
    code: string,
    id: string,
    options?: TransformOptions,
  ) => TransformResult | Promise<TransformResult>
}

export function quaScriptCompilerPlugin(options: QuaEngineVitePluginOptions['scriptCompiler'] = {}): Plugin {
  const {
    autoCollectDecorators,
    enabled = true,
    include = /\.(qs|ts|tsx|js|jsx)$/,
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
    autoCollectDecorators,
    include,
    exclude,
    decoratorMappings,
    projectRoot,
  }) as BaseScriptPlugin

  // Create enhanced plugin to avoid Vite version conflicts
  const enhancedPlugin: Plugin = {
    name: 'qua-script-compiler',

    async configResolved(config) {
      await callPluginHook(basePlugin.configResolved, this, config)
    },

    configureServer(server) {
      return callPluginHook(basePlugin.configureServer, this, server)
    },

    async transform(code: string, id: string, options) {
      // Check if file should be processed
      if (!shouldTransform(id, include, exclude)) {
        return null
      }

      const isStandaloneFile = isStandaloneQuaScriptFile(id)

      // Only process files with qs`` template literals or standalone .qs sources
      if (!code.includes('qs`') && !isStandaloneFile) {
        return null
      }

      // Use the base plugin's transform method if available
      if (basePlugin && typeof basePlugin.transform === 'function') {
        return basePlugin.transform.call(this, code, id, options)
      }
      return null
    },

    async handleHotUpdate(ctx) {
      const baseResult = await callPluginHook(basePlugin.handleHotUpdate, this, ctx)

      // Custom HMR for QuaScript files
      if (shouldTransform(ctx.file, include, exclude)) {
        ctx.server.ws.send({
          type: 'custom',
          event: 'qua-script-update',
          data: {
            file: ctx.file,
            timestamp: Date.now(),
          },
        })
      }

      return baseResult
    },

    buildEnd(error) {
      return callPluginHook(basePlugin.buildEnd, this, error)
    },
  }

  return enhancedPlugin
}

async function callPluginHook<Args extends unknown[], Return>(
  hook: ((...args: Args) => Return) | { handler: (...args: Args) => Return } | undefined,
  context: unknown,
  ...args: Args
): Promise<Awaited<Return> | undefined> {
  if (!hook) {
    return undefined
  }

  const handler = typeof hook === 'function' ? hook : hook.handler
  return await handler.call(context, ...args) as Awaited<Return>
}

function isStandaloneQuaScriptFile(id: string): boolean {
  return !id.includes('?raw') && stripQuery(id).endsWith('.qs')
}

function stripQuery(id: string): string {
  return id.split('?', 1)[0]
}
