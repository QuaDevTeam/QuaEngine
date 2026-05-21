import type { ParsedQuaScript, QuaScriptDiagnostic, SourceRange } from '@quajs/script-compiler'
import { dirname, join } from 'node:path'
import {
  createLineStarts,
  parseQuaScriptDocument,
  positionAt,
  QuaScriptParser,
  rangeFromOffsets,
} from '@quajs/script-compiler'

export type QuaScriptVirtualRegionKind = 'decorator-args' | 'expression' | 'module-script' | 'setup-script'

export interface QuaScriptVirtualMapping {
  kind: QuaScriptVirtualRegionKind
  sourceEnd: number
  sourceStart: number
  virtualEnd: number
  virtualStart: number
}

export interface QuaScriptVirtualDocument {
  diagnostics: QuaScriptDiagnostic[]
  fileName: string
  mappings: QuaScriptVirtualMapping[]
  source: string
  sourceLineStarts: number[]
  text: string
  virtualLineStarts: number[]
}

export interface QuaScriptVirtualDocumentOptions {
  filePath?: string
  projectRoot?: string
}

interface TypeScriptRegion {
  kind: QuaScriptVirtualRegionKind
  sourceEnd: number
  sourceStart: number
}

export function createQuaScriptVirtualDocument(
  source: string,
  options: QuaScriptVirtualDocumentOptions = {},
): QuaScriptVirtualDocument {
  const sourceLineStarts = createLineStarts(source)
  const document = parseQuaScriptDocument(source)
  const parser = new QuaScriptParser()
  const parsed = parser.parse(document.dslBody)
  const diagnostics = [...document.diagnostics, ...parsed.diagnostics]
  const regions = collectTypeScriptRegions(source, document.dslBody, parsed)
  const fileName = options.filePath
    ? `${options.filePath}.ts`
    : join(options.projectRoot || '/', '.quascript.virtual.ts')

  let text = ''
  const mappings: QuaScriptVirtualMapping[] = []
  const append = (chunk: string) => {
    text += chunk
  }
  const appendMapped = (chunk: string, sourceStart: number, sourceEnd: number, kind: QuaScriptVirtualRegionKind) => {
    const virtualStart = text.length
    text += chunk
    mappings.push({
      kind,
      sourceEnd,
      sourceStart,
      virtualEnd: text.length,
      virtualStart,
    })
  }

  append('type GameStep = { uuid: string; run: (...args: any[]) => any }\n')
  append('declare function __quaExpr<T>(value: T): T\n')
  append('declare function __quaDecorator(...args: any[]): void\n\n')
  append('declare function node(id: string, options?: Record<string, unknown>): unknown\n')
  append('declare function label(id: string, options?: Record<string, unknown>): unknown\n')
  append('declare function scene(id: string, options?: Record<string, unknown>): unknown\n')
  append('declare function script(id: string, options?: Record<string, unknown>): unknown\n')
  append('declare function packageNode(packageId: string, nodeId: string, options?: Record<string, unknown>): unknown\n')
  append('declare function checkpoint(id: string): unknown\n')
  append('declare function image(name: string, options?: Record<string, unknown>): unknown\n\n')

  const moduleScript = document.moduleScript
  if (moduleScript) {
    appendMapped(
      source.slice(moduleScript.contentRange.start.offset, moduleScript.contentRange.end.offset),
      moduleScript.contentRange.start.offset,
      moduleScript.contentRange.end.offset,
      'module-script',
    )
    append('\n\n')
  }

  const scopeParam = hasExportedScopeType(moduleScript?.content || '')
    ? 'scope: Scope'
    : 'scope: Record<string, unknown> = {}'
  append(`export default function createQuaScript(${scopeParam}): GameStep[] {\n`)

  const setupScript = document.setupScript
  if (setupScript) {
    appendMapped(
      source.slice(setupScript.contentRange.start.offset, setupScript.contentRange.end.offset),
      setupScript.contentRange.start.offset,
      setupScript.contentRange.end.offset,
      'setup-script',
    )
    append('\n')
  }

  for (const region of regions) {
    const expression = source.slice(region.sourceStart, region.sourceEnd)
    append(region.kind === 'decorator-args' ? '__quaDecorator(' : '__quaExpr(')
    appendMapped(expression, region.sourceStart, region.sourceEnd, region.kind)
    append(');\n')
  }

  append('return []\n}\n')

  return {
    diagnostics,
    fileName,
    mappings,
    source,
    sourceLineStarts,
    text,
    virtualLineStarts: createLineStarts(text),
  }
}

export function sourcePositionToOffset(source: string, position: { character: number, line: number }): number {
  const lineStarts = createLineStarts(source)
  const lineStart = lineStarts[Math.max(0, Math.min(position.line, lineStarts.length - 1))] ?? 0
  return Math.max(0, Math.min(source.length, lineStart + position.character))
}

