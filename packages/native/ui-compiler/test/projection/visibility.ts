import { describe, expect, it } from 'vitest'
import {
  analyzeQssSource,
  analyzeQuiSource,
  compileNativeUiSurfaceProjection,
} from '../../src'
import { withDefaultVisible } from './helpers'

describe('@quajs/native-ui-compiler projection visibility and clipping', () => {
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
    expect(compileNativeUiSurfaceProjection(qui, { qss })).toEqual(withDefaultVisible({
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
    }))
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
    expect(compileNativeUiSurfaceProjection(qui, { qss })).toEqual(withDefaultVisible({
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
    }))
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
    expect(compileNativeUiSurfaceProjection(qui, { qss, rootId: 'root' })).toEqual(withDefaultVisible({
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
    }))
  })
})
