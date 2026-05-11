import type { QuaWebDomLayerContext, QuaWebDomRendererPlugin } from './core'
import { defineWebRendererPlugin } from './core'

export function createEffectsWebRendererPlugin(): QuaWebDomRendererPlugin {
  return defineWebRendererPlugin({
    name: '@quajs/renderer-web/effects',
    setup() {},
    layers: [{
      id: 'effects',
      order: 40,
      render: renderEffectLayer,
    }],
  })
}

export const effectsWebRendererPlugin = createEffectsWebRendererPlugin()

function renderEffectLayer(context: QuaWebDomLayerContext): Node {
  const layer = context.document.createElement('div')
  layer.className = 'qua-effect-layer'
  for (const effect of context.view.effects) {
    const node = context.document.createElement('div')
    node.className = `qua-effect qua-effect--${effect.type}`
    layer.append(node)
  }
  return layer
}
