import { describe, expect, it } from 'vitest'
import {
  buildNativeUiProjectIndex,
  createNativeUiProjectRenameEdits,
  findNativeUiProjectDefinitions,
  findNativeUiProjectReferences,
  getNativeUiProjectDocumentLinks,
  updateNativeUiProjectIndex,
} from '../src'
import { rangeOf } from './language-server-test-utils'

describe('@quajs/native-language-server project index', () => {
  it('builds an in-memory project index for QUI and QSS authoring files', () => {
    const index = buildNativeUiProjectIndex([
      {
        uri: 'file:///project/menu.qui',
        source: 'import style "./menu.qss";\nPanel.dialog { slot body { Button(action: ui.close()) { Text { "Close" } } } }',
      },
      {
        uri: 'file:///project/menu.qss',
        source: 'Panel.dialog { color: #fff; opacity: 0.8; }',
      },
      {
        uri: 'file:///project/readme.md',
        source: '# ignored',
      },
    ], {
      language: {
        lint: {
          strictComponents: true,
        },
      },
    })

    expect(index.summary).toEqual({
      assetReferences: 0,
      classes: 1,
      componentImports: 0,
      components: 3,
      diagnostics: 0,
      documentBytes: expect.any(Number),
      documentCount: 2,
      qssDeclarations: 2,
      qssDocumentCount: 1,
      qssRules: 1,
      ids: 0,
      quiDocumentCount: 1,
      skippedDocumentCount: 1,
      styleImports: 1,
      tokenImports: 0,
    })
    expect(index.documents.map(document => document.uri)).toEqual([
      'file:///project/menu.qss',
      'file:///project/menu.qui',
    ])
    expect(index.skippedDocuments).toEqual(['file:///project/readme.md'])
  })

  it('indexes QUI references from the structured AST without treating slots as components', () => {
    const index = buildNativeUiProjectIndex([
      {
        uri: 'file:///project/menu.qui',
        source: 'Panel.dialog { slot Header { Button.primary { Text { "Open" } } } }',
      },
    ])

    expect(index.summary.components).toBe(3)
    expect(findNativeUiProjectReferences(index, { kind: 'component' }).map(reference => reference.name))
      .toEqual(['Button', 'Panel', 'Text'])
    expect(findNativeUiProjectReferences(index, { kind: 'component', name: 'Header' }))
      .toEqual([])
    expect(findNativeUiProjectReferences(index, { kind: 'class' }).map(reference => reference.name))
      .toEqual(['dialog', 'primary'])
  })

  it('indexes precise QUI class reference ranges for chained component classes', () => {
    const source = 'Panel.dialog.primary { Button.cta { Text { "Open" } } }'
    const index = buildNativeUiProjectIndex([
      {
        uri: 'file:///project/menu.qui',
        source,
      },
    ])
    const document = index.documents.find(document => document.uri.endsWith('menu.qui'))

    expect(document?.classReferences).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: 'dialog',
        range: rangeOf(source, 'dialog'),
      }),
      expect.objectContaining({
        name: 'primary',
        range: rangeOf(source, 'primary'),
      }),
      expect.objectContaining({
        name: 'cta',
        range: rangeOf(source, 'cta'),
      }),
    ]))
    expect(findNativeUiProjectDefinitions(index, { kind: 'class', name: 'primary' }))
      .toEqual([
        expect.objectContaining({
          kind: 'class',
          name: 'primary',
          range: rangeOf(source, 'primary'),
          source: 'qui-node',
          uri: 'file:///project/menu.qui',
        }),
      ])
  })

  it('indexes id references across QUI ids and QSS selectors', () => {
    const index = buildNativeUiProjectIndex([
      {
        uri: 'file:///project/menu.qui',
        source: 'Panel(id: "main-panel") { Button.primary { Text { "Open" } } }',
      },
      {
        uri: 'file:///project/menu.qss',
        source: '#main-panel { background-color: #10141f; }\nPanel#main-panel Button.primary { color: #fff; }',
      },
    ])

    expect(index.summary.ids).toBe(1)
    expect(index.documents.find(document => document.uri.endsWith('menu.qui'))?.ids).toEqual(['main-panel'])
    expect(index.documents.find(document => document.uri.endsWith('menu.qui'))?.idReferences[0]?.range).toEqual({
      start: {
        character: 11,
        line: 0,
      },
      end: {
        character: 21,
        line: 0,
      },
    })
    expect(index.documents.find(document => document.uri.endsWith('menu.qss'))?.idReferences[0]?.range).toEqual({
      start: {
        character: 1,
        line: 0,
      },
      end: {
        character: 11,
        line: 0,
      },
    })
    expect(findNativeUiProjectReferences(index, { kind: 'id', name: 'main-panel' }))
      .toEqual(expect.arrayContaining([
        expect.objectContaining({
          kind: 'id',
          name: 'main-panel',
          source: 'qui-node',
          uri: 'file:///project/menu.qui',
        }),
        expect.objectContaining({
          kind: 'id',
          name: 'main-panel',
          source: 'qss-selector',
          uri: 'file:///project/menu.qss',
        }),
      ]))
    expect(findNativeUiProjectDefinitions(index, { kind: 'id', name: 'main-panel' }))
      .toEqual([
        expect.objectContaining({
          kind: 'id',
          name: 'main-panel',
          source: 'qui-node',
          uri: 'file:///project/menu.qui',
        }),
      ])
  })

  it('creates cross-document rename edits for indexed QUI and QSS symbols', () => {
    const qui = 'Panel.dialog(id: "main-panel") { Button.primary { Text { "Open" } } }'
    const qss = '#main-panel { background-color: #10141f; }\nPanel.dialog Button.primary { color: #fff; }'
    const index = buildNativeUiProjectIndex([
      {
        uri: 'file:///project/menu.qui',
        source: qui,
      },
      {
        uri: 'file:///project/menu.qss',
        source: qss,
      },
    ])

    expect(createNativeUiProjectRenameEdits(index, {
      kind: 'id',
      name: 'main-panel',
      newName: 'settings-panel',
    })).toEqual([
      {
        newText: 'settings-panel',
        range: rangeOf(qss, 'main-panel'),
        uri: 'file:///project/menu.qss',
      },
      {
        newText: 'settings-panel',
        range: rangeOf(qui, 'main-panel'),
        uri: 'file:///project/menu.qui',
      },
    ])

    expect(createNativeUiProjectRenameEdits(index, {
      kind: 'class',
      name: 'primary',
      newName: 'secondary',
    })).toEqual([
      {
        newText: 'secondary',
        range: rangeOf(qss, 'primary'),
        uri: 'file:///project/menu.qss',
      },
      {
        newText: 'secondary',
        range: rangeOf(qui, 'primary'),
        uri: 'file:///project/menu.qui',
      },
    ])

    expect(createNativeUiProjectRenameEdits(index, {
      kind: 'component',
      name: 'Button',
      newName: 'cta-button',
    })).toEqual([])
  })

  it('returns definition candidates using QUI declarations before QSS references', () => {
    const index = buildNativeUiProjectIndex([
      {
        uri: 'file:///project/ui/menu.qui',
        source: 'Panel.dialog { Button.primary { Text { "Open" } } }',
      },
      {
        uri: 'file:///project/ui/menu.qss',
        source: 'Panel.dialog, Button.primary { color: #fff; }',
      },
    ])

    expect(findNativeUiProjectDefinitions(index, { kind: 'component', name: 'Button' }))
      .toEqual([
        expect.objectContaining({
          kind: 'component',
          name: 'Button',
          source: 'qui-node',
          uri: 'file:///project/ui/menu.qui',
        }),
      ])
    expect(findNativeUiProjectDefinitions(index, { kind: 'class', name: 'primary' }))
      .toEqual([
        expect.objectContaining({
          kind: 'class',
          name: 'primary',
          source: 'qui-node',
          uri: 'file:///project/ui/menu.qui',
        }),
      ])
    expect(findNativeUiProjectDefinitions(index, { kind: 'class', name: 'only-qss' }))
      .toEqual([])
  })

  it('updates a native UI project index incrementally', () => {
    const initial = buildNativeUiProjectIndex([
      {
        uri: 'file:///project/menu.qui',
        source: 'Panel { slot body { Text { "Ready" } } }',
      },
      {
        uri: 'file:///project/menu.qss',
        source: 'Panel { color: #fff; }',
      },
    ])
    const unchangedQss = initial.documents.find(document => document.uri.endsWith('menu.qss'))
    const updated = updateNativeUiProjectIndex(initial, [
      {
        uri: 'file:///project/menu.qui',
        source: 'Panel { slot body { Text(if: ready = true) { "Ready" } } }',
        version: 2,
      },
    ])

    expect(updated.summary.diagnostics).toBe(1)
    expect(updated.documents.find(document => document.uri.endsWith('menu.qui'))?.version).toBe(2)
    expect(updated.documents.find(document => document.uri.endsWith('menu.qss'))).toBe(unchangedQss)

    const noOp = updateNativeUiProjectIndex(initial, [
      {
        uri: 'file:///project/menu.qss',
      },
    ])
    expect(noOp.documents.find(document => document.uri.endsWith('menu.qss'))).toBe(unchangedQss)

    const deleted = updateNativeUiProjectIndex(updated, [
      {
        deleted: true,
        uri: 'file:///project/menu.qss',
      },
    ])
    expect(deleted.summary.qssDocumentCount).toBe(0)
  })

  it('resolves project document links and searchable references', () => {
    const index = buildNativeUiProjectIndex([
      {
        uri: 'file:///project/ui/menu.qui',
        source: 'import style "./menu.qss";\nPanel.dialog { Button.primary { Text { "Open" } } }',
      },
      {
        uri: 'file:///project/ui/menu.qss',
        source: 'Panel.dialog, Button.primary { color: #fff; }',
      },
      {
        uri: 'file:///project/ui/sidebar.qui',
        source: 'import style "./missing.qss";\nPanel.sidebar {}',
      },
    ])

    expect(getNativeUiProjectDocumentLinks(index, 'file:///project/ui/menu.qui')).toEqual([
      expect.objectContaining({
        candidateUri: 'file:///project/ui/menu.qss',
        kind: 'style',
        path: './menu.qss',
        resolved: true,
        sourceUri: 'file:///project/ui/menu.qui',
        targetUri: 'file:///project/ui/menu.qss',
      }),
    ])
    expect(getNativeUiProjectDocumentLinks(index, 'file:///project/ui/sidebar.qui')).toEqual([
      expect.objectContaining({
        candidateUri: 'file:///project/ui/missing.qss',
        path: './missing.qss',
        resolved: false,
        targetUri: undefined,
      }),
    ])
    expect(findNativeUiProjectReferences(index, { kind: 'class', name: 'dialog' }))
      .toEqual(expect.arrayContaining([
        expect.objectContaining({
          kind: 'class',
          name: 'dialog',
          source: 'qui-node',
          uri: 'file:///project/ui/menu.qui',
        }),
        expect.objectContaining({
          kind: 'class',
          name: 'dialog',
          source: 'qss-selector',
          uri: 'file:///project/ui/menu.qss',
        }),
      ]))
    expect(findNativeUiProjectReferences(index, { kind: 'component', name: 'Button' }))
      .toEqual(expect.arrayContaining([
        expect.objectContaining({
          kind: 'component',
          name: 'Button',
          source: 'qui-node',
          uri: 'file:///project/ui/menu.qui',
        }),
        expect.objectContaining({
          kind: 'component',
          name: 'Button',
          source: 'qss-selector',
          uri: 'file:///project/ui/menu.qss',
        }),
      ]))
    expect(findNativeUiProjectReferences(index, { kind: 'id' })).toEqual([])
  })
})
