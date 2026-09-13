import { describe, expect, it } from 'vitest'
import { NativeLanguageServerSession } from '../src/server-session'

describe('@quajs/native-language-server session', () => {
  it('normalizes initialization and workspace settings for document options', () => {
    const session = new NativeLanguageServerSession()
    const document = nativeDocument('file:///project/ui/menu.qui', 'Panel {}')

    session.setInitializationOptions({
      settings: {
        format: {
          indentSize: 4,
        },
        lint: {
          strictComponents: true,
        },
      },
    })

    expect(session.documentOptions(document)).toEqual(expect.objectContaining({
      filePath: '/project/ui/menu.qui',
      format: {
        indentSize: 4,
      },
      lint: {
        strictComponents: true,
      },
    }))

    session.setWorkspaceConfiguration({
      quaNative: {
        lint: {
          maxSelectorDepth: 2,
        },
      },
    })

    expect(session.documentOptions(document)).toEqual(expect.objectContaining({
      lint: {
        maxSelectorDepth: 2,
      },
    }))
  })

  it('combines compiler diagnostics with missing native asset diagnostics', () => {
    const session = new NativeLanguageServerSession({
      resolveDocumentLink: link => link.path === 'assets/external.png'
        ? {
            ...link,
            resolved: true,
            targetUri: link.candidateUri,
          }
        : link,
    })
    const source = [
      'Text(if: ready = true) { "Ready" }',
      'Image(src: "assets/missing.png")',
      'Image(src: "assets/present.png")',
      'Image(src: "assets/external.png")',
    ].join('\n')
    const document = nativeDocument('file:///project/ui/menu.qui', source)
    const index = session.projectIndex([
      document,
      nativeDocument('file:///project/ui/assets/present.png', '', 'plaintext'),
    ])

    expect(session.diagnosticsForDocument(index, document.uri))
      .toEqual(expect.arrayContaining([
        expect.objectContaining({
          code: 'QUI_UNSAFE_EXPRESSION',
          source: 'qui',
        }),
        expect.objectContaining({
          code: 'NATIVE_UI_ASSET_MISSING',
          message: 'Native UI asset "assets/missing.png" could not be resolved.',
          source: 'native-ui',
        }),
      ]))
    expect(session.diagnosticsForDocument(index, document.uri)
      .filter(diagnostic => diagnostic.code === 'NATIVE_UI_ASSET_MISSING'))
      .toHaveLength(1)
  })

  it('finds the indexed reference under an LSP position', () => {
    const session = new NativeLanguageServerSession()
    const source = 'Panel.dialog { Button.primary { Text { "Open" } } }'
    const document = nativeDocument('file:///project/ui/menu.qui', source)
    const index = session.projectIndex([document])

    expect(session.findReferenceAtPosition(index, {
      position: {
        character: source.indexOf('primary') + 1,
        line: 0,
      },
      textDocument: {
        uri: document.uri,
      },
    })).toEqual(expect.objectContaining({
      kind: 'class',
      name: 'primary',
      uri: document.uri,
    }))
  })
})

function nativeDocument(uri: string, source: string, languageId = 'qua-ui') {
  return {
    getText: () => source,
    languageId,
    uri,
    version: 1,
  }
}
