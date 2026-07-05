import { describe, expect, it } from 'vitest'
import {
  analyzeNativeUiDocument,
  analyzeQssSource,
  formatNativeUiDocument,
  getNativeUiCompletions,
  getNativeUiHover,
  nativeWgpuQssFeatureNames,
  nativeWgpuQuiComponentNames,
} from '../src'

const EXPECTED_NATIVE_WGPU_QUI_COMPONENTS = [
  'Backdrop',
  'Box',
  'Button',
  'Column',
  'Divider',
  'Fragment',
  'Grid',
  'Image',
  'Layer',
  'Panel',
  'RichText',
  'Row',
  'SafeArea',
  'Scroll',
  'Spacer',
  'Stack',
  'Text',
]

const EXPECTED_NATIVE_WGPU_QSS_FEATURES = [
  'align-items',
  'background-color',
  'background-image',
  'background-position',
  'background-size',
  'border-color',
  'border-radius',
  'border-style',
  'border-width',
  'bottom',
  'box-sizing',
  'color',
  'column-gap',
  'display',
  'font-family',
  'font-size',
  'font-style',
  'font-weight',
  'gap',
  'height',
  'inset',
  'justify-content',
  'left',
  'letter-spacing',
  'line-height',
  'margin',
  'margin-bottom',
  'margin-left',
  'margin-right',
  'margin-top',
  'max-height',
  'max-width',
  'min-height',
  'min-width',
  'object-fit',
  'object-position',
  'opacity',
  'overflow',
  'padding',
  'padding-bottom',
  'padding-left',
  'padding-right',
  'padding-top',
  'position',
  'right',
  'row-gap',
  'text-align',
  'text-decoration',
  'text-overflow',
  'text-transform',
  'top',
  'visibility',
  'white-space',
  'width',
  'z-index',
]

function sorted(values: readonly string[]): string[] {
  return [...values].sort()
}

describe('@quajs/native-ui-compiler', () => {
  it('exposes native-wgpu QUI and QSS capability feature lists', () => {
    expect(sorted(nativeWgpuQuiComponentNames())).toEqual(EXPECTED_NATIVE_WGPU_QUI_COMPONENTS)
    expect(sorted(nativeWgpuQssFeatureNames())).toEqual(EXPECTED_NATIVE_WGPU_QSS_FEATURES)
    expect(nativeWgpuQuiComponentNames()).not.toEqual(expect.arrayContaining(['Dialog', 'Drawer']))
    expect(nativeWgpuQssFeatureNames()).not.toEqual(expect.arrayContaining([
      'background-repeat',
      'box-shadow',
      'flex-direction',
      'text-shadow',
    ]))
  })

  it('rejects browser-only QSS selectors and values', () => {
    const document = analyzeQssSource(`
Button:nth-child(2) {
  background-image: url("https://example.test/panel.png");
}
`)

    expect(document.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'QSS_UNSUPPORTED_SELECTOR' }),
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

  it('returns QSS value completions and hovers from property metadata', () => {
    const backgroundSize = 'Panel { background-size:  }'
    const backgroundImage = 'Panel { background-image:  }'
    const backgroundPosition = 'Panel { background-position:  }'
    const boxSizing = 'Panel { box-sizing:  }'
    const gap = 'Row { gap:  }'
    const alignItems = 'Row { align-items:  }'
    const justifyContent = 'Row { justify-content:  }'
    const margin = 'Button { margin:  }'
    const objectFit = 'Image { object-fit:  }'
    const objectPosition = 'Image { object-position:  }'
    const position = 'Button { position:  }'
    const textAlign = 'Text { text-align:  }'
    const textOverflow = 'Text { text-overflow:  }'
    const textTransform = 'Text { text-transform:  }'
    const hoverSource = 'Panel { background-size: contain; }'

    expect(getNativeUiCompletions(backgroundSize, backgroundSize.indexOf(' }'), { filePath: 'menu.qss' }).map(item => item.label))
      .toEqual(expect.arrayContaining(['cover', 'contain', 'fill', 'none', 'scale-down']))
    expect(getNativeUiCompletions(backgroundImage, backgroundImage.indexOf(' }'), { filePath: 'menu.qss' }))
      .toEqual(expect.arrayContaining([
        expect.objectContaining({
          label: 'asset("...")',
          insertText: 'asset("$1")',
          kind: 'value',
        }),
      ]))
    expect(getNativeUiCompletions(backgroundPosition, backgroundPosition.indexOf(' }'), { filePath: 'menu.qss' }).map(item => item.label))
      .toEqual(expect.arrayContaining(['left top', 'center', 'right bottom', '50% 50%']))
    expect(getNativeUiCompletions(boxSizing, boxSizing.indexOf(' }'), { filePath: 'menu.qss' }).map(item => item.label))
      .toEqual(expect.arrayContaining(['border-box', 'content-box']))
    expect(getNativeUiCompletions(gap, gap.indexOf(' }'), { filePath: 'menu.qss' }).map(item => item.label))
      .toEqual(expect.arrayContaining(['8px', '12px', '16px']))
    expect(getNativeUiCompletions(alignItems, alignItems.indexOf(' }'), { filePath: 'menu.qss' }).map(item => item.label))
      .toEqual(expect.arrayContaining(['flex-start', 'center', 'flex-end']))
    expect(getNativeUiCompletions(justifyContent, justifyContent.indexOf(' }'), { filePath: 'menu.qss' }).map(item => item.label))
      .toEqual(expect.arrayContaining(['flex-start', 'center', 'flex-end', 'space-between', 'space-around', 'space-evenly']))
    expect(getNativeUiCompletions(margin, margin.indexOf(' }'), { filePath: 'menu.qss' }).map(item => item.label))
      .toEqual(expect.arrayContaining(['8px', '12px', '16px']))
    expect(getNativeUiCompletions(objectFit, objectFit.indexOf(' }'), { filePath: 'menu.qss' }).map(item => item.label))
      .toEqual(expect.arrayContaining(['cover', 'contain', 'scale-down']))
    expect(getNativeUiCompletions(objectPosition, objectPosition.indexOf(' }'), { filePath: 'menu.qss' }).map(item => item.label))
      .toEqual(expect.arrayContaining(['left top', 'center', 'right bottom', '50% 50%']))
    expect(getNativeUiCompletions(position, position.indexOf(' }'), { filePath: 'menu.qss' }).map(item => item.label))
      .toEqual(expect.arrayContaining(['relative', 'absolute']))
    expect(getNativeUiCompletions(textAlign, textAlign.indexOf(' }'), { filePath: 'menu.qss' }).map(item => item.label))
      .toEqual(expect.arrayContaining(['left', 'center', 'right', 'justify']))
    expect(getNativeUiCompletions(textOverflow, textOverflow.indexOf(' }'), { filePath: 'menu.qss' }).map(item => item.label))
      .toEqual(expect.arrayContaining(['clip', 'ellipsis']))
    expect(getNativeUiCompletions(textTransform, textTransform.indexOf(' }'), { filePath: 'menu.qss' }).map(item => item.label))
      .toEqual(expect.arrayContaining(['none', 'uppercase', 'lowercase', 'capitalize']))

    const hover = getNativeUiHover(hoverSource, hoverSource.indexOf('contain') + 2, { filePath: 'menu.qss' })
    expect(hover?.contents).toContain('contain')
    expect(hover?.contents).toContain('background-size')
    expect(hover?.contents).toContain('Native wgpu: supported')
  })
})
