import type {
  NativeQssResolvedBounds,
  NativeQssResolvedLayout,
  NativeQuiProp,
  NativeUiSurfaceNodeKind,
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

export function rectFromProps(
  props: readonly NativeQuiProp[],
  bounds: NativeQssResolvedBounds | undefined,
  parentBounds: NativeUiSurfaceRect | undefined,
): NativeUiSurfaceRect {
  const width = numberProp(props, 'width') ?? bounds?.width ?? 0
  const height = numberProp(props, 'height') ?? bounds?.height ?? 0
  return {
    x: numberProp(props, 'x') ?? resolveNativeQssBoundX(bounds, parentBounds, width),
    y: numberProp(props, 'y') ?? resolveNativeQssBoundY(bounds, parentBounds, height),
    width,
    height,
  }
}

export function applyNativeQssStructuralLayout(
  kind: NativeUiSurfaceNodeKind,
  bounds: NativeUiSurfaceRect,
  children: readonly NativeUiSurfaceNodeProjection[],
  layout: NativeQssResolvedLayout | undefined,
): NativeUiSurfaceNodeProjection[] {
  if (!layout || children.length === 0)
    return [...children]

  switch (kind) {
    case 'Row':
      return layoutRowChildren(children, bounds, layout.columnGap ?? 0)
    case 'Column':
      return layoutColumnChildren(children, bounds, layout.rowGap ?? 0)
    case 'Grid':
      return layoutGridChildren(children, bounds, layout)
    default:
      return [...children]
  }
}

export function pruneSurfaceNode(node: NativeUiSurfaceNodeProjection): NativeUiSurfaceNodeProjection {
  if (node.visible === undefined)
    delete node.visible
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

function layoutRowChildren(
  children: readonly NativeUiSurfaceNodeProjection[],
  bounds: NativeUiSurfaceRect,
  gap: number,
): NativeUiSurfaceNodeProjection[] {
  let cursorX = 0
  return children.map((child) => {
    const localX = cursorX + child.bounds.x
    const x = bounds.x + localX
    const y = bounds.y + child.bounds.y
    cursorX = localX + child.bounds.width + gap
    return withBounds(child, { ...child.bounds, x, y })
  })
}

function layoutColumnChildren(
  children: readonly NativeUiSurfaceNodeProjection[],
  bounds: NativeUiSurfaceRect,
  gap: number,
): NativeUiSurfaceNodeProjection[] {
  let cursorY = 0
  return children.map((child) => {
    const x = bounds.x + child.bounds.x
    const localY = cursorY + child.bounds.y
    const y = bounds.y + localY
    cursorY = localY + child.bounds.height + gap
    return withBounds(child, { ...child.bounds, x, y })
  })
}

function layoutGridChildren(
  children: readonly NativeUiSurfaceNodeProjection[],
  bounds: NativeUiSurfaceRect,
  layout: NativeQssResolvedLayout,
): NativeUiSurfaceNodeProjection[] {
  const columnGap = layout.columnGap ?? 0
  const rowGap = layout.rowGap ?? 0
  const maxWidth = bounds.width > 0 ? bounds.width : undefined
  let cursorX = 0
  let cursorY = 0
  let rowHeight = 0

  return children.map((child) => {
    if (
      maxWidth !== undefined
      && cursorX > 0
      && cursorX + child.bounds.x + child.bounds.width > maxWidth
    ) {
      cursorX = 0
      cursorY += rowHeight + rowGap
      rowHeight = 0
    }

    const localX = cursorX + child.bounds.x
    const localY = cursorY + child.bounds.y
    const x = bounds.x + localX
    const y = bounds.y + localY
    cursorX = localX + child.bounds.width + columnGap
    rowHeight = Math.max(rowHeight, child.bounds.y + child.bounds.height)
    return withBounds(child, { ...child.bounds, x, y })
  })
}

function withBounds(
  child: NativeUiSurfaceNodeProjection,
  bounds: NativeUiSurfaceRect,
): NativeUiSurfaceNodeProjection {
  return {
    ...child,
    bounds,
  }
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
