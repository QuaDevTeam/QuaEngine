import type { CodeAction, Diagnostic, Position, Range, TextEdit } from 'vscode-languageserver/node.js'
import { CodeActionKind } from 'vscode-languageserver/node.js'

export interface NativeUiAssetCodeActionOptions {
  diagnostics: readonly Diagnostic[]
  range: Range
  source: string
  uri: string
}

interface NativeUiRangeForCodeAction {
  end: Position
  start: Position
}

export function createNativeUiAssetCodeActions(options: NativeUiAssetCodeActionOptions): CodeAction[] {
  const diagnostics = options.diagnostics.filter(isNativeAssetDiagnostic)
  if (diagnostics.length === 0)
    return []

  const quickFixes = diagnostics
    .filter(diagnostic => rangesIntersect(diagnostic.range, options.range))
    .flatMap((diagnostic): CodeAction[] => {
      const edit = removalEditForAssetDiagnostic(options.source, diagnostic.range)
      if (!edit)
        return []

      return [{
        title: assetRemovalTitle(diagnostic.code),
        kind: CodeActionKind.QuickFix,
        diagnostics: [diagnostic],
        edit: {
          changes: {
            [options.uri]: [edit],
          },
        },
      }]
    })

  const fixAllEdits = mergeOverlappingTextEdits(dedupeTextEdits(diagnostics
    .map(diagnostic => removalEditForAssetDiagnostic(options.source, diagnostic.range))
    .filter((edit): edit is TextEdit => Boolean(edit))))

  return [
    ...quickFixes,
    ...(fixAllEdits.length > 0
      ? [{
          title: 'Remove all invalid native UI asset references',
          kind: `${CodeActionKind.SourceFixAll}.quaNativeAssets`,
          diagnostics,
          edit: {
            changes: {
              [options.uri]: fixAllEdits,
            },
          },
        }]
      : []),
  ]
}

function isNativeAssetDiagnostic(diagnostic: { code?: number | string }): boolean {
  return diagnostic.code === 'NATIVE_UI_ASSET_MISSING'
    || diagnostic.code === 'QUI_INVALID_ASSET_REFERENCE'
}

function assetRemovalTitle(code: number | string | undefined): string {
  return code === 'NATIVE_UI_ASSET_MISSING'
    ? 'Remove missing native UI asset reference'
    : 'Remove invalid native UI asset reference'
}

function removalEditForAssetDiagnostic(source: string, range: Range): TextEdit | undefined {
  const start = offsetAtPosition(source, range.start)
  const end = offsetAtPosition(source, range.end)
  const lineStart = source.lastIndexOf('\n', Math.max(0, start - 1)) + 1
  const lineEnd = source.indexOf('\n', end)
  const statementEnd = lineEnd === -1 ? source.length : lineEnd
  const lineText = source.slice(lineStart, statementEnd)

  if (lineText.includes(';')) {
    const declarationRange = expandToQssDeclaration(source, start, end, lineStart, statementEnd)
    if (declarationRange)
      return { newText: '', range: declarationRange }
  }

  const propRange = expandToQuiProp(source, start, end, lineStart, statementEnd)
  return propRange
    ? { newText: '', range: propRange }
    : undefined
}

function expandToQssDeclaration(
  source: string,
  start: number,
  end: number,
  lineStart: number,
  lineEnd: number,
): NativeUiRangeForCodeAction | undefined {
  const semicolon = source.indexOf(';', end)
  if (semicolon === -1 || semicolon > lineEnd)
    return undefined

  const colon = source.lastIndexOf(':', start)
  if (colon < lineStart)
    return undefined

  let declarationStart = colon
  while (declarationStart > lineStart && /[A-Za-z-]/.test(source[declarationStart - 1])) {
    declarationStart -= 1
  }
  while (declarationStart > lineStart && /[ \t]/.test(source[declarationStart - 1])) {
    declarationStart -= 1
  }

  let declarationEnd = semicolon + 1
  while (declarationEnd < source.length && /[ \t]/.test(source[declarationEnd])) {
    declarationEnd += 1
  }
  if (source[declarationEnd] === '\r')
    declarationEnd += 1
  if (source[declarationEnd] === '\n')
    declarationEnd += 1

  return rangeFromOffsets(source, declarationStart, declarationEnd)
}

