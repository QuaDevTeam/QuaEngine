import type { NativeQssEdgeInsetsValue } from './types'

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

export function parsePercentUnitInterval(value: string): number | undefined {
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

export function parseNativeQssLetterSpacing(value: string): number | undefined {
  return value.toLowerCase() === 'normal'
    ? 0
    : parseNativeQssLogicalNumber(value)
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
