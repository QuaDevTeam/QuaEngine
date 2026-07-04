import type {
  CompletionItemLike,
  CompletionListLike,
  DocumentLinkLike,
  HoverLike,
  LocationLike,
  WorkspaceEditLike,
} from '../lsp-process-harness'
import process from 'node:process'
import { describe, expect, it } from 'vitest'
import {
  completionItems,
  hoverText,
  positionAtOffset,
  rangeAtOffset,
} from '../lsp-process-harness'
import { createClient } from './setup'

describe('@quajs/native-language-server process editor features', () => {
  it('serves editor requests over stdio without target runtime adapters', async () => {
    const quiUri = 'file:///project/ui/menu.qui'
    const qssUri = 'file:///project/ui/menu.qss'
    const qui = 'import style "./menu.qss";\nPanel.dialog(id: "main-panel") { Button.primary { Text { "Open" } } }'
    const qss = 'Panel.dialog, Button.primary, #main-panel { color: #fff; }'

    const client = createClient()

    const initialize = await client.request<{ capabilities: Record<string, unknown> }>('initialize', {
      capabilities: {},
      initializationOptions: {
        quaNative: {
          lint: {
            strictComponents: true,
          },
        },
      },
      processId: process.pid,
      rootUri: 'file:///project',
    })

    expect(initialize.capabilities).toEqual(expect.objectContaining({
      completionProvider: expect.any(Object),
      codeActionProvider: expect.any(Object),
      definitionProvider: true,
      documentLinkProvider: expect.any(Object),
      hoverProvider: true,
      referencesProvider: true,
      renameProvider: true,
    }))

    client.notify('initialized', {})
    client.notify('textDocument/didOpen', {
      textDocument: {
        languageId: 'qua-style',
        text: qss,
        uri: qssUri,
        version: 1,
      },
    })
    client.notify('textDocument/didOpen', {
      textDocument: {
        languageId: 'qua-ui',
        text: qui,
        uri: quiUri,
        version: 1,
      },
    })

    await expect(client.waitForDiagnostics(qssUri)).resolves.toEqual([])
    await expect(client.waitForDiagnostics(quiUri)).resolves.toEqual([])

    const completion = await client.request<CompletionItemLike[] | CompletionListLike>('textDocument/completion', {
      position: {
        character: 0,
        line: 0,
      },
      textDocument: {
        uri: quiUri,
      },
    })
    expect(completionItems(completion).some(item => item.label === 'Button')).toBe(true)

    const buttonPosition = positionAtOffset(qui, qui.indexOf('Button'))
    const hover = await client.request<HoverLike>('textDocument/hover', {
      position: buttonPosition,
      textDocument: {
        uri: quiUri,
      },
    })
    expect(hoverText(hover)).toContain('Button')

    const links = await client.request<DocumentLinkLike[]>('textDocument/documentLink', {
      textDocument: {
        uri: quiUri,
      },
    })
    expect(links).toEqual([
      expect.objectContaining({
        target: qssUri,
      }),
    ])

    const references = await client.request<LocationLike[]>('textDocument/references', {
      context: {
        includeDeclaration: true,
      },
      position: buttonPosition,
      textDocument: {
        uri: quiUri,
      },
    })
    expect(references).toEqual(expect.arrayContaining([
      expect.objectContaining({
        uri: quiUri,
      }),
      expect.objectContaining({
        uri: qssUri,
      }),
    ]))

    const idReferences = await client.request<LocationLike[]>('textDocument/references', {
      context: {
        includeDeclaration: true,
      },
      position: positionAtOffset(qui, qui.indexOf('main-panel')),
      textDocument: {
        uri: quiUri,
      },
    })
    expect(idReferences).toEqual(expect.arrayContaining([
      expect.objectContaining({
        uri: quiUri,
      }),
      expect.objectContaining({
        uri: qssUri,
      }),
    ]))

    const idDefinition = await client.request<LocationLike[]>('textDocument/definition', {
      position: positionAtOffset(qss, qss.indexOf('main-panel')),
      textDocument: {
        uri: qssUri,
      },
    })
    expect(idDefinition).toEqual([
      expect.objectContaining({
        uri: quiUri,
      }),
    ])

    const idRename = await client.request<WorkspaceEditLike>('textDocument/rename', {
      newName: 'settings-panel',
      position: positionAtOffset(qss, qss.indexOf('main-panel')),
      textDocument: {
        uri: qssUri,
      },
    })
    expect(idRename.changes).toEqual({
      [qssUri]: [
        {
          newText: 'settings-panel',
          range: rangeAtOffset(qss, qss.indexOf('main-panel'), 'main-panel'.length),
        },
      ],
      [quiUri]: [
        {
          newText: 'settings-panel',
          range: rangeAtOffset(qui, qui.indexOf('main-panel'), 'main-panel'.length),
        },
      ],
    })

    const classRename = await client.request<WorkspaceEditLike>('textDocument/rename', {
      newName: 'secondary',
      position: positionAtOffset(qui, qui.indexOf('primary')),
      textDocument: {
        uri: quiUri,
      },
    })
    expect(classRename.changes).toEqual({
      [qssUri]: [
        {
          newText: 'secondary',
          range: rangeAtOffset(qss, qss.indexOf('primary'), 'primary'.length),
        },
      ],
      [quiUri]: [
        {
          newText: 'secondary',
          range: rangeAtOffset(qui, qui.indexOf('primary'), 'primary'.length),
        },
      ],
    })
  }, 30_000)
})
