import type {
  NativeQssAtRule,
  NativeUiDiagnostic,
} from './types'

const SUPPORTED_MEDIA_PATTERN = /^\s*\((?:orientation:\s*(?:landscape|portrait)|(?:min|max)-(?:width|height):\s*\d+(?:\.\d+)?px)\)\s*$/
const SUPPORTED_SUPPORTS_PATTERN = /^\s*(?:renderer\((?:wgpu|preview)\)|native-feature\((?:video|audio-levels|filters|blend-modes|virtualization|focus-navigation)\))\s*$/

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
