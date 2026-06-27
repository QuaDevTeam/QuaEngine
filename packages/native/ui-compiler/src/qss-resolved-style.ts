import type {
  NativeQssDeclaration,
  NativeQssEdgeInsetsValue,
  NativeQssResolvedBounds,
  NativeQssResolvedNodeStyle,
} from './types'
import {
  parseNativeQssBackgroundImage,
  parseNativeQssBackgroundPosition,
  parseNativeQssBorderStyle,
  parseNativeQssColor,
  parseNativeQssCoordinateNumber,
  parseNativeQssDisplay,
  parseNativeQssEdgeInsets,
  parseNativeQssFontFamilyList,
  parseNativeQssFontStyle,
  parseNativeQssFontWeight,
  parseNativeQssInteger,
  parseNativeQssLetterSpacing,
  parseNativeQssLogicalNumber,
  parseNativeQssObjectFit,
  parseNativeQssOpacity,
  parseNativeQssOverflow,
  parseNativeQssTextAlign,
  parseNativeQssTextDecoration,
  parseNativeQssTextOverflow,
  parseNativeQssTextTransform,
  parseNativeQssVisibility,
  parseNativeQssWhiteSpace,
} from './qss-style-values'

export {
  parseNativeQssBackgroundImage,
  parseNativeQssBackgroundPosition,
  parseNativeQssBorderStyle,
  parseNativeQssColor,
  parseNativeQssCoordinateNumber,
  parseNativeQssDisplay,
  parseNativeQssEdgeInsets,
  parseNativeQssFontFamilyList,
  parseNativeQssFontStyle,
  parseNativeQssFontWeight,
  parseNativeQssInteger,
  parseNativeQssLetterSpacing,
  parseNativeQssLogicalNumber,
  parseNativeQssObjectFit,
  parseNativeQssOpacity,
  parseNativeQssOverflow,
  parseNativeQssTextAlign,
  parseNativeQssTextDecoration,
  parseNativeQssTextOverflow,
  parseNativeQssTextTransform,
  parseNativeQssVisibility,
  parseNativeQssWhiteSpace,
} from './qss-style-values'

