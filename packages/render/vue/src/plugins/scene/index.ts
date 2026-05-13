import type { QuaVueRendererPlugin } from '../core'
import { createSceneTransitionStore } from '@quajs/renderer-web'
import { defineVueRendererPlugin } from '../core'
import { QuaSceneTransitionLayer } from './components'

export { QuaSceneTransitionLayer } from './components'

export function createSceneRendererPlugin(): QuaVueRendererPlugin {
  const store = createSceneTransitionStore()
  return defineVueRendererPlugin({
    name: '@quajs/renderer-vue/scene',
    setup(context) {
      store.setup(context)
      context.addDisposer(() => store.destroy())
    },
    layers: [{
      id: 'scene-transition',
      slot: 'scene-transition',
      component: QuaSceneTransitionLayer,
      order: 80,
      plane: 'stage',
      props: { store },
    }],
  })
}

export const sceneRendererPlugin = createSceneRendererPlugin()
