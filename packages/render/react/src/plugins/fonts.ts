import type { RendererPlugin } from '@quajs/render-core'
import type { FontsWebRendererPluginOptions } from '@quajs/renderer-web/plugins/fonts'
import { createFontsWebRendererPlugin } from '@quajs/renderer-web/plugins/fonts'

export * from '@quajs/renderer-web/plugins/fonts'

export type FontsReactRendererPluginOptions = FontsWebRendererPluginOptions

export function createFontsRendererPlugin(options: FontsReactRendererPluginOptions = {}): RendererPlugin {
  const plugin = createFontsWebRendererPlugin(options)
  return {
    ...plugin,
    name: '@quajs/renderer-react/fonts',
  }
}

export const fontsRendererPlugin = createFontsRendererPlugin()
