import type { RenderErrorPayload, ResolveOverlayStackPlacementOptions, ViewOverlayStackPlacement, ViewUiOverlayProjection, ViewUiSceneProjection } from '@quajs/render-core'
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

export function uiSceneDataAttributes(scene: Readonly<ViewUiSceneProjection> | undefined): Record<string, string | undefined> {
  return {
    'data-ui-scene-id': scene?.id,
    'data-ui-scene-presentation': scene?.presentation,
    'data-ui-scene-overlay-variant': scene?.overlay?.variant,
    'data-ui-scene-default-chrome': scene?.overlay?.defaultChrome === false ? 'false' : undefined,
    'data-ui-scene-hide-hud': scene?.overlay?.hideHud ? 'true' : undefined,
    'data-ui-scene-hide-dialogue': scene?.overlay?.hideDialogue ? 'true' : undefined,
  }
}

export function applyUiSceneDataAttributes(element: HTMLElement, scene: Readonly<ViewUiSceneProjection> | undefined): void {
  for (const [name, value] of Object.entries(uiSceneDataAttributes(scene))) {
    if (value === undefined) {
      element.removeAttribute(name)
    }
    else {
      element.setAttribute(name, value)
    }
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
