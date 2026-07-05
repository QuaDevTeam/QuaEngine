import type {
  NativeQssResolvedBounds,
  NativeQuiProp,
  NativeUiSurfaceNodeProjection,
  NativeUiSurfaceRect,
} from './types'
import { numberProp } from './projection-props'

export const ZERO_RECT: NativeUiSurfaceRect = {
  x: 0,
  y: 0,
  width: 0,
  height: 0,
}

export type NativeQuiNumberPropResolver = (
  props: readonly NativeQuiProp[],
  name: string,
) => number | undefined

export function rectFromProps(
  props: readonly NativeQuiProp[],
  bounds: NativeQssResolvedBounds | undefined,
  parentBounds: NativeUiSurfaceRect | undefined,
  resolveNumberProp: NativeQuiNumberPropResolver = numberProp,
): NativeUiSurfaceRect {
  const width = resolveNumberProp(props, 'width') ?? bounds?.width ?? 0
  const height = resolveNumberProp(props, 'height') ?? bounds?.height ?? 0
  return {
    x: resolveNumberProp(props, 'x') ?? resolveNativeQssBoundX(bounds, parentBounds, width),
    y: resolveNumberProp(props, 'y') ?? resolveNativeQssBoundY(bounds, parentBounds, height),
    width,
    height,
  }
}

export function pruneSurfaceNode(node: NativeUiSurfaceNodeProjection): NativeUiSurfaceNodeProjection {
  if (node.clipChildren === undefined)
    delete node.clipChildren
  if (node.zIndex === undefined)
    delete node.zIndex
  if (node.opacity === undefined)
    delete node.opacity
  if (node.scrollOffsetX === undefined)
    delete node.scrollOffsetX
  if (node.scrollOffsetY === undefined)
    delete node.scrollOffsetY
  if (!node.text)
    delete node.text
  if (!node.image)
    delete node.image
  if (!node.intent)
    delete node.intent
  if (!node.style || Object.keys(node.style).length === 0)
    delete node.style
  if (!node.provenance || Object.keys(node.provenance).length === 0)
    delete node.provenance
  if (!node.children || node.children.length === 0)
    delete node.children
  return node
}

function resolveNativeQssBoundX(
  bounds: NativeQssResolvedBounds | undefined,
  parentBounds: NativeUiSurfaceRect | undefined,
  width: number,
): number {
  if (bounds?.x !== undefined)
    return bounds.x
  if (bounds?.right !== undefined && parentBounds)
    return parentBounds.x + parentBounds.width - width - bounds.right
  return 0
}

function resolveNativeQssBoundY(
  bounds: NativeQssResolvedBounds | undefined,
  parentBounds: NativeUiSurfaceRect | undefined,
  height: number,
): number {
  if (bounds?.y !== undefined)
    return bounds.y
  if (bounds?.bottom !== undefined && parentBounds)
    return parentBounds.y + parentBounds.height - height - bounds.bottom
  return 0
}
