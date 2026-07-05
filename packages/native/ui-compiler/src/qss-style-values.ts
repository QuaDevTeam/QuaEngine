import type {
  NativeQssAlignItemsValue,
  NativeQssBackgroundImageValue,
  NativeQssBackgroundPositionValue,
  NativeQssBorderStyleValue,
  NativeQssBoxSizingValue,
  NativeQssFontStyleValue,
  NativeQssFontWeightValue,
  NativeQssJustifyContentValue,
  NativeQssObjectFitValue,
  NativeQssPointerEventsValue,
  NativeQssPositionValue,
  NativeQssTextAlignValue,
  NativeQssTextDecorationValue,
  NativeQssTextOverflowValue,
  NativeQssTextTransformValue,
  NativeQssWhiteSpaceValue,
} from './types'
import { isSafeNativeAssetType, isSafePackageAssetName } from './assets'
import {
  parseNativeQssInteger,
  parsePercentUnitInterval,
} from './qss-style-primitives'

export {
  parseNativeQssColor,
  parseNativeQssCoordinateNumber,
  parseNativeQssEdgeInsets,
  parseNativeQssFontFamilyList,
  parseNativeQssGap,
  parseNativeQssInteger,
  parseNativeQssLetterSpacing,
  parseNativeQssLogicalNumber,
  parseNativeQssOpacity,
} from './qss-style-primitives'

const OBJECT_FIT_VALUES = new Set<NativeQssObjectFitValue>(['contain', 'cover', 'fill', 'none', 'scale-down'])
const TEXT_ALIGN_VALUES = new Set<NativeQssTextAlignValue>(['center', 'justify', 'left', 'right'])
const TEXT_DECORATION_VALUES = new Set<NativeQssTextDecorationValue>(['line-through', 'none', 'underline'])
const TEXT_OVERFLOW_VALUES = new Set<NativeQssTextOverflowValue>(['clip', 'ellipsis'])
const TEXT_TRANSFORM_VALUES = new Set<NativeQssTextTransformValue>(['capitalize', 'lowercase', 'none', 'uppercase'])
const WHITE_SPACE_VALUES = new Set<NativeQssWhiteSpaceValue>(['normal', 'nowrap', 'pre', 'pre-line', 'pre-wrap'])
const BORDER_STYLE_VALUES = new Set<NativeQssBorderStyleValue>(['none', 'solid'])
const BOX_SIZING_VALUES = new Set<NativeQssBoxSizingValue>(['border-box', 'content-box'])
const FONT_STYLE_VALUES = new Set<NativeQssFontStyleValue>(['italic', 'normal'])
const POSITION_VALUES = new Set<NativeQssPositionValue>(['absolute', 'relative'])
const POINTER_EVENTS_VALUES = new Set<NativeQssPointerEventsValue>(['auto', 'none'])
const ALIGN_ITEMS_VALUES = new Set<NativeQssAlignItemsValue>(['center', 'flex-end', 'flex-start'])
const JUSTIFY_CONTENT_VALUES = new Set<NativeQssJustifyContentValue>([
  'center',
  'flex-end',
  'flex-start',
  'space-around',
  'space-between',
  'space-evenly',
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

export function parseNativeQssPosition(value: string): NativeQssPositionValue | undefined {
  const normalized = value.toLowerCase()
  return POSITION_VALUES.has(normalized as NativeQssPositionValue)
    ? normalized as NativeQssPositionValue
    : undefined
}

export function parseNativeQssPointerEvents(value: string): boolean | undefined {
  const normalized = value.toLowerCase()
  if (!POINTER_EVENTS_VALUES.has(normalized as NativeQssPointerEventsValue))
    return undefined
  return normalized === 'auto'
}

export function parseNativeQssAlignItems(value: string): NativeQssAlignItemsValue | undefined {
  const normalized = value.toLowerCase()
  return ALIGN_ITEMS_VALUES.has(normalized as NativeQssAlignItemsValue)
    ? normalized as NativeQssAlignItemsValue
    : undefined
}

export function parseNativeQssJustifyContent(value: string): NativeQssJustifyContentValue | undefined {
  const normalized = value.toLowerCase()
  return JUSTIFY_CONTENT_VALUES.has(normalized as NativeQssJustifyContentValue)
    ? normalized as NativeQssJustifyContentValue
    : undefined
}

export function parseNativeQssBorderStyle(value: string): NativeQssBorderStyleValue | undefined {
  const normalized = value.toLowerCase()
  return BORDER_STYLE_VALUES.has(normalized as NativeQssBorderStyleValue)
    ? normalized as NativeQssBorderStyleValue
    : undefined
}

export function parseNativeQssBoxSizing(value: string): NativeQssBoxSizingValue | undefined {
  const normalized = value.toLowerCase()
  return BOX_SIZING_VALUES.has(normalized as NativeQssBoxSizingValue)
    ? normalized as NativeQssBoxSizingValue
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
