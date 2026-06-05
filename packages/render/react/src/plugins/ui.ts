import type { UiWebRendererPluginOptions } from '@quajs/renderer-web/plugins/ui'
import type { QuaReactRendererPlugin } from './core'
import { createUiWebRendererPlugin } from '@quajs/renderer-web/plugins/ui'
import { defineReactRendererPlugin } from './core'

export * from '@quajs/renderer-web/plugins/ui'

export type UiReactRendererPluginOptions = UiWebRendererPluginOptions

export function createUiRendererPlugin(options: UiReactRendererPluginOptions = {}): QuaReactRendererPlugin {
  const plugin = createUiWebRendererPlugin(options)
  return defineReactRendererPlugin({
    ...plugin,
    name: '@quajs/renderer-react/ui',
  })
}

export const uiRendererPlugin = createUiRendererPlugin()
