import type { QuaReactRendererPlugin } from './core'
import { createUiWebRendererPlugin } from '@quajs/renderer-web/plugins/ui'
import { defineReactRendererPlugin } from './core'

export * from '@quajs/renderer-web/plugins/ui'

export function createUiRendererPlugin(): QuaReactRendererPlugin {
  const plugin = createUiWebRendererPlugin()
  return defineReactRendererPlugin({
    ...plugin,
    name: '@quajs/renderer-react/ui',
  })
}

export const uiRendererPlugin = createUiRendererPlugin()
