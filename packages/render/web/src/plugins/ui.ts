import type { ResolveOverlayStackPlacementOptions, ViewUiOverlayProjection } from '@quajs/render-core'
import type { QuaWebDomLayerContext, QuaWebDomRendererPlugin } from './core'
import { compareResolvedOverlayStackPlacement, DEFAULT_UI_OVERLAY_Z_INDEXES, resolveActiveUiSceneProjection, resolveUiOverlayStackPlacement } from '@quajs/render-core'
import { motionProjectionVars, projectUiOverlay } from '../projection'
import { bindUiControlSkin } from '../ui-skin'
import { defineWebRendererPlugin } from './core'
import { applyStyleVars, applyUiOverlayStackPlacement, applyUiSceneDataAttributes } from './shared'

export interface UiWebRendererPluginOptions {
  handledElementIds?: readonly string[]
}

export function createUiWebRendererPlugin(options: UiWebRendererPluginOptions = {}): QuaWebDomRendererPlugin {
  return defineWebRendererPlugin({
    name: '@quajs/renderer-web/ui',
    setup() {},
    layers: [{
      id: 'overlay',
      order: 90,
      plane: 'screen',
      render: context => renderUiLayer(context, options),
      update: (context, node) => updateUiLayer(context, node, options),
    }],
  })
}

export const uiWebRendererPlugin = createUiWebRendererPlugin()

function renderUiLayer(context: QuaWebDomLayerContext, options: UiWebRendererPluginOptions): Node | undefined {
  const overlays = context.view.ui.overlays
  const entries = visibleOverlayEntries(overlays, options)
  if (!overlays || entries.length === 0) {
    return undefined
  }

  const activeScene = resolveActiveUiSceneProjection(overlays, defaultUiOverlayPlacement)
  const topEntry = entries[entries.length - 1]
  const layer = context.document.createElement('div')
  layer.className = [
    'qua-overlay-layer',
    activeScene ? 'qua-overlay-layer--ui-scene' : '',
    activeScene?.presentation === 'scene' ? 'qua-overlay-layer--scene' : '',
    activeScene?.presentation === 'overlay' ? 'qua-overlay-layer--overlay' : '',
  ].filter(Boolean).join(' ')
  layer.style.pointerEvents = 'auto'
  layer.setAttribute('data-qua-capture-role', 'overlay')
  applyUiOverlayStackPlacement(layer, topEntry?.[1], defaultUiOverlayPlacement(topEntry?.[0]))
  applyUiSceneDataAttributes(layer, activeScene)
  layer.addEventListener('click', event => event.stopPropagation())
  for (const [elementId, overlayConfig] of entries) {
    const config = overlayConfig as Readonly<Record<string, unknown>> & { skinId?: string }
    const projected = projectUiOverlay(overlayConfig, elementId, context.view.animations, Date.now())
    const overlay = context.document.createElement('div')
    overlay.className = 'qua-ui-overlay'
    overlay.setAttribute('data-overlay', elementId)
    overlay.setAttribute('data-qua-capture-role', 'overlay')
    applyUiOverlayStackPlacement(overlay, overlayConfig, defaultUiOverlayPlacement(elementId))
    applyStyleVars(overlay, motionProjectionVars(projected, '--qua-ui'))
    bindUiControlSkin(context, overlay, {
      kind: 'panel',
      skinId: config.skinId,
    })
    layer.append(overlay)
  }
  return layer
}

function updateUiLayer(context: QuaWebDomLayerContext, node: Node, options: UiWebRendererPluginOptions): void {
  if (!(node instanceof HTMLElement))
    return
  const overlays = context.view.ui.overlays
  if (!overlays)
    return
  const entries = visibleOverlayEntries(overlays, options)
  const topEntry = entries[entries.length - 1]
  applyUiOverlayStackPlacement(node, topEntry?.[1], defaultUiOverlayPlacement(topEntry?.[0]))
  applyUiSceneDataAttributes(node, resolveActiveUiSceneProjection(overlays, defaultUiOverlayPlacement))
  for (const [elementId, overlayConfig] of entries) {
    const overlay = node.querySelector(`[data-overlay="${cssEscape(elementId)}"]`)
    if (overlay instanceof HTMLElement) {
      const projected = projectUiOverlay(overlayConfig as Readonly<Record<string, unknown>>, elementId, context.view.animations, Date.now())
      applyUiOverlayStackPlacement(overlay, overlayConfig, defaultUiOverlayPlacement(elementId))
      applyStyleVars(overlay, motionProjectionVars(projected, '--qua-ui'))
    }
  }
}

function visibleOverlayEntries(
  overlays: Readonly<Record<string, ViewUiOverlayProjection>> | undefined,
  options: UiWebRendererPluginOptions,
): Array<[string, ViewUiOverlayProjection]> {
  if (!overlays) {
    return []
  }
  const handled = new Set(options.handledElementIds || [])
  return Object.entries(overlays)
    .filter(([elementId]) => !handled.has(elementId))
    .sort(compareUiOverlayEntries)
}

function compareUiOverlayEntries(left: [string, ViewUiOverlayProjection], right: [string, ViewUiOverlayProjection]): number {
  return compareResolvedOverlayStackPlacement(
    resolveUiOverlayStackPlacement(left[1], defaultUiOverlayPlacement(left[0])),
    resolveUiOverlayStackPlacement(right[1], defaultUiOverlayPlacement(right[0])),
    left[0],
    right[0],
  )
}

function defaultUiOverlayPlacement(elementId?: string): ResolveOverlayStackPlacementOptions {
  if (elementId === 'confirm' || elementId === 'titleConfirm') {
    return { overlayStack: 'modal', zIndex: DEFAULT_UI_OVERLAY_Z_INDEXES.ui }
  }
  return { overlayStack: 'overlay', zIndex: DEFAULT_UI_OVERLAY_Z_INDEXES.ui }
}

function cssEscape(value: string): string {
  return typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
    ? CSS.escape(value)
    : value.replace(/"/g, '\\"')
}
