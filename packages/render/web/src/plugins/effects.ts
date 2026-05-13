import type { QuaWebDomLayerContext, QuaWebDomRendererPlugin } from './core'
import { motionProjectionVars, projectEffect } from '../projection'
import { defineWebRendererPlugin } from './core'
import { applyStyleVars } from './shared'

export function createEffectsWebRendererPlugin(): QuaWebDomRendererPlugin {
  return defineWebRendererPlugin({
    name: '@quajs/renderer-web/effects',
    setup() {},
    layers: [{
      id: 'effects',
      order: 40,
      plane: 'stage',
      render: renderEffectLayer,
      update: updateEffectLayer,
    }],
  })
}

export const effectsWebRendererPlugin = createEffectsWebRendererPlugin()

function renderEffectLayer(context: QuaWebDomLayerContext): Node {
  const layer = context.document.createElement('div')
  layer.className = 'qua-effect-layer'
  for (const effect of context.view.effects) {
    const projected = projectEffect(effect, context.view.animations, Date.now())
    const node = context.document.createElement('div')
    node.className = `qua-effect qua-effect--${projected.type}`
    node.setAttribute('data-effect-id', projected.id)
    applyStyleVars(node, motionProjectionVars(projected as unknown as Record<string, unknown>, '--qua-effect'))
    layer.append(node)
  }
  return layer
}

function updateEffectLayer(context: QuaWebDomLayerContext, node: Node): void {
  if (!(node instanceof HTMLElement))
    return
  for (const effect of context.view.effects) {
    const projected = projectEffect(effect, context.view.animations, Date.now())
    const element = node.querySelector(`[data-effect-id="${cssEscape(projected.id)}"]`)
    if (element instanceof HTMLElement) {
      applyStyleVars(element, motionProjectionVars(projected as unknown as Record<string, unknown>, '--qua-effect'))
    }
  }
}

function cssEscape(value: string): string {
  return typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
    ? CSS.escape(value)
    : value.replace(/"/g, '\\"')
}
