import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import type { NativeUiSurfaceProjection } from '../src'
import {
  analyzeQssSource,
  analyzeQuiSource,
  collectNativeUiSurfaceProjectionRequirements,
  compileNativeUiSurfaceProjection,
  createNativeUiSurfaceCompatibilityFromDocuments,
  createNativeUiSurfaceCompatibilityFromProjection,
  nativeWgpuQssFeatureNames,
  nativeWgpuQuiComponentNames,
} from '../src'

const SHARED_SURFACE_FRAME_FIXTURE = fileURLToPath(
  new URL('../../test-fixtures/renderer/qui-qss-surface-frame.json', import.meta.url),
)

describe('@quajs/native-ui-compiler projection compatibility', () => {
  it('derives native UI surface compatibility metadata from QUI and QSS documents', () => {
    const qui = analyzeQuiSource(`
Panel.dialog(id: "menu", image: "ui/panel.png") {
  Text.title { "Main Menu" }
  Image.poster(src: "ui/poster.png", asset-type: "images")
  Button.primary(action: ui.close()) { Text { "Close" } }
  Button.choice(action: choice.select("start")) { Text { "Start" } }
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
  pointer-events: none;
}
Image.poster {
  object-position: right top;
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
    expect(compatibility.intentEvents).toEqual(['choice/select', 'ui/intent'])
    expect(compatibility.quiComponents).toEqual(['Button', 'Image', 'Panel', 'Text'])
    expect(compatibility.qssFeatures).toEqual([
      'background-color',
      'background-image',
      'border-radius',
      'color',
      'font-size',
      'object-position',
      'pointer-events',
    ])
    expect([
      ...(compatibility.capabilities || []),
      ...(compatibility.optionalCapabilities || []),
    ]).not.toContain('native-wgpu.audio@1')
  })

  it('omits authoring-only composite components from document-derived native requirements', () => {
    const qui = analyzeQuiSource(`
import component "./Dialog.qui";
import component "./Drawer.qui";

Stack(id: "ui-root") {
  Dialog {
    Panel(id: "dialog-panel") {
      Text { "Dialog" }
      Button(action: ui.close()) { Text { "Close" } }
    }
  }
  Drawer {
    Image(src: "ui/drawer.png")
  }
}
`, {
      lint: {
        strictComponents: true,
      },
    })
    const compatibility = createNativeUiSurfaceCompatibilityFromDocuments(qui, {
      optionalQuiComponents: ['Dialog'],
    })

    expect(qui.diagnostics).toEqual([])
    expect(compatibility.quiComponents).toEqual(['Button', 'Image', 'Panel', 'Stack', 'Text'])
    expect(compatibility.quiComponents).not.toEqual(expect.arrayContaining(['Dialog', 'Drawer']))
    expect(compatibility.optionalQuiComponents).toEqual(['Dialog'])
    expect(compatibility.assetKinds).toEqual(expect.arrayContaining(['qui', 'qss', 'tokens', 'images']))
  })

  it('omits non-projectable foundational actions from document-derived native intent events', () => {
    const qui = analyzeQuiSource(`
Stack {
  Image(src: "ui/poster.png", action: choice.select("poster"))
  Text(action: ui.open("caption")) { "Caption" }
}
`)
    const compatibility = createNativeUiSurfaceCompatibilityFromDocuments(qui)
    const projectionCompatibility = createNativeUiSurfaceCompatibilityFromProjection(
      compileNativeUiSurfaceProjection(qui),
    )

    expect(qui.diagnostics.filter(item => item.code === 'QUI_UNSUPPORTED_ACTION_TARGET')).toHaveLength(2)
    expect(compatibility.intentEvents).toBeUndefined()
    expect(projectionCompatibility.intentEvents).toBeUndefined()
  })

  it('omits unsafe document asset references from native compatibility asset kinds', () => {
    const qui = analyzeQuiSource(`
Stack {
  Image(src: "ui/good.png", asset-type: "sprites")
  Image(src: "ui/native.dll", asset-type: "native")
  Image(src: "ui//panel.png", asset-type: "../bad")
  Image(src: "ui/./panel.png")
}
`)
    const qss = analyzeQssSource(`
Panel.good {
  background-image: asset("ui/panel.png", "images");
}
Panel.bad {
  background-image: asset("ui/native.dll", "native");
}
Panel.bad-type {
  background-image: asset("ui/panel.png", "../bad");
}
`)
    const compatibility = createNativeUiSurfaceCompatibilityFromDocuments(qui, { qss })

    expect(qui.diagnostics.filter(item => item.code === 'QUI_INVALID_ASSET_REFERENCE')).toHaveLength(4)
    expect(qss.diagnostics.filter(item => item.code === 'QSS_INVALID_VALUE')).toHaveLength(2)
    expect(compatibility.assetKinds).toEqual(expect.arrayContaining(['images', 'qss', 'qui', 'sprites', 'tokens']))
    expect(compatibility.assetKinds).toHaveLength(5)
    expect(compatibility.assetKinds).not.toEqual(expect.arrayContaining(['native', '../bad']))
    expect(compatibility.nativeCode).toBe(false)
  })

  it('derives native UI surface compatibility metadata from resolved projections', () => {
    const projection = compileNativeUiSurfaceProjection(
      analyzeQuiSource(`
Panel.dialog(id: "menu", image: "ui/panel.png") {
  Text.title { "Main Menu" }
  Image.poster(src: "ui/poster.png")
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
Image.poster {
  object-position: right top;
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
    expect(compatibility.intentEvents).toEqual(['ui/intent'])
    expect(compatibility.quiComponents).toEqual(['Button', 'Image', 'Panel', 'Text'])
    expect(compatibility.qssFeatures).toEqual([
      'background-color',
      'background-image',
      'border-radius',
      'color',
      'font-size',
      'object-position',
    ])
    expect([
      ...(compatibility.capabilities || []),
      ...(compatibility.optionalCapabilities || []),
    ]).not.toContain('native-wgpu.audio@1')
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
})
