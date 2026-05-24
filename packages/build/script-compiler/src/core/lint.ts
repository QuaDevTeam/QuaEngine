import type {
  QuaScriptDiagnostic,
  QuaScriptFormatOptions,
  QuaScriptLintOptions,
  QuaScriptLintResult,
  QuaScriptLintRule,
  QuaScriptTextEdit,
} from './types'
import { applyQuaScriptLintRules, createQuaScriptLintResult } from './diagnostics'
import { createLineStarts, parseQuaScriptDocument, rangeFromOffsets } from './document'
import { detectLineEnding, splitQuaScriptSourceLines } from './format'
import { QuaScriptParser } from './parser'

export const QUASCRIPT_STYLE_RULES: QuaScriptLintRule[] = [
  {
    code: 'QS_STYLE_TRAILING_WHITESPACE',
    defaultSeverity: 'warning',
    description: 'Disallow trailing whitespace outside TypeScript script blocks.',
  },
  {
    code: 'QS_STYLE_MULTIPLE_BLANK_LINES',
    defaultSeverity: 'warning',
    description: 'Limit consecutive blank lines outside TypeScript script blocks.',
  },
  {
    code: 'QS_STYLE_DECORATOR_SPACING',
    defaultSeverity: 'warning',
    description: 'Keep decorators attached to the QuaScript statement they decorate.',
  },
  {
    code: 'QS_STYLE_FINAL_NEWLINE',
    defaultSeverity: 'warning',
    description: 'Require a final newline.',
  },
]

export interface QuaScriptSourceLintOptions {
  format?: QuaScriptFormatOptions
  lint?: QuaScriptLintOptions
}

export function lintQuaScriptSource(source: string, options: QuaScriptSourceLintOptions = {}): QuaScriptLintResult {
  const document = parseQuaScriptDocument(source)
  const parsed = new QuaScriptParser().parse(document.dslBody)
  const diagnostics = applyQuaScriptLintRules([
    ...document.diagnostics,
    ...parsed.diagnostics,
    ...collectQuaScriptStyleDiagnostics(source, options.format),
  ], options.lint)
  return createQuaScriptLintResult(diagnostics)
}

export function collectQuaScriptStyleDiagnostics(source: string, options: QuaScriptFormatOptions = {}): QuaScriptDiagnostic[] {
  return [
    ...collectTrailingWhitespaceDiagnostics(source),
    ...collectBlankLineDiagnostics(source, options),
    ...collectDecoratorSpacingDiagnostics(source),
    ...collectFinalNewlineDiagnostics(source, options),
  ]
}

export function getQuaScriptFixAllEdits(diagnostics: readonly QuaScriptDiagnostic[]): QuaScriptTextEdit[] {
  return dedupeOverlappingTextEdits(diagnostics.flatMap(diagnostic => diagnostic.fix?.edits || []))
}

function collectTrailingWhitespaceDiagnostics(source: string): QuaScriptDiagnostic[] {
  const lineStarts = createLineStarts(source)
  return splitQuaScriptSourceLines(source).flatMap((line) => {
    if (line.protected) {
      return []
    }
    const trailing = line.text.match(/[ \t]+$/u)?.[0]
    if (!trailing) {
      return []
    }
    const start = line.end - line.eol.length - trailing.length
    const end = line.end - line.eol.length
    const range = rangeFromOffsets(lineStarts, start, end)
    return [{
      code: 'QS_STYLE_TRAILING_WHITESPACE',
      fix: {
        edits: [{ newText: '', range }],
        title: 'Remove trailing whitespace',
      },
      message: 'Trailing whitespace is not allowed.',
      range,
      severity: 'warning',
      source: 'quascript/style',
    }]
  })
}

