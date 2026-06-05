import type { ResolveOverlayStackPlacementOptions, ViewOverlayStackPlacement, ViewUiOverlayProjection } from '@quajs/render-core'
import { resolveOverlayStackPlacement, resolveUiOverlayStackPlacement } from '@quajs/render-core'

export interface VueOverlayStackBinding {
  attrs: Record<string, string>
  style: Record<string, string | number>
}

export function createOverlayStackBinding(
  placement: Readonly<ViewOverlayStackPlacement> | undefined,
  defaults: ResolveOverlayStackPlacementOptions = {},
): VueOverlayStackBinding {
  const resolved = resolveOverlayStackPlacement(placement, defaults)
  return {
    attrs: {
      'data-overlay-stack': resolved.overlayStack,
      'data-overlay-stack-priority': String(resolved.stackPriority),
      'data-overlay-z-index': String(resolved.zIndex),
      'data-overlay-effective-z-index': String(resolved.effectiveZIndex),
    },
    style: {
      zIndex: resolved.effectiveZIndex,
    },
  }
}

export function createUiOverlayStackBinding(
  overlay: Readonly<ViewUiOverlayProjection> | undefined,
  defaults: ResolveOverlayStackPlacementOptions = {},
): VueOverlayStackBinding {
  const resolved = resolveUiOverlayStackPlacement(overlay, defaults)
  return {
    attrs: {
      'data-overlay-stack': resolved.overlayStack,
      'data-overlay-stack-priority': String(resolved.stackPriority),
      'data-overlay-z-index': String(resolved.zIndex),
      'data-overlay-effective-z-index': String(resolved.effectiveZIndex),
    },
    style: {
      zIndex: resolved.effectiveZIndex,
    },
  }
}
