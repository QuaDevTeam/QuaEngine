import type {
  NativeQssDeclaration,
  NativeQssBorderStyleValue,
  NativeQssEdgeInsetsValue,
  NativeQssFontStyleValue,
  NativeQssObjectFitValue,
  NativeQssResolvedBounds,
  NativeQssResolvedNodeStyle,
  NativeQssTextDecorationValue,
  NativeQssTextAlignValue,
  NativeQssTextOverflowValue,
  NativeQssTextTransformValue,
  NativeQssWhiteSpaceValue,
} from './types'

const OBJECT_FIT_VALUES = new Set<NativeQssObjectFitValue>(['contain', 'cover', 'fill', 'none', 'scale-down'])
const TEXT_ALIGN_VALUES = new Set<NativeQssTextAlignValue>(['center', 'justify', 'left', 'right'])
const TEXT_DECORATION_VALUES = new Set<NativeQssTextDecorationValue>(['line-through', 'none', 'underline'])
const TEXT_OVERFLOW_VALUES = new Set<NativeQssTextOverflowValue>(['clip', 'ellipsis'])
const TEXT_TRANSFORM_VALUES = new Set<NativeQssTextTransformValue>(['capitalize', 'lowercase', 'none', 'uppercase'])
const WHITE_SPACE_VALUES = new Set<NativeQssWhiteSpaceValue>(['normal', 'nowrap', 'pre', 'pre-line', 'pre-wrap'])
const BORDER_STYLE_VALUES = new Set<NativeQssBorderStyleValue>(['none', 'solid'])
const FONT_STYLE_VALUES = new Set<NativeQssFontStyleValue>(['italic', 'normal'])

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
        resolved.style.backgroundColor = value
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
        resolved.style.borderColor = value
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
        resolved.style.color = value
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

export function parseNativeQssBackgroundImage(value: string): { assetType: string, assetName: string } | undefined {
  const match = /^asset\(\s*(?:"([^"]+)"|'([^']+)')\s*(?:,\s*(?:"([^"]+)"|'([^']+)'))?\s*\)$/i.exec(value.trim())
  if (!match)
    return undefined

  const assetName = (match[1] || match[2] || '').trim()
  const assetType = (match[3] || match[4] || 'images').trim()

  if (!isSafeAssetType(assetType) || !isSafePackageAssetName(assetName))
    return undefined

  return { assetType, assetName }
}

function isSafeAssetType(value: string): boolean {
  return /^[a-z][a-z0-9-]*$/i.test(value)
}

function isSafePackageAssetName(value: string): boolean {
  const normalized = value.replace(/\\/g, '/')
  return normalized.length > 0
    && !normalized.startsWith('/')
    && !/^[a-z][a-z0-9+.-]*:/i.test(normalized)
    && !normalized.split('/').includes('..')
}

export function parseNativeQssBackgroundPosition(value: string): { x: number, y: number } | undefined {
  const parts = value.toLowerCase().split(/\s+/).filter(Boolean)
  if (parts.length === 0 || parts.length > 2)
    return undefined

  if (parts.length === 1) {
    const single = parseHorizontalPosition(parts[0])
    if (single !== undefined)
      return { x: single, y: 0.5 }

    const vertical = parseVerticalPosition(parts[0])
    return vertical !== undefined ? { x: 0.5, y: vertical } : undefined
  }

  const horizontal = parseHorizontalPosition(parts[0])
  const vertical = parseVerticalPosition(parts[1])
  if (horizontal !== undefined && vertical !== undefined)
    return { x: horizontal, y: vertical }

  const reversedHorizontal = parseHorizontalPosition(parts[1])
  const reversedVertical = parseVerticalPosition(parts[0])
  return reversedHorizontal !== undefined && reversedVertical !== undefined
    ? { x: reversedHorizontal, y: reversedVertical }
    : undefined
}

function parseHorizontalPosition(value: string): number | undefined {
  switch (value) {
    case 'left':
      return 0
    case 'center':
      return 0.5
    case 'right':
      return 1
    default:
      return parsePercentUnitInterval(value)
  }
}

function parseVerticalPosition(value: string): number | undefined {
  switch (value) {
    case 'top':
      return 0
    case 'center':
      return 0.5
    case 'bottom':
      return 1
    default:
      return parsePercentUnitInterval(value)
  }
}

export function parseNativeQssLogicalNumber(value: string): number | undefined {
  const match = /^(-?\d+(?:\.\d+)?)(?:px)?$/.exec(value.trim())
  if (!match)
    return undefined
  const number = Number(match[1])
  return Number.isFinite(number) && number >= 0 ? number : undefined
}

export function parseNativeQssCoordinateNumber(value: string): number | undefined {
  const match = /^(-?\d+(?:\.\d+)?)(?:px)?$/.exec(value.trim())
  if (!match)
    return undefined
  const number = Number(match[1])
  return Number.isFinite(number) ? number : undefined
}

