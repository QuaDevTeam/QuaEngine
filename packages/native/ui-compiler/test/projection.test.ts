import { describe, expect, it } from 'vitest'
import {
  analyzeQssSource,
  analyzeQuiSource,
  compileNativeUiSurfaceProjection,
} from '../src'

describe('@quajs/native-ui-compiler projection', () => {
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

  it('flattens imported composite QUI components into foundational surface nodes', () => {
    const qui = analyzeQuiSource(`
import component "./Dialog.qui";
import component "./Drawer.qui";

Stack(id: "ui-root") {
  Dialog(if: view.overlays.settings, key: "settings-dialog") {
    Backdrop(id: "settings-backdrop", action: ui.close(), width: 1920, height: 1080)
    Panel(id: "settings-panel", width: 640, height: 420) {
      Text(id: "settings-title") { "Settings" }
      Button(id: "settings-close", label: "Close", action: ui.close())
    }
  }

  Drawer(for: drawer in view.drawers, key: drawer.id) {
    Panel(id: "drawer-panel", width: 420, height: 1080) {
      Text(id: "drawer-title") { drawer.title }
    }
  }
}
`, {
      lint: {
        strictComponents: true,
      },
    })
    const projection = compileNativeUiSurfaceProjection(qui)

    expect(qui.diagnostics).toEqual([])
    expect(qui.nodes.map(node => node.name)).toEqual([
      'Stack',
      'Dialog',
      'Backdrop',
      'Panel',
      'Text',
      'Button',
      'Drawer',
      'Panel',
      'Text',
    ])
    expect(projection.root).toEqual({
      id: 'ui-root',
      kind: 'Stack',
      bounds: { x: 0, y: 0, width: 0, height: 0 },
      children: [
        {
          id: 'settings-backdrop',
          kind: 'Backdrop',
          bounds: { x: 0, y: 0, width: 1920, height: 1080 },
          intent: {
            event: 'ui/intent',
            action: 'close',
          },
        },
        {
          id: 'settings-panel',
          kind: 'Panel',
          bounds: { x: 0, y: 0, width: 640, height: 420 },
          children: [
            {
              id: 'settings-title',
              kind: 'Text',
              bounds: { x: 0, y: 0, width: 0, height: 0 },
              text: 'Settings',
            },
            {
              id: 'settings-close',
              kind: 'Button',
              bounds: { x: 0, y: 0, width: 0, height: 0 },
              text: 'Close',
              intent: {
                event: 'ui/intent',
                action: 'close',
              },
            },
          ],
        },
        {
          id: 'drawer-panel',
          kind: 'Panel',
          bounds: { x: 0, y: 0, width: 420, height: 1080 },
          children: [
            {
              id: 'drawer-title',
              kind: 'Text',
              bounds: { x: 0, y: 0, width: 0, height: 0 },
              text: 'drawer.title',
            },
          ],
        },
      ],
    })
    expect(JSON.stringify(projection)).not.toContain('Dialog')
    expect(JSON.stringify(projection)).not.toContain('Drawer')
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
})
