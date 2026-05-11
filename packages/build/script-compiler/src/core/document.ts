import type { ParsedQuaScriptDocument, QuaScriptDiagnostic, SourcePosition, SourceRange } from './types'

export function parseQuaScriptDocument(source: string): ParsedQuaScriptDocument {
  const diagnostics: QuaScriptDiagnostic[] = []
  const lineStarts = createLineStarts(source)
  const blocks: Array<{
    attrs: Record<string, string | boolean>
    closeEnd: number
    content: string
    contentEnd: number
    contentStart: number
    openStart: number
    setup: boolean
  }> = []

  const scriptOpen = /<script\b([^>]*)>/gi
  let match = scriptOpen.exec(source)
  while (match) {
    const openStart = match.index
    const openEnd = scriptOpen.lastIndex
    const closeStart = source.toLowerCase().indexOf('</script>', openEnd)
    const attrs = parseScriptAttrs(match[1] || '')
    const setup = attrs.setup === true

    if (attrs.lang !== 'ts') {
      diagnostics.push({
        message: '<script> blocks in .qs files must use lang="ts".',
        range: rangeFromOffsets(lineStarts, openStart, openEnd),
        severity: 'error',
      })
    }

    if (closeStart === -1) {
      diagnostics.push({
        message: 'Missing closing </script> tag.',
        range: rangeFromOffsets(lineStarts, openStart, openEnd),
        severity: 'error',
      })
      break
    }

    const closeEnd = closeStart + '</script>'.length
    blocks.push({
      attrs,
      closeEnd,
      content: source.slice(openEnd, closeStart),
      contentEnd: closeStart,
      contentStart: openEnd,
      openStart,
      setup,
    })

    scriptOpen.lastIndex = closeEnd
    match = scriptOpen.exec(source)
  }

  const moduleBlocks = blocks.filter(block => !block.setup)
  const setupBlocks = blocks.filter(block => block.setup)

  if (moduleBlocks.length > 1) {
    moduleBlocks.slice(1).forEach((block) => {
      diagnostics.push({
        message: 'Only one module <script lang="ts"> block is allowed in a .qs file.',
        range: rangeFromOffsets(lineStarts, block.openStart, block.closeEnd),
        severity: 'error',
      })
    })
  }

  if (setupBlocks.length > 1) {
    setupBlocks.slice(1).forEach((block) => {
      diagnostics.push({
        message: 'Only one <script setup lang="ts"> block is allowed in a .qs file.',
        range: rangeFromOffsets(lineStarts, block.openStart, block.closeEnd),
        severity: 'error',
      })
    })
  }

  let dslBody = source
  for (const block of [...blocks].sort((a, b) => b.openStart - a.openStart)) {
    dslBody = `${dslBody.slice(0, block.openStart)}${blankLike(dslBody.slice(block.openStart, block.closeEnd))}${dslBody.slice(block.closeEnd)}`
  }

  const toDocumentBlock = (block: typeof blocks[number] | undefined) => {
    if (!block) {
      return undefined
    }

    const trimmed = trimOneLeadingAndTrailingNewline(block.content, block.contentStart, block.contentEnd)
    return {
      attrs: block.attrs,
      content: trimmed.content,
      contentRange: rangeFromOffsets(lineStarts, trimmed.start, trimmed.end),
      range: rangeFromOffsets(lineStarts, block.openStart, block.closeEnd),
      setup: block.setup,
    }
  }

  return {
    source,
    moduleScript: toDocumentBlock(moduleBlocks[0]),
    setupScript: toDocumentBlock(setupBlocks[0]),
    dslBody,
    diagnostics,
  }
}

export function createLineStarts(source: string): number[] {
  const starts = [0]
  for (let index = 0; index < source.length; index++) {
    if (source.charCodeAt(index) === 10) {
      starts.push(index + 1)
    }
  }
  return starts
}

export function positionAt(lineStarts: readonly number[], offset: number): SourcePosition {
  const safeOffset = Math.max(0, offset)
  let low = 0
  let high = lineStarts.length - 1

  while (low <= high) {
    const middle = Math.floor((low + high) / 2)
    const start = lineStarts[middle]
    const next = middle + 1 < lineStarts.length ? lineStarts[middle + 1] : Number.POSITIVE_INFINITY
    if (safeOffset < start) {
      high = middle - 1
    }
    else if (safeOffset >= next) {
      low = middle + 1
    }
    else {
      return {
        line: middle,
        column: safeOffset - start,
        offset: safeOffset,
      }
    }
  }

  const lastLine = lineStarts.length - 1
  return {
    line: lastLine,
    column: safeOffset - lineStarts[lastLine],
    offset: safeOffset,
  }
}

export function rangeFromOffsets(lineStarts: readonly number[], start: number, end: number): SourceRange {
  return {
    start: positionAt(lineStarts, start),
    end: positionAt(lineStarts, end),
  }
}

function parseScriptAttrs(source: string): Record<string, string | boolean> {
  const attrs: Record<string, string | boolean> = {}
  const attrPattern = /([A-Z_:][\w:.-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>/]+)))?/gi
  let match = attrPattern.exec(source)
  while (match) {
    attrs[match[1]] = match[2] ?? match[3] ?? match[4] ?? true
    match = attrPattern.exec(source)
  }
  return attrs
}

function blankLike(source: string): string {
  return source.replace(/[^\n]/g, ' ')
}

function trimOneLeadingAndTrailingNewline(source: string, start: number, end: number): { content: string, end: number, start: number } {
  let content = source
  let nextStart = start
  let nextEnd = end

  const leading = content.match(/^\r?\n/)?.[0]
  if (leading) {
    content = content.slice(leading.length)
    nextStart += leading.length
  }

  const trailing = content.match(/\r?\n$/)?.[0]
  if (trailing) {
    content = content.slice(0, -trailing.length)
    nextEnd -= trailing.length
  }

  return {
    content,
    end: nextEnd,
    start: nextStart,
  }
}
