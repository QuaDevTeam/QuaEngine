import type {
  NativeQssEdgeInsetsValue,
  NativeQssResolvedBounds,
  NativeQssResolvedLayout,
  NativeQssResolvedNodeStyle,
} from './types'
import {
  parseNativeQssEdgeInsets,
  parseNativeQssGap,
  parseNativeQssLogicalNumber,
} from './qss-style-primitives'

export function resolveNativeQssEdgeInset(
  current: NativeQssEdgeInsetsValue | undefined,
  edge: keyof NativeQssEdgeInsetsValue,
  value: string,
): NativeQssEdgeInsetsValue | undefined {
  const number = parseNativeQssLogicalNumber(value)
  if (number === undefined)
    return current

  return {
    bottom: current?.bottom ?? 0,
    left: current?.left ?? 0,
    right: current?.right ?? 0,
    top: current?.top ?? 0,
    [edge]: number,
  }
}

export function resolveNativeQssInset(
  current: NativeQssResolvedBounds | undefined,
  value: string,
): NativeQssResolvedBounds | undefined {
  const insets = parseNativeQssEdgeInsets(value)
  if (!insets)
    return current

  return {
    ...current,
    bottom: insets.bottom,
    right: insets.right,
    x: insets.left,
    y: insets.top,
  }
}

export function resolveNativeQssGap(
  current: NativeQssResolvedLayout | undefined,
  value: string,
): NativeQssResolvedLayout | undefined {
  const gap = parseNativeQssGap(value)
  if (!gap)
    return current

  return {
    ...current,
    ...gap,
  }
}

export function resolveNativeQssLayoutGap(
  current: NativeQssResolvedLayout | undefined,
  edge: keyof NativeQssResolvedLayout,
  value: string,
): NativeQssResolvedLayout | undefined {
  const number = parseNativeQssLogicalNumber(value)
  if (number === undefined)
    return current

  return {
    ...current,
    [edge]: number,
  }
}

export function resolveNativeQssBound(
  current: NativeQssResolvedBounds | undefined,
  edge: keyof NativeQssResolvedBounds,
  value: string,
  parser: (value: string) => number | undefined,
): NativeQssResolvedBounds | undefined {
  const number = parser(value)
  if (number === undefined)
    return current

  return {
    ...current,
    [edge]: number,
  }
}

export function pruneUndefinedResolvedNodeStyle(style: NativeQssResolvedNodeStyle): NativeQssResolvedNodeStyle {
  style.bounds = clampNativeQssBounds(style.bounds)

  for (const key of Object.keys(style.style) as Array<keyof typeof style.style>) {
    if (style.style[key] === undefined)
      delete style.style[key]
  }

  if (style.bounds) {
    for (const key of Object.keys(style.bounds) as Array<keyof typeof style.bounds>) {
      if (style.bounds[key] === undefined)
        delete style.bounds[key]
    }
    delete style.bounds.minHeight
    delete style.bounds.maxHeight
    delete style.bounds.minWidth
    delete style.bounds.maxWidth
    if (Object.keys(style.bounds).length === 0)
      delete style.bounds
  }
  else {
    delete style.bounds
  }

  if (style.layout) {
    for (const key of Object.keys(style.layout) as Array<keyof typeof style.layout>) {
      if (style.layout[key] === undefined)
        delete style.layout[key]
    }
    if (Object.keys(style.layout).length === 0)
      delete style.layout
  }
  else {
    delete style.layout
  }

  if (style.zIndex === undefined)
    delete style.zIndex
  if (style.visible === undefined)
    delete style.visible
  if (style.clipChildren === undefined)
    delete style.clipChildren

  return style
}

function clampNativeQssBounds(bounds: NativeQssResolvedBounds | undefined): NativeQssResolvedBounds | undefined {
  if (!bounds)
    return undefined

  const clamped: NativeQssResolvedBounds = { ...bounds }
  if (clamped.width !== undefined)
    clamped.width = clampNativeQssBoundDimension(clamped.width, clamped.minWidth, clamped.maxWidth)
  if (clamped.height !== undefined)
    clamped.height = clampNativeQssBoundDimension(clamped.height, clamped.minHeight, clamped.maxHeight)
  return clamped
}

function clampNativeQssBoundDimension(
  value: number,
  min: number | undefined,
  max: number | undefined,
): number {
  const lower = min ?? 0
  const upper = max !== undefined ? Math.max(lower, max) : undefined
  return upper !== undefined
    ? Math.min(Math.max(value, lower), upper)
    : Math.max(value, lower)
}
