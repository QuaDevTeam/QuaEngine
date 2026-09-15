import type {
  NativeQssRule,
  NativeUiDiagnostic,
  NativeUiLanguageOptions,
} from './types'
import {
  findNativeUiComponent,
  nativeQssPseudoStates,
} from './registry'
import { splitTopLevel } from './source'

const ATTR_SELECTOR_PATTERN = /\[[A-Z_][\w-]*(?:\s*=\s*(?:"[^"]*"|'[^']*'|[\w-]+))?\]/gi
const PART_SELECTOR_PATTERN = /([A-Z]\w*)::part\(([A-Za-z_][\w-]*)\)/g
const PSEUDO_PATTERN = /(?<!:):([A-Z-]+)(?![A-Z-(])/gi

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

    for (const partMatch of selector.matchAll(PART_SELECTOR_PATTERN)) {
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

    for (const pseudoMatch of selector.matchAll(PSEUDO_PATTERN)) {
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
      for (const match of selector.matchAll(/\b([A-Z]\w*)\b/g)) {
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
