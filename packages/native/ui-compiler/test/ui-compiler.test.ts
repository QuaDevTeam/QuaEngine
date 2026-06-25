import { describe, expect, it } from 'vitest'
import {
  analyzeNativeUiDocument,
  analyzeQssSource,
  analyzeQuiSource,
  formatNativeUiDocument,
  getNativeUiCompletions,
  getNativeUiHover,
  nativeWgpuQssFeatureNames,
  nativeWgpuQuiComponentNames,
} from '../src'

describe('@quajs/native-ui-compiler', () => {
  it('exposes native-wgpu QUI and QSS capability feature lists', () => {
    expect(nativeWgpuQuiComponentNames()).toContain('Button')
    expect(nativeWgpuQuiComponentNames()).toContain('RichText')
    expect(nativeWgpuQuiComponentNames()).toContain('Scroll')
    expect(nativeWgpuQssFeatureNames()).toContain('background-color')
    expect(nativeWgpuQssFeatureNames()).toContain('object-fit')
    expect(nativeWgpuQssFeatureNames()).toContain('opacity')
    expect(nativeWgpuQssFeatureNames()).not.toContain('padding')
  })

  it('parses QUI imports, nodes, and safe directives', () => {
    const document = analyzeQuiSource(`
import style "./menu.qss";
import tokens "./theme.tokens.json";

Stack {
  Text(if: view.mode == "audio") { "Audio" }
  Button(action: ui.close()) { Text { "Close" } }
}
`)

    expect(document.diagnostics).toEqual([])
    expect(document.imports.map(item => item.kind)).toEqual(['style', 'tokens'])
    expect(document.nodes.map(node => node.name)).toEqual(['Stack', 'Text', 'Button', 'Text'])
    expect(document.props.map(prop => prop.name)).toContain('if')
    expect(document.props.map(prop => prop.name)).toContain('action')
  })

  it('accepts keyed QUI loop rendering with item and index bindings', () => {
    const document = analyzeQuiSource(`
Column {
  Button(
    for: (choice, index) in view.choices.items,
    key: choice.id,
    action: choice.select(choice.id)
  ) {
    Text { choice.label }
    Text { index }
  }
}
`)

    expect(document.diagnostics).toEqual([])
    expect(document.props.find(prop => prop.name === 'for')?.value).toBe('(choice, index) in view.choices.items')
    expect(document.props.find(prop => prop.name === 'key')?.groupId).toBe(document.props.find(prop => prop.name === 'for')?.groupId)
  })

  it('requires stable keys for QUI loop rendering', () => {
    const document = analyzeQuiSource(`
Column {
  Button(for: choice in view.choices.items, action: choice.select(choice.id)) {
    Text { choice.label }
  }
}
`)

    expect(document.diagnostics).toEqual([
      expect.objectContaining({
        code: 'QUI_LOOP_KEY_MISSING',
        severity: 'error',
      }),
    ])
  })

  it('accepts adjacent QUI conditional branch chains', () => {
    const document = analyzeQuiSource(`
Stack {
  Text(if: view.mode == "audio") { "Audio" }
  Text(else-if: view.mode == "video") { "Video" }
  Text(else) { "Default" }
}
`)

    expect(document.diagnostics).toEqual([])
  })

  it('rejects orphaned QUI else branches', () => {
    const document = analyzeQuiSource(`
Stack {
  Text(else) { "Default" }
  Text(else-if: view.ready) { "Ready" }
}
`)

    expect(document.diagnostics).toEqual([
      expect.objectContaining({
        code: 'QUI_CONDITIONAL_BRANCH_ORPHANED',
        severity: 'error',
      }),
      expect.objectContaining({
        code: 'QUI_CONDITIONAL_BRANCH_ORPHANED',
        severity: 'error',
      }),
    ])
  })

  it('rejects duplicate QUI directives on the same node', () => {
    const document = analyzeQuiSource('Button(action: ui.close(), action: ui.confirm()) { Text { "Close" } }')

    expect(document.diagnostics).toEqual([
      expect.objectContaining({
        code: 'QUI_DUPLICATE_DIRECTIVE',
        severity: 'error',
      }),
    ])
  })

  it('rejects component children inside text-only QUI leaves', () => {
    const document = analyzeQuiSource('Text { Button(action: ui.close()) { Text { "Close" } } }')

    expect(document.diagnostics).toEqual([
      expect.objectContaining({
        code: 'QUI_INVALID_CHILDREN',
        severity: 'error',
      }),
    ])
  })

  it('rejects child content inside no-content QUI leaves', () => {
    const document = analyzeQuiSource('Image(src: assets.hero) { Text { "Hero" } }')

    expect(document.diagnostics).toEqual([
      expect.objectContaining({
        code: 'QUI_INVALID_CHILDREN',
        severity: 'error',
      }),
    ])
  })

  it('validates named QUI slots against the parent component registry', () => {
    const valid = analyzeQuiSource(`
Panel {
  slot header { Text { "Title" } }
  slot body { Text { props.body } }
}
`)
    const invalid = analyzeQuiSource('Button { slot header { Text { "Title" } } }')

    expect(valid.diagnostics).toEqual([])
    expect(invalid.diagnostics).toEqual([
      expect.objectContaining({
        code: 'QUI_UNKNOWN_SLOT',
        severity: 'error',
      }),
    ])
  })

  it('rejects orphaned and duplicate QUI slot blocks', () => {
    const document = analyzeQuiSource(`
slot header { Text { "Title" } }
Panel {
  slot body { Text { "Body" } }
  slot body { Text { "Duplicate" } }
}
`)

    expect(document.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'QUI_SLOT_ORPHANED',
        severity: 'error',
      }),
      expect.objectContaining({
        code: 'QUI_DUPLICATE_SLOT',
        severity: 'error',
      }),
    ]))
  })

  it('rejects unsafe QUI expressions before runtime package evaluation', () => {
    const document = analyzeQuiSource('Text(if: view.ready = true) { "Ready" }')

    expect(document.diagnostics).toEqual([
      expect.objectContaining({
        code: 'QUI_UNSAFE_EXPRESSION',
        severity: 'error',
      }),
    ])
  })

  it('validates QSS selector subset and native-wgpu property gates', () => {
    const document = analyzeQssSource(`
Panel::part(header), Button.primary:hover {
  background-color: #10141f;
  padding: 12px;
  width: 10vw;
}
`)

    expect(document.rules).toHaveLength(1)
    expect(document.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'QSS_TARGET_UNSUPPORTED_FEATURE' }),
      expect.objectContaining({ code: 'QSS_UNSUPPORTED_UNIT' }),
    ]))
  })

  it('accepts opacity as a native-wgpu QSS feature', () => {
    const document = analyzeQssSource(`
Panel {
  opacity: 0.64;
}
`)

    expect(document.diagnostics).toEqual([])
    expect(document.rules[0].declarations.map(item => item.name)).toContain('opacity')
  })

  it('rejects browser-only QSS selectors and values', () => {
    const document = analyzeQssSource(`
Button:nth-child(2) {
  background-image: url("https://example.test/panel.png");
}
`)

    expect(document.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'QSS_UNSUPPORTED_SELECTOR' }),
      expect.objectContaining({ code: 'QSS_TARGET_UNSUPPORTED_FEATURE' }),
      expect.objectContaining({ code: 'QSS_UNSUPPORTED_VALUE' }),
    ]))
  })

  it('detects document kind by language id or file path', () => {
    expect(analyzeNativeUiDocument('Button {}', { languageId: 'qua-ui' }).kind).toBe('qui')
    expect(analyzeNativeUiDocument('Button { color: #fff; }', { filePath: 'menu.qss' }).kind).toBe('qss')
  })

  it('formats native UI documents idempotently enough for LSP formatting', () => {
    const formattedQui = formatNativeUiDocument('Stack{\nText { "Hi" }\n}', {
      filePath: 'menu.qui',
      format: { insertFinalNewline: true },
    })
    const formattedQss = formatNativeUiDocument('Button{color:#fff;}', {
      filePath: 'menu.qss',
      format: { insertFinalNewline: true },
    })

    expect(formattedQui).toContain('Stack{')
    expect(formattedQui.endsWith('\n')).toBe(true)
    expect(formattedQss).toBe('Button {\n  color: #fff;\n}\n')
  })

  it('returns completions and hover metadata from the shared registry', () => {
    const completions = getNativeUiCompletions('', 0, { filePath: 'menu.qui' })
    const hover = getNativeUiHover('Button {}', 1, { filePath: 'menu.qui' })

    expect(completions.some(item => item.label === 'Button')).toBe(true)
    expect(hover?.contents).toContain('Button')
    expect(hover?.contents).toContain('Content: children')
    expect(hover?.contents).toContain('Slots: default')
  })
})
