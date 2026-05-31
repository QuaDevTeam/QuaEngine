import type { QuaReactRendererPlugin } from './core'
import { createBackgroundWebRendererPlugin } from '@quajs/renderer-web/plugins/background'
import { defineReactRendererPlugin } from './core'

export * from '@quajs/renderer-web/plugins/background'

export function createBackgroundRendererPlugin(): QuaReactRendererPlugin {
  const plugin = createBackgroundWebRendererPlugin()
  return defineReactRendererPlugin({
    ...plugin,
    name: '@quajs/renderer-react/background',
  })
}

export const backgroundRendererPlugin = createBackgroundRendererPlugin()