function expandToQuiProp(
  source: string,
  start: number,
  end: number,
  lineStart: number,
  lineEnd: number,
): NativeUiRangeForCodeAction | undefined {
  const colon = source.lastIndexOf(':', start)
  if (colon < lineStart)
    return undefined

  let propStart = colon
  while (propStart > lineStart && /[A-Za-z0-9_-]/.test(source[propStart - 1])) {
    propStart -= 1
  }
  while (propStart > lineStart && /[ \t]/.test(source[propStart - 1])) {
    propStart -= 1
  }

  let propEnd = end
  while (propEnd < lineEnd && source[propEnd] !== ',' && source[propEnd] !== ')' && source[propEnd] !== '\n') {
    propEnd += 1
  }

  const previousComma = source.lastIndexOf(',', propStart)
  const hasPreviousCommaOnLine = previousComma >= lineStart
  if (hasPreviousCommaOnLine) {
    let removalStart = previousComma
    while (removalStart > lineStart && /[ \t]/.test(source[removalStart - 1])) {
      removalStart -= 1
    }
    return rangeFromOffsets(source, removalStart, propEnd)
  }

  if (source[propEnd] === ',') {
    propEnd += 1
    while (propEnd < lineEnd && /[ \t]/.test(source[propEnd])) {
      propEnd += 1
    }
  }

  return rangeFromOffsets(source, propStart, propEnd)
}

function rangesIntersect(left: Range, right: Range): boolean {
  return comparePosition(left.end, right.start) >= 0
    && comparePosition(right.end, left.start) >= 0
}

function dedupeTextEdits(edits: readonly TextEdit[]): TextEdit[] {
  const seen = new Set<string>()
  const deduped: TextEdit[] = []
  for (const edit of edits) {
    const key = JSON.stringify(edit.range)
    if (seen.has(key))
      continue
    seen.add(key)
    deduped.push(edit)
  }
  return deduped.sort((left, right) => comparePosition(left.range.start, right.range.start))
}

function mergeOverlappingTextEdits(edits: readonly TextEdit[]): TextEdit[] {
  const sorted = [...edits].sort((left, right) => comparePosition(left.range.start, right.range.start))
  const merged: TextEdit[] = []

  for (const edit of sorted) {
    const previous = merged[merged.length - 1]
    if (!previous || comparePosition(edit.range.start, previous.range.end) > 0) {
      merged.push(edit)
      continue
    }

    previous.range.end = comparePosition(edit.range.end, previous.range.end) > 0
      ? edit.range.end
      : previous.range.end
  }

  return merged
}

function offsetAtPosition(source: string, position: Position): number {
  const lineStarts = createLineStartOffsets(source)
  const line = Math.max(0, Math.min(position.line, lineStarts.length - 1))
  const nextLineStart = lineStarts[line + 1] ?? source.length
  return Math.min(lineStarts[line] + Math.max(0, position.character), nextLineStart)
}

function rangeFromOffsets(source: string, startOffset: number, endOffset: number): NativeUiRangeForCodeAction {
  return {
    start: positionAtOffset(source, startOffset),
    end: positionAtOffset(source, endOffset),
  }
}

function positionAtOffset(source: string, offset: number): Position {
  const lineStarts = createLineStartOffsets(source)
  const safeOffset = Math.max(0, Math.min(source.length, offset))
  let line = 0
  while (line + 1 < lineStarts.length && lineStarts[line + 1] <= safeOffset) {
    line += 1
  }
  return {
    line,
    character: safeOffset - lineStarts[line],
  }
}

function createLineStartOffsets(source: string): number[] {
  const starts = [0]
  for (let index = 0; index < source.length; index += 1) {
    if (source.charCodeAt(index) === 10)
      starts.push(index + 1)
  }
  return starts
}

function comparePosition(left: Position, right: Position): number {
  return left.line - right.line || left.character - right.character
}
