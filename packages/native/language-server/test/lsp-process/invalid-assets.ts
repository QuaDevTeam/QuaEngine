import type { CodeActionLike } from '../lsp-process-harness'
import process from 'node:process'
import { describe, expect, it } from 'vitest'
import { applyTextEdits, rangeAtOffset } from '../lsp-process-harness'
import { createClient } from './setup'

describe('@quajs/native-language-server process invalid asset fixes', () => {
  it('offers quick fixes for invalid QUI asset references from compiler diagnostics', async () => {
    const quiUri = 'file:///project/ui/invalid-assets.qui'
    const qui = 'Image(src: "../escape.png", asset-type: "../bad")'

    const client = createClient()
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
