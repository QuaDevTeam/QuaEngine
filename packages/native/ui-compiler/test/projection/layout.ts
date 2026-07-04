import { describe, expect, it } from 'vitest'
import {
  analyzeQssSource,
  analyzeQuiSource,
  compileNativeUiSurfaceProjection,
} from '../../src'

describe('@quajs/native-ui-compiler projection structural layout', () => {
  it('applies QSS alignment and distribution to structural Row and Column children', () => {
    const qui = analyzeQuiSource(`
Panel(id: "root", width: 520, height: 320) {
  Row.toolbar(id: "toolbar", x: 20, y: 30, width: 300, height: 60) {
    Button(id: "save", label: "Save", width: 80, height: 20)
    Button(id: "load", label: "Load", width: 70, height: 30)
  }
  Column.choices(id: "choices", x: 360, y: 40, width: 120, height: 180) {
    Text(id: "choice-a", width: 60, height: 20) { "A" }
    Text(id: "choice-b", width: 80, height: 20) { "B" }
    Text(id: "choice-c", width: 50, height: 20) { "C" }
  }
}
`)
    const qss = analyzeQssSource(`
Row.toolbar {
  gap: 10px;
  justify-content: center;
  align-items: flex-end;
}
Column.choices {
  row-gap: 5px;
  justify-content: space-between;
  align-items: center;
}
`)

    expect(qui.diagnostics).toEqual([])
    expect(qss.diagnostics).toEqual([])
    expect(compileNativeUiSurfaceProjection(qui, { qss })).toEqual({
      root: {
        id: 'root',
        kind: 'Panel',
        bounds: { x: 0, y: 0, width: 520, height: 320 },
        children: [
          {
            id: 'toolbar',
            kind: 'Row',
            bounds: { x: 20, y: 30, width: 300, height: 60 },
            children: [
              {
                id: 'save',
                kind: 'Button',
                bounds: { x: 90, y: 70, width: 80, height: 20 },
                text: 'Save',
              },
              {
                id: 'load',
                kind: 'Button',
                bounds: { x: 180, y: 60, width: 70, height: 30 },
                text: 'Load',
              },
            ],
          },
          {
            id: 'choices',
            kind: 'Column',
            bounds: { x: 360, y: 40, width: 120, height: 180 },
            children: [
              {
                id: 'choice-a',
                kind: 'Text',
                bounds: { x: 390, y: 40, width: 60, height: 20 },
                text: 'A',
              },
              {
                id: 'choice-b',
                kind: 'Text',
                bounds: { x: 380, y: 120, width: 80, height: 20 },
                text: 'B',
              },
              {
                id: 'choice-c',
                kind: 'Text',
                bounds: { x: 395, y: 200, width: 50, height: 20 },
                text: 'C',
              },
            ],
          },
        ],
      },
    })
  })

  it('applies QSS content-box sizing to fallback bounds while QUI size props stay authoritative', () => {
    const qui = analyzeQuiSource(`
Panel(id: "root", width: 360, height: 220) {
  Button.content(id: "content", label: "Content")
  Button.border(id: "border", label: "Border")
  Button.override(id: "override", label: "Override", width: 50, height: 20)
}
`)
    const qss = analyzeQssSource(`
Button {
  left: 20px;
  width: 100px;
  height: 40px;
  padding: 5px 10px;
  border-width: 2px;
}
Button.content {
  top: 20px;
  box-sizing: content-box;
}
Button.border {
  top: 90px;
  box-sizing: border-box;
}
Button.override {
  top: 150px;
  box-sizing: content-box;
  padding: 10px;
  border-width: 5px;
}
`)

    expect(qui.diagnostics).toEqual([])
    expect(qss.diagnostics).toEqual([])
    expect(compileNativeUiSurfaceProjection(qui, { qss })).toEqual({
      root: {
        id: 'root',
        kind: 'Panel',
        bounds: { x: 0, y: 0, width: 360, height: 220 },
        children: [
          {
            id: 'content',
            kind: 'Button',
            bounds: { x: 20, y: 20, width: 124, height: 54 },
            text: 'Content',
            style: {
              borderWidth: 2,
              padding: { top: 5, right: 10, bottom: 5, left: 10 },
            },
          },
          {
            id: 'border',
            kind: 'Button',
            bounds: { x: 20, y: 90, width: 100, height: 40 },
            text: 'Border',
            style: {
              borderWidth: 2,
              padding: { top: 5, right: 10, bottom: 5, left: 10 },
            },
          },
          {
            id: 'override',
            kind: 'Button',
            bounds: { x: 20, y: 150, width: 50, height: 20 },
            text: 'Override',
            style: {
              borderWidth: 5,
              padding: { top: 10, right: 10, bottom: 10, left: 10 },
            },
          },
        ],
      },
    })
  })
})
