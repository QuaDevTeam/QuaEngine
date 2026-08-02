import { describe, expect, it } from 'vitest'
import { Box, Button, Image, Panel, Text } from '@quajs/native-ui'
import { ui } from '@quajs/native-ui'
import { analyzeQssSource, compileQuiTsxProjection } from '../../src'
import { withDefaultVisible } from './helpers'

describe('@quajs/native-ui-compiler projection static style', () => {
  it('resolves circle gradient geometry from the final non-square node bounds', () => {
    const root = Box({ id: 'vignette', class: 'vignette', x: 0, y: 0, width: 1920, height: 1080 })
    const qss = analyzeQssSource(`
Box.vignette {
  background-image: radial-gradient(circle at center, transparent 46%, rgba(0,0,0,0.34) 100%);
}
`)

    expect(qss.diagnostics).toEqual([])
    const projection = compileQuiTsxProjection(root, { qss })
    expect(projection.root?.style?.backgroundGradient).toEqual({
      centerX: 0.5,
      centerY: 0.5,
      kind: 'radial',
      radius: Math.hypot(0.5, 0.5 * (1080 / 1920)),
      shape: 'circle',
      stops: [
        { color: 'transparent', position: 0.46 },
        { color: 'rgba(0,0,0,0.34)', position: 1 },
      ],
    })
  })

  it('compiles static TSX components and QSS into native UI surface projection JSON', () => {
    const root = Panel({ id: 'menu', class: 'dialog', x: 10, y: 20, width: 520, height: 320, children: [
      Text({ id: 'title', class: 'title', x: 32, y: 28, width: 240, height: 44, children: 'Main Menu' }),
      Image({ id: 'poster', class: 'poster', src: 'ui/poster.png', x: 40, y: 96, width: 180, height: 112 }),
      Button({ id: 'close', class: 'primary', onClick: ui.close('menu'), x: 340, y: 236, width: 120, height: 48, children: 'Close' }),
    ] })

    const qss = analyzeQssSource(`
Panel { background-color: #101820; }
Panel.dialog { border-color: #5ac8fa; border-radius: 14px; border-width: 2px; padding: 20px 24px; }
#title { color: #f7f3e8; font-size: 34px; padding: 2px 4px; z-index: 8; }
Button.primary { background-color: #f0c15a; color: #18130a; font-weight: bold; padding: 8px 14px 10px 16px; }
`)

    expect(qss.diagnostics).toEqual([])
    const result = compileQuiTsxProjection(root, {
      contentPackageId: 'runtime.ui',
      qss,
      requiredRuntimePackages: ['base', 'runtime.fonts', 'base'],
    })

    const provenance = {
      contentPackageId: 'runtime.ui',
      requiredRuntimePackages: ['base', 'runtime.fonts'],
    }

    expect(result).toEqual(withDefaultVisible({
      root: {
        id: 'menu',
        kind: 'Panel',
        bounds: { x: 10, y: 20, width: 520, height: 320 },
        provenance,
        style: {
          backgroundColor: '#101820',
          borderColor: '#5ac8fa',
          borderRadius: 14,
          borderWidth: 2,
          padding: { top: 20, right: 24, bottom: 20, left: 24 },
        },
        children: [
          { id: 'title', kind: 'Text', bounds: { x: 32, y: 28, width: 240, height: 44 },
            zIndex: 8, text: 'Main Menu', provenance,
            style: { color: '#f7f3e8', fontSize: 34, padding: { top: 2, right: 4, bottom: 2, left: 4 } } },
          { id: 'poster', kind: 'Image', bounds: { x: 40, y: 96, width: 180, height: 112 },
            provenance, image: { assetType: 'images', assetName: 'ui/poster.png' } },
          { id: 'close', kind: 'Button', bounds: { x: 340, y: 236, width: 120, height: 48 },
            text: 'Close',
            intent: { event: 'ui/intent', action: 'close', metadata: { arg0: 'menu' } },
            provenance,
            style: {
              backgroundColor: '#f0c15a',
              color: '#18130a',
              fontWeight: 'bold',
              padding: { top: 8, right: 14, bottom: 10, left: 16 },
            } },
        ],
      },
    }))
  })

  it('uses QSS geometry as bounds fallback while explicit TSX props stay authoritative', () => {
    const root = Panel({ id: 'menu', class: 'dialog', children: [
      Button({ id: 'qss-button', class: 'primary', children: 'From QSS' }),
      Button({ id: 'override-button', class: 'primary', x: 140, y: 96, width: 120, height: 48, children: 'Override' }),
    ] })

    const qss = analyzeQssSource(`
Button.primary { left: 20px; top: 20px; width: 80px; height: 40px; }
`)

    expect(qss.diagnostics).toEqual([])
    const result = compileQuiTsxProjection(root, { qss })
    const qssBtn = result.root?.children?.[0]
    const overrideBtn = result.root?.children?.[1]

    expect(qssBtn?.bounds).toEqual({ x: 20, y: 20, width: 80, height: 40 })
    // explicit props override QSS
    expect(overrideBtn?.bounds).toEqual({ x: 140, y: 96, width: 120, height: 48 })
  })

  it('projects interactive pseudo-state styles into stateStyles projection field', () => {
    const root = Button({ id: 'btn', class: 'action', x: 0, y: 0, width: 100, height: 40, children: 'Click' })
    const qss = analyzeQssSource(`
Button.action { background-color: rgba(9,12,18,0.88); color: rgba(255,250,242,0.92); }
Button.action:hover { background-color: rgba(20,54,66,0.82); translate: 3px 0; }
Button.action:active { background-color: rgba(14,42,54,0.88); translate: 5px 0; }
`)

    expect(qss.diagnostics).toEqual([])
    const result = compileQuiTsxProjection(root, { qss })
    const node = result.root

    expect(node?.style?.backgroundColor).toBe('rgba(9,12,18,0.88)')
    expect(node?.stateStyles?.hover?.style.backgroundColor).toBe('rgba(20,54,66,0.82)')
    expect(node?.stateStyles?.active?.style.backgroundColor).toBe('rgba(14,42,54,0.88)')
  })
})
