import type {
  NativeQssDeclaration,
  NativeUiDiagnostic,
  NativeUiLanguageOptions,
} from './types'
import { findNativeQssProperty } from './registry'
import {
  parseNativeQssAlignItems,
  parseNativeQssBackgroundGradient,
  parseNativeQssBackgroundImage,
  parseNativeQssBackgroundPosition,
  parseNativeQssBorderStyle,
  parseNativeQssBoxSizing,
  parseNativeQssColor,
  parseNativeQssCoordinateNumber,
  parseNativeQssDisplay,
  parseNativeQssEdgeInsets,
  parseNativeQssFilter,
  parseNativeQssFontFamilyList,
  parseNativeQssFontStyle,
  parseNativeQssFontWeight,
  parseNativeQssGap,
  parseNativeQssInteger,
  parseNativeQssJustifyContent,
  parseNativeQssLetterSpacing,
  parseNativeQssLogicalNumber,
  parseNativeQssObjectFit,
  parseNativeQssOpacity,
  parseNativeQssOverflow,
  parseNativeQssPointerEvents,
  parseNativeQssPosition,
  parseNativeQssBoxShadow,
  parseNativeQssTextAlign,
  parseNativeQssTextDecoration,
  parseNativeQssTextOverflow,
  parseNativeQssTextTransform,
  parseNativeQssTextShadow,
  parseNativeQssTransform,
  parseNativeQssTransformOrigin,
  parseNativeQssTranslate,
  parseNativeQssScale,
  parseNativeQssTransition,
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
    case 'align-items':
      return parseNativeQssAlignItems(value)
        ? undefined
        : 'align-items supports flex-start, center, or flex-end.'
    case 'background-color':
    case 'border-color':
    case 'color':
      return parseNativeQssColor(value)
        ? undefined
        : `${declaration.name} must be a safe native color literal: hex, rgb(...), rgba(...), transparent, currentColor, or a basic named color.`
    case 'background-image':
      return parseNativeQssBackgroundImage(value) || parseNativeQssBackgroundGradient(value)
        ? undefined
        : 'background-image must use package-relative asset(...) or a linear-gradient(...) / radial-gradient(...) with 2 to 8 strictly ordered color stops.'
    case 'background-position':
    case 'object-position':
      return parseNativeQssBackgroundPosition(value)
        ? undefined
        : `${declaration.name} supports left/center/right, top/center/bottom, and 0%..100% one- or two-axis origins.`
    case 'background-size':
    case 'object-fit':
      return parseNativeQssObjectFit(value)
        ? undefined
        : `${declaration.name} supports cover, contain, fill, none, or scale-down.`
    case 'border-style':
      return parseNativeQssBorderStyle(value)
        ? undefined
        : 'border-style supports solid or none.'
    case 'box-sizing':
      return parseNativeQssBoxSizing(value)
        ? undefined
        : 'box-sizing supports border-box or content-box.'
    case 'box-shadow':
      return value.toLowerCase() === 'none' || parseNativeQssBoxShadow(value)
        ? undefined
        : 'box-shadow supports one shadow: [inset] offset-x offset-y [blur-radius] [spread-radius] color.'
    case 'text-shadow':
      return value.toLowerCase() === 'none' || parseNativeQssTextShadow(value)
        ? undefined
        : 'text-shadow supports one shadow: offset-x offset-y [blur-radius] color.'
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
    case 'justify-content':
      return parseNativeQssJustifyContent(value)
        ? undefined
        : 'justify-content supports flex-start, center, flex-end, space-between, space-around, or space-evenly.'
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
    case 'filter':
      return parseNativeQssFilter(value)
        ? undefined
        : 'filter supports none and bounded brightness(...) / saturate(...) functions.'
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
    case 'pointer-events':
      return parseNativeQssPointerEvents(value) !== undefined
        ? undefined
        : 'pointer-events supports auto or none.'
    case 'padding':
      return parseNativeQssEdgeInsets(value) !== undefined
        ? undefined
        : 'padding supports one to four non-negative logical px or unitless numbers.'
    case 'position':
      return parseNativeQssPosition(value) !== undefined
        ? undefined
        : 'position supports relative or absolute in native QSS static layout.'
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
    case 'transform':
      return parseNativeQssTransform(value)
        ? undefined
        : 'transform supports bounded translate(...) and scale(...) functions.'
    case 'transform-origin':
      return parseNativeQssTransformOrigin(value)
        ? undefined
        : 'transform-origin supports left/center/right, top/center/bottom, and 0%..100% origins.'
    case 'translate':
      return parseNativeQssTranslate(value)
        ? undefined
        : 'translate supports one or two finite logical px or unitless coordinates.'
    case 'scale':
      return parseNativeQssScale(value)
        ? undefined
        : 'scale supports one or two bounded non-negative numbers.'
    case 'transition':
      return parseNativeQssTransition(value)
        ? undefined
        : 'transition supports all or native paint/transform properties with a 0ms..5s duration and either a standard easing keyword or cubic-bezier(x1, y1, x2, y2) with x coordinates in 0..1.'
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
