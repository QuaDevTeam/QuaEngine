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
    || child.compilerLayout?.position === 'absolute'
    || child.compilerLayout?.flexGrow !== undefined
    || child.compilerLayout?.flexShrink !== undefined
    || child.compilerLayout?.flexBasis !== undefined
    || child.compilerLayout?.alignSelf !== undefined)
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
  const gap = layout?.columnGap ?? 0
  const parentAlign = layout?.alignItems

  // Split absolute vs. flow children
  const flowChildren = children.filter(child => !isAbsolute(child))

  // Resolve flex-basis natural main-axis sizes
  const naturalWidths = flowChildren.map(child =>
    flexBasisMainSize(child, child.bounds.width))
  const naturalOuterWidths = flowChildren.map((child, i) => {
    const margin = marginFor(child)
    return margin.left + child.bounds.x + naturalWidths[i] + margin.right
  })

  const flowCount = flowChildren.length
  const usedWidth = naturalOuterWidths.reduce((s, w) => s + w, 0)
    + gap * Math.max(0, flowCount - 1)
  const freeSpace = bounds.width - usedWidth

  // Distribute free space via flex-grow / flex-shrink
  const adjustedWidths = distributeFlex(
    naturalWidths,
    flowChildren,
    freeSpace,
  )

  // justifyContent: recompute startOffset with adjusted sizes
  const adjustedOuterWidths = flowChildren.map((child, i) => {
    const margin = marginFor(child)
    return margin.left + child.bounds.x + adjustedWidths[i] + margin.right
  })
  const { gap: effectiveGap, startOffset } = distributeMainAxis(
    bounds.width,
    adjustedOuterWidths,
    gap,
    layout?.justifyContent,
  )

  let cursorX = startOffset
  let flowIndex = 0
  return children.map((child) => {
    if (isAbsolute(child))
      return withBounds(child, absoluteBounds(child, bounds))

    const margin = marginFor(child)
    const childWidth = adjustedWidths[flowIndex]
    const effectiveAlign = resolveEffectiveAlign(child.compilerLayout?.alignSelf, parentAlign)
    const crossOffset = alignCrossAxis(
      bounds.height,
      margin.top + child.bounds.y + child.bounds.height + margin.bottom,
      effectiveAlign,
    )
    const localX = cursorX + margin.left + child.bounds.x
    const x = bounds.x + localX
    const y = bounds.y + crossOffset + margin.top + child.bounds.y
    cursorX += adjustedOuterWidths[flowIndex] + effectiveGap
    flowIndex++
    return withBounds(child, { ...child.bounds, width: childWidth, x, y })
  })
}

