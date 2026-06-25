import { describe, expect, it } from 'vitest'
import {
  formatNativeUiDocumentEdits,
  getNativeUiLanguageCompletions,
  getNativeUiLanguageHover,
  lintNativeUiDocument,
} from '../src'

describe('@quajs/native-language-server', () => {
  it('adapts compiler diagnostics for QUI documents', () => {
    const result = lintNativeUiDocument('Text(if: ready = true) { "Ready" }', {
      filePath: 'overlay.qui',
    })

    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: 'QUI_UNSAFE_EXPRESSION',
        source: 'qui',
      }),
    ])
  })

  it('adapts compiler structure diagnostics for QUI documents', () => {
    const result = lintNativeUiDocument('Text { Button(action: ui.close()) { Text { "Close" } } }', {
      filePath: 'overlay.qui',
    })

    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: 'QUI_INVALID_CHILDREN',
        source: 'qui',
      }),
    ])
  })

  it('formats QSS with full document edits', () => {
    const edits = formatNativeUiDocumentEdits('Button{color:#fff;}', {
      filePath: 'menu.qss',
    })

    expect(edits).toEqual([
      expect.objectContaining({
        newText: 'Button {\n  color: #fff;\n}\n',
      }),
    ])
  })

  it('returns native registry completions and hovers without target runtime imports', () => {
    const completions = getNativeUiLanguageCompletions('', { line: 0, character: 0 }, {
      filePath: 'menu.qui',
    })
    const hover = getNativeUiLanguageHover('Button {}', { line: 0, character: 1 }, {
      filePath: 'menu.qui',
    })

    expect(completions.some(item => item.label === 'Button')).toBe(true)
    expect(hover?.contents).toContain('Button')
  })
})
