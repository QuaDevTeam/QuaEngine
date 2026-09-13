import type { CodeActionLike, DocumentLinkLike } from '../lsp-process-harness'
import { Buffer } from 'node:buffer'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'
import { applyTextEdits, rangeAtOffset } from '../lsp-process-harness'
import { createClient } from './setup'

describe('@quajs/native-language-server process asset links', () => {
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
})
