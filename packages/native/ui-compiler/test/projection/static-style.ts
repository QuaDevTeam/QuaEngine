import { describe, expect, it } from 'vitest'
import {
  analyzeQssSource,
  analyzeQuiSource,
  compileNativeUiSurfaceProjection,
} from '../../src'
import { withDefaultVisible } from './helpers'

describe('@quajs/native-ui-compiler projection static style', () => {
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
    })).toEqual(withDefaultVisible({
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
    }))
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
    expect(compileNativeUiSurfaceProjection(qui, { qss })).toEqual(withDefaultVisible({
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
    }))
  })

  it('applies QSS gap to structural Row, Column, and Grid children during projection', () => {
    const qui = analyzeQuiSource(`
Panel(id: "root", width: 420, height: 260) {
  Row.tabs(id: "tabs", x: 20, y: 24, width: 320, height: 40) {
    Button(id: "tab-a", label: "A", width: 80, height: 32)
    Button(id: "tab-b", label: "B", width: 72, height: 32)
  }
  Column.menu(id: "menu", x: 24, y: 84, width: 180, height: 96) {
    Text(id: "first", width: 100, height: 20) { "First" }
    Text(id: "second", width: 100, height: 20) { "Second" }
  }
  Grid.thumbs(id: "thumbs", x: 220, y: 84, width: 150, height: 80) {
    Image(id: "one", src: "ui/one.png", width: 70, height: 20)
    Image(id: "two", src: "ui/two.png", width: 70, height: 20)
    Image(id: "three", src: "ui/three.png", width: 70, height: 20)
  }
}
`)
    const qss = analyzeQssSource(`
Row.tabs {
  gap: 12px;
}
Column.menu {
  row-gap: 6px;
}
Grid.thumbs {
  gap: 4px 10px;
}
`)

    expect(qui.diagnostics).toEqual([])
    expect(qss.diagnostics).toEqual([])
    expect(compileNativeUiSurfaceProjection(qui, { qss })).toEqual(withDefaultVisible({
      root: {
        id: 'root',
        kind: 'Panel',
        bounds: { x: 0, y: 0, width: 420, height: 260 },
        children: [
          {
            id: 'tabs',
            kind: 'Row',
            bounds: { x: 20, y: 24, width: 320, height: 40 },
            children: [
              {
                id: 'tab-a',
                kind: 'Button',
                bounds: { x: 20, y: 24, width: 80, height: 32 },
                text: 'A',
              },
              {
                id: 'tab-b',
                kind: 'Button',
                bounds: { x: 112, y: 24, width: 72, height: 32 },
                text: 'B',
              },
            ],
          },
          {
            id: 'menu',
            kind: 'Column',
            bounds: { x: 24, y: 84, width: 180, height: 96 },
            children: [
              {
                id: 'first',
                kind: 'Text',
                bounds: { x: 24, y: 84, width: 100, height: 20 },
                text: 'First',
              },
              {
                id: 'second',
                kind: 'Text',
                bounds: { x: 24, y: 110, width: 100, height: 20 },
                text: 'Second',
              },
            ],
          },
          {
            id: 'thumbs',
            kind: 'Grid',
            bounds: { x: 220, y: 84, width: 150, height: 80 },
            children: [
              {
                id: 'one',
                kind: 'Image',
                bounds: { x: 220, y: 84, width: 70, height: 20 },
                image: { assetType: 'images', assetName: 'ui/one.png' },
              },
              {
                id: 'two',
                kind: 'Image',
                bounds: { x: 300, y: 84, width: 70, height: 20 },
                image: { assetType: 'images', assetName: 'ui/two.png' },
              },
              {
                id: 'three',
                kind: 'Image',
                bounds: { x: 220, y: 108, width: 70, height: 20 },
                image: { assetType: 'images', assetName: 'ui/three.png' },
              },
            ],
          },
        ],
      },
    }))
  })

  it('applies QSS margin to structural Row, Column, and Grid child layout only', () => {
    const qui = analyzeQuiSource(`
Panel(id: "root", width: 520, height: 300) {
  Row.tabs(id: "tabs", x: 20, y: 20, width: 300, height: 60) {
    Button.first(id: "first-tab", label: "One", width: 80, height: 30)
    Button.second(id: "second-tab", label: "Two", width: 70, height: 30)
  }
  Column.stack(id: "stack", x: 20, y: 100, width: 200, height: 100) {
    Text.itemA(id: "item-a", width: 100, height: 20) { "A" }
    Text.itemB(id: "item-b", width: 100, height: 20) { "B" }
  }
  Grid.tiles(id: "tiles", x: 260, y: 100, width: 130, height: 120) {
    Image.tile(id: "tile-one", src: "ui/one.png", width: 50, height: 20)
    Image.tile(id: "tile-two", src: "ui/two.png", width: 50, height: 20)
    Image.tile(id: "tile-three", src: "ui/three.png", width: 50, height: 20)
  }
}
`)
    const qss = analyzeQssSource(`
Row.tabs {
  gap: 10px;
}
Button.first {
  margin: 2px 4px 6px 8px;
}
Button.second {
  margin-left: 10px;
  margin-right: 5px;
}
Column.stack {
  row-gap: 5px;
}
Text.itemA {
  margin-top: 3px;
  margin-bottom: 7px;
  margin-left: 2px;
}
Text.itemB {
  margin: 4px;
}
Grid.tiles {
  gap: 3px 5px;
}
Image.tile {
  margin-right: 5px;
  margin-bottom: 4px;
}
`)

    expect(qui.diagnostics).toEqual([])
    expect(qss.diagnostics).toEqual([])
    expect(compileNativeUiSurfaceProjection(qui, { qss })).toEqual(withDefaultVisible({
      root: {
        id: 'root',
        kind: 'Panel',
        bounds: { x: 0, y: 0, width: 520, height: 300 },
        children: [
          {
            id: 'tabs',
            kind: 'Row',
            bounds: { x: 20, y: 20, width: 300, height: 60 },
            children: [
              {
                id: 'first-tab',
                kind: 'Button',
                bounds: { x: 28, y: 22, width: 80, height: 30 },
                text: 'One',
              },
              {
                id: 'second-tab',
                kind: 'Button',
                bounds: { x: 132, y: 20, width: 70, height: 30 },
                text: 'Two',
              },
            ],
          },
          {
            id: 'stack',
            kind: 'Column',
            bounds: { x: 20, y: 100, width: 200, height: 100 },
            children: [
              {
                id: 'item-a',
                kind: 'Text',
                bounds: { x: 22, y: 103, width: 100, height: 20 },
                text: 'A',
              },
              {
                id: 'item-b',
                kind: 'Text',
                bounds: { x: 24, y: 139, width: 100, height: 20 },
                text: 'B',
              },
            ],
          },
          {
            id: 'tiles',
            kind: 'Grid',
            bounds: { x: 260, y: 100, width: 130, height: 120 },
            children: [
              {
                id: 'tile-one',
                kind: 'Image',
                bounds: { x: 260, y: 100, width: 50, height: 20 },
                image: { assetType: 'images', assetName: 'ui/one.png' },
              },
              {
                id: 'tile-two',
                kind: 'Image',
                bounds: { x: 320, y: 100, width: 50, height: 20 },
                image: { assetType: 'images', assetName: 'ui/two.png' },
              },
              {
                id: 'tile-three',
                kind: 'Image',
                bounds: { x: 260, y: 127, width: 50, height: 20 },
                image: { assetType: 'images', assetName: 'ui/three.png' },
              },
            ],
          },
        ],
      },
    }))
  })

  it('keeps absolute positioned structural children out of Row flow', () => {
    const qui = analyzeQuiSource(`
Panel(id: "root", width: 360, height: 120) {
  Row.toolbar(id: "toolbar", x: 20, y: 20, width: 300, height: 60) {
    Button.left(id: "left", label: "Left", width: 80, height: 30)
    Button.float(id: "float", label: "Float", width: 50, height: 20)
    Button.right(id: "right", label: "Right", width: 70, height: 30)
  }
}
`)
    const qss = analyzeQssSource(`
Row.toolbar {
  gap: 10px;
}
Button.float {
  position: absolute;
  left: 200px;
  top: 5px;
  margin-left: 3px;
}
`)

    expect(qui.diagnostics).toEqual([])
    expect(qss.diagnostics).toEqual([])
    expect(compileNativeUiSurfaceProjection(qui, { qss })).toEqual(withDefaultVisible({
      root: {
        id: 'root',
        kind: 'Panel',
        bounds: { x: 0, y: 0, width: 360, height: 120 },
        children: [
          {
            id: 'toolbar',
            kind: 'Row',
            bounds: { x: 20, y: 20, width: 300, height: 60 },
            children: [
              {
                id: 'left',
                kind: 'Button',
                bounds: { x: 20, y: 20, width: 80, height: 30 },
                text: 'Left',
              },
              {
                id: 'float',
                kind: 'Button',
                bounds: { x: 223, y: 25, width: 50, height: 20 },
                text: 'Float',
              },
              {
                id: 'right',
                kind: 'Button',
                bounds: { x: 110, y: 20, width: 70, height: 30 },
                text: 'Right',
              },
            ],
          },
        ],
      },
    }))
  })
})