export function mapSourceOffsetToVirtualOffset(
  document: QuaScriptVirtualDocument,
  sourceOffset: number,
): number | undefined {
  const segment = document.mappings.find(mapping =>
    sourceOffset >= mapping.sourceStart && sourceOffset <= mapping.sourceEnd,
  )
  if (!segment) {
    return undefined
  }
  return segment.virtualStart + Math.min(sourceOffset - segment.sourceStart, segment.virtualEnd - segment.virtualStart)
}

export function mapVirtualOffsetToSourceOffset(
  document: QuaScriptVirtualDocument,
  virtualOffset: number,
): number | undefined {
  const segment = document.mappings.find(mapping =>
    virtualOffset >= mapping.virtualStart && virtualOffset <= mapping.virtualEnd,
  )
  if (!segment) {
    return undefined
  }
  return segment.sourceStart + Math.min(virtualOffset - segment.virtualStart, segment.sourceEnd - segment.sourceStart)
}

export function mapVirtualRangeToSourceRange(
  document: QuaScriptVirtualDocument,
  virtualStart: number,
  virtualLength = 0,
): SourceRange | undefined {
  const sourceStart = mapVirtualOffsetToSourceOffset(document, virtualStart)
  if (sourceStart === undefined) {
    return undefined
  }

  const sourceEnd = mapVirtualOffsetToSourceOffset(document, virtualStart + virtualLength)
    ?? sourceStart
  return rangeFromOffsets(document.sourceLineStarts, sourceStart, Math.max(sourceStart, sourceEnd))
}

export function mapSourceOffsetToRange(document: QuaScriptVirtualDocument, sourceOffset: number, length = 0): SourceRange {
  return rangeFromOffsets(document.sourceLineStarts, sourceOffset, sourceOffset + length)
}

export function virtualFileDirectory(document: QuaScriptVirtualDocument): string {
  return dirname(document.fileName)
}

function collectTypeScriptRegions(source: string, dslBody: string, parsed: ParsedQuaScript): TypeScriptRegion[] {
  const regions: TypeScriptRegion[] = []

  for (const step of parsed.steps) {
    if (step.type === 'dialogue') {
      const dialogue = step.content as any
      dialogue.decorators.forEach((decorator: any) => {
        if (decorator.argsRange) {
          regions.push({
            kind: 'decorator-args',
            sourceEnd: decorator.argsRange.end.offset,
            sourceStart: decorator.argsRange.start.offset,
          })
        }
      })
      ;(dialogue.templateExpressionRanges || []).forEach((range: SourceRange) => {
        regions.push({
          kind: 'expression',
          sourceEnd: range.end.offset,
          sourceStart: range.start.offset,
        })
      })
    }
    else if (step.type === 'choice') {
      const choice = step.content as any
      choice.options.forEach((option: any) => {
        if (option.conditionRange) {
          regions.push({
            kind: 'expression',
            sourceEnd: option.conditionRange.end.offset,
            sourceStart: option.conditionRange.start.offset,
          })
        }
      })
    }
    else if (step.type === 'action') {
      const action = step.content as any
      action.decorators.forEach((decorator: any) => {
        if (decorator.argsRange) {
          regions.push({
            kind: 'decorator-args',
            sourceEnd: decorator.argsRange.end.offset,
            sourceStart: decorator.argsRange.start.offset,
          })
        }
      })
    }
  }

  regions.push(...collectTolerantTypeScriptRegions(source, dslBody))
  return dedupeRegions(regions)
}

function collectTolerantTypeScriptRegions(source: string, dslBody: string): TypeScriptRegion[] {
  const regions: TypeScriptRegion[] = []
  const lineStarts = createLineStarts(dslBody)
  const lines = dslBody.split('\n')

  lines.forEach((rawLine, lineIndex) => {
    const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine
    const lineStart = lineStarts[lineIndex] ?? 0
    const leading = line.length - line.trimStart().length
    const trimmed = line.trim()

    collectInterpolationRegions(line, lineStart, regions)

    if (trimmed.startsWith('@')) {
      const localStart = leading
      const open = line.indexOf('(', localStart)
      if (open !== -1) {
        const close = findBalancedClose(line, open, '(', ')')
        const end = close === -1 ? line.length : close
        regions.push({
          kind: 'decorator-args',
          sourceEnd: lineStart + end,
          sourceStart: lineStart + open + 1,
        })
      }
    }

    if (trimmed.startsWith('- ')) {
      const arrowIndex = findTopLevelArrow(line)
      const conditionSearchStart = arrowIndex === -1 ? leading + 2 : arrowIndex + 2
      const ifIndex = findTopLevelKeyword(line, 'if', conditionSearchStart)
      if (ifIndex !== -1) {
        const expressionStart = skipWhitespace(line, ifIndex + 'if'.length)
        regions.push({
          kind: 'expression',
          sourceEnd: lineStart + line.length,
          sourceStart: lineStart + expressionStart,
        })
      }
    }
  })

  return regions.filter(region => region.sourceStart <= region.sourceEnd && region.sourceEnd <= source.length)
}

