import type {
  NativeQssAlignItemsValue,
  NativeQssBackgroundImageValue,
  NativeQssBackgroundPositionValue,
  NativeQssBorderStyleValue,
  NativeQssBoxSizingValue,
  NativeQssFontStyleValue,
  NativeQssFontWeightValue,
  NativeQssFilterValue,
  NativeQssGradientStop,
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
const TRANSITION_EASING_KEYWORDS = new Set<NativeQssTransitionEasing>([
  'ease',
  'ease-in',
  'ease-in-out',
  'ease-out',
  'linear',
])

/**
 * Accepts the CSS keywords plus `cubic-bezier(x1, y1, x2, y2)`. The x control
 * points must stay inside the unit interval so the curve remains a function of
 * time, matching CSS and the native renderer's validation.
 */
function isNativeQssTransitionEasing(value: string): value is NativeQssTransitionEasing {
  if (TRANSITION_EASING_KEYWORDS.has(value as NativeQssTransitionEasing)) {
    return true
  }
  const match = /^cubic-bezier\(([^)]*)\)$/.exec(value)
  if (!match) {
    return false
  }
  const points = match[1].split(',').map(part => Number(part.trim()))
  return points.length === 4
    && points.every(point => Number.isFinite(point))
    && points[0] >= 0 && points[0] <= 1
    && points[2] >= 0 && points[2] <= 1
}

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
  // Extend pattern to include all supported CSS filter functions.
  const pattern = /(brightness|saturate|blur|contrast|grayscale|sepia|hue-rotate|invert)\(\s*(\d+(?:\.\d+)?(?:deg|px|%)?)\s*\)/gi
  let match: RegExpExecArray | null
  while ((match = pattern.exec(source))) {
    if (source.slice(cursor, match.index).trim() || seen.has(match[1].toLowerCase()))
      return undefined
    cursor = pattern.lastIndex
    const name = match[1].toLowerCase()
    const raw = match[2]
    const amount = name === 'hue-rotate'
      ? parseHueRotateDeg(raw)
      : name === 'blur'
        ? parseBlurPx(raw)
        : parseFilterAmount(raw)
    if (amount === undefined)
      return undefined
    switch (name) {
      case 'brightness': result.brightness = amount; break
      case 'saturate': result.saturate = amount; break
      case 'blur': result.blur = amount; break
      case 'contrast': result.contrast = amount; break
      case 'grayscale': result.grayscale = amount; break
      case 'sepia': result.sepia = amount; break
      case 'hue-rotate': result.hueRotate = amount; break
      case 'invert': result.invert = amount; break
    }
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
    // A `cubic-bezier(...)` timing function contains its own commas and spaces,
    // so lift it out before splitting the entry on whitespace. CSS allows a
    // delay after the timing function, so the bezier is not anchored to the end.
    const bezier = /\s+(cubic-bezier\([^)]*\))(?=\s|$)/.exec(entry)
    const head = bezier
      ? `${entry.slice(0, bezier.index)}${entry.slice(bezier.index + bezier[0].length)}`
      : entry
    const parts = head.split(/\s+/).filter(Boolean)
    // `property duration [easing] [delay]` — at most four tokens, one of which
    // is the lifted bezier when present.
    if (parts.length < 2 || parts.length > (bezier ? 3 : 4))
      return undefined
    const property = parts[0] as NativeQssTransitionProperty
    // CSS reads time values positionally: the first is duration, the second is
    // delay. Any non-time token is the timing function.
    const times: (number | undefined)[] = []
    let easingToken: string | undefined
    for (const part of parts.slice(1)) {
      if (isTransitionTimeToken(part)) {
        if (times.length >= 2)
          return undefined
        times.push(parseTransitionDuration(part))
        continue
      }
      if (easingToken !== undefined || bezier)
        return undefined
      easingToken = part
    }
    const durationMs = times[0]
    // A delay is optional; unlike duration, CSS permits it to be negative,
    // but native has no use for a pre-seeked transition so those are rejected.
    const delayMs = times.length > 1 ? times[1] : 0
    const easing = (bezier
      ? bezier[1].replaceAll(/\s+/g, ' ')
      : easingToken || 'ease') as NativeQssTransitionEasing
    if (
      !TRANSITION_PROPERTIES.has(property)
      || durationMs === undefined
      || delayMs === undefined
      || !isNativeQssTransitionEasing(easing)
      || seen.has(property)
      || (property === 'all' && entries.length > 1)
    ) {
      return undefined
    }
    seen.add(property)
    transitions.push(delayMs > 0
      ? { delayMs, durationMs, easing, property }
      : { durationMs, easing, property })
  }
  return transitions
}

