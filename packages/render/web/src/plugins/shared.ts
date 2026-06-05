import type { RenderErrorPayload, ResolveOverlayStackPlacementOptions, ViewOverlayStackPlacement, ViewUiOverlayProjection } from '@quajs/render-core'
import type { QuaWebDomLayerContext } from './core'
import { resolveOverlayStackPlacement, resolveUiOverlayStackPlacement } from '@quajs/render-core'

type RendererIntentDispatchOptions = Pick<Partial<RenderErrorPayload>, 'message' | 'phase' | 'metadata' | 'pluginName'>

export function applyStyleVars(element: HTMLElement, vars: Record<string, string | number> | undefined): void {
  if (!vars) {
    return
  }
  for (const [name, value] of Object.entries(vars)) {
    element.style.setProperty(name, String(value))
  }
}

export function assignData(element: HTMLElement, name: string, value: unknown): void {
  if (value !== undefined && value !== null) {
    element.setAttribute(name, String(value))
  }
}

export function applyOverlayStackPlacement(
  element: HTMLElement,
  placement: Readonly<ViewOverlayStackPlacement> | undefined,
  defaults: ResolveOverlayStackPlacementOptions = {},
): void {
  const resolved = resolveOverlayStackPlacement(placement, defaults)
  element.style.zIndex = String(resolved.effectiveZIndex)
  element.setAttribute('data-overlay-stack', resolved.overlayStack)
  element.setAttribute('data-overlay-stack-priority', String(resolved.stackPriority))
  element.setAttribute('data-overlay-z-index', String(resolved.zIndex))
  element.setAttribute('data-overlay-effective-z-index', String(resolved.effectiveZIndex))
}

export function applyUiOverlayStackPlacement(
  element: HTMLElement,
  overlay: Readonly<ViewUiOverlayProjection> | undefined,
  defaults: ResolveOverlayStackPlacementOptions = {},
): void {
  const resolved = resolveUiOverlayStackPlacement(overlay, defaults)
  element.style.zIndex = String(resolved.effectiveZIndex)
  element.setAttribute('data-overlay-stack', resolved.overlayStack)
  element.setAttribute('data-overlay-stack-priority', String(resolved.stackPriority))
  element.setAttribute('data-overlay-z-index', String(resolved.zIndex))
  element.setAttribute('data-overlay-effective-z-index', String(resolved.effectiveZIndex))
}

export function dispatchRendererIntent(
  context: Pick<QuaWebDomLayerContext, 'controller'>,
  action: () => Promise<void>,
  options: RendererIntentDispatchOptions = {},
): void {
  void Promise.resolve()
    .then(action)
    .catch((error) => {
      void context.controller.reportError(error, {
        message: options.message || 'Renderer intent dispatch failed.',
        phase: options.phase || 'renderer:intent',
        metadata: options.metadata,
        pluginName: options.pluginName,
      })
    })
}
