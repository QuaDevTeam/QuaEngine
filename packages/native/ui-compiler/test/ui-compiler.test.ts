import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import type { NativeUiSurfaceProjection } from '../src'
import {
  analyzeNativeUiDocument,
  analyzeQssSource,
  analyzeQuiSource,
  collectNativeUiSurfaceProjectionRequirements,
  compileNativeUiSurfaceProjection,
  createNativeUiSurfaceCompatibilityFromDocuments,
  createNativeUiSurfaceCompatibilityFromProjection,
  formatNativeUiDocument,
  getNativeUiCompletions,
  getNativeUiHover,
  nativeWgpuQssFeatureNames,
  nativeWgpuQuiComponentNames,
} from '../src'

const SHARED_SURFACE_FRAME_FIXTURE = fileURLToPath(
  new URL('../../test-fixtures/renderer/qui-qss-surface-frame.json', import.meta.url),
)

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
    expect(nativeWgpuQssFeatureNames()).toContain('height')
    expect(nativeWgpuQssFeatureNames()).toContain('inset')
    expect(nativeWgpuQssFeatureNames()).toContain('left')
    expect(nativeWgpuQssFeatureNames()).toContain('font-style')
    expect(nativeWgpuQssFeatureNames()).toContain('letter-spacing')
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
    expect(nativeWgpuQssFeatureNames()).toContain('text-decoration')
    expect(nativeWgpuQssFeatureNames()).toContain('text-overflow')
    expect(nativeWgpuQssFeatureNames()).toContain('text-transform')
    expect(nativeWgpuQssFeatureNames()).toContain('top')
    expect(nativeWgpuQssFeatureNames()).toContain('visibility')
    expect(nativeWgpuQssFeatureNames()).toContain('white-space')
    expect(nativeWgpuQssFeatureNames()).toContain('width')
    expect(nativeWgpuQssFeatureNames()).toContain('z-index')
  })

  it('compiles static QUI and QSS into native UI surface projection JSON', () => {
    const qui = analyzeQuiSource(`
Panel.dialog(id: "menu", x: 10, y: 20, width: 520, height: 320) {
  Text.title(id: "title", x: 32, y: 28, width: 240, height: 44) { "Main Menu" }
  Image.poster(id: "poster", src: "ui/poster.png", x: 40, y: 96, width: 180, height: 112)
  Button.primary(id: "close", label: "Close", action: ui.close(), x: 340, y: 236, width: 120, height: 48)
}
`)
    const qss = analyzeQssSource(`
Panel {
  background-color: #101820;
}
Panel.dialog {
  border-color: #5ac8fa;
  border-radius: 14px;
  border-width: 2px;
  padding: 20px 24px;
}
#title {
  color: #f7f3e8;
  font-size: 34px;
  padding: 2px 4px;
  z-index: 8;
}
Button.primary {
  background-color: #f0c15a;
  color: #18130a;
  font-weight: bold;
  padding: 8px 14px 10px 16px;
}
`)

    expect(qui.diagnostics).toEqual([])
    expect(qss.diagnostics).toEqual([])
    expect(compileNativeUiSurfaceProjection(qui, {
      contentPackageId: 'runtime.ui',
      qss,
      requiredRuntimePackages: ['base', 'runtime.fonts', 'base'],
    })).toEqual({
      root: {
        id: 'menu',
        kind: 'Panel',
        bounds: { x: 10, y: 20, width: 520, height: 320 },
        provenance: {
          contentPackageId: 'runtime.ui',
          requiredRuntimePackages: ['base', 'runtime.fonts'],
        },
        style: {
          backgroundColor: '#101820',
          borderColor: '#5ac8fa',
          borderRadius: 14,
          borderWidth: 2,
          padding: { top: 20, right: 24, bottom: 20, left: 24 },
        },
        children: [
          {
            id: 'title',
            kind: 'Text',
            bounds: { x: 32, y: 28, width: 240, height: 44 },
            zIndex: 8,
            text: 'Main Menu',
            provenance: {
              contentPackageId: 'runtime.ui',
              requiredRuntimePackages: ['base', 'runtime.fonts'],
            },
            style: {
              color: '#f7f3e8',
              fontSize: 34,
              padding: { top: 2, right: 4, bottom: 2, left: 4 },
            },
          },
          {
            id: 'poster',
            kind: 'Image',
            bounds: { x: 40, y: 96, width: 180, height: 112 },
            image: {
              assetType: 'images',
              assetName: 'ui/poster.png',
            },
            provenance: {
              contentPackageId: 'runtime.ui',
              requiredRuntimePackages: ['base', 'runtime.fonts'],
            },
          },
          {
            id: 'close',
            kind: 'Button',
            bounds: { x: 340, y: 236, width: 120, height: 48 },
            text: 'Close',
            intent: {
              event: 'ui/intent',
              action: 'close',
            },
            provenance: {
              contentPackageId: 'runtime.ui',
              requiredRuntimePackages: ['base', 'runtime.fonts'],
            },
            style: {
              backgroundColor: '#f0c15a',
              color: '#18130a',
              fontWeight: 'bold',
              padding: { top: 8, right: 14, bottom: 10, left: 16 },
            },
          },
        ],
      },
    })
  })

  it('derives native UI surface compatibility metadata from QUI and QSS documents', () => {
    const qui = analyzeQuiSource(`
Panel.dialog(id: "menu", image: "ui/panel.png") {
  Text.title { "Main Menu" }
  Image.poster(src: "ui/poster.png", asset-type: "images")
  Button.primary(action: ui.close()) { Text { "Close" } }
}
`)
    const qss = analyzeQssSource(`
Panel.dialog {
  background-color: #101820;
  background-image: asset("ui/panel-bg.png", "images");
  border-radius: 12px;
}
Button.primary {
  color: #18130a;
  font-size: 22px;
}
`)
    const compatibility = createNativeUiSurfaceCompatibilityFromDocuments(qui, {
      qss,
      rendererVersionRange: '^0.1.0',
      optionalCapabilities: ['native-wgpu.video@1'],
    })

    expect(qui.diagnostics).toEqual([])
    expect(qss.diagnostics).toEqual([])
    expect(compatibility).toMatchObject({
      packageName: '@quajs/native-renderer',
      versionRange: '^0.1.0',
      capabilities: ['native-wgpu.ui.surface@1'],
      optionalCapabilities: ['native-wgpu.video@1'],
      nativeCode: false,
    })
    expect(compatibility.assetKinds).toEqual(expect.arrayContaining(['qui', 'qss', 'tokens', 'images']))
    expect(compatibility.quiComponents).toEqual(['Button', 'Image', 'Panel', 'Text'])
    expect(compatibility.qssFeatures).toEqual([
      'background-color',
      'background-image',
      'border-radius',
      'color',
      'font-size',
    ])
    expect([
      ...(compatibility.capabilities || []),
      ...(compatibility.optionalCapabilities || []),
    ]).not.toContain('native-wgpu.audio@1')
  })

  it('derives native UI surface compatibility metadata from resolved projections', () => {
    const projection = compileNativeUiSurfaceProjection(
      analyzeQuiSource(`
Panel.dialog(id: "menu", image: "ui/panel.png") {
  Text.title { "Main Menu" }
  Button.primary(action: ui.close()) { Text { "Close" } }
}
`),
      {
        contentPackageId: 'runtime.ui',
        qss: analyzeQssSource(`
Panel.dialog {
  background-color: #101820;
  background-image: asset("ui/panel-bg.png", "images");
  border-radius: 12px;
}
Button.primary {
  color: #18130a;
  font-size: 22px;
}
`),
        requiredRuntimePackages: ['base'],
      },
    )
    const compatibility = createNativeUiSurfaceCompatibilityFromProjection(projection, {
      rendererVersionRange: '^0.1.0',
      optionalCapabilities: ['native-wgpu.video@1'],
    })

    expect(compatibility).toMatchObject({
      packageName: '@quajs/native-renderer',
      versionRange: '^0.1.0',
      capabilities: ['native-wgpu.ui.surface@1'],
      optionalCapabilities: ['native-wgpu.video@1'],
      nativeCode: false,
    })
    expect(compatibility.assetKinds).toEqual(expect.arrayContaining(['qui', 'qss', 'tokens', 'images']))
    expect(compatibility.quiComponents).toEqual(['Button', 'Panel', 'Text'])
    expect(compatibility.qssFeatures).toEqual([
      'background-color',
      'background-image',
      'border-radius',
      'color',
      'font-size',
    ])
    expect([
      ...(compatibility.capabilities || []),
      ...(compatibility.optionalCapabilities || []),
    ]).not.toContain('native-wgpu.audio@1')
  })

  it('uses QSS geometry as bounds fallback while QUI props stay authoritative', () => {
    const qui = analyzeQuiSource(`
Panel.dialog(id: "menu") {
  Button.primary(id: "qss-button", label: "From QSS")
  Button.secondary(id: "right-button", label: "Right")
  Button.primary(id: "override-button", label: "Override", x: 140, y: 96, width: 120, height: 48)
}
`)
    const qss = analyzeQssSource(`
Panel.dialog {
  left: 12px;
  top: 18px;
  width: 300px;
  height: 160px;
}
Button.primary {
  left: 40px;
  top: 52px;
  width: 100px;
  height: 44px;
  min-width: 128px;
  max-height: 40px;
}
Button.secondary {
  right: 18px;
  bottom: 20px;
  width: 96px;
  height: 36px;
}
#override-button {
  left: 1px;
  right: 96px;
  top: 2px;
  bottom: 96px;
  width: 3px;
  height: 4px;
  min-width: 260px;
  max-height: 12px;
}
`)

    expect(qui.diagnostics).toEqual([])
    expect(qss.diagnostics).toEqual([])
    expect(compileNativeUiSurfaceProjection(qui, { qss })).toEqual({
      root: {
        id: 'menu',
        kind: 'Panel',
        bounds: { x: 12, y: 18, width: 300, height: 160 },
        children: [
          {
            id: 'qss-button',
            kind: 'Button',
            bounds: { x: 40, y: 52, width: 128, height: 40 },
            text: 'From QSS',
          },
          {
            id: 'right-button',
            kind: 'Button',
            bounds: { x: 198, y: 122, width: 96, height: 36 },
            text: 'Right',
          },
          {
            id: 'override-button',
            kind: 'Button',
            bounds: { x: 140, y: 96, width: 120, height: 48 },
            text: 'Override',
          },
        ],
      },
    })
  })

  it('uses QSS display none as node visibility fallback while QUI show stays authoritative', () => {
    const qui = analyzeQuiSource(`
Panel.dialog(id: "menu") {
  Text.notice(id: "hidden-text") { "Hidden by display" }
  Button.primary(id: "override-button", label: "Override", show: true)
}
`)
    const qss = analyzeQssSource(`
Text.notice {
  display: none;
  visibility: visible;
}
Button.primary {
  display: none;
}
Panel.dialog {
  visibility: visible;
}
`)

    expect(qui.diagnostics).toEqual([])
    expect(qss.diagnostics).toEqual([])
    expect(compileNativeUiSurfaceProjection(qui, { qss })).toEqual({
      root: {
        id: 'menu',
        kind: 'Panel',
        bounds: { x: 0, y: 0, width: 0, height: 0 },
        visible: true,
        children: [
          {
            id: 'hidden-text',
            kind: 'Text',
            bounds: { x: 0, y: 0, width: 0, height: 0 },
            visible: false,
            text: 'Hidden by display',
          },
          {
            id: 'override-button',
            kind: 'Button',
            bounds: { x: 0, y: 0, width: 0, height: 0 },
            visible: true,
            text: 'Override',
          },
        ],
      },
    })
  })

  it('uses QSS visibility as node visibility fallback while QUI show stays authoritative', () => {
    const qui = analyzeQuiSource(`
Panel.dialog(id: "menu") {
  Text.notice(id: "hidden-text") { "Hidden by QSS" }
  Button.primary(id: "override-button", label: "Override", show: true)
}
`)
    const qss = analyzeQssSource(`
Text.notice {
  visibility: hidden;
}
Button.primary {
  visibility: hidden;
}
Panel.dialog {
  visibility: visible;
}
`)

    expect(qui.diagnostics).toEqual([])
    expect(qss.diagnostics).toEqual([])
    expect(compileNativeUiSurfaceProjection(qui, { qss })).toEqual({
      root: {
        id: 'menu',
        kind: 'Panel',
        bounds: { x: 0, y: 0, width: 0, height: 0 },
        visible: true,
        children: [
          {
            id: 'hidden-text',
            kind: 'Text',
            bounds: { x: 0, y: 0, width: 0, height: 0 },
            visible: false,
            text: 'Hidden by QSS',
          },
          {
            id: 'override-button',
            kind: 'Button',
            bounds: { x: 0, y: 0, width: 0, height: 0 },
            visible: true,
            text: 'Override',
          },
        ],
      },
    })
  })

  it('uses QSS overflow as child clip metadata in compiled projection', () => {
    const qui = analyzeQuiSource(`
Panel.clip(id: "menu") {
  Button.primary(id: "inside", label: "Inside")
}
Panel.open(id: "drawer") {
  Button.primary(id: "outside", label: "Outside")
}
`)
    const qss = analyzeQssSource(`
Panel.clip {
  overflow: hidden;
}
Panel.open {
  overflow: visible;
}
`)

    expect(qui.diagnostics).toEqual([])
    expect(qss.diagnostics).toEqual([])
    expect(compileNativeUiSurfaceProjection(qui, { qss, rootId: 'root' })).toEqual({
      root: {
        id: 'root',
        kind: 'Fragment',
        bounds: { x: 0, y: 0, width: 0, height: 0 },
        children: [
          {
            id: 'menu',
            kind: 'Panel',
            bounds: { x: 0, y: 0, width: 0, height: 0 },
            clipChildren: true,
            children: [
              {
                id: 'inside',
                kind: 'Button',
                bounds: { x: 0, y: 0, width: 0, height: 0 },
                text: 'Inside',
              },
            ],
          },
          {
            id: 'drawer',
            kind: 'Panel',
            bounds: { x: 0, y: 0, width: 0, height: 0 },
            clipChildren: false,
            children: [
              {
                id: 'outside',
                kind: 'Button',
                bounds: { x: 0, y: 0, width: 0, height: 0 },
                text: 'Outside',
              },
            ],
          },
        ],
      },
    })
  })

  it('matches the shared Rust renderer JSON fixture for compiled QUI and QSS surfaces', () => {
    const qui = analyzeQuiSource(`
Panel.compiled(id: "menu", x: 32, y: 24, width: 520, height: 392) {
  Text.title(id: "title", x: 64, y: 58, width: 360, height: 56) { "Compiled Menu" }
  Image.poster(id: "poster", src: "ui/poster.png", x: 64, y: 132, width: 180, height: 112)
  Button.primary(id: "open-settings", label: "Settings", action: ui.open("settings"), x: 340, y: 330, width: 136, height: 48)
}
`)
    const qss = analyzeQssSource(`
Panel.compiled {
  background-color: #101820;
  background-image: asset("ui/panel.png");
  background-position: right top;
  background-size: contain;
  border-color: #5ac8fa;
  border-radius: 12px;
  border-width: 2px;
  padding: 18px 22px;
}
#title {
  color: #f7f3e8;
  font-family: "Qua Sans", "Fallback Serif";
  font-size: 34px;
  font-weight: bold;
  line-height: 44px;
  padding: 2px 4px 6px;
  text-align: center;
  z-index: 8;
}
Image.poster {
  object-fit: cover;
}
Button.primary {
  background-color: #f0c15a;
  color: #18130a;
  font-weight: 700;
  padding: 8px 14px 10px 16px;
}
`)
    const fixture = JSON.parse(readFileSync(SHARED_SURFACE_FRAME_FIXTURE, 'utf8')) as {
      view: {
        ui: {
          overlays: Array<{
            surface: {
              root: unknown
            }
          }>
        }
      }
    }

    expect(qui.diagnostics).toEqual([])
    expect(qss.diagnostics).toEqual([])
    expect(compileNativeUiSurfaceProjection(qui, {
      contentPackageId: 'runtime.ui',
      qss,
      requiredRuntimePackages: ['base', 'runtime.fonts'],
    }).root)
      .toEqual(fixture.view.ui.overlays[0].surface.root)
  })

  it('keeps the native-wgpu registry compatible with the shared resolved surface fixture', () => {
    const fixture = JSON.parse(readFileSync(SHARED_SURFACE_FRAME_FIXTURE, 'utf8')) as {
      view: {
        ui: {
          overlays: Array<{
            surface: NativeUiSurfaceProjection
          }>
        }
      }
    }
    const requirements = collectNativeUiSurfaceProjectionRequirements(fixture.view.ui.overlays[0].surface)
    const supportedComponents = new Set(nativeWgpuQuiComponentNames())
    const supportedQssFeatures = new Set(nativeWgpuQssFeatureNames())

    expect(requirements.assetKinds).toEqual(expect.arrayContaining(['fonts', 'images']))
    expect(requirements.intentEvents).toEqual(['ui/intent'])
    expect(requirements.projectionFields).toEqual(expect.arrayContaining([
      'bounds',
      'children',
      'image',
      'intent',
      'kind',
      'provenance',
      'text',
    ]))
    expect(requirements.quiComponents).toEqual(['Button', 'Image', 'Panel', 'Text'])
    expect(requirements.qssFeatures).toEqual(expect.arrayContaining([
      'background-color',
      'background-image',
      'background-position',
      'background-size',
      'border-color',
      'border-radius',
      'border-width',
      'color',
      'font-family',
      'font-size',
      'font-weight',
      'line-height',
      'object-fit',
      'padding',
      'text-align',
      'z-index',
    ]))
    expect(requirements.quiComponents.filter(component => !supportedComponents.has(component))).toEqual([])
    expect(requirements.qssFeatures.filter(feature => !supportedQssFeatures.has(feature))).toEqual([])
  })

  it('separates resolved projection fields from QSS features when collecting surface requirements', () => {
    const requirements = collectNativeUiSurfaceProjectionRequirements({
      root: {
        id: 'scroll',
        kind: 'Scroll',
        bounds: { x: 0, y: 0, width: 320, height: 240 },
        clipChildren: true,
        opacity: 0.5,
        scrollOffsetX: 12,
        scrollOffsetY: 24,
        visible: false,
        zIndex: 4,
        children: [
          {
            id: 'content',
            kind: 'Panel',
            bounds: { x: 0, y: 0, width: 320, height: 240 },
          },
        ],
      },
    })

    expect(requirements.projectionFields).toEqual(expect.arrayContaining([
      'bounds',
      'children',
      'clipChildren',
      'kind',
      'opacity',
      'scrollOffsetX',
      'scrollOffsetY',
      'visible',
    ]))
    expect(requirements.qssFeatures).toEqual(['overflow', 'z-index'])
    expect(requirements.qssFeatures).not.toContain('opacity')
    expect(requirements.qssFeatures).not.toContain('visibility')
  })

  it('applies native QSS selector specificity and ancestor matching during projection compile', () => {
    const qui = analyzeQuiSource(`
Panel(id: "menu") {
  Button.primary(id: "direct", label: "Direct")
  Column {
    Button.primary(id: "nested", label: "Nested")
  }
}
`)
    const qss = analyzeQssSource(`
Button { color: #aaaaaa; }
.primary { color: #bbbbbb; }
Panel Button.primary { color: #cccccc; }
Panel > Button.primary { color: #dddddd; }
#nested { color: #eeeeee; }
`)

    const projection = compileNativeUiSurfaceProjection(qui, { qss })
    const direct = projection.root?.children?.[0]
    const nested = projection.root?.children?.[1]?.children?.[0]

    expect(direct?.style).toEqual({ color: '#dddddd' })
    expect(nested?.style).toEqual({ color: '#eeeeee' })
  })

  it('ignores malformed native QSS selector chains during projection compile', () => {
    const qui = analyzeQuiSource(`
Panel(id: "menu") {
  Button(id: "target", label: "Target")
}
`)
    const qss = analyzeQssSource(`
Panel > { color: #ff0000; }
> Button { color: #00ff00; }
Panel > > Button { color: #0000ff; }
Panel > Button { color: #101010; }
`)

    const projection = compileNativeUiSurfaceProjection(qui, { qss })
    const target = projection.root?.children?.[0]

    expect(target?.style).toEqual({ color: '#101010' })
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
