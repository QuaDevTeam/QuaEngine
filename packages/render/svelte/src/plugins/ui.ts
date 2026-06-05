import type { UiWebRendererPluginOptions } from '@quajs/renderer-web/plugins/ui'
import type { QuaSvelteRendererPlugin } from './core'
import { createUiWebRendererPlugin } from '@quajs/renderer-web/plugins/ui'
import { defineSvelteRendererPlugin } from './core'

export * from '@quajs/renderer-web/plugins/ui'

export type UiSvelteRendererPluginOptions = UiWebRendererPluginOptions

export function createUiRendererPlugin(options: UiSvelteRendererPluginOptions = {}): QuaSvelteRendererPlugin {
  const plugin = createUiWebRendererPlugin(options)
  return defineSvelteRendererPlugin({
    ...plugin,
    name: '@quajs/renderer-svelte/ui',
  })
}

export const uiRendererPlugin = createUiRendererPlugin()
