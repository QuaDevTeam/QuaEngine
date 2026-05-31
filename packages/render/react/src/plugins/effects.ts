import type { QuaReactRendererPlugin } from './core'
import { createEffectsWebRendererPlugin } from '@quajs/renderer-web/plugins/effects'
import { defineReactRendererPlugin } from './core'

export * from '@quajs/renderer-web/plugins/effects'

export function createEffectsRendererPlugin(): QuaReactRendererPlugin {
  const plugin = createEffectsWebRendererPlugin()
  return defineReactRendererPlugin({
    ...plugin,
    name: '@quajs/renderer-react/effects',
  })
}

export const effectsRendererPlugin = createEffectsRendererPlugin()
