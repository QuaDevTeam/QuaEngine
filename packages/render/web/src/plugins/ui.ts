import type { QuaViewProjection, ResolveOverlayStackPlacementOptions, RendererActions, ViewUiOverlayProjection, ViewUiOverlaySurfaceProjection } from '@quajs/render-core'
import type { QuaWebDomLayerContext, QuaWebDomRendererPlugin } from './core'
import {
  compareResolvedOverlayStackPlacement,
  DEFAULT_UI_OVERLAY_Z_INDEXES,
  getUiOverlaySurfaceProjection,
  resolveActiveUiSceneProjection,
  resolveUiOverlayStackPlacement,
  uiOverlayIsInteractive,
  uiOverlayIsRenderOnly,
} from '@quajs/render-core'
import { motionProjectionVars, projectUiOverlay } from '../projection'
import { bindUiControlSkin } from '../ui-skin'
import { defineWebRendererPlugin } from './core'
import { applyStyleVars, applyUiOverlayStackPlacement, applyUiSceneDataAttributes } from './shared'

export interface UiWebRenderOnlySurfaceContext {
  elementId: string
  overlay: Readonly<ViewUiOverlayProjection>
  surface: Readonly<ViewUiOverlaySurfaceProjection>
  projected: Readonly<Record<string, unknown>>
  view: Readonly<QuaViewProjection>
  actions: RendererActions
  document: Document
  root: HTMLElement
  layerContext: QuaWebDomLayerContext
}

export type UiWebRenderOnlySurfaceResult
  = | Node
    | {
      node?: Node | null
      destroy?: () => void
    }
    | null
    | undefined

export type UiWebRenderOnlySurfaceFactory = (
  context: UiWebRenderOnlySurfaceContext,
) => UiWebRenderOnlySurfaceResult

export interface UiWebRendererPluginOptions {
  handledElementIds?: readonly string[]
  renderOnlySurfaces?: Readonly<Record<string, UiWebRenderOnlySurfaceFactory>>
}

interface UiWebRendererPluginRuntime {
  renderOnlyDisposers: Array<() => void>
  warnedMissingSurfaces: Set<string>
}

export function createUiWebRendererPlugin(options: UiWebRendererPluginOptions = {}): QuaWebDomRendererPlugin {
  const runtime: UiWebRendererPluginRuntime = {
    renderOnlyDisposers: [],
    warnedMissingSurfaces: new Set<string>(),
  }
  return defineWebRendererPlugin({
    name: '@quajs/renderer-web/ui',
    setup(context) {
      context.addDisposer(() => destroyRenderOnlySurfaces(runtime))
    },
    layers: [{
      id: 'overlay',
      order: 90,
      plane: 'screen',
      render: context => renderUiLayer(context, options, runtime),
      update: (context, node) => updateUiLayer(context, node, options),
    }],
  })
}

export const uiWebRendererPlugin = createUiWebRendererPlugin()

