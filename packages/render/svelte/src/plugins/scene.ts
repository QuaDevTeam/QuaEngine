import type { QuaSvelteRendererPlugin } from './core'
import { createSceneWebRendererPlugin } from '@quajs/renderer-web/plugins/scene'
import { defineSvelteRendererPlugin } from './core'

export * from '@quajs/renderer-web/plugins/scene'

export function createSceneRendererPlugin(): QuaSvelteRendererPlugin {
  const plugin = createSceneWebRendererPlugin()
  return defineSvelteRendererPlugin({
    ...plugin,
    name: '@quajs/renderer-svelte/scene',
  })
}

export const sceneRendererPlugin = createSceneRendererPlugin()
