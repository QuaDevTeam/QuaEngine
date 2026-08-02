import { describe, expect, it } from 'vitest'
import { Button, Column, Panel, Row, Text } from '@quajs/native-ui'
import { analyzeQssSource, compileQuiTsxProjection } from '../../src'
import { withDefaultVisible } from './helpers'

describe('@quajs/native-ui-compiler projection structural layout', () => {
  it('applies QSS alignment and distribution to structural Row and Column children', () => {
    const root = Panel({ id: 'root', x: 0, y: 0, width: 520, height: 320, children: [
      Row({ id: 'toolbar', class: 'toolbar', x: 20, y: 30, width: 300, height: 60, children: [
        // No explicit width/height — let QSS provide them
        Button({ id: 'save', children: 'Save' }),
        Button({ id: 'load', children: 'Load' }),
      ] }),
      Column({ id: 'choices', class: 'choices', x: 360, y: 40, width: 120, height: 180, children: [
        Text({ id: 'choice-a', children: 'A' }),
        Text({ id: 'choice-b', children: 'B' }),
        Text({ id: 'choice-c', children: 'C' }),
      ] }),
    ] })

    const qss = analyzeQssSource(`
Row.toolbar  { gap: 10px; justify-content: center; align-items: flex-end; }
Column.choices { row-gap: 5px; justify-content: space-between; align-items: center; }
Button { width: 80px; height: 20px; }
Button#load { width: 70px; height: 30px; }
Text { width: 60px; height: 20px; }
Text#choice-b { width: 80px; }
Text#choice-c { width: 50px; }
`)

    expect(compileQuiTsxProjection(root, { qss })).toEqual(withDefaultVisible({
      root: {
        id: 'root', kind: 'Panel', bounds: { x: 0, y: 0, width: 520, height: 320 },
        children: [
          { id: 'toolbar', kind: 'Row', bounds: { x: 20, y: 30, width: 300, height: 60 }, children: [
            { id: 'save', kind: 'Button', bounds: { x: 90, y: 70, width: 80, height: 20 }, text: 'Save' },
            { id: 'load', kind: 'Button', bounds: { x: 180, y: 60, width: 70, height: 30 }, text: 'Load' },
          ] },
          { id: 'choices', kind: 'Column', bounds: { x: 360, y: 40, width: 120, height: 180 }, children: [
            { id: 'choice-a', kind: 'Text', bounds: { x: 390, y: 40, width: 60, height: 20 }, text: 'A' },
            { id: 'choice-b', kind: 'Text', bounds: { x: 380, y: 120, width: 80, height: 20 }, text: 'B' },
            { id: 'choice-c', kind: 'Text', bounds: { x: 395, y: 200, width: 50, height: 20 }, text: 'C' },
          ] },
        ],
      },
    }))
  })

  it('applies QSS box-sizing to fallback bounds while explicit size props stay authoritative', () => {
    const root = Panel({ id: 'root', x: 0, y: 0, width: 360, height: 220, children: [
      Button({ id: 'content', class: 'content', children: 'Content' }),
      Button({ id: 'border', class: 'border', children: 'Border' }),
      // explicit width/height override QSS sizing
      Button({ id: 'override', class: 'override', width: 50, height: 20, children: 'Override' }),
    ] })

    const qss = analyzeQssSource(`
Button { left: 20px; width: 100px; height: 40px; padding: 5px 10px; border-width: 2px; }
Button.content { top: 20px; box-sizing: content-box; }
Button.border  { top: 90px; box-sizing: border-box; }
Button.override { top: 150px; box-sizing: content-box; padding: 10px; border-width: 5px; }
`)

    expect(compileQuiTsxProjection(root, { qss })).toEqual(withDefaultVisible({
      root: {
        id: 'root', kind: 'Panel', bounds: { x: 0, y: 0, width: 360, height: 220 },
        children: [
          { id: 'content', kind: 'Button', bounds: { x: 20, y: 20, width: 124, height: 54 }, text: 'Content',
            style: { borderWidth: 2, padding: { top: 5, right: 10, bottom: 5, left: 10 } } },
          { id: 'border', kind: 'Button', bounds: { x: 20, y: 90, width: 100, height: 40 }, text: 'Border',
            style: { borderWidth: 2, padding: { top: 5, right: 10, bottom: 5, left: 10 } } },
          { id: 'override', kind: 'Button', bounds: { x: 20, y: 150, width: 50, height: 20 }, text: 'Override',
            style: { borderWidth: 5, padding: { top: 10, right: 10, bottom: 10, left: 10 } } },
        ],
      },
    }))
  })
})