function collectInterpolationRegions(line: string, lineStart: number, regions: TypeScriptRegion[]): void {
  let cursor = 0
  while (cursor < line.length) {
    const start = line.indexOf('${', cursor)
    if (start === -1) {
      return
    }

    const close = findBalancedClose(line, start + 1, '{', '}')
    const end = close === -1 ? line.length : close
    regions.push({
      kind: 'expression',
      sourceEnd: lineStart + end,
      sourceStart: lineStart + start + 2,
    })
    cursor = end + 1
  }
}

function dedupeRegions(regions: TypeScriptRegion[]): TypeScriptRegion[] {
  const seen = new Set<string>()
  return regions
    .filter((region) => {
      const key = `${region.kind}:${region.sourceStart}:${region.sourceEnd}`
      if (seen.has(key)) {
        return false
      }
      seen.add(key)
      return true
    })
    .sort((a, b) => a.sourceStart - b.sourceStart || a.sourceEnd - b.sourceEnd)
}

function hasExportedScopeType(source: string): boolean {
  return /\bexport\s+(?:interface|type)\s+Scope\b/.test(source)
}

function findBalancedClose(source: string, openIndex: number, open: string, close: string): number {
  let depth = 0
  let quote: '"' | '\'' | '`' | null = null
  let escaped = false

  for (let index = openIndex; index < source.length; index++) {
    const char = source[index]
    if (quote) {
      if (escaped) {
        escaped = false
        continue
      }
      if (char === '\\') {
        escaped = true
        continue
      }
      if (char === quote) {
        quote = null
      }
      continue
    }

    if (char === '"' || char === '\'' || char === '`') {
      quote = char
      continue
    }
    if (char === open) {
      depth++
      continue
    }
    if (char === close) {
      depth--
      if (depth === 0) {
        return index
      }
    }
  }

  return -1
}

function findTopLevelKeyword(source: string, keyword: string, start = 0): number {
  const stack: string[] = []
  let quote: '"' | '\'' | '`' | null = null
  let escaped = false

  for (let index = 0; index < source.length; index++) {
    const char = source[index]
    if (quote) {
      if (escaped) {
        escaped = false
        continue
      }
      if (char === '\\') {
        escaped = true
        continue
      }
      if (char === quote) {
        quote = null
      }
      continue
    }
    if (char === '"' || char === '\'' || char === '`') {
      quote = char
      continue
    }
    if (char === '(' || char === '[' || char === '{') {
      stack.push(char)
      continue
    }
    if (char === ')' || char === ']' || char === '}') {
      stack.pop()
      continue
    }
    if (
      index >= start
      && stack.length === 0
      && source.slice(index, index + keyword.length) === keyword
      && isKeywordBoundary(source[index - 1])
      && isKeywordBoundary(source[index + keyword.length])
    ) {
      return index
    }
  }

  return -1
}

function findTopLevelArrow(source: string): number {
  const stack: string[] = []
  let quote: '"' | '\'' | '`' | null = null
  let escaped = false

  for (let index = 0; index < source.length; index++) {
    const char = source[index]
    if (quote) {
      if (escaped) {
        escaped = false
        continue
      }
      if (char === '\\') {
        escaped = true
        continue
      }
      if (char === quote) {
        quote = null
      }
      continue
    }
    if (char === '"' || char === '\'' || char === '`') {
      quote = char
      continue
    }
    if (char === '(' || char === '[' || char === '{') {
      stack.push(char)
      continue
    }
    if (char === ')' || char === ']' || char === '}') {
      stack.pop()
      continue
    }
    if (stack.length === 0 && char === '-' && source[index + 1] === '>') {
      return index
    }
  }

  return -1
}

function isKeywordBoundary(char: string | undefined): boolean {
  return !char || /\s/.test(char)
}

function skipWhitespace(source: string, start: number): number {
  let index = start
  while (index < source.length && /\s/.test(source[index])) {
    index++
  }
  return index
}

export function sourceRangeFromOffsets(source: string, start: number, end: number): SourceRange {
  return rangeFromOffsets(createLineStarts(source), start, end)
}

export function sourceOffsetToPosition(source: string, offset: number): { character: number, line: number } {
  const position = positionAt(createLineStarts(source), offset)
  return {
    character: position.column,
    line: position.line,
  }
}
