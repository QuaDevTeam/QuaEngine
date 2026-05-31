import type { InputWebRendererPluginOptions } from '@quajs/renderer-web/plugins/input'
import type { QuaSvelteRendererPlugin } from './core'
import { createInputWebRendererPlugin } from '@quajs/renderer-web/plugins/input'
import { defineSvelteRendererPlugin } from './core'

export type InputSvelteRendererPluginOptions = InputWebRendererPluginOptions

export function createInputRendererPlugin(options: InputSvelteRendererPluginOptions = {}): QuaSvelteRendererPlugin {
  const plugin = createInputWebRendererPlugin(options)
  return defineSvelteRendererPlugin({
    ...plugin,
    name: '@quajs/renderer-svelte/input',
  })
}

export const inputRendererPlugin = createInputRendererPlugin()
