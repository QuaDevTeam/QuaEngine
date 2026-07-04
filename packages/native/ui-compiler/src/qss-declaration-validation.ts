import type {
  NativeQssDeclaration,
  NativeUiDiagnostic,
  NativeUiLanguageOptions,
} from './types'
import { findNativeQssProperty } from './registry'
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
  parseNativeQssGap,
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
} from './qss-resolved-style'

const UNSUPPORTED_UNIT_PATTERN = /(?:^|[^\w-])(?:-?\d*\.?\d+)(em|rem|vw|vh|vmin|vmax|dvh|svh|lvh|cm|mm|in|pt|pc)\b/g

export function validateDeclaration(
  declaration: NativeQssDeclaration,
  diagnostics: NativeUiDiagnostic[],
  options: NativeUiLanguageOptions,
): void {
  const property = findNativeQssProperty(declaration.name)
  if (!property) {
    diagnostics.push({
      code: 'QSS_UNSUPPORTED_PROPERTY',
      message: `Property "${declaration.name}" is not part of the native QSS subset.`,
      range: declaration.nameRange,
      severity: 'error',
      source: 'qss',
    })
    return
  }

  if (!property.nativeWgpu && !options.lint?.allowPreviewFeatures) {
    diagnostics.push({
      code: 'QSS_TARGET_UNSUPPORTED_FEATURE',
      message: `Property "${declaration.name}" is planned for ${property.phase.toUpperCase()} but is not supported by current native-wgpu UI surface capabilities.`,
      range: declaration.nameRange,
      severity: 'error',
      source: 'qss',
    })
  }

  const unsupportedUnits = Array.from(declaration.value.matchAll(UNSUPPORTED_UNIT_PATTERN))
  for (const unit of unsupportedUnits) {
    diagnostics.push({
      code: 'QSS_UNSUPPORTED_UNIT',
      message: `Unit "${unit[1]}" is not supported by native QSS; use logical px, %, fr, or unitless values.`,
      range: declaration.valueRange,
      severity: 'error',
      source: 'qss',
    })
  }

  const hasUnsupportedBrowserValue = /\b(?:url|var|env)\s*\(/i.test(declaration.value) || /https?:\/\//i.test(declaration.value)
  if (hasUnsupportedBrowserValue) {
    diagnostics.push({
      code: 'QSS_UNSUPPORTED_VALUE',
      message: 'Native QSS values must use token(...) and asset("...") instead of browser url(...), var(...), env(...), or network references.',
      range: declaration.valueRange,
      severity: 'error',
      source: 'qss',
    })
  }

  const hasUnsupportedUnits = unsupportedUnits.length > 0
  if (property.nativeWgpu && !hasUnsupportedBrowserValue && !hasUnsupportedUnits) {
    const message = validateNativeWgpuDeclarationValue(declaration)
    if (message) {
      diagnostics.push({
        code: 'QSS_INVALID_VALUE',
        message,
        range: declaration.valueRange,
        severity: 'error',
        source: 'qss',
      })
    }
  }
}

function validateNativeWgpuDeclarationValue(declaration: NativeQssDeclaration): string | undefined {
  const value = declaration.value.trim()
  switch (declaration.name) {
    case 'background-color':
    case 'border-color':
    case 'color':
      return parseNativeQssColor(value)
        ? undefined
        : `${declaration.name} must be a safe native color literal: hex, rgb(...), rgba(...), transparent, currentColor, or a basic named color.`
    case 'background-image':
      return parseNativeQssBackgroundImage(value)
        ? undefined
        : 'background-image must use package-relative asset("path") or asset("path", "asset-kind") references.'
    case 'background-position':
      return parseNativeQssBackgroundPosition(value)
        ? undefined
        : 'background-position supports left/center/right, top/center/bottom, and 0%..100% one- or two-axis origins.'
    case 'background-size':
    case 'object-fit':
      return parseNativeQssObjectFit(value)
        ? undefined
        : `${declaration.name} supports cover, contain, fill, none, or scale-down.`
    case 'border-style':
      return parseNativeQssBorderStyle(value)
        ? undefined
        : 'border-style supports solid or none.'
    case 'gap':
      return parseNativeQssGap(value) !== undefined
        ? undefined
        : 'gap supports one or two non-negative logical px or unitless numbers.'
    case 'border-radius':
    case 'border-width':
    case 'font-size':
    case 'height':
    case 'line-height':
    case 'max-height':
    case 'max-width':
    case 'min-height':
    case 'min-width':
    case 'width':
      return parseNativeQssLogicalNumber(value) !== undefined
        ? undefined
        : `${declaration.name} must be a non-negative logical px or unitless number.`
    case 'bottom':
    case 'right':
      return parseNativeQssLogicalNumber(value) !== undefined
        ? undefined
        : `${declaration.name} must be a non-negative logical px or unitless inset.`
    case 'inset':
      return parseNativeQssEdgeInsets(value) !== undefined
        ? undefined
        : 'inset supports one to four non-negative logical px or unitless numbers.'
    case 'margin':
      return parseNativeQssEdgeInsets(value) !== undefined
        ? undefined
        : 'margin supports one to four non-negative logical px or unitless numbers.'
    case 'left':
    case 'top':
      return parseNativeQssCoordinateNumber(value) !== undefined
        ? undefined
        : `${declaration.name} must be a finite logical px or unitless coordinate.`
    case 'display':
      return parseNativeQssDisplay(value) !== undefined
        ? undefined
        : 'display currently supports none only.'
    case 'font-family':
      return parseNativeQssFontFamilyList(value)
        ? undefined
        : 'font-family must include at least one font family name.'
    case 'font-style':
      return parseNativeQssFontStyle(value) !== undefined
        ? undefined
        : 'font-style supports normal or italic.'
    case 'font-weight':
      return parseNativeQssFontWeight(value) !== undefined
        ? undefined
        : 'font-weight must be normal, bold, or an integer weight.'
    case 'letter-spacing':
      return parseNativeQssLetterSpacing(value) !== undefined
        ? undefined
        : 'letter-spacing must be normal or a non-negative logical px or unitless number.'
    case 'opacity':
      return parseNativeQssOpacity(value) !== undefined
        ? undefined
        : 'opacity must be a finite number; native projection clamps it to 0..1.'
    case 'overflow':
      return parseNativeQssOverflow(value) !== undefined
        ? undefined
        : 'overflow supports visible or hidden.'
    case 'padding':
      return parseNativeQssEdgeInsets(value) !== undefined
        ? undefined
        : 'padding supports one to four non-negative logical px or unitless numbers.'
    case 'padding-bottom':
    case 'padding-left':
    case 'padding-right':
    case 'padding-top':
    case 'margin-bottom':
    case 'margin-left':
    case 'margin-right':
    case 'margin-top':
    case 'row-gap':
    case 'column-gap':
      return parseNativeQssLogicalNumber(value) !== undefined
        ? undefined
        : `${declaration.name} must be a non-negative logical px or unitless number.`
    case 'text-align':
      return parseNativeQssTextAlign(value)
        ? undefined
        : 'text-align supports left, center, right, or justify.'
    case 'text-decoration':
      return parseNativeQssTextDecoration(value)
        ? undefined
        : 'text-decoration supports none, underline, or line-through.'
    case 'text-overflow':
      return parseNativeQssTextOverflow(value)
        ? undefined
        : 'text-overflow supports clip or ellipsis.'
    case 'text-transform':
      return parseNativeQssTextTransform(value)
        ? undefined
        : 'text-transform supports none, uppercase, lowercase, or capitalize.'
    case 'visibility':
      return parseNativeQssVisibility(value) !== undefined
        ? undefined
        : 'visibility supports visible or hidden.'
    case 'white-space':
      return parseNativeQssWhiteSpace(value)
        ? undefined
        : 'white-space supports normal, nowrap, pre, pre-line, or pre-wrap.'
    case 'z-index':
      return parseNativeQssInteger(value) !== undefined
        ? undefined
        : 'z-index must be a safe integer.'
    default:
      return undefined
  }
}
