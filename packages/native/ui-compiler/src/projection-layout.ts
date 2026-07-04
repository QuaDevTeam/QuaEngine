import type {
  NativeQssEdgeInsetsValue,
  NativeQssResolvedLayout,
  NativeUiSurfaceNodeKind,
  NativeUiSurfaceNodeProjection,
  NativeUiSurfaceRect,
} from './types'

export interface NativeUiCompilerSurfaceNodeProjection extends NativeUiSurfaceNodeProjection {
  children?: NativeUiCompilerSurfaceNodeProjection[]
  compilerLayout?: NativeQssResolvedLayout
}

const ZERO_INSETS: NativeQssEdgeInsetsValue = {
  bottom: 0,
  left: 0,
  right: 0,
  top: 0,
}

export function applyNativeQssStructuralLayout(
  kind: NativeUiSurfaceNodeKind,
  bounds: NativeUiSurfaceRect,
  children: readonly NativeUiCompilerSurfaceNodeProjection[],
  layout: NativeQssResolvedLayout | undefined,
): NativeUiCompilerSurfaceNodeProjection[] {
  if (children.length === 0)
    return []

  const hasChildMargin = children.some(child => child.compilerLayout?.margin)
  if (!layout && !hasChildMargin)
    return [...children]

  switch (kind) {
    case 'Row':
      return layoutRowChildren(children, bounds, layout?.columnGap ?? 0)
    case 'Column':
      return layoutColumnChildren(children, bounds, layout?.rowGap ?? 0)
    case 'Grid':
      return layoutGridChildren(children, bounds, layout)
    default:
      return [...children]
  }
}

export function stripNativeQssCompilerLayout(
  node: NativeUiCompilerSurfaceNodeProjection,
): NativeUiSurfaceNodeProjection {
  const {
    children,
    compilerLayout: _compilerLayout,
    ...surfaceNode
  } = node

  return children?.length
    ? {
        ...surfaceNode,
        children: children.map(stripNativeQssCompilerLayout),
      }
    : surfaceNode
}

function layoutRowChildren(
  children: readonly NativeUiCompilerSurfaceNodeProjection[],
  bounds: NativeUiSurfaceRect,
  gap: number,
): NativeUiCompilerSurfaceNodeProjection[] {
  let cursorX = 0
  return children.map((child) => {
    const margin = marginFor(child)
    const localX = cursorX + margin.left + child.bounds.x
    const x = bounds.x + localX
    const y = bounds.y + margin.top + child.bounds.y
    cursorX = localX + child.bounds.width + margin.right + gap
    return withBounds(child, { ...child.bounds, x, y })
  })
}

function layoutColumnChildren(
  children: readonly NativeUiCompilerSurfaceNodeProjection[],
  bounds: NativeUiSurfaceRect,
  gap: number,
): NativeUiCompilerSurfaceNodeProjection[] {
  let cursorY = 0
  return children.map((child) => {
    const margin = marginFor(child)
    const x = bounds.x + margin.left + child.bounds.x
    const localY = cursorY + margin.top + child.bounds.y
    const y = bounds.y + localY
    cursorY = localY + child.bounds.height + margin.bottom + gap
    return withBounds(child, { ...child.bounds, x, y })
  })
}

function layoutGridChildren(
  children: readonly NativeUiCompilerSurfaceNodeProjection[],
  bounds: NativeUiSurfaceRect,
  layout: NativeQssResolvedLayout | undefined,
): NativeUiCompilerSurfaceNodeProjection[] {
  const columnGap = layout?.columnGap ?? 0
  const rowGap = layout?.rowGap ?? 0
  const maxWidth = bounds.width > 0 ? bounds.width : undefined
  let cursorX = 0
  let cursorY = 0
  let rowHeight = 0

  return children.map((child) => {
    const margin = marginFor(child)
    const outerWidth = margin.left + child.bounds.x + child.bounds.width + margin.right
    if (
      maxWidth !== undefined
      && cursorX > 0
      && cursorX + outerWidth > maxWidth
    ) {
      cursorX = 0
      cursorY += rowHeight + rowGap
      rowHeight = 0
    }

    const localX = cursorX + margin.left + child.bounds.x
    const localY = cursorY + margin.top + child.bounds.y
    const x = bounds.x + localX
    const y = bounds.y + localY
    cursorX += outerWidth + columnGap
    rowHeight = Math.max(
      rowHeight,
      margin.top + child.bounds.y + child.bounds.height + margin.bottom,
    )
    return withBounds(child, { ...child.bounds, x, y })
  })
}

function marginFor(child: NativeUiCompilerSurfaceNodeProjection): NativeQssEdgeInsetsValue {
  return child.compilerLayout?.margin ?? ZERO_INSETS
}

function withBounds(
  child: NativeUiCompilerSurfaceNodeProjection,
  bounds: NativeUiSurfaceRect,
): NativeUiCompilerSurfaceNodeProjection {
  return {
    ...child,
    bounds,
  }
}
