import { describe, expect, it } from 'vitest'
import {
  applyQuaScriptTextEdits,
  formatQuaScript,
  formatQuaScriptDocument,
  formatQuaScriptWithEdits,
  lintQuaScriptSource,
} from '../src'

describe('quaScript formatter', () => {
  it('trims trailing whitespace and ensures final newline', () => {
    expect(formatQuaScript('Yuki: Hello   ')).toBe('Yuki: Hello\n')
  })

  it('preserves TypeScript script block content byte-identical', () => {
    const scriptBlock = '<script lang="ts">\nconst value = "x"   \n\n</script>'
    const source = `${scriptBlock}\n\n\nYuki: Hello   \n`
    const formatted = formatQuaScript(source)

    expect(formatted.slice(0, scriptBlock.length)).toBe(scriptBlock)
    expect(formatted).toBe(`${scriptBlock}\n\nYuki: Hello\n`)
  })

  it('collapses excessive blank lines by option', () => {
    expect(formatQuaScript('Yuki: Hello\n\n\n\nAlice: Hi\n', { maxBlankLines: 2 }))
      .toBe('Yuki: Hello\n\n\nAlice: Hi\n')
  })

  it('keeps decorators attached to the next statement', () => {
    expect(formatQuaScript('@SetBackground("classroom.png")\n\nYuki: Hello\n'))
      .toBe('@SetBackground("classroom.png")\nYuki: Hello\n')
  })

  it('does not rewrite choice text, decorator args, or TypeScript expressions', () => {
    const source = [
      '@Choice("Go now",  node("library", { when: scope.ok }))',
      '- Stay here -> stay if scope.a  &&  scope.b',
      'Yuki: Hello $' + '{ scope.name ?? "Guest" }   ',
    ].join('\n')

    expect(formatQuaScript(source)).toBe([
      '@Choice("Go now",  node("library", { when: scope.ok }))',
      '- Stay here -> stay if scope.a  &&  scope.b',
      'Yuki: Hello $' + '{ scope.name ?? "Guest" }',
      '',
    ].join('\n'))
  })

  it('preserves the detected CRLF line ending policy outside script blocks', () => {
    expect(formatQuaScript('Yuki: Hello  \r\n\r\n\r\nAlice: Hi'))
      .toBe('Yuki: Hello\r\n\r\nAlice: Hi\r\n')
  })

  it('removes all trailing line endings when final newline insertion is disabled', () => {
    expect(formatQuaScript('Yuki: Hello\n\n\n', { insertFinalNewline: false })).toBe('Yuki: Hello')
    expect(formatQuaScript('Yuki: Hello\r\n\r\n', { insertFinalNewline: false })).toBe('Yuki: Hello')
  })

  it('is idempotent and exposes reusable minimal edits', () => {
    const source = '@SetBackground("classroom.png")\n\nYuki: Hello   '
    const once = formatQuaScript(source)
    const twice = formatQuaScript(once)
    const edits = formatQuaScriptWithEdits(source)

    expect(twice).toBe(once)
    expect(applyQuaScriptTextEdits(source, edits)).toBe(once)
    expect(formatQuaScriptDocument(once).edits).toEqual([])
  })
})

describe('quaScript style lint', () => {
  it('reports stable style diagnostics with safe fixes', () => {
    const lint = lintQuaScriptSource('Yuki: Hello  \n\n\n@SetBackground("classroom.png")\n\nYuki: Back')
    const diagnostics = lint.diagnostics.filter(diagnostic => diagnostic.source === 'quascript/style')

    expect(diagnostics.map(diagnostic => diagnostic.code)).toEqual(expect.arrayContaining([
      'QS_STYLE_TRAILING_WHITESPACE',
      'QS_STYLE_MULTIPLE_BLANK_LINES',
      'QS_STYLE_DECORATOR_SPACING',
      'QS_STYLE_FINAL_NEWLINE',
    ]))
    expect(diagnostics.every(diagnostic => diagnostic.severity === 'warning')).toBe(true)
    expect(diagnostics.every(diagnostic => diagnostic.fix?.edits.length)).toBe(true)
    expect(lint.warningCount).toBeGreaterThanOrEqual(4)
    expect(lint.fixableCount).toBeGreaterThanOrEqual(4)
  })

  it('honors lint rule severity overrides and off switches', () => {
    const lint = lintQuaScriptSource('Yuki: Hello  ', {
      lint: {
        rules: {
          QS_STYLE_FINAL_NEWLINE: 'off',
          QS_STYLE_TRAILING_WHITESPACE: 'error',
        },
      },
    })

    expect(lint.diagnostics.map(diagnostic => diagnostic.code)).toEqual(['QS_STYLE_TRAILING_WHITESPACE'])
    expect(lint.errorCount).toBe(1)
    expect(lint.warningCount).toBe(0)
  })
})
