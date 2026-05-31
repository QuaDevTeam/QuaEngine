import type { QuaReactRendererPlugin } from './core'
import { createSceneWebRendererPlugin } from '@quajs/renderer-web/plugins/scene'
import { defineReactRendererPlugin } from './core'

export * from '@quajs/renderer-web/plugins/scene'

export function createSceneRendererPlugin(): QuaReactRendererPlugin {
  const plugin = createSceneWebRendererPlugin()
  return defineReactRendererPlugin({
    ...plugin,
    name: '@quajs/renderer-react/scene',
  })
}

export const sceneRendererPlugin = createSceneRendererPlugin()
