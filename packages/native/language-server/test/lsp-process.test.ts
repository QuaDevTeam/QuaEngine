import type {
  CodeActionLike,
  CompletionItemLike,
  CompletionListLike,
  DocumentLinkLike,
  HoverLike,
  LocationLike,
  WorkspaceEditLike,
} from './lsp-process-harness'
import { Buffer } from 'node:buffer'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import {
  LspProcessClient,
  applyTextEdits,
  completionItems,
  hoverText,
  positionAtOffset,
  rangeAtOffset,
  runLspProcessBuilds,
} from './lsp-process-harness'

let client: LspProcessClient | undefined

describe('@quajs/native-language-server process', () => {
  beforeAll(async () => {
    await runLspProcessBuilds()
  }, 120_000)

  afterEach(async () => {
    await client?.dispose()
    client = undefined
  })

  it('serves editor requests over stdio without target runtime adapters', async () => {
    const quiUri = 'file:///project/ui/menu.qui'
    const qssUri = 'file:///project/ui/menu.qss'
    const qui = 'import style "./menu.qss";\nPanel.dialog(id: "main-panel") { Button.primary { Text { "Open" } } }'
    const qss = 'Panel.dialog, Button.primary, #main-panel { color: #fff; }'

    client = new LspProcessClient()

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

  it('resolves asset document links against files that are not open text documents', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'qua-native-lsp-'))
    try {
      await mkdir(join(tempDir, 'ui/assets'), { recursive: true })
      await writeFile(join(tempDir, 'ui/assets/poster.png'), Buffer.from([0x89, 0x50, 0x4E, 0x47]))
      await writeFile(join(tempDir, 'ui/assets/bg.png'), Buffer.from([0x89, 0x50, 0x4E, 0x47]))

      const quiPath = join(tempDir, 'ui/menu.qui')
      const qssPath = join(tempDir, 'ui/menu.qss')
      const assetUri = pathToFileURL(join(tempDir, 'ui/assets/poster.png')).href
      const qssAssetUri = pathToFileURL(join(tempDir, 'ui/assets/bg.png')).href
      const quiUri = pathToFileURL(quiPath).href
      const qssUri = pathToFileURL(qssPath).href
      const rootUri = pathToFileURL(tempDir).href
      const qui = [
        'Image(src: "assets/poster.png")',
        'Image(src: "assets/missing.png")',
      ].join('\n')
      const qss = [
        'Panel.hero { background-image: asset("assets/bg.png"); }',
        'Panel.missing { background-image: asset("assets/missing-bg.png"); }',
      ].join('\n')

      client = new LspProcessClient()
      await client.request('initialize', {
        capabilities: {},
        initializationOptions: {
          quaNative: {
            lint: {
              strictComponents: true,
            },
          },
        },
        processId: process.pid,
        rootUri,
      })

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

      const qssDiagnostics = await client.waitForDiagnostics(qssUri)
      expect(qssDiagnostics).toEqual([
        expect.objectContaining({
          code: 'NATIVE_UI_ASSET_MISSING',
          message: 'Native UI asset "assets/missing-bg.png" could not be resolved.',
          severity: 2,
        }),
      ])
      const quiDiagnostics = await client.waitForDiagnostics(quiUri)
      expect(quiDiagnostics).toEqual([
        expect.objectContaining({
          code: 'NATIVE_UI_ASSET_MISSING',
          message: 'Native UI asset "assets/missing.png" could not be resolved.',
          severity: 2,
        }),
      ])

      const quiLinks = await client.request<DocumentLinkLike[]>('textDocument/documentLink', {
        textDocument: {
          uri: quiUri,
        },
      })

      expect(quiLinks).toHaveLength(2)
      expect(quiLinks[0]).toEqual(expect.objectContaining({
        tooltip: 'Missing assets/missing.png',
      }))
      expect(quiLinks[0]?.target).toBeUndefined()
      expect(quiLinks[1]).toEqual(expect.objectContaining({
        target: assetUri,
        tooltip: 'Open assets/poster.png',
      }))

      const qssLinks = await client.request<DocumentLinkLike[]>('textDocument/documentLink', {
        textDocument: {
          uri: qssUri,
        },
      })

      expect(qssLinks).toHaveLength(2)
      expect(qssLinks[0]).toEqual(expect.objectContaining({
        target: qssAssetUri,
        tooltip: 'Open assets/bg.png',
      }))
      expect(qssLinks[1]).toEqual(expect.objectContaining({
        tooltip: 'Missing assets/missing-bg.png',
      }))
      expect(qssLinks[1]?.target).toBeUndefined()

      const quiActions = await client.request<CodeActionLike[]>('textDocument/codeAction', {
        context: {
          diagnostics: quiDiagnostics,
        },
        range: rangeAtOffset(qui, qui.indexOf('assets/missing.png'), 'assets/missing.png'.length),
        textDocument: {
          uri: quiUri,
        },
      })
      const quiQuickFix = quiActions.find(action => action.kind === 'quickfix')
      const quiFixAll = quiActions.find(action => action.kind === 'source.fixAll.quaNativeAssets')
      expect(quiQuickFix).toEqual(expect.objectContaining({
        title: 'Remove missing native UI asset reference',
      }))
      expect(applyTextEdits(qui, quiQuickFix?.edit?.changes?.[quiUri] ?? [])).toBe('Image(src: "assets/poster.png")\nImage()')
      expect(applyTextEdits(qui, quiFixAll?.edit?.changes?.[quiUri] ?? [])).toBe('Image(src: "assets/poster.png")\nImage()')

      const qssActions = await client.request<CodeActionLike[]>('textDocument/codeAction', {
        context: {
          diagnostics: qssDiagnostics,
        },
        range: rangeAtOffset(qss, qss.indexOf('assets/missing-bg.png'), 'assets/missing-bg.png'.length),
        textDocument: {
          uri: qssUri,
        },
      })
      const qssQuickFix = qssActions.find(action => action.kind === 'quickfix')
      expect(qssQuickFix).toEqual(expect.objectContaining({
        title: 'Remove missing native UI asset reference',
      }))
      expect(applyTextEdits(qss, qssQuickFix?.edit?.changes?.[qssUri] ?? []))
        .toBe('Panel.hero { background-image: asset("assets/bg.png"); }\nPanel.missing {}')
    }
    finally {
      await rm(tempDir, { force: true, recursive: true })
    }
  }, 30_000)

  it('offers quick fixes for invalid QUI asset references from compiler diagnostics', async () => {
    const quiUri = 'file:///project/ui/invalid-assets.qui'
    const qui = 'Image(src: "../escape.png", asset-type: "../bad")'

    client = new LspProcessClient()
    await client.request('initialize', {
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

    client.notify('initialized', {})
    client.notify('textDocument/didOpen', {
      textDocument: {
        languageId: 'qua-ui',
        text: qui,
        uri: quiUri,
        version: 1,
      },
    })

    const diagnostics = await client.waitForDiagnostics(quiUri)
    expect(diagnostics).toEqual([
      expect.objectContaining({
        code: 'QUI_INVALID_ASSET_REFERENCE',
      }),
      expect.objectContaining({
        code: 'QUI_INVALID_ASSET_REFERENCE',
      }),
    ])

    const actions = await client.request<CodeActionLike[]>('textDocument/codeAction', {
      context: {
        diagnostics,
      },
      range: rangeAtOffset(qui, qui.indexOf('../escape.png'), '../escape.png'.length),
      textDocument: {
        uri: quiUri,
      },
    })
    const quickFix = actions.find(action => action.kind === 'quickfix')
    const fixAll = actions.find(action => action.kind === 'source.fixAll.quaNativeAssets')

    expect(quickFix).toEqual(expect.objectContaining({
      title: 'Remove invalid native UI asset reference',
    }))
    expect(applyTextEdits(qui, quickFix?.edit?.changes?.[quiUri] ?? [])).toBe('Image(asset-type: "../bad")')
    expect(applyTextEdits(qui, fixAll?.edit?.changes?.[quiUri] ?? [])).toBe('Image()')
  }, 30_000)
})
