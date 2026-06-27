import type {
  NativeQssBackgroundImageValue,
  NativeQssBackgroundPositionValue,
  NativeQssBorderStyleValue,
  NativeQssEdgeInsetsValue,
  NativeQssFontStyleValue,
  NativeQssFontWeightValue,
  NativeQssObjectFitValue,
  NativeQssTextAlignValue,
  NativeQssTextDecorationValue,
  NativeQssTextOverflowValue,
  NativeQssTextTransformValue,
  NativeQssWhiteSpaceValue,
} from './types'
import { isSafeNativeAssetType, isSafePackageAssetName } from './assets'

const OBJECT_FIT_VALUES = new Set<NativeQssObjectFitValue>(['contain', 'cover', 'fill', 'none', 'scale-down'])
const TEXT_ALIGN_VALUES = new Set<NativeQssTextAlignValue>(['center', 'justify', 'left', 'right'])
const TEXT_DECORATION_VALUES = new Set<NativeQssTextDecorationValue>(['line-through', 'none', 'underline'])
const TEXT_OVERFLOW_VALUES = new Set<NativeQssTextOverflowValue>(['clip', 'ellipsis'])
const TEXT_TRANSFORM_VALUES = new Set<NativeQssTextTransformValue>(['capitalize', 'lowercase', 'none', 'uppercase'])
const WHITE_SPACE_VALUES = new Set<NativeQssWhiteSpaceValue>(['normal', 'nowrap', 'pre', 'pre-line', 'pre-wrap'])
const BORDER_STYLE_VALUES = new Set<NativeQssBorderStyleValue>(['none', 'solid'])
const FONT_STYLE_VALUES = new Set<NativeQssFontStyleValue>(['italic', 'normal'])
const BASIC_COLOR_KEYWORDS = new Set([
  'aqua',
  'black',
  'blue',
  'currentcolor',
  'fuchsia',
  'gray',
  'green',
  'lime',
  'maroon',
  'navy',
  'olive',
  'orange',
  'purple',
  'red',
  'silver',
  'teal',
  'transparent',
  'white',
  'yellow',
])

export function parseNativeQssBackgroundImage(value: string): NativeQssBackgroundImageValue | undefined {
  const match = /^asset\(\s*(?:"([^"]+)"|'([^']+)')\s*(?:,\s*(?:"([^"]+)"|'([^']+)'))?\s*\)$/i.exec(value.trim())
  if (!match)
    return undefined

  const assetName = (match[1] || match[2] || '').trim()
  const assetType = (match[3] || match[4] || 'images').trim()

  if (!isSafeNativeAssetType(assetType) || !isSafePackageAssetName(assetName))
    return undefined

  return { assetType, assetName }
}

export function parseNativeQssBackgroundPosition(value: string): NativeQssBackgroundPositionValue | undefined {
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

export function parseNativeQssFontWeight(value: string): NativeQssFontWeightValue | undefined {
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

export function parseNativeQssColor(value: string): string | undefined {
  const normalized = value.trim()
  if (!normalized)
    return undefined

  if (/^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(normalized))
    return normalized

  const keyword = normalized.toLowerCase()
  if (BASIC_COLOR_KEYWORDS.has(keyword))
    return normalized

  const rgb = normalized.match(/^rgba?\((.*)\)$/i)
  if (!rgb)
    return undefined

  const parts = rgb[1].split(',').map(part => part.trim())
  if (parts.length !== (keyword.startsWith('rgba') ? 4 : 3))
    return undefined

  const [red, green, blue, alpha] = parts
  if (![red, green, blue].every(isNativeQssRgbChannel))
    return undefined
  if (alpha !== undefined && !isNativeQssAlphaChannel(alpha))
    return undefined

  return normalized
}

export function parseNativeQssFontFamilyList(value: string): string[] | undefined {
  const families = value
    .split(',')
    .map(item => item.trim().replace(/^['"]|['"]$/g, ''))
    .filter(Boolean)

  return families.length > 0 ? families : undefined
}

function isNativeQssRgbChannel(value: string): boolean {
  if (!/^\d+(?:\.\d+)?$/.test(value))
    return false
  const number = Number(value)
  return Number.isFinite(number) && number >= 0 && number <= 255
}

function isNativeQssAlphaChannel(value: string): boolean {
  if (!/^(?:0|1|0?\.\d+)$/.test(value))
    return false
  const number = Number(value)
  return Number.isFinite(number) && number >= 0 && number <= 1
}
