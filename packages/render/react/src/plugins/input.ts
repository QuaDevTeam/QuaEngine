import type { InputWebRendererPluginOptions } from '@quajs/renderer-web/plugins/input'
import type { QuaReactRendererPlugin } from './core'
import { createInputWebRendererPlugin } from '@quajs/renderer-web/plugins/input'
import { defineReactRendererPlugin } from './core'

export * from '@quajs/renderer-web/plugins/input'

export type InputReactRendererPluginOptions = InputWebRendererPluginOptions

export function createInputRendererPlugin(options: InputReactRendererPluginOptions = {}): QuaReactRendererPlugin {
  const plugin = createInputWebRendererPlugin(options)
  return defineReactRendererPlugin({
    ...plugin,
    name: '@quajs/renderer-react/input',
  })
}

export const inputRendererPlugin = createInputRendererPlugin()
