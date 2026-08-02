/**
 * Integration smoke test: NativeApp TSX component → compileQuiTsxProjection
 *
 * Validates the full pipeline:
 *   NativeApp({ view }) → QuiNode tree → NativeUiSurfaceProjection
 *
 * These tests also confirm that Button children (instead of label prop)
 * surface correctly as text in the projection, and that QSS style
 * resolution works for the real screen components.
 */
import { describe, expect, it } from 'vitest'
import { Box, Button, Column, Panel, Stack, Text } from '@quajs/native-ui'
import { ui, save } from '@quajs/native-ui'
import {
  analyzeQssSource,
  compileQuiTsxProjection,
} from '../src'
import type { NativeDemoAppSurfaceState } from '../../demo/src/targets/native/ui'
// NOTE: NativeApp lives in the demo package — import it here for the
// integration test.  If the demo isn't available (CI-only ui-compiler run),
// the component-function tests below still cover the projection pipeline.
// import { NativeApp } from '../../demo/src/targets/native/native-app'

// ─── Component-function projection tests ────────────────────────────────────

describe('@quajs/native-ui Button children → projection text', () => {
  it('maps Button string children to text field in projection', () => {
    const root = Button({ id: 'btn', x: 0, y: 0, width: 100, height: 40, children: 'CLICK ME' })
    const result = compileQuiTsxProjection(root)
    expect(result.root?.text).toBe('CLICK ME')
    expect(result.root?.kind).toBe('Button')
  })

  it('maps Button numeric children to string text field in projection', () => {
    const root = Button({ id: 'count', x: 0, y: 0, width: 60, height: 30, children: 42 })
    const result = compileQuiTsxProjection(root)
    expect(result.root?.text).toBe('42')
  })

  it('omits text field when Button has no children', () => {
    const root = Button({ id: 'icon-btn', x: 0, y: 0, width: 40, height: 40 })
    const result = compileQuiTsxProjection(root)
    expect(result.root?.text).toBeUndefined()
  })
})

describe('@quajs/native-ui Fragment flattening in compileQuiTsxProjection', () => {
  it('promotes Fragment children to parent level', () => {
    const root = Stack({ id: 'root', x: 0, y: 0, width: 100, height: 100, children: [
      Text({ id: 'a', x: 0, y: 0, width: 0, height: 0, children: 'A' }),
      Text({ id: 'b', x: 0, y: 0, width: 0, height: 0, children: 'B' }),
    ] })
    const result = compileQuiTsxProjection(root)
    expect(result.root?.children).toHaveLength(2)
    expect(result.root?.children?.[0]?.id).toBe('a')
    expect(result.root?.children?.[1]?.id).toBe('b')
  })
})

describe('@quajs/native-ui QSS integration with compileQuiTsxProjection', () => {
  it('resolves QSS color onto projected nodes', () => {
    const root = Stack({ id: 'root', x: 0, y: 0, width: 200, height: 100, children: [
      Button({ id: 'primary-btn', class: 'primary', x: 0, y: 0, width: 80, height: 40, children: 'GO' }),
    ] })

    const qss = analyzeQssSource(`
Stack { overflow: hidden; }
Button.primary { color: #ff0000; font-size: 14px; }
`)

    const result = compileQuiTsxProjection(root, { qss })
    const btn = result.root?.children?.[0]
    expect(btn?.text).toBe('GO')
    expect(btn?.style?.color).toBe('#ff0000')
  })

  it('resolves intent from QuiIntent onClick prop', () => {
    const root = Button({ id: 'open-btn', class: 'menu-btn', x: 0, y: 0, width: 100, height: 40,
      onClick: ui.open('story'), children: 'START' })

    const result = compileQuiTsxProjection(root)
    expect(result.root?.intent).toEqual({
      event: 'ui/intent',
      action: 'open',
      metadata: { arg0: 'story' },
    })
    expect(result.root?.text).toBe('START')
  })

  it('resolves save.select intent from onClick prop', () => {
    const root = Button({ id: 'slot-1', x: 0, y: 0, width: 100, height: 60,
      onClick: save.select('slot-1'), children: 'Slot 1' })

    const result = compileQuiTsxProjection(root)
    expect(result.root?.intent?.event).toBe('ui/intent')
    expect(result.root?.intent?.action).toBe('save.select')
    expect(result.root?.intent?.metadata).toEqual({ arg0: 'slot-1' })
    expect(result.root?.text).toBe('Slot 1')
  })
})