export function parseNativeQssEdgeInsets(value: string): NativeQssEdgeInsetsValue | undefined {
  const parts = value.split(/\s+/).map(item => item.trim()).filter(Boolean)
  if (parts.length < 1 || parts.length > 4)
    return undefined

  const numbers = parts.map(parseNativeQssLogicalNumber)
  if (numbers.some(number => number === undefined))
    return undefined

  const [top, right = top, bottom = top, left = right] = numbers as [number, number?, number?, number?]
  return { top, right, bottom, left }
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

function parsePercentUnitInterval(value: string): number | undefined {
  const match = /^(\d+(?:\.\d+)?)%$/.exec(value.trim())
  if (!match)
    return undefined
  const number = Number(match[1])
  return Number.isFinite(number) && number >= 0 && number <= 100
    ? number / 100
    : undefined
}

export function parseNativeQssInteger(value: string): number | undefined {
  const match = /^-?\d+$/.exec(value.trim())
  if (!match)
    return undefined
  const number = Number(value)
  return Number.isSafeInteger(number) ? number : undefined
}

export function parseNativeQssOpacity(value: string): number | undefined {
  const number = Number(value)
  if (!Number.isFinite(number))
    return undefined
  return Math.min(1, Math.max(0, number))
}

export function parseNativeQssTextAlign(value: string): NativeQssTextAlignValue | undefined {
  const normalized = value.toLowerCase()
  return TEXT_ALIGN_VALUES.has(normalized as NativeQssTextAlignValue)
    ? normalized as NativeQssTextAlignValue
    : undefined
}

export function parseNativeQssTextDecoration(value: string): NativeQssTextDecorationValue | undefined {
  const normalized = value.toLowerCase()
  return TEXT_DECORATION_VALUES.has(normalized as NativeQssTextDecorationValue)
    ? normalized as NativeQssTextDecorationValue
    : undefined
}

export function parseNativeQssTextOverflow(value: string): NativeQssTextOverflowValue | undefined {
  const normalized = value.toLowerCase()
  return TEXT_OVERFLOW_VALUES.has(normalized as NativeQssTextOverflowValue)
    ? normalized as NativeQssTextOverflowValue
    : undefined
}

export function parseNativeQssTextTransform(value: string): NativeQssTextTransformValue | undefined {
  const normalized = value.toLowerCase()
  return TEXT_TRANSFORM_VALUES.has(normalized as NativeQssTextTransformValue)
    ? normalized as NativeQssTextTransformValue
    : undefined
}

export function parseNativeQssWhiteSpace(value: string): NativeQssWhiteSpaceValue | undefined {
  const normalized = value.toLowerCase()
  return WHITE_SPACE_VALUES.has(normalized as NativeQssWhiteSpaceValue)
    ? normalized as NativeQssWhiteSpaceValue
    : undefined
}

export function parseNativeQssLetterSpacing(value: string): number | undefined {
  return value.toLowerCase() === 'normal'
    ? 0
    : parseNativeQssLogicalNumber(value)
}

export function parseNativeQssVisibility(value: string): boolean | undefined {
  switch (value.toLowerCase()) {
    case 'hidden':
      return false
    case 'visible':
      return true
    default:
      return undefined
  }
}

export function parseNativeQssDisplay(value: string): false | undefined {
  return value.toLowerCase() === 'none' ? false : undefined
}

export function parseNativeQssObjectFit(value: string): NativeQssObjectFitValue | undefined {
  const normalized = value.toLowerCase()
  return OBJECT_FIT_VALUES.has(normalized as NativeQssObjectFitValue)
    ? normalized as NativeQssObjectFitValue
    : undefined
}

export function parseNativeQssBorderStyle(value: string): NativeQssBorderStyleValue | undefined {
  const normalized = value.toLowerCase()
  return BORDER_STYLE_VALUES.has(normalized as NativeQssBorderStyleValue)
    ? normalized as NativeQssBorderStyleValue
    : undefined
}

export function parseNativeQssOverflow(value: string): boolean | undefined {
  switch (value.toLowerCase()) {
    case 'hidden':
      return true
    case 'visible':
      return false
    default:
      return undefined
  }
}

export function parseNativeQssFontWeight(value: string): 'bold' | 'normal' | number | undefined {
  const normalized = value.toLowerCase()
  if (normalized === 'bold' || normalized === 'normal')
    return normalized

  const number = parseNativeQssInteger(value)
  return number !== undefined ? number : undefined
}

export function parseNativeQssFontStyle(value: string): NativeQssFontStyleValue | undefined {
  const normalized = value.toLowerCase()
  return FONT_STYLE_VALUES.has(normalized as NativeQssFontStyleValue)
    ? normalized as NativeQssFontStyleValue
    : undefined
}

export function parseNativeQssFontFamilyList(value: string): string[] | undefined {
  const families = value
    .split(',')
    .map(item => item.trim().replace(/^['"]|['"]$/g, ''))
    .filter(Boolean)

  return families.length > 0 ? families : undefined
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
