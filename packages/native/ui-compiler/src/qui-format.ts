import type { NativeUiLanguageOptions } from './types'
import { maskSourceLiterals } from './source'

export function formatQuiSource(source: string, options: NativeUiLanguageOptions = {}): string {
  const indent = ' '.repeat(options.format?.indentSize ?? 2)
  const masked = maskSourceLiterals(source)
  const lines = source.split(/\r?\n/)
  const maskedLines = masked.split(/\r?\n/)
  const output: string[] = []
  let level = 0
  let blankLines = 0

  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index]
    const trimmed = raw.trim()
    const maskedLine = maskedLines[index] || ''

    if (!trimmed) {
      blankLines += 1
      if (blankLines <= 1 && output.length > 0)
        output.push('')
      continue
    }
    blankLines = 0

    if (/^[}\])]/.test(trimmed))
      level = Math.max(0, level - 1)

    output.push(`${indent.repeat(level)}${normalizeQuiLine(trimmed)}`)

    const opens = count(maskedLine, '{')
    const closes = count(maskedLine, '}')
    level = Math.max(0, level + opens - closes)
  }

  const formatted = output.join('\n').replace(/\n{3,}/g, '\n\n')
  return options.format?.insertFinalNewline === false ? formatted : `${formatted.replace(/\n+$/, '')}\n`
}

function normalizeQuiLine(line: string): string {
  return line
    .replace(/\s+\{/g, ' {')
    .replace(/\{\s+/g, '{ ')
    .replace(/\s+\}/g, ' }')
    .replace(/\(\s+/g, '(')
    .replace(/\s+\)/g, ')')
    .replace(/,\s*/g, ', ')
    .replace(/\s*:\s*/g, ': ')
    .trim()
}

function count(text: string, char: string): number {
  return Array.from(text).filter(item => item === char).length
}
