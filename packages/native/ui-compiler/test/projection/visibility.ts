import { describe, expect, it } from 'vitest'
import { Button, Panel, Text } from '@quajs/native-ui'
import { analyzeQssSource, compileQuiTsxProjection } from '../../src'
import { withDefaultVisible } from './helpers'

describe('@quajs/native-ui-compiler projection visibility and clipping', () => {
  it('uses QSS display:none as node visibility fallback while show prop stays authoritative', () => {
    const root = Panel({ id: 'menu', class: 'dialog', x: 0, y: 0, width: 0, height: 0, children: [
      Text({ id: 'hidden-text', class: 'notice', x: 0, y: 0, width: 0, height: 0, children: 'Hidden by display' }),
      Button({ id: 'override-button', class: 'primary', show: true, x: 0, y: 0, width: 0, height: 0, children: 'Override' }),
    ] })

    const qss = analyzeQssSource(`
Text.notice { display: none; visibility: visible; }
Button.primary { display: none; }
Panel.dialog { visibility: visible; }
`)

    expect(compileQuiTsxProjection(root, { qss })).toEqual(withDefaultVisible({
      root: {
        id: 'menu',
        kind: 'Panel',
        bounds: { x: 0, y: 0, width: 0, height: 0 },
        visible: true,
        children: [
          { id: 'hidden-text', kind: 'Text', bounds: { x: 0, y: 0, width: 0, height: 0 }, visible: false, text: 'Hidden by display' },
          { id: 'override-button', kind: 'Button', bounds: { x: 0, y: 0, width: 0, height: 0 }, visible: true, text: 'Override' },
        ],
      },
    }))
  })

  it('uses QSS visibility:hidden as node visibility fallback while show prop stays authoritative', () => {
    const root = Panel({ id: 'menu', class: 'dialog', x: 0, y: 0, width: 0, height: 0, children: [
      Text({ id: 'hidden-text', class: 'notice', x: 0, y: 0, width: 0, height: 0, children: 'Hidden by QSS' }),
      Button({ id: 'override-button', class: 'primary', show: true, x: 0, y: 0, width: 0, height: 0, children: 'Override' }),
    ] })

    const qss = analyzeQssSource(`
Text.notice { visibility: hidden; }
Button.primary { visibility: hidden; }
Panel.dialog { visibility: visible; }
`)

    expect(compileQuiTsxProjection(root, { qss })).toEqual(withDefaultVisible({
      root: {
        id: 'menu',
        kind: 'Panel',
        bounds: { x: 0, y: 0, width: 0, height: 0 },
        visible: true,
        children: [
          { id: 'hidden-text', kind: 'Text', bounds: { x: 0, y: 0, width: 0, height: 0 }, visible: false, text: 'Hidden by QSS' },
          { id: 'override-button', kind: 'Button', bounds: { x: 0, y: 0, width: 0, height: 0 }, visible: true, text: 'Override' },
        ],
      },
    }))
  })

  it('uses QSS overflow:hidden as clipChildren metadata in compiled projection', () => {
    const root = [
      Panel({ id: 'menu', class: 'clip', x: 0, y: 0, width: 0, height: 0, children: [
        Button({ id: 'inside', class: 'primary', x: 0, y: 0, width: 0, height: 0, children: 'Inside' }),
      ] }),
      Panel({ id: 'drawer', class: 'open', x: 0, y: 0, width: 0, height: 0, children: [
        Button({ id: 'outside', class: 'primary', x: 0, y: 0, width: 0, height: 0, children: 'Outside' }),
      ] }),
    ]

    const qss = analyzeQssSource(`
Panel.clip { overflow: hidden; }
Panel.open { overflow: visible; }
`)

    // Use Fragment wrapper (rootId forces a Fragment root)
    // Instead, compile each separately and verify
    const clip = compileQuiTsxProjection(root[0]!, { qss })
    const open = compileQuiTsxProjection(root[1]!, { qss })

    expect(clip.root?.clipChildren).toBe(true)
    expect(open.root?.clipChildren).toBe(false)
  })
})
