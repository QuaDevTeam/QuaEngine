import type {
  ResolvedOverlayStackPlacement,
  ResolveOverlayStackPlacementOptions,
  ViewOverlayStackPlacement,
  ViewUiOverlayProjection,
} from '@quajs/render-core'
import {
  compareResolvedOverlayStackPlacement,
  DEFAULT_UI_OVERLAY_Z_INDEXES,
  resolveOverlayStackPlacement,
  resolveUiOverlayStackPlacement,
} from '@quajs/render-core'

export function resolveSceneOverlayPlacement(
  placement: Readonly<ViewOverlayStackPlacement> | undefined,
  defaults: ResolveOverlayStackPlacementOptions = {},
): ResolvedOverlayStackPlacement {
  return resolveOverlayStackPlacement(placement, defaults)
}

export function resolveSceneOverlayZIndex(
  placement: Readonly<ViewOverlayStackPlacement> | undefined,
  defaults: ResolveOverlayStackPlacementOptions = {},
): number {
  return resolveSceneOverlayPlacement(placement, defaults).effectiveZIndex
}

export function resolveSceneUiOverlayPlacement(
  overlay: Readonly<ViewUiOverlayProjection> | undefined,
  defaults: ResolveOverlayStackPlacementOptions = {},
): ResolvedOverlayStackPlacement {
  return resolveUiOverlayStackPlacement(overlay, defaults)
}

export function resolveSceneUiOverlayZIndex(
  overlay: Readonly<ViewUiOverlayProjection> | undefined,
  defaults: ResolveOverlayStackPlacementOptions = {},
): number {
  return resolveSceneUiOverlayPlacement(overlay, defaults).effectiveZIndex
}

export function compareSceneUiOverlayEntries(
  left: readonly [string, Readonly<ViewUiOverlayProjection>],
  right: readonly [string, Readonly<ViewUiOverlayProjection>],
): number {
  return compareResolvedOverlayStackPlacement(
    resolveSceneUiOverlayPlacement(left[1], defaultSceneUiOverlayPlacement(left[0])),
    resolveSceneUiOverlayPlacement(right[1], defaultSceneUiOverlayPlacement(right[0])),
    left[0],
    right[0],
  )
}

export function defaultSceneUiOverlayPlacement(elementId?: string): ResolveOverlayStackPlacementOptions {
  if (elementId === 'confirm' || elementId === 'titleConfirm') {
    return { overlayStack: 'modal', zIndex: DEFAULT_UI_OVERLAY_Z_INDEXES.ui }
  }
  return { overlayStack: 'overlay', zIndex: DEFAULT_UI_OVERLAY_Z_INDEXES.ui }
}
