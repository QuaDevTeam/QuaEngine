import type { NativeUiDiagnostic, NativeUiPosition, NativeUiRange } from './types'

export function createLineStarts(source: string): number[] {
  const starts = [0]
  for (let index = 0; index < source.length; index += 1) {
    if (source.charCodeAt(index) === 10)
      starts.push(index + 1)
  }
  return starts
}

export function positionAt(lineStarts: readonly number[], offset: number): NativeUiPosition {
  let low = 0
  let high = lineStarts.length - 1

  while (low <= high) {
    const mid = Math.floor((low + high) / 2)
    const lineStart = lineStarts[mid]
    const nextLineStart = lineStarts[mid + 1] ?? Number.POSITIVE_INFINITY
    if (offset < lineStart) {
      high = mid - 1
    }
    else if (offset >= nextLineStart) {
      low = mid + 1
    }
    else {
      return {
        line: mid,
        character: Math.max(0, offset - lineStart),
      }
    }
  }

  const line = Math.max(0, Math.min(lineStarts.length - 1, low))
  return {
    line,
    character: Math.max(0, offset - lineStarts[line]),
  }
}

export function rangeFromOffsets(
  lineStarts: readonly number[],
  start: number,
  end: number,
): NativeUiRange {
  return {
    start: positionAt(lineStarts, start),
    end: positionAt(lineStarts, end),
  }
}

export function maskSourceLiterals(source: string): string {
  const output = source.split('')
  let index = 0
  while (index < source.length) {
    const current = source[index]
    const next = source[index + 1]

    if (current === '/' && next === '/') {
      output[index] = ' '
      output[index + 1] = ' '
      index += 2
      while (index < source.length && source[index] !== '\n') {
        output[index] = ' '
        index += 1
      }
      continue
    }

    if (current === '/' && next === '*') {
      output[index] = ' '
      output[index + 1] = ' '
      index += 2
      while (index < source.length) {
        if (source[index] === '*' && source[index + 1] === '/') {
          output[index] = ' '
          output[index + 1] = ' '
          index += 2
          break
        }
        if (source[index] !== '\n')
          output[index] = ' '
        index += 1
      }
      continue
    }

    if (current === '"' || current === '\'' || current === '`') {
      const quote = current
      output[index] = ' '
      index += 1
      while (index < source.length) {
        const char = source[index]
        if (char === '\\') {
          output[index] = ' '
          if (source[index + 1] !== '\n')
            output[index + 1] = ' '
          index += 2
          continue
        }
        if (char === quote) {
          output[index] = ' '
          index += 1
          break
        }
        if (char !== '\n')
          output[index] = ' '
        index += 1
      }
      continue
    }

    index += 1
  }

  return output.join('')
}

export function collectBalancedDelimiterDiagnostics(
  source: string,
  lineStarts: readonly number[],
  sourceName: 'qui' | 'qss',
): NativeUiDiagnostic[] {
  const masked = maskSourceLiterals(source)
  const stack: Array<{ char: string, offset: number }> = []
  const diagnostics: NativeUiDiagnostic[] = []
  const opens = new Map([
    ['{', '}'],
    ['(', ')'],
    ['[', ']'],
  ])
  const closes = new Map(Array.from(opens.entries()).map(([open, close]) => [close, open]))

  for (let offset = 0; offset < masked.length; offset += 1) {
    const char = masked[offset]
    if (opens.has(char)) {
      stack.push({ char, offset })
      continue
    }
    const expectedOpen = closes.get(char)
    if (!expectedOpen)
      continue

    const actual = stack.pop()
    if (!actual || actual.char !== expectedOpen) {
      diagnostics.push({
        code: `${sourceName.toUpperCase()}_UNMATCHED_DELIMITER`,
        message: `Unexpected closing delimiter "${char}".`,
        range: rangeFromOffsets(lineStarts, offset, offset + 1),
        severity: 'error',
        source: sourceName,
      })
    }
  }

  for (const open of stack) {
    diagnostics.push({
      code: `${sourceName.toUpperCase()}_UNMATCHED_DELIMITER`,
      message: `Unclosed delimiter "${open.char}".`,
      range: rangeFromOffsets(lineStarts, open.offset, open.offset + 1),
      severity: 'error',
      source: sourceName,
    })
  }

  return diagnostics
}

export function findMatchingDelimiter(
  maskedSource: string,
  openOffset: number,
  open: string,
  close: string,
): number {
  let depth = 0
  for (let offset = openOffset; offset < maskedSource.length; offset += 1) {
    const char = maskedSource[offset]
    if (char === open)
      depth += 1
    if (char === close) {
      depth -= 1
      if (depth === 0)
        return offset
    }
  }
  return -1
}

export function splitTopLevel(
  text: string,
  delimiter: string,
): Array<{ end: number, start: number, text: string }> {
  const parts: Array<{ end: number, start: number, text: string }> = []
  let depth = 0
  let start = 0

  for (let offset = 0; offset < text.length; offset += 1) {
    const char = text[offset]
    if (char === '(' || char === '[' || char === '{')
      depth += 1
    else if (char === ')' || char === ']' || char === '}')
      depth = Math.max(0, depth - 1)
    else if (char === delimiter && depth === 0) {
      parts.push({ start, end: offset, text: text.slice(start, offset) })
      start = offset + 1
    }
  }

  parts.push({ start, end: text.length, text: text.slice(start) })
  return parts
}

export function wordAt(source: string, offset: number): { end: number, start: number, text: string } | undefined {
  if (offset < 0 || offset > source.length)
    return undefined

  let start = offset
  let end = offset
  while (start > 0 && /[A-Za-z0-9_-]/.test(source[start - 1]))
    start -= 1
  while (end < source.length && /[A-Za-z0-9_-]/.test(source[end]))
    end += 1

  if (start === end)
    return undefined

  return {
    start,
    end,
    text: source.slice(start, end),
  }
}
