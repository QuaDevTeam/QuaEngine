import type {
  QuaScriptDiagnostic,
  QuaScriptDiagnosticSeverity,
  QuaScriptLintOptions,
  QuaScriptLintResult,
  QuaScriptRuleSeverity,
  QuaScriptTextEdit,
} from './types'
import { createLineStarts, rangeFromOffsets } from './document'

export function summarizeQuaScriptDiagnostics(diagnostics: readonly QuaScriptDiagnostic[]): Omit<QuaScriptLintResult, 'diagnostics'> {
  return {
    errorCount: diagnostics.filter(diagnostic => diagnostic.severity === 'error').length,
    fixableCount: diagnostics.filter(diagnostic => diagnostic.fix?.edits.length).length,
    infoCount: diagnostics.filter(diagnostic => diagnostic.severity === 'info').length,
    warningCount: diagnostics.filter(diagnostic => diagnostic.severity === 'warning').length,
  }
}

export function createQuaScriptLintResult(diagnostics: QuaScriptDiagnostic[]): QuaScriptLintResult {
  return {
    diagnostics,
    ...summarizeQuaScriptDiagnostics(diagnostics),
  }
}

export function applyQuaScriptLintRules(
  diagnostics: readonly QuaScriptDiagnostic[],
  options: QuaScriptLintOptions = {},
): QuaScriptDiagnostic[] {
  return diagnostics.flatMap((diagnostic) => {
    const severity = resolveQuaScriptRuleSeverity(diagnostic.code, diagnostic.severity, options)
    if (severity === 'off') {
      return []
    }
    if (severity === diagnostic.severity) {
      return [diagnostic]
    }
    return [{ ...diagnostic, severity }]
  })
}

export function resolveQuaScriptRuleSeverity(
  code: string,
  fallback: QuaScriptDiagnosticSeverity,
  options: QuaScriptLintOptions = {},
): QuaScriptRuleSeverity {
  return options.rules?.[code] ?? fallback
}

export function applyQuaScriptTextEdits(source: string, edits: readonly QuaScriptTextEdit[]): string {
  return [...edits]
    .sort((left, right) => right.range.start.offset - left.range.start.offset)
    .reduce((text, edit) => `${text.slice(0, edit.range.start.offset)}${edit.newText}${text.slice(edit.range.end.offset)}`, source)
}

export function createFullDocumentEdit(source: string, newText: string): QuaScriptTextEdit {
  const lineStarts = createLineStarts(source)
  return {
    newText,
    range: rangeFromOffsets(lineStarts, 0, source.length),
  }
}

export function createMinimalTextEdit(source: string, formatted: string): QuaScriptTextEdit[] {
  if (source === formatted) {
    return []
  }

  let prefix = 0
  const maxPrefix = Math.min(source.length, formatted.length)
  while (prefix < maxPrefix && source[prefix] === formatted[prefix]) {
    prefix++
  }

  let sourceSuffix = source.length
  let formattedSuffix = formatted.length
  while (
    sourceSuffix > prefix
    && formattedSuffix > prefix
    && source[sourceSuffix - 1] === formatted[formattedSuffix - 1]
  ) {
    sourceSuffix--
    formattedSuffix--
  }

  const lineStarts = createLineStarts(source)
  return [{
    newText: formatted.slice(prefix, formattedSuffix),
    range: rangeFromOffsets(lineStarts, prefix, sourceSuffix),
  }]
}
