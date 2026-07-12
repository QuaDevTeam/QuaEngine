import type {
  NativeQssAlignItemsValue,
  NativeQssBackgroundImageValue,
  NativeQssBackgroundPositionValue,
  NativeQssBorderStyleValue,
  NativeQssBoxSizingValue,
  NativeQssFontStyleValue,
  NativeQssFontWeightValue,
  NativeQssFilterValue,
  NativeQssGradientValue,
  NativeQssJustifyContentValue,
  NativeQssObjectFitValue,
  NativeQssPointerEventsValue,
  NativeQssPositionValue,
  NativeQssShadowValue,
  NativeQssTextAlignValue,
  NativeQssTextDecorationValue,
  NativeQssTextOverflowValue,
  NativeQssTextTransformValue,
  NativeQssTransformValue,
  NativeQssTransitionEasing,
  NativeQssTransitionProperty,
  NativeQssTransitionValue,
  NativeQssWhiteSpaceValue,
} from './types'
import { isSafeNativeAssetType, isSafePackageAssetName } from './assets'
import {
  parseNativeQssColor,
  parseNativeQssCoordinateNumber,
  parseNativeQssInteger,
  parseNativeQssLogicalNumber,
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
const TRANSITION_PROPERTIES = new Set<NativeQssTransitionProperty>([
  'all',
  'background-color',
  'border-color',
  'box-shadow',
  'color',
  'filter',
  'opacity',
  'scale',
  'transform',
  'translate',
])
const TRANSITION_EASINGS = new Set<NativeQssTransitionEasing>([
  'ease',
  'ease-in',
  'ease-in-out',
  'ease-out',
  'linear',
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

export function parseNativeQssBackgroundGradient(value: string): NativeQssGradientValue | undefined {
  const trimmed = value.trim()
  const linear = /^linear-gradient\((.*)\)$/i.exec(trimmed)
  if (linear)
    return parseLinearGradient(linear[1])

  const radial = /^radial-gradient\((.*)\)$/i.exec(trimmed)
  if (radial)
    return parseRadialGradient(radial[1])

  return undefined
}

export function parseNativeQssFilter(value: string): NativeQssFilterValue | undefined {
  const source = value.trim()
  if (source.toLowerCase() === 'none')
    return { brightness: 1, saturate: 1 }

  const result: NativeQssFilterValue = { brightness: 1, saturate: 1 }
  const seen = new Set<string>()
  let cursor = 0
  const pattern = /(brightness|saturate)\(\s*(\d+(?:\.\d+)?%?)\s*\)/gi
  let match: RegExpExecArray | null
  while ((match = pattern.exec(source))) {
    if (source.slice(cursor, match.index).trim() || seen.has(match[1].toLowerCase()))
      return undefined
    cursor = pattern.lastIndex
    const name = match[1].toLowerCase() as 'brightness' | 'saturate'
    const amount = parseFilterAmount(match[2])
    if (amount === undefined)
      return undefined
    result[name] = amount
    seen.add(name)
  }
  if (seen.size === 0 || source.slice(cursor).trim())
    return undefined
  return result
}

export function parseNativeQssTransition(value: string): NativeQssTransitionValue[] | undefined {
  const source = value.trim().toLowerCase()
  if (source === 'none')
    return []

  const entries = splitQssCommaComponents(source)
  if (entries.length === 0)
    return undefined

  const seen = new Set<NativeQssTransitionProperty>()
  const transitions: NativeQssTransitionValue[] = []
  for (const entry of entries) {
    const parts = entry.split(/\s+/).filter(Boolean)
    if (parts.length < 2 || parts.length > 3)
      return undefined
    const property = parts[0] as NativeQssTransitionProperty
    const durationMs = parseTransitionDuration(parts[1])
    const easing = (parts[2] || 'ease') as NativeQssTransitionEasing
    if (
      !TRANSITION_PROPERTIES.has(property)
      || durationMs === undefined
      || !TRANSITION_EASINGS.has(easing)
      || seen.has(property)
      || (property === 'all' && entries.length > 1)
    ) {
      return undefined
    }
    seen.add(property)
    transitions.push({ durationMs, easing, property })
  }
  return transitions
}

function parseTransitionDuration(value: string): number | undefined {
  const match = /^(\d+(?:\.\d+)?)(ms|s)$/.exec(value)
  if (!match)
    return undefined
  const duration = Number(match[1]) * (match[2] === 's' ? 1000 : 1)
  return Number.isFinite(duration) && duration >= 0 && duration <= 5000
    ? duration
    : undefined
}

export function parseNativeQssTransform(value: string): NativeQssTransformValue | undefined {
  const source = value.trim()
  const result = defaultNativeQssTransform()
  if (source.toLowerCase() === 'none')
    return result

  let cursor = 0
  let matched = false
  const pattern = /(translate|scale)\(([^)]*)\)/gi
  let match: RegExpExecArray | null
  while ((match = pattern.exec(source))) {
    if (source.slice(cursor, match.index).trim())
      return undefined
    cursor = pattern.lastIndex
    matched = true
    if (match[1].toLowerCase() === 'translate') {
      const translate = parseNativeQssTranslate(match[2])
      if (!translate)
        return undefined
      result.translateX = translate.x
      result.translateY = translate.y
    }
    else {
      const scale = parseNativeQssScale(match[2])
      if (!scale)
        return undefined
      result.scaleX = scale.x
      result.scaleY = scale.y
    }
  }
  return matched && !source.slice(cursor).trim() ? result : undefined
}

export function parseNativeQssTranslate(value: string): { x: number, y: number } | undefined {
  const parts = value.trim().split(/[\s,]+/).filter(Boolean)
  if (parts.length < 1 || parts.length > 2)
    return undefined
  const x = parseNativeQssCoordinateNumber(parts[0])
  const y = parts[1] === undefined ? 0 : parseNativeQssCoordinateNumber(parts[1])
  return x === undefined || y === undefined ? undefined : { x, y }
}

export function parseNativeQssScale(value: string): { x: number, y: number } | undefined {
  const parts = value.trim().split(/[\s,]+/).filter(Boolean)
  if (parts.length < 1 || parts.length > 2)
    return undefined
  const x = parseBoundedScale(parts[0])
  const y = parts[1] === undefined ? x : parseBoundedScale(parts[1])
  return x === undefined || y === undefined ? undefined : { x, y }
}

export function parseNativeQssTransformOrigin(value: string): { x: number, y: number } | undefined {
  return parseNativeQssBackgroundPosition(value)
}

export function defaultNativeQssTransform(): NativeQssTransformValue {
  return {
    originX: 0.5,
    originY: 0.5,
    scaleX: 1,
    scaleY: 1,
    translateX: 0,
    translateY: 0,
  }
}

function parseBoundedScale(value: string): number | undefined {
  if (!/^\d+(?:\.\d+)?$/.test(value))
    return undefined
  const scale = Number(value)
  return Number.isFinite(scale) && scale >= 0 && scale <= 8 ? scale : undefined
}

function parseFilterAmount(value: string): number | undefined {
  const percent = value.endsWith('%')
  const amount = Number(percent ? value.slice(0, -1) : value)
  const normalized = percent ? amount / 100 : amount
  return Number.isFinite(normalized) && normalized >= 0 && normalized <= 8
    ? normalized
    : undefined
}

function parseLinearGradient(value: string): NativeQssGradientValue | undefined {
  const parts = splitQssCommaComponents(value)
  if (parts.length < 2 || parts.length > 3)
    return undefined

  const hasDirection = parts.length === 3
  const angleDegrees = hasDirection ? parseGradientAngle(parts[0]) : 180
  const startColor = parseNativeQssColor(parts[hasDirection ? 1 : 0])
  const endColor = parseNativeQssColor(parts[hasDirection ? 2 : 1])
  if (angleDegrees === undefined || !startColor || !endColor)
    return undefined

  return { angleDegrees, endColor, kind: 'linear', startColor }
}

function parseRadialGradient(value: string): NativeQssGradientValue | undefined {
  const parts = splitQssCommaComponents(value)
  if (parts.length < 2 || parts.length > 3)
    return undefined

  const hasShape = parts.length === 3
  const position = hasShape ? parseRadialGradientPosition(parts[0]) : { x: 0.5, y: 0.5 }
  const startColor = parseNativeQssColor(parts[hasShape ? 1 : 0])
  const endColor = parseNativeQssColor(parts[hasShape ? 2 : 1])
  if (!position || !startColor || !endColor)
    return undefined

  return {
    centerX: position.x,
    centerY: position.y,
    endColor,
    kind: 'radial',
    radius: Math.max(
      Math.hypot(position.x, position.y),
      Math.hypot(1 - position.x, position.y),
      Math.hypot(position.x, 1 - position.y),
      Math.hypot(1 - position.x, 1 - position.y),
    ),
    startColor,
  }
}

function parseGradientAngle(value: string): number | undefined {
  const lower = value.trim().toLowerCase()
  const keywordAngles: Record<string, number> = {
    'to top': 0,
    'to right': 90,
    'to bottom': 180,
    'to left': 270,
  }
  if (keywordAngles[lower] !== undefined)
    return keywordAngles[lower]

  const match = /^(-?\d+(?:\.\d+)?)deg$/.exec(lower)
  if (!match)
    return undefined
  const angle = Number(match[1])
  return Number.isFinite(angle) ? ((angle % 360) + 360) % 360 : undefined
}

function parseRadialGradientPosition(value: string): { x: number, y: number } | undefined {
  const match = /^circle(?:\s+at\s+(.+))?$/i.exec(value.trim())
  if (!match)
    return undefined
  return match[1]
    ? parseNativeQssBackgroundPosition(match[1])
    : { x: 0.5, y: 0.5 }
}

function splitQssCommaComponents(value: string): string[] {
  const parts: string[] = []
  let current = ''
  let depth = 0
  let quote: '"' | "'" | undefined
  for (const character of value) {
    if (quote) {
      current += character
      if (character === quote)
        quote = undefined
      continue
    }
    if (character === '"' || character === "'") {
      quote = character
      current += character
      continue
    }
    if (character === '(') {
      depth += 1
      current += character
      continue
    }
    if (character === ')') {
      depth -= 1
      if (depth < 0)
        return []
      current += character
      continue
    }
    if (character === ',' && depth === 0) {
      if (!current.trim())
        return []
      parts.push(current.trim())
      current = ''
      continue
    }
    current += character
  }
  if (depth !== 0 || quote || !current.trim())
    return []
  parts.push(current.trim())
  return parts
}

export function parseNativeQssBoxShadow(value: string): NativeQssShadowValue | undefined {
  const parts = splitQssValueComponents(value.trim())
  const insetParts = parts.filter(part => part.toLowerCase() === 'inset')
  if (insetParts.length > 1)
    return undefined

  const shadowParts = parts.filter(part => part.toLowerCase() !== 'inset')
  return parseNativeQssShadowParts(shadowParts, insetParts.length === 1, true)
}

export function parseNativeQssTextShadow(value: string): NativeQssShadowValue | undefined {
  const parts = splitQssValueComponents(value.trim())
  if (parts.some(part => part.toLowerCase() === 'inset'))
    return undefined

  return parseNativeQssShadowParts(parts, false, false)
}

function parseNativeQssShadowParts(
  parts: readonly string[],
  inset: boolean,
  allowSpread: boolean,
): NativeQssShadowValue | undefined {
  const maxPartCount = allowSpread ? 5 : 4
  if (parts.length < 3 || parts.length > maxPartCount)
    return undefined

  const color = parseNativeQssColor(parts.at(-1) || '')
  const lengths = parts.slice(0, -1)
  const maxLengthCount = allowSpread ? 4 : 3
  if (!color || lengths.length < 2 || lengths.length > maxLengthCount)
    return undefined

  const offsetX = parseNativeQssCoordinateNumber(lengths[0])
  const offsetY = parseNativeQssCoordinateNumber(lengths[1])
  const blurRadius = lengths[2] === undefined ? 0 : parseNativeQssLogicalNumber(lengths[2])
  const spreadRadius = lengths[3] === undefined ? 0 : parseNativeQssCoordinateNumber(lengths[3])
  if (offsetX === undefined || offsetY === undefined || blurRadius === undefined || spreadRadius === undefined)
    return undefined

  return { blurRadius, color, inset, offsetX, offsetY, spreadRadius }
}

function splitQssValueComponents(value: string): string[] {
  const parts: string[] = []
  let current = ''
  let depth = 0
  let quote: '"' | "'" | undefined
  for (const character of value) {
    if (quote) {
      current += character
      if (character === quote)
        quote = undefined
      continue
    }
    if (character === '"' || character === "'") {
      quote = character
      current += character
      continue
    }
    if (character === '(') {
      depth += 1
      current += character
      continue
    }
    if (character === ')') {
      depth -= 1
      if (depth < 0)
        return []
      current += character
      continue
    }
    if (/\s/.test(character) && depth === 0) {
      if (current) {
        parts.push(current)
        current = ''
      }
      continue
    }
    current += character
  }
  if (quote || depth !== 0)
    return []
  if (current)
    parts.push(current)
  return parts
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