function renderUiLayer(
  context: QuaWebDomLayerContext,
  options: UiWebRendererPluginOptions,
  runtime: UiWebRendererPluginRuntime,
): Node | undefined {
  destroyRenderOnlySurfaces(runtime)
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
  layer.style.pointerEvents = entries.some(([, overlay]) => uiOverlayIsInteractive(overlay)) ? 'auto' : 'none'
  layer.setAttribute('data-qua-capture-role', 'overlay')
  applyUiOverlayStackPlacement(layer, topEntry?.[1], defaultUiOverlayPlacement(topEntry?.[0]))
  applyUiSceneDataAttributes(layer, activeScene)
  layer.addEventListener('click', event => event.stopPropagation())
  for (const [elementId, overlayConfig] of entries) {
    if (uiOverlayIsRenderOnly(overlayConfig)) {
      layer.append(renderRenderOnlyOverlay(context, options, runtime, elementId, overlayConfig))
      continue
    }
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
  node.style.pointerEvents = entries.some(([, overlay]) => uiOverlayIsInteractive(overlay)) ? 'auto' : 'none'
  applyUiOverlayStackPlacement(node, topEntry?.[1], defaultUiOverlayPlacement(topEntry?.[0]))
  applyUiSceneDataAttributes(node, resolveActiveUiSceneProjection(overlays, defaultUiOverlayPlacement))
  for (const [elementId, overlayConfig] of entries) {
    const overlay = node.querySelector(`[data-overlay="${cssEscape(elementId)}"]`)
    if (overlay instanceof HTMLElement) {
      const projected = projectUiOverlay(overlayConfig as Readonly<Record<string, unknown>>, elementId, context.view.animations, Date.now())
      applyUiOverlayStackPlacement(overlay, overlayConfig, defaultUiOverlayPlacement(elementId))
      applyStyleVars(overlay, motionProjectionVars(projected, '--qua-ui'))
      overlay.style.pointerEvents = uiOverlayIsInteractive(overlayConfig) ? 'auto' : 'none'
    }
  }
}

function renderRenderOnlyOverlay(
  context: QuaWebDomLayerContext,
  options: UiWebRendererPluginOptions,
  runtime: UiWebRendererPluginRuntime,
  elementId: string,
  overlayConfig: ViewUiOverlayProjection,
): HTMLElement {
  const projected = projectUiOverlay(overlayConfig, elementId, context.view.animations, Date.now())
  const root = context.document.createElement('div')
  root.className = 'qua-ui-overlay qua-ui-overlay--render-only'
  root.setAttribute('data-overlay', elementId)
  root.setAttribute('data-overlay-render-mode', 'render-only')
  root.setAttribute('data-qua-capture-role', 'overlay')
  root.style.position = 'absolute'
  root.style.inset = '0'
  root.style.pointerEvents = uiOverlayIsInteractive(overlayConfig) ? 'auto' : 'none'
  applyUiOverlayStackPlacement(root, overlayConfig, defaultUiOverlayPlacement(elementId))
  applyStyleVars(root, motionProjectionVars(projected, '--qua-ui'))

  const surface = getUiOverlaySurfaceProjection(overlayConfig)
  const surfaceKey = surface?.key.trim()
  if (surfaceKey) {
    root.setAttribute('data-overlay-surface-key', surfaceKey)
  }

  const renderSurface = surfaceKey ? options.renderOnlySurfaces?.[surfaceKey] : undefined
  if (!surface || !surfaceKey || !renderSurface) {
    warnMissingRenderOnlySurface(context, runtime, elementId, surfaceKey)
    return root
  }

  try {
    const result = renderSurface({
      elementId,
      overlay: overlayConfig,
      surface,
      projected,
      view: context.view,
      actions: context.actions,
      document: context.document,
      root,
      layerContext: context,
    })
    const mount = normalizeRenderOnlySurfaceResult(result)
    if (mount.node) {
      root.append(mount.node)
    }
    if (mount.destroy) {
      runtime.renderOnlyDisposers.push(mount.destroy)
    }
  }
  catch (error) {
    void context.controller.reportError(error, {
      message: `Render-only overlay surface "${surfaceKey}" failed to render.`,
      phase: 'ui-render-only-surface:render',
      pluginName: '@quajs/renderer-web/ui',
      metadata: { elementId, surfaceKey },
    })
  }
  return root
}

function normalizeRenderOnlySurfaceResult(result: UiWebRenderOnlySurfaceResult): {
  node?: Node | null
  destroy?: () => void
} {
  if (!result) {
    return {}
  }
  if (isDomNode(result)) {
    return { node: result }
  }
  return result
}

function isDomNode(value: unknown): value is Node {
  return Boolean(value && typeof value === 'object' && typeof (value as Node).nodeType === 'number')
}

function warnMissingRenderOnlySurface(
  context: QuaWebDomLayerContext,
  runtime: UiWebRendererPluginRuntime,
  elementId: string,
  surfaceKey: string | undefined,
): void {
  const warningKey = `${elementId}:${surfaceKey || '<missing>'}`
  if (runtime.warnedMissingSurfaces.has(warningKey)) {
    return
  }
  runtime.warnedMissingSurfaces.add(warningKey)
  void context.controller.reportError(new Error('Render-only overlay surface renderer is not registered.'), {
    message: surfaceKey
      ? `Render-only overlay surface "${surfaceKey}" is not registered.`
      : `Render-only overlay "${elementId}" is missing surface.key.`,
    phase: 'ui-render-only-surface:resolve',
    pluginName: '@quajs/renderer-web/ui',
    severity: 'warning',
    recoverable: true,
    metadata: { elementId, surfaceKey },
  })
}

function destroyRenderOnlySurfaces(runtime: UiWebRendererPluginRuntime): void {
  while (runtime.renderOnlyDisposers.length > 0) {
    const dispose = runtime.renderOnlyDisposers.pop()
    try {
      dispose?.()
    }
    catch (error) {
      console.warn('[quajs:renderer-web] Render-only overlay surface cleanup failed.', error)
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
