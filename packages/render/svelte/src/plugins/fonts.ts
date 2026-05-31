import type { RendererPlugin } from '@quajs/render-core'
import type { FontsWebRendererPluginOptions } from '@quajs/renderer-web/plugins/fonts'
import { createFontsWebRendererPlugin } from '@quajs/renderer-web/plugins/fonts'

export * from '@quajs/renderer-web/plugins/fonts'

export type FontsSvelteRendererPluginOptions = FontsWebRendererPluginOptions

export function createFontsRendererPlugin(options: FontsSvelteRendererPluginOptions = {}): RendererPlugin {
  const plugin = createFontsWebRendererPlugin(options)
  return {
    ...plugin,
    name: '@quajs/renderer-svelte/fonts',
  }
}

export const fontsRendererPlugin = createFontsRendererPlugin()
