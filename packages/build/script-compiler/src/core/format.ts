import type { QuaScriptFormatOptions, QuaScriptFormatResult, QuaScriptTextEdit } from './types'
import { createMinimalTextEdit } from './diagnostics'

export interface QuaScriptSourceLine {
  end: number
  eol: string
  protected: boolean
  start: number
  text: string
}

export interface QuaScriptScriptRange {
  end: number
  start: number
}

const DEFAULT_MAX_BLANK_LINES = 1

export function formatQuaScript(source: string, options: QuaScriptFormatOptions = {}): string {
  return formatQuaScriptDocument(source, options).formatted
}

export function formatQuaScriptWithEdits(source: string, options: QuaScriptFormatOptions = {}): QuaScriptTextEdit[] {
  return formatQuaScriptDocument(source, options).edits
}

export function formatQuaScriptDocument(source: string, options: QuaScriptFormatOptions = {}): QuaScriptFormatResult {
  const formatted = renderFormattedLines(source, options)
  return {
    changed: formatted !== source,
    edits: createMinimalTextEdit(source, formatted),
    formatted,
  }
}

function renderFormattedLines(source: string, options: QuaScriptFormatOptions): string {
  const eol = detectLineEnding(source)
  const insertFinalNewline = options.insertFinalNewline ?? true
  const maxBlankLines = Math.max(0, Math.floor(options.maxBlankLines ?? DEFAULT_MAX_BLANK_LINES))
  const scriptRanges = collectScriptRanges(source)
  const lines = splitQuaScriptSourceLines(source, scriptRanges)
  const rendered: string[] = []
  let blankCount = 0
  let decoratorPending = false

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]
    if (line.protected) {
      rendered.push(`${line.text}${line.eol}`)
      blankCount = 0
      decoratorPending = false
      continue
    }

    const text = stripTrailingWhitespace(line.text)
    const trimmed = text.trim()
    if (trimmed.length === 0) {
      const next = findNextNonBlankUnprotectedLine(lines, index + 1)
      if (decoratorPending && next && isDecoratorAttachmentTarget(next.text.trim())) {
        continue
      }
      if (blankCount < maxBlankLines) {
        rendered.push(eol)
        blankCount++
      }
      continue
    }

    rendered.push(`${text}${line.eol ? eol : ''}`)
    blankCount = 0

    if (trimmed.startsWith('@')) {
      decoratorPending = true
    }
    else if (decoratorPending && isDecoratorAttachmentTarget(trimmed)) {
      decoratorPending = false
    }
  }

  let formatted = rendered.join('')
  if (insertFinalNewline) {
    formatted = formatted.replace(/[ \t]+$/u, '')
    if (formatted.length > 0 && !formatted.endsWith('\n') && !formatted.endsWith('\r')) {
      formatted += eol
    }
  }
  else {
    formatted = formatted.replace(/(?:\r\n|\n|\r)+$/u, '')
  }
  return formatted
}

export function splitQuaScriptSourceLines(source: string, scriptRanges: readonly QuaScriptScriptRange[] = collectScriptRanges(source)): QuaScriptSourceLine[] {
  const lines: QuaScriptSourceLine[] = []
  const linePattern = /(.*?)(\r\n|\n|\r|$)/gu
  let match = linePattern.exec(source)
  while (match && match[0] !== '') {
    const start = match.index
    const text = match[1] || ''
    const eol = match[2] || ''
    const end = start + text.length + eol.length
    lines.push({
      end,
      eol,
      protected: scriptRanges.some(range => start < range.end && end > range.start),
      start,
      text,
    })
    match = linePattern.exec(source)
  }
  if (source.length === 0) {
    return []
  }
  return lines
}

export function collectScriptRanges(source: string): QuaScriptScriptRange[] {
  const ranges: QuaScriptScriptRange[] = []
  const scriptOpen = /<script\b[^>]*>/giu
  let match = scriptOpen.exec(source)
  while (match) {
    const start = match.index
    const openEnd = scriptOpen.lastIndex
    const closeStart = source.toLowerCase().indexOf('</script>', openEnd)
    if (closeStart === -1) {
      ranges.push({ end: source.length, start })
      break
    }
    const end = closeStart + '</script>'.length
    ranges.push({ end, start })
    scriptOpen.lastIndex = end
    match = scriptOpen.exec(source)
  }
  return ranges
}

export function detectLineEnding(source: string): string {
  return source.match(/\r\n|\n|\r/u)?.[0] || '\n'
}

function stripTrailingWhitespace(source: string): string {
  return source.replace(/[ \t]+$/u, '')
}

function findNextNonBlankUnprotectedLine(lines: readonly QuaScriptSourceLine[], start: number): QuaScriptSourceLine | undefined {
  for (let index = start; index < lines.length; index++) {
    const line = lines[index]
    if (line.protected) {
      return undefined
    }
    if (line.text.trim().length > 0) {
      return line
    }
  }
  return undefined
}

function isDecoratorAttachmentTarget(trimmed: string): boolean {
  if (trimmed.startsWith('@') || trimmed.startsWith('- ')) {
    return true
  }
  return /^[^:@-][^:]*:\s*/u.test(trimmed)
}
