import type { QuaWebDomLayerContext, QuaWebDomRendererPlugin } from './core'
import {
  createSceneTransitionStore,
  normalizeSceneTransitionClass,
  sceneTransitionLayerStyle,
  sceneTransitionOverlayStyle,
} from '../scene'
import { defineWebRendererPlugin } from './core'
import { applyStyleVars } from './shared'

export function createSceneWebRendererPlugin(): QuaWebDomRendererPlugin {
  const store = createSceneTransitionStore()
  return defineWebRendererPlugin({
    name: '@quajs/renderer-web/scene',
    setup(context) {
      store.setup(context)
      context.addDisposer(() => store.destroy())
    },
    layers: [{
      id: 'scene-transition',
      order: 80,
      plane: 'stage',
      render: renderSceneTransitionLayer,
    }],
  })

  function renderSceneTransitionLayer(context: QuaWebDomLayerContext): Node | undefined {
    const state = store.getSnapshot()
    if (!state.active) {
      return undefined
    }

    const layer = context.document.createElement('div')
    layer.className = 'qua-scene-transition-layer'
    applyStyleVars(layer, sceneTransitionLayerStyle())

    const overlay = context.document.createElement('div')
    overlay.className = [
      'qua-scene-transition',
      `qua-scene-transition--${normalizeSceneTransitionClass(state.type)}`,
    ].join(' ')
    overlay.setAttribute('data-scene-transition-type', state.type)
    applyStyleVars(overlay, sceneTransitionOverlayStyle(state))
    layer.append(overlay)
    return layer
  }
}

export const sceneWebRendererPlugin = createSceneWebRendererPlugin()
