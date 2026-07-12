import type {
  NativeQssAlignItemsValue,
  NativeQssEdgeInsetsValue,
  NativeQssJustifyContentValue,
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

interface MainAxisDistribution {
  gap: number
  startOffset: number
}

export function applyNativeQssStructuralLayout(
  kind: NativeUiSurfaceNodeKind,
  bounds: NativeUiSurfaceRect,
  children: readonly NativeUiCompilerSurfaceNodeProjection[],
  layout: NativeQssResolvedLayout | undefined,
): NativeUiCompilerSurfaceNodeProjection[] {
  if (children.length === 0)
    return []

  const hasChildLayout = children.some(child =>
    child.compilerLayout?.margin
    || child.compilerLayout?.position === 'absolute')
  if (!layout && !hasChildLayout)
    return [...children]

  switch (kind) {
    case 'Row':
      return layoutRowChildren(children, bounds, layout)
    case 'Column':
      return layoutColumnChildren(children, bounds, layout)
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
  layout: NativeQssResolvedLayout | undefined,
): NativeUiCompilerSurfaceNodeProjection[] {
  const distribution = distributeMainAxis(
    bounds.width,
    children.filter(child => !isAbsolute(child)).map(rowOuterWidth),
    layout?.columnGap ?? 0,
    layout?.justifyContent,
  )
  let cursorX = distribution.startOffset
  return children.map((child) => {
    if (isAbsolute(child))
      return withBounds(child, absoluteBounds(child, bounds))

    const margin = marginFor(child)
    const crossOffset = alignCrossAxis(
      bounds.height,
      rowOuterHeight(child),
      layout?.alignItems,
    )
    const localX = cursorX + margin.left + child.bounds.x
    const x = bounds.x + localX
    const y = bounds.y + crossOffset + margin.top + child.bounds.y
    cursorX += rowOuterWidth(child) + distribution.gap
    return withBounds(child, { ...child.bounds, x, y })
  })
}

function layoutColumnChildren(
  children: readonly NativeUiCompilerSurfaceNodeProjection[],
  bounds: NativeUiSurfaceRect,
  layout: NativeQssResolvedLayout | undefined,
): NativeUiCompilerSurfaceNodeProjection[] {
  const distribution = distributeMainAxis(
    bounds.height,
    children.filter(child => !isAbsolute(child)).map(columnOuterHeight),
    layout?.rowGap ?? 0,
    layout?.justifyContent,
  )
  let cursorY = distribution.startOffset
  return children.map((child) => {
    if (isAbsolute(child))
      return withBounds(child, absoluteBounds(child, bounds))

    const margin = marginFor(child)
    const crossOffset = alignCrossAxis(
      bounds.width,
      columnOuterWidth(child),
      layout?.alignItems,
    )
    const x = bounds.x + crossOffset + margin.left + child.bounds.x
    const localY = cursorY + margin.top + child.bounds.y
    const y = bounds.y + localY
    cursorY += columnOuterHeight(child) + distribution.gap
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
    if (isAbsolute(child))
      return withBounds(child, absoluteBounds(child, bounds))

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

function distributeMainAxis(
  containerSize: number,
  itemOuterSizes: readonly number[],
  baseGap: number,
  justifyContent: NativeQssJustifyContentValue | undefined,
): MainAxisDistribution {
  const itemCount = itemOuterSizes.length
  if (itemCount === 0) {
    return {
      gap: baseGap,
      startOffset: 0,
    }
  }

  const usedSize = itemOuterSizes.reduce((sum, size) => sum + size, 0)
    + baseGap * Math.max(0, itemCount - 1)
  const freeSpace = Math.max(0, containerSize - usedSize)

  switch (justifyContent) {
    case 'center':
      return {
        gap: baseGap,
        startOffset: freeSpace / 2,
      }
    case 'flex-end':
      return {
        gap: baseGap,
        startOffset: freeSpace,
      }
    case 'space-around': {
      const distributed = freeSpace / itemCount
      return {
        gap: baseGap + distributed,
        startOffset: distributed / 2,
      }
    }
    case 'space-between':
      return {
        gap: itemCount > 1 ? baseGap + freeSpace / (itemCount - 1) : baseGap,
        startOffset: 0,
      }
    case 'space-evenly': {
      const distributed = freeSpace / (itemCount + 1)
      return {
        gap: baseGap + distributed,
        startOffset: distributed,
      }
    }
    case 'flex-start':
    default:
      return {
        gap: baseGap,
        startOffset: 0,
      }
  }
}

function alignCrossAxis(
  containerSize: number,
  itemOuterSize: number,
  alignItems: NativeQssAlignItemsValue | undefined,
): number {
  const freeSpace = Math.max(0, containerSize - itemOuterSize)
  switch (alignItems) {
    case 'center':
      return freeSpace / 2
    case 'flex-end':
      return freeSpace
    case 'flex-start':
    default:
      return 0
  }
}

function rowOuterWidth(child: NativeUiCompilerSurfaceNodeProjection): number {
  const margin = marginFor(child)
  return margin.left + child.bounds.x + child.bounds.width + margin.right
}

function rowOuterHeight(child: NativeUiCompilerSurfaceNodeProjection): number {
  const margin = marginFor(child)
  return margin.top + child.bounds.y + child.bounds.height + margin.bottom
}

function columnOuterWidth(child: NativeUiCompilerSurfaceNodeProjection): number {
  const margin = marginFor(child)
  return margin.left + child.bounds.x + child.bounds.width + margin.right
}

function columnOuterHeight(child: NativeUiCompilerSurfaceNodeProjection): number {
  const margin = marginFor(child)
  return margin.top + child.bounds.y + child.bounds.height + margin.bottom
}

function marginFor(child: NativeUiCompilerSurfaceNodeProjection): NativeQssEdgeInsetsValue {
  return child.compilerLayout?.margin ?? ZERO_INSETS
}

function isAbsolute(child: NativeUiCompilerSurfaceNodeProjection): boolean {
  return child.compilerLayout?.position === 'absolute'
}

function absoluteBounds(
  child: NativeUiCompilerSurfaceNodeProjection,
  parentBounds: NativeUiSurfaceRect,
): NativeUiSurfaceRect {
  const margin = marginFor(child)
  return {
    ...child.bounds,
    x: parentBounds.x + margin.left + child.bounds.x,
    y: parentBounds.y + margin.top + child.bounds.y,
  }
}

function withBounds(
  child: NativeUiCompilerSurfaceNodeProjection,
  bounds: NativeUiSurfaceRect,
): NativeUiCompilerSurfaceNodeProjection {
  const deltaX = bounds.x - child.bounds.x
  const deltaY = bounds.y - child.bounds.y
  return {
    ...child,
    bounds,
    stateStyles: child.stateStyles
      ? Object.fromEntries(Object.entries(child.stateStyles).map(([state, style]) => [
          state,
          style
            ? {
                ...style,
                bounds: {
                  ...style.bounds,
                  x: style.bounds.x + deltaX,
                  y: style.bounds.y + deltaY,
                },
              }
            : style,
        ]))
      : undefined,
  }
}