function collectBlankLineDiagnostics(source: string, options: QuaScriptFormatOptions): QuaScriptDiagnostic[] {
  const lineStarts = createLineStarts(source)
  const maxBlankLines = Math.max(0, Math.floor(options.maxBlankLines ?? 1))
  const diagnostics: QuaScriptDiagnostic[] = []
  let blankCount = 0

  for (const line of splitQuaScriptSourceLines(source)) {
    if (line.protected) {
      blankCount = 0
      continue
    }
    if (line.text.trim().length === 0) {
      blankCount++
      if (blankCount > maxBlankLines) {
        const range = rangeFromOffsets(lineStarts, line.start, line.end)
        diagnostics.push({
          code: 'QS_STYLE_MULTIPLE_BLANK_LINES',
          fix: {
            edits: [{ newText: '', range }],
            title: 'Remove extra blank line',
          },
          message: `Too many consecutive blank lines. Keep at most ${maxBlankLines}.`,
          range,
          severity: 'warning',
          source: 'quascript/style',
        })
      }
      continue
    }
    blankCount = 0
  }

  return diagnostics
}

function collectDecoratorSpacingDiagnostics(source: string): QuaScriptDiagnostic[] {
  const lineStarts = createLineStarts(source)
  const lines = splitQuaScriptSourceLines(source)
  const diagnostics: QuaScriptDiagnostic[] = []
  let pendingDecoratorIndex: number | undefined
  let firstBlankIndex: number | undefined

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]
    if (line.protected) {
      pendingDecoratorIndex = undefined
      firstBlankIndex = undefined
      continue
    }

    const trimmed = line.text.trim()
    if (trimmed.length === 0) {
      if (pendingDecoratorIndex !== undefined && firstBlankIndex === undefined) {
        firstBlankIndex = index
      }
      continue
    }

    if (pendingDecoratorIndex !== undefined && firstBlankIndex !== undefined && isDecoratorAttachmentTarget(trimmed)) {
      const firstBlank = lines[firstBlankIndex]
      const range = rangeFromOffsets(lineStarts, firstBlank.start, line.start)
      diagnostics.push({
        code: 'QS_STYLE_DECORATOR_SPACING',
        fix: {
          edits: [{ newText: '', range }],
          title: 'Attach decorator to statement',
        },
        message: 'Decorators should be adjacent to the statement they decorate.',
        range,
        severity: 'warning',
        source: 'quascript/style',
      })
    }

    if (trimmed.startsWith('@')) {
      pendingDecoratorIndex = index
      firstBlankIndex = undefined
      continue
    }

    pendingDecoratorIndex = undefined
    firstBlankIndex = undefined
  }

  return diagnostics
}

function collectFinalNewlineDiagnostics(source: string, options: QuaScriptFormatOptions): QuaScriptDiagnostic[] {
  if (source.length === 0 || options.insertFinalNewline === false || /(?:\r\n|\n|\r)$/u.test(source)) {
    return []
  }
  const lineStarts = createLineStarts(source)
  const range = rangeFromOffsets(lineStarts, source.length, source.length)
  return [{
    code: 'QS_STYLE_FINAL_NEWLINE',
    fix: {
      edits: [{ newText: detectLineEnding(source), range }],
      title: 'Insert final newline',
    },
    message: 'File should end with a newline.',
    range,
    severity: 'warning',
    source: 'quascript/style',
  }]
}

function isDecoratorAttachmentTarget(trimmed: string): boolean {
  if (trimmed.startsWith('@') || trimmed.startsWith('- ')) {
    return true
  }
  return /^[^:@-][^:]*:\s*/u.test(trimmed)
}

function dedupeOverlappingTextEdits(edits: QuaScriptTextEdit[]): QuaScriptTextEdit[] {
  const sorted = [...edits].sort((left, right) =>
    left.range.start.offset - right.range.start.offset
    || right.range.end.offset - left.range.end.offset,
  )
  const selected: QuaScriptTextEdit[] = []
  for (const edit of sorted) {
    const overlaps = selected.some(existing =>
      edit.range.start.offset < existing.range.end.offset
      && edit.range.end.offset > existing.range.start.offset,
    )
    if (!overlaps) {
      selected.push(edit)
    }
  }
  return selected
}
