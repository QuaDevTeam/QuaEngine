import type { InputWebRendererPluginOptions } from '@quajs/renderer-web/plugins/input'
import type { QuaReactRendererPlugin } from './core'
import { createInputWebRendererPlugin } from '@quajs/renderer-web/plugins/input'
import { defineReactRendererPlugin } from './core'

export type InputReactRendererPluginOptions = InputWebRendererPluginOptions

export function createInputRendererPlugin(options: InputReactRendererPluginOptions = {}): QuaReactRendererPlugin {
  const plugin = createInputWebRendererPlugin(options)
  return defineReactRendererPlugin({
    name: '@quajs/renderer-react/input',
    setup: plugin.setup,
    destroy: plugin.destroy,
  })
}

export const inputRendererPlugin = createInputRendererPlugin()
