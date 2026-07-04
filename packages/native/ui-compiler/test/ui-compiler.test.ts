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

describe('@quajs/native-ui-compiler', () => {
  it('exposes native-wgpu QUI and QSS capability feature lists', () => {
    expect(nativeWgpuQuiComponentNames()).toContain('Button')
    expect(nativeWgpuQuiComponentNames()).toContain('RichText')
    expect(nativeWgpuQuiComponentNames()).toContain('Scroll')
    expect(nativeWgpuQssFeatureNames()).toContain('background-color')
    expect(nativeWgpuQssFeatureNames()).toContain('background-image')
    expect(nativeWgpuQssFeatureNames()).toContain('background-position')
    expect(nativeWgpuQssFeatureNames()).toContain('background-size')
    expect(nativeWgpuQssFeatureNames()).toContain('border-style')
    expect(nativeWgpuQssFeatureNames()).toContain('bottom')
    expect(nativeWgpuQssFeatureNames()).toContain('display')
    expect(nativeWgpuQssFeatureNames()).toContain('gap')
    expect(nativeWgpuQssFeatureNames()).toContain('height')
    expect(nativeWgpuQssFeatureNames()).toContain('inset')
    expect(nativeWgpuQssFeatureNames()).toContain('left')
    expect(nativeWgpuQssFeatureNames()).toContain('font-style')
    expect(nativeWgpuQssFeatureNames()).toContain('letter-spacing')
    expect(nativeWgpuQssFeatureNames()).toContain('margin')
    expect(nativeWgpuQssFeatureNames()).toContain('margin-bottom')
    expect(nativeWgpuQssFeatureNames()).toContain('margin-left')
    expect(nativeWgpuQssFeatureNames()).toContain('margin-right')
    expect(nativeWgpuQssFeatureNames()).toContain('margin-top')
    expect(nativeWgpuQssFeatureNames()).toContain('max-height')
    expect(nativeWgpuQssFeatureNames()).toContain('max-width')
    expect(nativeWgpuQssFeatureNames()).toContain('min-height')
    expect(nativeWgpuQssFeatureNames()).toContain('min-width')
    expect(nativeWgpuQssFeatureNames()).toContain('object-fit')
    expect(nativeWgpuQssFeatureNames()).toContain('opacity')
    expect(nativeWgpuQssFeatureNames()).toContain('overflow')
    expect(nativeWgpuQssFeatureNames()).toContain('padding')
    expect(nativeWgpuQssFeatureNames()).toContain('padding-bottom')
    expect(nativeWgpuQssFeatureNames()).toContain('padding-left')
    expect(nativeWgpuQssFeatureNames()).toContain('padding-right')
    expect(nativeWgpuQssFeatureNames()).toContain('padding-top')
    expect(nativeWgpuQssFeatureNames()).toContain('right')
    expect(nativeWgpuQssFeatureNames()).toContain('row-gap')
    expect(nativeWgpuQssFeatureNames()).toContain('column-gap')
    expect(nativeWgpuQssFeatureNames()).toContain('text-decoration')
    expect(nativeWgpuQssFeatureNames()).toContain('text-overflow')
    expect(nativeWgpuQssFeatureNames()).toContain('text-transform')
    expect(nativeWgpuQssFeatureNames()).toContain('top')
    expect(nativeWgpuQssFeatureNames()).toContain('visibility')
    expect(nativeWgpuQssFeatureNames()).toContain('white-space')
    expect(nativeWgpuQssFeatureNames()).toContain('width')
    expect(nativeWgpuQssFeatureNames()).toContain('z-index')
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
    const gap = 'Row { gap:  }'
    const margin = 'Button { margin:  }'
    const objectFit = 'Image { object-fit:  }'
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
    expect(getNativeUiCompletions(gap, gap.indexOf(' }'), { filePath: 'menu.qss' }).map(item => item.label))
      .toEqual(expect.arrayContaining(['8px', '12px', '16px']))
    expect(getNativeUiCompletions(margin, margin.indexOf(' }'), { filePath: 'menu.qss' }).map(item => item.label))
      .toEqual(expect.arrayContaining(['8px', '12px', '16px']))
    expect(getNativeUiCompletions(objectFit, objectFit.indexOf(' }'), { filePath: 'menu.qss' }).map(item => item.label))
      .toEqual(expect.arrayContaining(['cover', 'contain', 'scale-down']))
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
