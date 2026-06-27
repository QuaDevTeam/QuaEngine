import type {
  NativeQssAtRule,
  NativeQssDeclaration,
  NativeQssRule,
  NativeUiDiagnostic,
  NativeUiLanguageOptions,
} from './types'
import {
  findNativeQssProperty,
  findNativeUiComponent,
  nativeQssPseudoStates,
} from './registry'
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
} from './qss-resolved-style'
import { splitTopLevel } from './source'

const UNSUPPORTED_UNIT_PATTERN = /(?:^|[^\w-])(?:-?\d*\.?\d+)(em|rem|vw|vh|vmin|vmax|dvh|svh|lvh|cm|mm|in|pt|pc)\b/g
const SUPPORTED_MEDIA_PATTERN = /^\s*\((?:orientation:\s*(?:landscape|portrait)|(?:min|max)-(?:width|height):\s*\d+(?:\.\d+)?px)\)\s*$/
const SUPPORTED_SUPPORTS_PATTERN = /^\s*(?:renderer\((?:wgpu|preview)\)|native-feature\((?:video|audio-levels|filters|blend-modes|virtualization|focus-navigation)\))\s*$/
const ATTR_SELECTOR_PATTERN = /\[[A-Za-z_][\w-]*(?:\s*=\s*(?:"[^"]*"|'[^']*'|[A-Za-z0-9_-]+))?\]/g
const PART_SELECTOR_PATTERN = /([A-Z][A-Za-z0-9_]*)::part\(([A-Za-z_][\w-]*)\)/g
const PSEUDO_PATTERN = /(?<!:):([A-Za-z-]+)(?![A-Za-z-(])/g

export function validateAtRule(atRule: NativeQssAtRule, diagnostics: NativeUiDiagnostic[]): void {
  if (atRule.kind === 'import' || atRule.kind === 'keyframes') {
    diagnostics.push({
      code: 'QSS_UNSUPPORTED_AT_RULE',
      message: `@${atRule.kind} is not supported by native QSS milestone 1.`,
      range: atRule.range,
      severity: 'error',
      source: 'qss',
    })
    return
  }

  if (!['tokens', 'theme', 'font-face', 'media', 'supports'].includes(atRule.kind)) {
    diagnostics.push({
      code: 'QSS_UNSUPPORTED_AT_RULE',
      message: `@${atRule.kind} is not part of the native QSS subset.`,
      range: atRule.range,
      severity: 'error',
      source: 'qss',
    })
    return
  }

  if (atRule.kind === 'media' && !SUPPORTED_MEDIA_PATTERN.test(atRule.prelude)) {
    diagnostics.push({
      code: 'QSS_UNSUPPORTED_AT_RULE',
      message: 'Native QSS @media supports orientation plus logical min/max width or height only.',
      range: atRule.range,
      severity: 'error',
      source: 'qss',
    })
  }

  if (atRule.kind === 'supports' && !SUPPORTED_SUPPORTS_PATTERN.test(atRule.prelude)) {
    diagnostics.push({
      code: 'QSS_UNSUPPORTED_AT_RULE',
      message: 'Native QSS @supports accepts renderer(...) or native-feature(...) gates only.',
      range: atRule.range,
      severity: 'error',
      source: 'qss',
    })
  }

  if (/url\s*\(/i.test(atRule.body || '')) {
    diagnostics.push({
      code: 'QSS_UNSUPPORTED_VALUE',
      message: 'Use asset("...") instead of browser url(...) references in native QSS.',
      range: atRule.range,
      severity: 'error',
      source: 'qss',
    })
  }
}

export function validateSelector(
  rule: NativeQssRule,
  diagnostics: NativeUiDiagnostic[],
  options: NativeUiLanguageOptions,
): void {
  const selectors = splitTopLevel(rule.selector, ',')
    .map(item => item.text.trim())
    .filter(Boolean)

  if (selectors.length === 0) {
    diagnostics.push({
      code: 'QSS_PARSE_ERROR',
      message: 'Expected selector before rule block.',
      range: rule.selectorRange,
      severity: 'error',
      source: 'qss',
    })
    return
  }

  const maxDepth = options.lint?.maxSelectorDepth ?? 3
  for (const selector of selectors) {
    if (/[+~]/.test(selector)) {
      pushUnsupportedSelector(rule, diagnostics, 'Sibling selectors are not supported in native QSS milestone 1.')
    }
    if (/::(?:before|after|marker)\b/.test(selector) || /::(?!part\()/u.test(selector)) {
      pushUnsupportedSelector(rule, diagnostics, 'Browser pseudo-elements are not supported; use declared ::part(...) selectors.')
    }
    if (/:(?:nth-child|has|not)\s*\(/.test(selector)) {
      pushUnsupportedSelector(rule, diagnostics, ':nth-child, :has, and :not are not supported in milestone 1.')
    }
    if (selector.includes('*') && selector.trim() !== '*') {
      pushUnsupportedSelector(rule, diagnostics, 'The universal selector is only allowed as a standalone reset selector.')
    }

    const withoutAttributes = selector.replace(ATTR_SELECTOR_PATTERN, '')
    if (withoutAttributes.includes('[') || withoutAttributes.includes(']')) {
      pushUnsupportedSelector(rule, diagnostics, 'Attribute selectors must use [name] or [name="value"] syntax.')
    }

    let partMatch: RegExpExecArray | null
    PART_SELECTOR_PATTERN.lastIndex = 0
    while ((partMatch = PART_SELECTOR_PATTERN.exec(selector))) {
      const component = findNativeUiComponent(partMatch[1])
      if (!component || !(component.styleParts || []).includes(partMatch[2])) {
        diagnostics.push({
          code: 'QSS_UNKNOWN_ELEMENT',
          message: `Style part "${partMatch[2]}" is not declared by component "${partMatch[1]}".`,
          range: rule.selectorRange,
          severity: 'error',
          source: 'qss',
        })
      }
    }

    let pseudoMatch: RegExpExecArray | null
    PSEUDO_PATTERN.lastIndex = 0
    while ((pseudoMatch = PSEUDO_PATTERN.exec(selector))) {
      if (!(nativeQssPseudoStates as readonly string[]).includes(pseudoMatch[1])) {
        pushUnsupportedSelector(rule, diagnostics, `Pseudo-state :${pseudoMatch[1]} is not supported.`)
      }
    }

    const depth = selector
      .replace(/\[[^\]]*\]/g, '')
      .replace(/::part\([^)]+\)/g, '')
      .split(/\s+|>/)
      .map(part => part.trim())
      .filter(Boolean)
      .length
    if (depth > maxDepth) {
      diagnostics.push({
        code: 'QSS_COMPLEXITY_LIMIT_EXCEEDED',
        message: `Selector depth ${depth} exceeds the native QSS limit of ${maxDepth}.`,
        range: rule.selectorRange,
        severity: 'error',
        source: 'qss',
      })
    }

    if (options.lint?.strictComponents) {
      for (const match of selector.matchAll(/\b([A-Z][A-Za-z0-9_]*)\b/g)) {
        if (!findNativeUiComponent(match[1])) {
          diagnostics.push({
            code: 'QSS_UNKNOWN_ELEMENT',
            message: `Component selector "${match[1]}" is not registered.`,
            range: rule.selectorRange,
            severity: 'warning',
            source: 'qss',
          })
        }
      }
    }
  }
}

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

function pushUnsupportedSelector(
  rule: NativeQssRule,
  diagnostics: NativeUiDiagnostic[],
  message: string,
): void {
  diagnostics.push({
    code: 'QSS_UNSUPPORTED_SELECTOR',
    message,
    range: rule.selectorRange,
    severity: 'error',
    source: 'qss',
  })
}
