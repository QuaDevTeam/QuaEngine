import type {
  NativeQssDeclaration,
  NativeQssObjectFitValue,
  NativeQssResolvedNodeStyle,
  NativeQssTextAlignValue,
} from './types'

const OBJECT_FIT_VALUES = new Set<NativeQssObjectFitValue>(['contain', 'cover', 'fill', 'none', 'scale-down'])
const TEXT_ALIGN_VALUES = new Set<NativeQssTextAlignValue>(['center', 'justify', 'left', 'right'])

export function resolveNativeQssDeclarations(
  declarations: readonly NativeQssDeclaration[],
): NativeQssResolvedNodeStyle {
  const resolved: NativeQssResolvedNodeStyle = {
    style: {},
  }

  for (const declaration of declarations) {
    const value = declaration.value.trim()
    switch (declaration.name) {
      case 'background-color':
        resolved.style.backgroundColor = value
        break
      case 'background-image':
        resolved.style.backgroundImage = parseBackgroundImage(value)
        break
      case 'background-position':
        resolved.style.backgroundPosition = parseBackgroundPosition(value)
        break
      case 'background-size':
        resolved.style.backgroundSize = parseObjectFit(value)
        break
      case 'border-color':
        resolved.style.borderColor = value
        break
      case 'border-radius':
        resolved.style.borderRadius = parseLogicalNumber(value)
        break
      case 'border-width':
        resolved.style.borderWidth = parseLogicalNumber(value)
        break
      case 'color':
        resolved.style.color = value
        break
      case 'font-family':
        resolved.style.fontFamily = parseFontFamilyList(value)
        break
      case 'font-size':
        resolved.style.fontSize = parseLogicalNumber(value)
        break
      case 'font-weight':
        resolved.style.fontWeight = parseFontWeight(value)
        break
      case 'line-height':
        resolved.style.lineHeight = parseLogicalNumber(value)
        break
      case 'object-fit':
        resolved.style.objectFit = parseObjectFit(value)
        break
      case 'opacity':
        resolved.style.opacity = parseOpacity(value)
        break
      case 'text-align':
        resolved.style.textAlign = parseTextAlign(value)
        break
      case 'z-index':
        resolved.zIndex = parseInteger(value)
        break
    }
  }

  return pruneUndefinedResolvedNodeStyle(resolved)
}

function parseBackgroundImage(value: string): { assetType: string, assetName: string } | undefined {
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

function parseBackgroundPosition(value: string): { x: number, y: number } | undefined {
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

function parseLogicalNumber(value: string): number | undefined {
  const match = /^(-?\d+(?:\.\d+)?)(?:px)?$/.exec(value.trim())
  if (!match)
    return undefined
  const number = Number(match[1])
  return Number.isFinite(number) && number >= 0 ? number : undefined
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

function parseInteger(value: string): number | undefined {
  const match = /^-?\d+$/.exec(value.trim())
  if (!match)
    return undefined
  const number = Number(value)
  return Number.isSafeInteger(number) ? number : undefined
}

function parseOpacity(value: string): number | undefined {
  const number = Number(value)
  if (!Number.isFinite(number))
    return undefined
  return Math.min(1, Math.max(0, number))
}

function parseTextAlign(value: string): NativeQssTextAlignValue | undefined {
  const normalized = value.toLowerCase()
  return TEXT_ALIGN_VALUES.has(normalized as NativeQssTextAlignValue)
    ? normalized as NativeQssTextAlignValue
    : undefined
}

function parseObjectFit(value: string): NativeQssObjectFitValue | undefined {
  const normalized = value.toLowerCase()
  return OBJECT_FIT_VALUES.has(normalized as NativeQssObjectFitValue)
    ? normalized as NativeQssObjectFitValue
    : undefined
}

function parseFontWeight(value: string): 'bold' | 'normal' | number | undefined {
  const normalized = value.toLowerCase()
  if (normalized === 'bold' || normalized === 'normal')
    return normalized

  const number = parseInteger(value)
  return number !== undefined ? number : undefined
}

function parseFontFamilyList(value: string): string[] | undefined {
  const families = value
    .split(',')
    .map(item => item.trim().replace(/^['"]|['"]$/g, ''))
    .filter(Boolean)

  return families.length > 0 ? families : undefined
}

function pruneUndefinedResolvedNodeStyle(style: NativeQssResolvedNodeStyle): NativeQssResolvedNodeStyle {
  for (const key of Object.keys(style.style) as Array<keyof typeof style.style>) {
    if (style.style[key] === undefined)
      delete style.style[key]
  }

  if (style.zIndex === undefined)
    delete style.zIndex

  return style
}
