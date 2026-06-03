import type { QuaWebDomLayerContext, QuaWebDomRendererPlugin } from './core'
import type { ViewUiOverlayProjection, ViewUiSceneProjection } from '@quajs/render-core'
import { motionProjectionVars, projectUiOverlay } from '../projection'
import { bindUiControlSkin } from '../ui-skin'
import { defineWebRendererPlugin } from './core'
import { applyStyleVars } from './shared'

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
  const elementIds = visibleOverlayElementIds(overlays, options)
  if (!overlays || elementIds.length === 0) {
    return undefined
  }

  const activeScene = resolveActiveUiScene(overlays)
  const layer = context.document.createElement('div')
  layer.className = [
    'qua-overlay-layer',
    activeScene ? 'qua-overlay-layer--ui-scene' : '',
    activeScene?.presentation === 'scene' ? 'qua-overlay-layer--scene' : '',
    activeScene?.presentation === 'overlay' ? 'qua-overlay-layer--overlay' : '',
  ].filter(Boolean).join(' ')
  layer.style.pointerEvents = 'auto'
  layer.setAttribute('data-qua-capture-role', 'overlay')
  applyUiSceneDataset(layer, activeScene)
  layer.addEventListener('click', event => event.stopPropagation())
  for (const elementId of elementIds) {
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

function updateUiLayer(context: QuaWebDomLayerContext, node: Node, options: UiWebRendererPluginOptions): void {
  if (!(node instanceof HTMLElement))
    return
  const overlays = context.view.ui.overlays
  if (!overlays)
    return
  applyUiSceneDataset(node, resolveActiveUiScene(overlays))
  for (const elementId of visibleOverlayElementIds(overlays, options)) {
    const overlay = node.querySelector(`[data-overlay="${cssEscape(elementId)}"]`)
    if (overlay instanceof HTMLElement) {
      const projected = projectUiOverlay(overlays[elementId] as Readonly<Record<string, unknown>>, elementId, context.view.animations, Date.now())
      applyStyleVars(overlay, motionProjectionVars(projected, '--qua-ui'))
    }
  }
}

function visibleOverlayElementIds(
  overlays: Readonly<Record<string, ViewUiOverlayProjection>> | undefined,
  options: UiWebRendererPluginOptions,
): string[] {
  if (!overlays) {
    return []
  }
  const handled = new Set(options.handledElementIds || [])
  return Object.keys(overlays).filter(elementId => !handled.has(elementId))
}

function resolveActiveUiScene(overlays: Readonly<Record<string, ViewUiOverlayProjection>>): ViewUiSceneProjection | undefined {
  const scenes = Object.values(overlays)
    .map(overlay => overlay.scene)
    .filter((scene): scene is ViewUiSceneProjection => Boolean(scene?.id))
  return scenes.find(scene => scene.presentation === 'scene') || scenes[0]
}

function applyUiSceneDataset(element: HTMLElement, scene: ViewUiSceneProjection | undefined): void {
  setOptionalAttribute(element, 'data-ui-scene-id', scene?.id)
  setOptionalAttribute(element, 'data-ui-scene-presentation', scene?.presentation)
  setOptionalAttribute(element, 'data-ui-scene-overlay-variant', scene?.overlay?.variant)
  setOptionalAttribute(element, 'data-ui-scene-hide-hud', scene?.overlay?.hideHud ? 'true' : undefined)
  setOptionalAttribute(element, 'data-ui-scene-hide-dialogue', scene?.overlay?.hideDialogue ? 'true' : undefined)
}

function setOptionalAttribute(element: HTMLElement, name: string, value: string | undefined): void {
  if (value === undefined) {
    element.removeAttribute(name)
    return
  }
  element.setAttribute(name, value)
}

function cssEscape(value: string): string {
  return typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
    ? CSS.escape(value)
    : value.replace(/"/g, '\\"')
}
