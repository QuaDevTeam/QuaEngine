import type { QuaWebDomLayerContext, QuaWebDomRendererPlugin } from './core'
import { motionProjectionVars, projectUiOverlay } from '../projection'
import { bindUiControlSkin } from '../ui-skin'
import { defineWebRendererPlugin } from './core'
import { applyStyleVars } from './shared'

export function createUiWebRendererPlugin(): QuaWebDomRendererPlugin {
  return defineWebRendererPlugin({
    name: '@quajs/renderer-web/ui',
    setup() {},
    layers: [{
      id: 'overlay',
      order: 90,
      plane: 'safe',
      render: renderUiLayer,
      update: updateUiLayer,
    }],
  })
}

export const uiWebRendererPlugin = createUiWebRendererPlugin()

function renderUiLayer(context: QuaWebDomLayerContext): Node | undefined {
  const overlays = context.view.ui.overlays
  if (!overlays || Object.keys(overlays).length === 0) {
    return undefined
  }

  const layer = context.document.createElement('div')
  layer.className = 'qua-overlay-layer'
  layer.setAttribute('data-qua-capture-role', 'overlay')
  layer.addEventListener('click', event => event.stopPropagation())
  for (const elementId of Object.keys(overlays)) {
    const overlayConfig = overlays[elementId] as Readonly<Record<string, unknown>> & { skinId?: string }
    const projected = projectUiOverlay(overlayConfig, elementId, context.view.animations, Date.now())
    const overlay = context.document.createElement('div')
    overlay.className = 'qua-ui-overlay'
    overlay.setAttribute('data-overlay', elementId)
    overlay.setAttribute('data-qua-capture-role', 'overlay')
    applyStyleVars(overlay, motionProjectionVars(projected, '--qua-ui'))
    bindUiControlSkin(context, overlay, {
      kind: 'panel',
      skinId: overlayConfig.skinId,
    })
    layer.append(overlay)
  }
  return layer
}

function updateUiLayer(context: QuaWebDomLayerContext, node: Node): void {
  if (!(node instanceof HTMLElement))
    return
  const overlays = context.view.ui.overlays
  if (!overlays)
    return
  for (const elementId of Object.keys(overlays)) {
    const overlay = node.querySelector(`[data-overlay="${cssEscape(elementId)}"]`)
    if (overlay instanceof HTMLElement) {
      const projected = projectUiOverlay(overlays[elementId] as Readonly<Record<string, unknown>>, elementId, context.view.animations, Date.now())
      applyStyleVars(overlay, motionProjectionVars(projected, '--qua-ui'))
    }
  }
}

function cssEscape(value: string): string {
  return typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
    ? CSS.escape(value)
    : value.replace(/"/g, '\\"')
}
