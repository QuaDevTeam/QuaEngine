#!/usr/bin/env node

import type { InitializeParams } from 'vscode-languageserver/node'
import { TextDocument } from 'vscode-languageserver-textdocument'
import {
  CompletionItemKind,
  createConnection,
  DiagnosticSeverity,
  ProposedFeatures,
  TextDocuments,
  TextDocumentSyncKind,
} from 'vscode-languageserver/node'
import { analyzeQuaScript, getQuaScriptCompletions, uriToFilePath } from './index'

const connection = createConnection(ProposedFeatures.all)
const documents = new TextDocuments(TextDocument)
let projectRoot: string | undefined

connection.onInitialize((params: InitializeParams) => {
  projectRoot = resolveProjectRoot(params)
  return {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      completionProvider: {
        triggerCharacters: ['@', '$', '{', '.', ' '],
      },
      hoverProvider: true,
    },
  }
})

documents.onDidChangeContent((change) => {
  validateDocument(change.document).catch((error) => {
    connection.console.error(String(error))
  })
})

documents.onDidOpen((event) => {
  validateDocument(event.document).catch((error) => {
    connection.console.error(String(error))
  })
})

connection.onCompletion(async (params) => {
  const document = documents.get(params.textDocument.uri)
  if (!document) {
    return []
  }

  const completions = await getQuaScriptCompletions(document.getText(), {
    line: params.position.line,
    character: params.position.character,
  }, { projectRoot })

  return completions.map(item => ({
    label: item.kind === 'decorator' ? `@${item.label}` : item.label,
    kind: toCompletionKind(item.kind),
    detail: item.detail,
  }))
})

connection.onHover((params) => {
  const document = documents.get(params.textDocument.uri)
  if (!document) {
    return null
  }

  const word = getWordAt(document.getText(), document.offsetAt(params.position))
  if (!word) {
    return null
  }

  if (word.startsWith('@')) {
    return {
      contents: {
        kind: 'markdown',
        value: `QuaScript decorator \`${word}\``,
      },
    }
  }

  if (word === 'scope') {
    return {
      contents: {
        kind: 'markdown',
        value: '`scope` is the typed data object passed to this `.qs` script factory.',
      },
    }
  }

  return null
})

documents.listen(connection)
connection.listen()

async function validateDocument(document: TextDocument): Promise<void> {
  const analysis = await analyzeQuaScript(document.getText(), { projectRoot })
  connection.sendDiagnostics({
    uri: document.uri,
    diagnostics: analysis.diagnostics.map(diagnostic => ({
      message: diagnostic.message,
      range: diagnostic.range
        ? {
            start: {
              line: diagnostic.range.start.line,
              character: diagnostic.range.start.column,
            },
            end: {
              line: diagnostic.range.end.line,
              character: diagnostic.range.end.column,
            },
          }
        : {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 0 },
          },
      severity: diagnostic.severity === 'warning' ? DiagnosticSeverity.Warning : DiagnosticSeverity.Error,
      source: 'quascript',
    })),
  })
}

function resolveProjectRoot(params: InitializeParams): string | undefined {
  const workspaceFolder = params.workspaceFolders?.[0]?.uri
  if (workspaceFolder) {
    return uriToFilePath(workspaceFolder)
  }

  if (params.rootUri) {
    return uriToFilePath(params.rootUri)
  }

  return params.rootPath || undefined
}

function toCompletionKind(kind: 'character' | 'decorator' | 'variable'): CompletionItemKind {
  switch (kind) {
    case 'character':
      return CompletionItemKind.Value
    case 'decorator':
      return CompletionItemKind.Function
    case 'variable':
      return CompletionItemKind.Variable
  }
}

function getWordAt(source: string, offset: number): string | undefined {
  const left = source.slice(0, offset).match(/@?[A-Z_$][\w$]*$/i)?.[0] || ''
  const right = source.slice(offset).match(/^[A-Z_$][\w$]*/i)?.[0] || ''
  const word = `${left}${right}`
  return word || undefined
}
