import type { InputWebRendererPluginOptions } from '@quajs/renderer-web/plugins/input'
import type { QuaVueRendererPlugin } from '../core'
import { createInputWebRendererPlugin } from '@quajs/renderer-web/plugins/input'
import { defineVueRendererPlugin } from '../core'

export type InputVueRendererPluginOptions = InputWebRendererPluginOptions

export function createInputRendererPlugin(options: InputVueRendererPluginOptions = {}): QuaVueRendererPlugin {
  const plugin = createInputWebRendererPlugin(options)
  return defineVueRendererPlugin({
    name: '@quajs/renderer-vue/input',
    setup: plugin.setup,
    destroy: plugin.destroy,
  })
}

export const inputRendererPlugin = createInputRendererPlugin()
