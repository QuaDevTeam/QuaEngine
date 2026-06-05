import type {
  ResolveOverlayStackPlacementOptions,
  ResolvedOverlayStackPlacement,
  ViewOverlayStackPlacement,
  ViewUiOverlayProjection,
} from '@quajs/render-core'
import {
  compareResolvedOverlayStackPlacement,
  DEFAULT_UI_OVERLAY_Z_INDEXES,
  resolveOverlayStackPlacement,
  resolveUiOverlayStackPlacement,
} from '@quajs/render-core'

export function resolveCocosOverlayPlacement(
  placement: Readonly<ViewOverlayStackPlacement> | undefined,
  defaults: ResolveOverlayStackPlacementOptions = {},
): ResolvedOverlayStackPlacement {
  return resolveOverlayStackPlacement(placement, defaults)
}

export function resolveCocosOverlayZIndex(
  placement: Readonly<ViewOverlayStackPlacement> | undefined,
  defaults: ResolveOverlayStackPlacementOptions = {},
): number {
  return resolveCocosOverlayPlacement(placement, defaults).effectiveZIndex
}

export function resolveCocosUiOverlayPlacement(
  overlay: Readonly<ViewUiOverlayProjection> | undefined,
  defaults: ResolveOverlayStackPlacementOptions = {},
): ResolvedOverlayStackPlacement {
  return resolveUiOverlayStackPlacement(overlay, defaults)
}

export function resolveCocosUiOverlayZIndex(
  overlay: Readonly<ViewUiOverlayProjection> | undefined,
  defaults: ResolveOverlayStackPlacementOptions = {},
): number {
  return resolveCocosUiOverlayPlacement(overlay, defaults).effectiveZIndex
}

export function compareCocosUiOverlayEntries(
  left: readonly [string, Readonly<ViewUiOverlayProjection>],
  right: readonly [string, Readonly<ViewUiOverlayProjection>],
): number {
  return compareResolvedOverlayStackPlacement(
    resolveCocosUiOverlayPlacement(left[1], defaultCocosUiOverlayPlacement(left[0])),
    resolveCocosUiOverlayPlacement(right[1], defaultCocosUiOverlayPlacement(right[0])),
    left[0],
    right[0],
  )
}

export function defaultCocosUiOverlayPlacement(elementId?: string): ResolveOverlayStackPlacementOptions {
  if (elementId === 'confirm' || elementId === 'titleConfirm') {
    return { overlayStack: 'modal', zIndex: DEFAULT_UI_OVERLAY_Z_INDEXES.ui }
  }
  return { overlayStack: 'overlay', zIndex: DEFAULT_UI_OVERLAY_Z_INDEXES.ui }
}