function isTransitionTimeToken(value: string): boolean {
  return /^-?\d+(?:\.\d+)?(?:ms|s)$/.test(value)
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
  const pattern = /(translate|scale|rotate)\(([^)]*)\)/gi
  let match: RegExpExecArray | null
  while ((match = pattern.exec(source))) {
    if (source.slice(cursor, match.index).trim())
      return undefined
    cursor = pattern.lastIndex
    matched = true
    const fn_ = match[1].toLowerCase()
    if (fn_ === 'translate') {
      const translate = parseNativeQssTranslate(match[2])
      if (!translate)
        return undefined
      result.translateX = translate.x
      result.translateY = translate.y
    }
    else if (fn_ === 'scale') {
      const scale = parseNativeQssScale(match[2])
      if (!scale)
        return undefined
      result.scaleX = scale.x
      result.scaleY = scale.y
    }
    else {
      const rotateDeg = parseNativeQssRotate(match[2])
      if (rotateDeg === undefined)
        return undefined
      result.rotateDeg = rotateDeg
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

/**
 * Parses a CSS `rotate()` angle argument and returns the equivalent degrees.
 * Supports `deg`, `rad`, and `turn` units. Returns `undefined` for invalid input.
 */
export function parseNativeQssRotate(value: string): number | undefined {
  const trimmed = value.trim()
  const match = /^(-?(?:\d+(?:\.\d+)?|\.\d+))(deg|rad|turn)$/i.exec(trimmed)
  if (!match)
    return undefined
  const amount = Number(match[1])
  if (!Number.isFinite(amount))
    return undefined
  const unit = match[2].toLowerCase()
  switch (unit) {
    case 'deg':
      return amount
    case 'rad':
      return amount * (180 / Math.PI)
    case 'turn':
      return amount * 360
    default:
      return undefined
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

/** Parses a blur radius in pixels: `12px` → 12. Accepts only non-negative px. */
function parseBlurPx(value: string): number | undefined {
  const raw = value.endsWith('px') ? value.slice(0, -2) : value
  const amount = Number(raw)
  return Number.isFinite(amount) && amount >= 0 && amount <= 256 ? amount : undefined
}

/** Parses a hue-rotate angle: `90deg` → 90, `1.5rad` → degrees, `0.25turn` → degrees. */
function parseHueRotateDeg(value: string): number | undefined {
  let deg: number
  if (value.endsWith('deg'))
    deg = Number(value.slice(0, -3))
  else if (value.endsWith('rad'))
    deg = Number(value.slice(0, -3)) * (180 / Math.PI)
  else if (value.endsWith('turn'))
    deg = Number(value.slice(0, -4)) * 360
  else
    deg = Number(value) // unitless degrees per CSS fallback
  return Number.isFinite(deg) ? deg % 360 : undefined
}

/**
 * Parses an array of CSS color-stop strings such as `["red", "blue 40%", "#0f0"]`
 * into normalized stop objects. Positions default to evenly spaced when absent.
 */
function parseGradientColorStops(
  parts: string[],
): NativeQssGradientStop[] | undefined {
  if (parts.length < 2 || parts.length > 8)
    return undefined
  const rawStops: Array<{ color: string; position: number | null }> = []
  for (const part of parts) {
    const trimmed = part.trim()
    // Optionally ends with a percentage, e.g. "rgba(0,0,0,0.5) 30%"
    const posMatch = /^(.+?)\s+(\d+(?:\.\d+)?)%\s*$/.exec(trimmed)
    if (posMatch) {
      const color = parseNativeQssColor(posMatch[1].trim())
      if (!color)
        return undefined
      const pct = Number(posMatch[2])
      if (!Number.isFinite(pct) || pct < 0 || pct > 100)
        return undefined
      rawStops.push({ color, position: pct / 100 })
    }
    else {
      const color = parseNativeQssColor(trimmed)
      if (!color)
        return undefined
      rawStops.push({ color, position: null })
    }
  }
  // CSS defaults the edge stops, then distributes each run of omitted stops
  // evenly between its surrounding explicit positions.
  const positions = rawStops.map(stop => stop.position)
  positions[0] ??= 0
  positions[positions.length - 1] ??= 1

  let cursor = 1
  while (cursor < positions.length - 1) {
    if (positions[cursor] !== null) {
      cursor += 1
      continue
    }
    const runStart = cursor - 1
    let runEnd = cursor + 1
    while (runEnd < positions.length && positions[runEnd] === null)
      runEnd += 1
    const start = positions[runStart]!
    const end = positions[runEnd]!
    const intervalCount = runEnd - runStart
    for (let index = cursor; index < runEnd; index++)
      positions[index] = start + (end - start) * ((index - runStart) / intervalCount)
    cursor = runEnd + 1
  }

  // The bounded native subset intentionally rejects hard-stop and decreasing
  // positions. Every emitted pair therefore has a real interval that can be
  // projected as one non-overlapping GPU segment.
  for (let index = 1; index < positions.length; index++) {
    if (positions[index]! <= positions[index - 1]!)
      return undefined
  }

  return rawStops.map((stop, index) => ({
    color: stop.color,
    position: positions[index]!,
  }))
}

function parseLinearGradient(value: string): NativeQssGradientValue | undefined {
  const parts = splitQssCommaComponents(value)
  // Allow: (angle, stop1, stop2[, stop3, ...]) or (stop1, stop2[, ...])
  if (parts.length < 2 || parts.length > 9)
    return undefined

  const firstPart = parts[0].trim()
  const hasDirection = /^(to |\-?\d)/i.test(firstPart)
  const angleDegrees = hasDirection ? parseGradientAngle(parts[0]) : 180
  if (angleDegrees === undefined)
    return undefined

  const colorParts = hasDirection ? parts.slice(1) : parts
  const stops = parseGradientColorStops(colorParts)
  if (!stops || stops.length < 2)
    return undefined

  return { angleDegrees, kind: 'linear', stops }
}

function parseRadialGradient(value: string): NativeQssGradientValue | undefined {
  const parts = splitQssCommaComponents(value)
  if (parts.length < 2 || parts.length > 9)
    return undefined

  // Detect whether the first part is a shape/position descriptor. CSS defaults
  // an unqualified radial gradient to an ellipse centred in the box.
  const firstLower = parts[0].trim().toLowerCase()
  const hasDescriptor = /^(circle|ellipse)(?:\s|$)|^at\s/.test(firstLower)
  const descriptor = hasDescriptor
    ? parseRadialGradientDescriptor(parts[0])
    : { position: { x: 0.5, y: 0.5 }, shape: 'ellipse' as const }
  if (!descriptor)
    return undefined

  const colorParts = hasDescriptor ? parts.slice(1) : parts
  const stops = parseGradientColorStops(colorParts)
  if (!stops || stops.length < 2)
    return undefined

  const { position, shape } = descriptor
  const radius = Math.max(
    Math.hypot(position.x, position.y),
    Math.hypot(1 - position.x, position.y),
    Math.hypot(position.x, 1 - position.y),
    Math.hypot(1 - position.x, 1 - position.y),
  )
  return {
    centerX: position.x,
    centerY: position.y,
    kind: 'radial',
    radius,
    shape,
    stops,
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

function parseRadialGradientDescriptor(value: string): {
  position: { x: number, y: number }
  shape: 'circle' | 'ellipse'
} | undefined {
  const match = /^(?:(circle|ellipse)\s*)?(?:at\s+(.+))?$/i.exec(value.trim())
  if (!match)
    return undefined
  const position = match[2]
    ? parseNativeQssBackgroundPosition(match[2])
    : { x: 0.5, y: 0.5 }
  if (!position)
    return undefined
  return {
    position,
    shape: (match[1]?.toLowerCase() || 'ellipse') as 'circle' | 'ellipse',
  }
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
