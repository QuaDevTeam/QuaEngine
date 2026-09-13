import type {
  NativeQssAtRule,
  NativeQssDeclaration,
  NativeQssRule,
  NativeUiDiagnostic,
} from './types'
import {
  findMatchingDelimiter,
  rangeFromOffsets,
} from './source'

export interface ParsedQssItem {
  atRule?: NativeQssAtRule
  bodyEnd?: number
  bodyStart?: number
  header: string
  rangeEnd: number
  rangeStart: number
  rule?: NativeQssRule
}

export function parseQssItems(
  source: string,
  masked: string,
  start: number,
  end: number,
  lineStarts: readonly number[],
  diagnostics: NativeUiDiagnostic[],
): ParsedQssItem[] {
  const items: ParsedQssItem[] = []
  let offset = start

  while (offset < end) {
    offset = skipWhitespace(masked, offset, end)
    if (offset >= end)
      break

    if (masked[offset] === '@') {
      const item = parseAtRule(source, masked, offset, end, lineStarts, diagnostics)
      if (!item)
        break
      items.push(item)
      offset = item.rangeEnd
      continue
    }

    const open = masked.indexOf('{', offset)
    if (open === -1 || open >= end) {
      diagnostics.push({
        code: 'QSS_PARSE_ERROR',
        message: 'Expected a rule block after selector.',
        range: rangeFromOffsets(lineStarts, offset, Math.min(end, source.length)),
        severity: 'error',
        source: 'qss',
      })
      break
    }

    const close = findMatchingDelimiter(masked, open, '{', '}')
    if (close === -1 || close > end)
      break

    const selector = source.slice(offset, open).trim()
    const declarations = parseDeclarations(source, masked, open + 1, close, lineStarts, diagnostics)
    const rule: NativeQssRule = {
      selector,
      declarations,
      selectorRange: rangeFromOffsets(lineStarts, offset, open),
      range: rangeFromOffsets(lineStarts, offset, close + 1),
    }
    items.push({
      header: selector,
      rangeStart: offset,
      rangeEnd: close + 1,
      bodyStart: open + 1,
      bodyEnd: close,
      rule,
    })
    offset = close + 1
  }

  return items
}

function parseAtRule(
  source: string,
  masked: string,
  offset: number,
  end: number,
  lineStarts: readonly number[],
  diagnostics: NativeUiDiagnostic[],
): ParsedQssItem | undefined {
  const nextSemicolon = masked.indexOf(';', offset)
  const nextOpen = masked.indexOf('{', offset)

  if (nextSemicolon !== -1 && (nextOpen === -1 || nextSemicolon < nextOpen)) {
    const header = source.slice(offset, nextSemicolon).trim()
    const atRule = createAtRule(header, '', offset, nextSemicolon + 1, lineStarts)
    return {
      header,
      atRule,
      rangeStart: offset,
      rangeEnd: nextSemicolon + 1,
    }
  }

  if (nextOpen === -1 || nextOpen >= end) {
    diagnostics.push({
      code: 'QSS_PARSE_ERROR',
      message: 'Expected ; or block after at-rule.',
      range: rangeFromOffsets(lineStarts, offset, Math.min(end, source.length)),
      severity: 'error',
      source: 'qss',
    })
    return undefined
  }

  const close = findMatchingDelimiter(masked, nextOpen, '{', '}')
  if (close === -1 || close > end)
    return undefined

  const header = source.slice(offset, nextOpen).trim()
  const body = source.slice(nextOpen + 1, close)
  const atRule = createAtRule(header, body, offset, close + 1, lineStarts)
  return {
    header,
    atRule,
    bodyStart: nextOpen + 1,
    bodyEnd: close,
    rangeStart: offset,
    rangeEnd: close + 1,
  }
}

function createAtRule(
  header: string,
  body: string,
  start: number,
  end: number,
  lineStarts: readonly number[],
): NativeQssAtRule {
  const kind = header.match(/^@([\w-]+)/)?.[1] || 'unknown'
  return {
    kind,
    prelude: header.replace(/^@[\w-]+/, '').trim(),
    body,
    range: rangeFromOffsets(lineStarts, start, end),
  }
}

function parseDeclarations(
  source: string,
  masked: string,
  start: number,
  end: number,
  lineStarts: readonly number[],
  diagnostics: NativeUiDiagnostic[],
): NativeQssDeclaration[] {
  const declarations: NativeQssDeclaration[] = []
  let offset = start

  while (offset < end) {
    offset = skipWhitespace(masked, offset, end)
    if (offset >= end)
      break

    const colon = masked.indexOf(':', offset)
    if (colon === -1 || colon > end)
      break

    const name = source.slice(offset, colon).trim()
    const nameStart = offset + source.slice(offset, colon).indexOf(name)
    let valueEnd = colon + 1
    let depth = 0
    while (valueEnd < end) {
      const char = masked[valueEnd]
      if (char === '(' || char === '[')
        depth += 1
      else if (char === ')' || char === ']')
        depth = Math.max(0, depth - 1)
      else if (char === ';' && depth === 0)
        break
      valueEnd += 1
    }

    const value = source.slice(colon + 1, valueEnd).trim()
    const valueStart = colon + 1 + source.slice(colon + 1, valueEnd).indexOf(value)
    if (!name) {
      diagnostics.push({
        code: 'QSS_PARSE_ERROR',
        message: 'Expected property name before colon.',
        range: rangeFromOffsets(lineStarts, offset, colon),
        severity: 'error',
        source: 'qss',
      })
    }
    else {
      declarations.push({
        name,
        value,
        nameRange: rangeFromOffsets(lineStarts, nameStart, nameStart + name.length),
        valueRange: rangeFromOffsets(lineStarts, valueStart, valueStart + value.length),
        range: rangeFromOffsets(lineStarts, offset, valueEnd + (masked[valueEnd] === ';' ? 1 : 0)),
      })
    }

    offset = valueEnd + 1
  }

  return declarations
}

function skipWhitespace(masked: string, offset: number, end: number): number {
  while (offset < end && /\s/.test(masked[offset]))
    offset += 1
  return offset
}