export function resolveNativeQssDeclarations(
  declarations: readonly NativeQssDeclaration[],
): NativeQssResolvedNodeStyle {
  const resolved: NativeQssResolvedNodeStyle = {
    style: {},
  }
  let displayNone = false

  for (const declaration of declarations) {
    const value = declaration.value.trim()
    switch (declaration.name) {
      case 'background-color':
        resolved.style.backgroundColor = parseNativeQssColor(value)
        break
      case 'background-image':
        resolved.style.backgroundImage = parseNativeQssBackgroundImage(value)
        break
      case 'background-position':
        resolved.style.backgroundPosition = parseNativeQssBackgroundPosition(value)
        break
      case 'background-size':
        resolved.style.backgroundSize = parseNativeQssObjectFit(value)
        break
      case 'border-color':
        resolved.style.borderColor = parseNativeQssColor(value)
        break
      case 'border-radius':
        resolved.style.borderRadius = parseNativeQssLogicalNumber(value)
        break
      case 'border-style':
        resolved.style.borderStyle = parseNativeQssBorderStyle(value)
        break
      case 'border-width':
        resolved.style.borderWidth = parseNativeQssLogicalNumber(value)
        break
      case 'color':
        resolved.style.color = parseNativeQssColor(value)
        break
      case 'display':
        if (parseNativeQssDisplay(value) === false)
          displayNone = true
        break
      case 'font-family':
        resolved.style.fontFamily = parseNativeQssFontFamilyList(value)
        break
      case 'font-size':
        resolved.style.fontSize = parseNativeQssLogicalNumber(value)
        break
      case 'font-style':
        resolved.style.fontStyle = parseNativeQssFontStyle(value)
        break
      case 'font-weight':
        resolved.style.fontWeight = parseNativeQssFontWeight(value)
        break
      case 'letter-spacing':
        resolved.style.letterSpacing = parseNativeQssLetterSpacing(value)
        break
      case 'line-height':
        resolved.style.lineHeight = parseNativeQssLogicalNumber(value)
        break
      case 'height':
        resolved.bounds = resolveNativeQssBound(resolved.bounds, 'height', value, parseNativeQssLogicalNumber)
        break
      case 'inset':
        resolved.bounds = resolveNativeQssInset(resolved.bounds, value)
        break
      case 'left':
        resolved.bounds = resolveNativeQssBound(resolved.bounds, 'x', value, parseNativeQssCoordinateNumber)
        break
      case 'max-height':
        resolved.bounds = resolveNativeQssBound(resolved.bounds, 'maxHeight', value, parseNativeQssLogicalNumber)
        break
      case 'max-width':
        resolved.bounds = resolveNativeQssBound(resolved.bounds, 'maxWidth', value, parseNativeQssLogicalNumber)
        break
      case 'min-height':
        resolved.bounds = resolveNativeQssBound(resolved.bounds, 'minHeight', value, parseNativeQssLogicalNumber)
        break
      case 'min-width':
        resolved.bounds = resolveNativeQssBound(resolved.bounds, 'minWidth', value, parseNativeQssLogicalNumber)
        break
      case 'object-fit':
        resolved.style.objectFit = parseNativeQssObjectFit(value)
        break
      case 'opacity':
        resolved.style.opacity = parseNativeQssOpacity(value)
        break
      case 'overflow':
        resolved.clipChildren = parseNativeQssOverflow(value)
        break
      case 'padding':
        resolved.style.padding = parseNativeQssEdgeInsets(value)
        break
      case 'padding-bottom':
        resolved.style.padding = resolveNativeQssEdgeInset(resolved.style.padding, 'bottom', value)
        break
      case 'padding-left':
        resolved.style.padding = resolveNativeQssEdgeInset(resolved.style.padding, 'left', value)
        break
      case 'padding-right':
        resolved.style.padding = resolveNativeQssEdgeInset(resolved.style.padding, 'right', value)
        break
      case 'padding-top':
        resolved.style.padding = resolveNativeQssEdgeInset(resolved.style.padding, 'top', value)
        break
      case 'right':
        resolved.bounds = resolveNativeQssBound(resolved.bounds, 'right', value, parseNativeQssLogicalNumber)
        break
      case 'bottom':
        resolved.bounds = resolveNativeQssBound(resolved.bounds, 'bottom', value, parseNativeQssLogicalNumber)
        break
      case 'top':
        resolved.bounds = resolveNativeQssBound(resolved.bounds, 'y', value, parseNativeQssCoordinateNumber)
        break
      case 'text-align':
        resolved.style.textAlign = parseNativeQssTextAlign(value)
        break
      case 'text-decoration':
        resolved.style.textDecoration = parseNativeQssTextDecoration(value)
        break
      case 'text-overflow':
        resolved.style.textOverflow = parseNativeQssTextOverflow(value)
        break
      case 'text-transform':
        resolved.style.textTransform = parseNativeQssTextTransform(value)
        break
      case 'visibility':
        resolved.visible = parseNativeQssVisibility(value)
        break
      case 'white-space':
        resolved.style.whiteSpace = parseNativeQssWhiteSpace(value)
        break
      case 'width':
        resolved.bounds = resolveNativeQssBound(resolved.bounds, 'width', value, parseNativeQssLogicalNumber)
        break
      case 'z-index':
        resolved.zIndex = parseNativeQssInteger(value)
        break
    }
  }

  if (displayNone)
    resolved.visible = false

  return pruneUndefinedResolvedNodeStyle(resolved)
}

function resolveNativeQssEdgeInset(
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

function resolveNativeQssInset(
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

function resolveNativeQssBound(
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

function pruneUndefinedResolvedNodeStyle(style: NativeQssResolvedNodeStyle): NativeQssResolvedNodeStyle {
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

  if (style.zIndex === undefined)
    delete style.zIndex
  if (style.visible === undefined)
    delete style.visible
  if (style.clipChildren === undefined)
    delete style.clipChildren

  return style
}
