import type { NativeUiRange } from '@quajs/native-ui-compiler'

export function offsetAtPosition(source: string, position: NativeUiRange['start']): number {
  const lineStarts = createLineStartOffsets(source)
  const line = Math.max(0, Math.min(position.line, lineStarts.length - 1))
  const nextLineStart = lineStarts[line + 1]
  const lineEnd = nextLineStart === undefined
    ? source.length
    : Math.max(lineStarts[line], nextLineStart - 1)
  return Math.min(lineEnd, lineStarts[line] + Math.max(0, position.character))
}

export function rangeFromOffsets(source: string, startOffset: number, endOffset: number): NativeUiRange {
  return {
    start: positionAtOffset(source, startOffset),
    end: positionAtOffset(source, endOffset),
  }
}

export function rangeFromRelativeOffsets(
  startPosition: NativeUiRange['start'],
  text: string,
  startOffset: number,
  endOffset: number,
): NativeUiRange {
  return {
    start: positionFromRelativeOffset(startPosition, text, startOffset),
    end: positionFromRelativeOffset(startPosition, text, endOffset),
  }
}

export function positionAtOffset(source: string, offset: number): NativeUiRange['start'] {
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

export function stringLiteralContentRange(
  source: string,
  value: string | undefined,
  range: NativeUiRange,
): NativeUiRange {
  if (!value || value.length < 2)
    return range

  const quote = value[0]
  if ((quote !== '"' && quote !== '\'') || value[value.length - 1] !== quote)
    return range

  const rangeStart = offsetAtPosition(source, range.start)
  const rangeEnd = offsetAtPosition(source, range.end)
  const raw = source.slice(rangeStart, rangeEnd)
  const leadingWhitespace = raw.search(/\S/)
  if (leadingWhitespace < 0)
    return range

  const start = rangeStart + leadingWhitespace + 1
  const end = start + value.length - 2
  return rangeFromRelativeOffsets({ line: 0, character: 0 }, source, start, end)
}

function createLineStartOffsets(source: string): number[] {
  const starts = [0]
  for (let index = 0; index < source.length; index += 1) {
    if (source.charCodeAt(index) === 10)
      starts.push(index + 1)
  }
  return starts
}

function positionFromRelativeOffset(
  startPosition: NativeUiRange['start'],
  text: string,
  offset: number,
): NativeUiRange['start'] {
  const before = text.slice(0, Math.max(0, offset))
  const lines = before.split(/\r?\n/)
  const lineDelta = lines.length - 1
  return {
    line: startPosition.line + lineDelta,
    character: lineDelta === 0
      ? startPosition.character + before.length
      : lines[lines.length - 1].length,
  }
}