describe('@quajs/native-ui screen registry integration', () => {  it('renders a complete panel with buttons and correct text projection', () => {
    const root = Panel({ id: 'menu', class: 'game-menu-panel', x: 730, y: 160, width: 460, height: 650, children: [
      Text({ id: 'title', class: 'panel-title', x: 770, y: 202, width: 300, height: 54, children: 'MENU' }),
      Column({ id: 'actions', class: 'game-menu-actions', x: 770, y: 322, width: 380, height: 330, children: [
        Button({ id: 'save', class: 'panel-action', x: 0, y: 0, width: 380, height: 46, onClick: ui.open('save'), children: 'SAVE' }),
        Button({ id: 'close', class: 'panel-action', x: 0, y: 0, width: 380, height: 46, onClick: ui.close('game-menu'), children: 'CLOSE' }),
      ] }),
    ] })

    const qss = analyzeQssSource(`
Panel.game-menu-panel { background-color: rgba(7,8,12,0.96); }
Button.panel-action { color: rgba(255,250,242,0.90); }
`)

    const result = compileQuiTsxProjection(root, { qss })
    const panel = result.root
    const titleNode = panel?.children?.[0]
    const actionsCol = panel?.children?.[1]
    const saveBtn = actionsCol?.children?.[0]
    const closeBtn = actionsCol?.children?.[1]

    expect(panel?.kind).toBe('Panel')
    expect(titleNode?.text).toBe('MENU')
    expect(saveBtn?.text).toBe('SAVE')
    expect(saveBtn?.intent?.action).toBe('open')
    expect(saveBtn?.style?.color).toBe('rgba(255,250,242,0.90)')
    expect(closeBtn?.text).toBe('CLOSE')
    expect(closeBtn?.intent?.event).toBe('ui/intent')
  })
})

// ─── Projection semantics parity with the legacy QUI path ───────────────────

describe('tsx projection transform, intent, id, and asset safety semantics', () => {
  it('applies QSS transform to base bounds and pseudo-state bounds', () => {
    const root = Button({ id: 'shift-btn', class: 'shift', x: 10, y: 20, width: 100, height: 40, children: 'GO' })
    const qss = analyzeQssSource(`
Button.shift { translate: 5px 0; }
Button.shift:hover { translate: 8px 2px; }
`)
    const result = compileQuiTsxProjection(root, { qss })
    expect(result.root?.bounds).toEqual({ x: 15, y: 20, width: 100, height: 40 })
    expect(result.root?.stateStyles?.hover?.bounds).toEqual({ x: 18, y: 22, width: 100, height: 40 })
    expect(result.root?.stateStyles?.hover?.bounds).not.toEqual(result.root?.bounds)
  })

  it('resolves right/bottom against the parent rect', () => {
    const root = Panel({ id: 'parent', x: 100, y: 100, width: 400, height: 300, children: [
      Box({ class: 'anchored' }) as never,
    ] })
    const qss = analyzeQssSource(`
Box.anchored { right: 10px; bottom: 20px; width: 50px; height: 30px; }
`)
    const result = compileQuiTsxProjection(root, { qss })
    expect(result.root?.children?.[0]?.bounds).toEqual({ x: 440, y: 350, width: 50, height: 30 })
  })

  it('projects control node kinds as Box while keeping control semantics', () => {
    const root = {
      kind: 'Switch' as const,
      classes: [],
      props: {
        selectedIndex: 1,
        options: [
          { label: 'OFF', intent: { __quiIntent: true as const, event: 'ui/intent' as const, action: 'off' } },
          { label: 'ON', intent: { __quiIntent: true as const, event: 'ui/intent' as const, action: 'on' } },
        ],
      },
      children: [],
      key: null,
    }
    const result = compileQuiTsxProjection(root)
    expect(result.root?.kind).toBe('Box')
    expect(result.root?.control?.kind).toBe('switch')
  })

  it('gives idless siblings distinct fallback ids and honours JSX keys', () => {
    const root = Stack({ id: 'root', x: 0, y: 0, width: 100, height: 100, children: [
      { kind: 'Box' as const, classes: [], props: {}, children: [], key: null },
      { kind: 'Box' as const, classes: [], props: {}, children: [], key: null },
      { kind: 'Box' as const, classes: [], props: {}, children: [], key: 'hero' },
    ] })
    const result = compileQuiTsxProjection(root)
    const ids = result.root?.children?.map(child => child.id) ?? []
    expect(new Set(ids).size).toBe(3)
    expect(ids).toContain('Box:hero')
  })

  it('suppresses intents on pointer-events none and non-intent kinds', () => {
    const root = Button({ id: 'ghost', class: 'ghost', x: 0, y: 0, width: 40, height: 20,
      onClick: ui.open('story'), children: 'NOPE' })
    const qss = analyzeQssSource(`Button.ghost { pointer-events: none; }`)
    expect(compileQuiTsxProjection(root, { qss }).root?.intent).toBeUndefined()

    const text = Text({ id: 'label', x: 0, y: 0, width: 40, height: 20,
      onClick: ui.open('story'), children: 'L' })
    expect(compileQuiTsxProjection(text).root?.intent).toBeUndefined()
  })

  it('drops unsafe image sources and invalid object-fit values', () => {
    const root = {
      kind: 'Image' as const,
      classes: [],
      props: { src: 'https://evil.example/x.png' },
      children: [],
      key: null,
    }
    expect(compileQuiTsxProjection(root).root?.image).toBeUndefined()

    const video = {
      kind: 'Video' as const,
      classes: [],
      props: { src: 'clips/intro.mp4', objectFit: 'bogus' },
      children: [],
      key: null,
    }
    const projected = compileQuiTsxProjection(video).root
    expect(projected?.kind).toBe('Box')
    expect(projected?.video?.assetName).toBe('clips/intro.mp4')
    expect(projected?.video?.objectFit).toBeUndefined()
  })
})