function layoutColumnChildren(
  children: readonly NativeUiCompilerSurfaceNodeProjection[],
  bounds: NativeUiSurfaceRect,
  layout: NativeQssResolvedLayout | undefined,
): NativeUiCompilerSurfaceNodeProjection[] {
  const gap = layout?.rowGap ?? 0
  const parentAlign = layout?.alignItems

  const flowChildren = children.filter(child => !isAbsolute(child))

  const naturalHeights = flowChildren.map(child =>
    flexBasisMainSize(child, child.bounds.height))
  const naturalOuterHeights = flowChildren.map((child, i) => {
    const margin = marginFor(child)
    return margin.top + child.bounds.y + naturalHeights[i] + margin.bottom
  })

  const flowCount = flowChildren.length
  const usedHeight = naturalOuterHeights.reduce((s, h) => s + h, 0)
    + gap * Math.max(0, flowCount - 1)
  const freeSpace = bounds.height - usedHeight

  const adjustedHeights = distributeFlex(
    naturalHeights,
    flowChildren,
    freeSpace,
  )

  const adjustedOuterHeights = flowChildren.map((child, i) => {
    const margin = marginFor(child)
    return margin.top + child.bounds.y + adjustedHeights[i] + margin.bottom
  })
  const { gap: effectiveGap, startOffset } = distributeMainAxis(
    bounds.height,
    adjustedOuterHeights,
    gap,
    layout?.justifyContent,
  )

  let cursorY = startOffset
  let flowIndex = 0
  return children.map((child) => {
    if (isAbsolute(child))
      return withBounds(child, absoluteBounds(child, bounds))

    const margin = marginFor(child)
    const childHeight = adjustedHeights[flowIndex]
    const effectiveAlign = resolveEffectiveAlign(child.compilerLayout?.alignSelf, parentAlign)
    const crossOffset = alignCrossAxis(
      bounds.width,
      margin.left + child.bounds.x + child.bounds.width + margin.right,
      effectiveAlign,
    )
    const x = bounds.x + crossOffset + margin.left + child.bounds.x
    const localY = cursorY + margin.top + child.bounds.y
    const y = bounds.y + localY
    cursorY += adjustedOuterHeights[flowIndex] + effectiveGap
    flowIndex++
    return withBounds(child, { ...child.bounds, height: childHeight, x, y })
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

function marginFor(child: NativeUiCompilerSurfaceNodeProjection): NativeQssEdgeInsetsValue {
  return child.compilerLayout?.margin ?? ZERO_INSETS
}

function isAbsolute(child: NativeUiCompilerSurfaceNodeProjection): boolean {
  return child.compilerLayout?.position === 'absolute'
}

/** Return the flex-basis as a main-axis size; falls back to the resolved QSS dimension. */
function flexBasisMainSize(
  child: NativeUiCompilerSurfaceNodeProjection,
  naturalSize: number,
): number {
  const basis = child.compilerLayout?.flexBasis
  if (basis === undefined || basis === 'auto') return naturalSize
  return Math.max(0, basis)
}

/** Resolve the effective cross-axis alignment for a single child. */
function resolveEffectiveAlign(
  alignSelf: NativeQssResolvedLayout['alignSelf'],
  parentAlignItems: NativeQssAlignItemsValue | undefined,
): NativeQssAlignItemsValue | undefined {
  if (!alignSelf || alignSelf === 'auto') return parentAlignItems
  return alignSelf
}

/**
 * Apply flex-grow / flex-shrink distribution.
 *
 * @param naturalSizes   Main-axis content sizes (from flex-basis or resolved bounds).
 * @param children       Flow children in order.
 * @param freeSpace      Remaining space: positive → grow pass, negative → shrink pass.
 * @returns Adjusted content sizes (same order as naturalSizes).
 */
function distributeFlex(
  naturalSizes: readonly number[],
  children: readonly NativeUiCompilerSurfaceNodeProjection[],
  freeSpace: number,
): number[] {
  const result = [...naturalSizes]
  if (freeSpace === 0) return result

  if (freeSpace > 0) {
    // Grow pass
    const growFactors = children.map(c => Math.max(0, c.compilerLayout?.flexGrow ?? 0))
    const totalGrow = growFactors.reduce((s, g) => s + g, 0)
    if (totalGrow <= 0) return result
    for (let i = 0; i < result.length; i++) {
      if (growFactors[i] > 0)
        result[i] = Math.max(0, result[i] + freeSpace * (growFactors[i] / totalGrow))
    }
  }
  else {
    // Shrink pass
    const shrinkFactors = children.map(c => Math.max(0, c.compilerLayout?.flexShrink ?? 1))
    // Weighted shrink: weight = factor * naturalSize (standard CSS flex-shrink)
    const shrinkWeights = shrinkFactors.map((f, i) => f * Math.max(0, naturalSizes[i]))
    const totalWeight = shrinkWeights.reduce((s, w) => s + w, 0)
    if (totalWeight <= 0) return result
    const overflow = -freeSpace
    for (let i = 0; i < result.length; i++) {
      if (shrinkWeights[i] > 0)
        result[i] = Math.max(0, result[i] - overflow * (shrinkWeights[i] / totalWeight))
    }
  }

  return result
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
