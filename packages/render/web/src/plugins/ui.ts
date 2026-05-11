import type { QuaWebDomLayerContext, QuaWebDomRendererPlugin } from './core'
import { defineWebRendererPlugin } from './core'

export function createUiWebRendererPlugin(): QuaWebDomRendererPlugin {
  return defineWebRendererPlugin({
    name: '@quajs/renderer-web/ui',
    setup() {},
    layers: [{
      id: 'overlay',
      order: 90,
      render: renderUiLayer,
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
  layer.addEventListener('click', event => event.stopPropagation())
  for (const elementId of Object.keys(overlays)) {
    const overlay = context.document.createElement('div')
    overlay.className = 'qua-ui-overlay'
    overlay.setAttribute('data-overlay', elementId)
    layer.append(overlay)
  }
  return layer
}
