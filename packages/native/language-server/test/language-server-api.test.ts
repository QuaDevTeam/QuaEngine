import { describe, expect, it } from 'vitest'
import {
  formatNativeUiDocumentEdits,
  getNativeUiAssetCodeActions,
  getNativeUiLanguageCompletions,
  getNativeUiLanguageHover,
  lintNativeUiDocument,
} from '../src'
import { rangeOf } from './language-server-test-utils'

describe('@quajs/native-language-server public API', () => {
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
    expect(hover?.contents).toContain('Content: children')
  })

  it('adapts QSS property value completions and hovers from the compiler registry', () => {
    const source = 'Panel { background-position:  }'
    const completions = getNativeUiLanguageCompletions(source, { line: 0, character: source.indexOf(' }') }, {
      filePath: 'menu.qss',
    })
    const hoverSource = 'Panel { background-position: right bottom; }'
    const hover = getNativeUiLanguageHover(hoverSource, { line: 0, character: hoverSource.indexOf('right') + 1 }, {
      filePath: 'menu.qss',
    })

    expect(completions.map(item => item.label)).toEqual(expect.arrayContaining(['left top', 'center', 'right bottom']))
    expect(hover?.contents).toContain('right')
    expect(hover?.contents).toContain('background-position')
  })

  it('returns native asset quickfix and fixAll code actions through the public tooling API', () => {
    const source = 'Image(src: "../escape.png", asset-type: "../bad")'
    const diagnostics = lintNativeUiDocument(source, {
      filePath: 'menu.qui',
    }).diagnostics.filter(diagnostic => diagnostic.code === 'QUI_INVALID_ASSET_REFERENCE')
    const actions = getNativeUiAssetCodeActions({
      diagnostics,
      range: rangeOf(source, '../escape.png'),
      source,
      uri: 'file:///project/ui/menu.qui',
    })

    expect(actions.map(action => action.kind)).toEqual([
      'quickfix',
      'source.fixAll.quaNativeAssets',
    ])
    expect(actions[0]).toEqual(expect.objectContaining({
      diagnostics: [expect.objectContaining({ code: 'QUI_INVALID_ASSET_REFERENCE' })],
      edits: [
        {
          newText: '',
          range: {
            start: {
              character: 6,
              line: 0,
            },
            end: {
              character: 28,
              line: 0,
            },
          },
        },
      ],
      title: 'Remove invalid native UI asset reference',
    }))
    expect(actions[1]?.edits).toHaveLength(1)
  })
})
