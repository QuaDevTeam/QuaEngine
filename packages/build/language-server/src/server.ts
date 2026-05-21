#!/usr/bin/env node

import type { InitializeParams } from 'vscode-languageserver/node'
import { pathToFileURL } from 'node:url'
import { TextDocument } from 'vscode-languageserver-textdocument'
import {
  CodeActionKind,
  CompletionItemKind,
  createConnection,
  DiagnosticSeverity,
  Location,
  MarkupKind,
  ProposedFeatures,
  TextDocuments,
  TextDocumentSyncKind,
} from 'vscode-languageserver/node'
import { analyzeQuaScript, getQuaScriptCodeActions, getQuaScriptCompletions, getQuaScriptDefinitions, getQuaScriptHover, uriToFilePath } from './index'

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
      definitionProvider: true,
      codeActionProvider: {
        codeActionKinds: [CodeActionKind.RefactorRewrite],
      },
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
  }, { filePath: uriToFilePath(document.uri), projectRoot })

  return completions.map(item => ({
    label: item.label,
    kind: toCompletionKind(item.kind),
    detail: item.detail,
    insertText: item.insertText,
    sortText: item.sortText,
  }))
})

connection.onHover(async (params) => {
  const document = documents.get(params.textDocument.uri)
  if (!document) {
    return null
  }

  const hover = await getQuaScriptHover(document.getText(), {
    line: params.position.line,
    character: params.position.character,
  }, { filePath: uriToFilePath(document.uri), projectRoot })
  if (!hover) {
    return null
  }

  return {
    contents: {
      kind: MarkupKind.Markdown,
      value: hover.contents,
    },
    range: hover.range
      ? {
          start: {
            line: hover.range.start.line,
            character: hover.range.start.column,
          },
          end: {
            line: hover.range.end.line,
            character: hover.range.end.column,
          },
        }
      : undefined,
  }
})

connection.onDefinition((params) => {
  const document = documents.get(params.textDocument.uri)
  if (!document) {
    return []
  }

  const definitions = getQuaScriptDefinitions(document.getText(), {
    line: params.position.line,
    character: params.position.character,
  }, { filePath: uriToFilePath(document.uri), projectRoot })

  return definitions.map((definition) => {
    const uri = definition.filePath
      ? pathToFileURL(definition.filePath).toString()
      : document.uri
    return Location.create(uri, {
      start: {
        line: definition.range.start.line,
        character: definition.range.start.column,
      },
      end: {
        line: definition.range.end.line,
        character: definition.range.end.column,
      },
    })
  })
})

connection.onCodeAction((params) => {
  const document = documents.get(params.textDocument.uri)
  if (!document) {
    return []
  }
  return getQuaScriptCodeActions(document.getText(), {
    line: params.range.start.line,
    character: params.range.start.character,
  }).map(action => ({
    title: action.title,
    kind: action.kind,
    edit: {
      changes: {
        [document.uri]: [{
          range: {
            start: {
              line: action.edit.range?.start.line || 0,
              character: action.edit.range?.start.column || 0,
            },
            end: {
              line: action.edit.range?.end.line || 0,
              character: action.edit.range?.end.column || 0,
            },
          },
          newText: action.edit.newText,
        }],
      },
    },
  }))
})

documents.listen(connection)
connection.listen()

async function validateDocument(document: TextDocument): Promise<void> {
  const analysis = await analyzeQuaScript(document.getText(), { filePath: uriToFilePath(document.uri), projectRoot })
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
  const initializationProjectRoot = (params.initializationOptions as { projectRoot?: string } | undefined)?.projectRoot
  if (initializationProjectRoot) {
    return initializationProjectRoot
  }

  const workspaceFolder = params.workspaceFolders?.[0]?.uri
  if (workspaceFolder) {
    return uriToFilePath(workspaceFolder)
  }

  if (params.rootUri) {
    return uriToFilePath(params.rootUri)
  }

  return params.rootPath || undefined
}

function toCompletionKind(kind: string): CompletionItemKind {
  switch (kind) {
    case 'asset':
      return CompletionItemKind.File
    case 'character':
      return CompletionItemKind.Value
    case 'class':
      return CompletionItemKind.Class
    case 'decorator':
      return CompletionItemKind.Function
    case 'enum':
      return CompletionItemKind.Enum
    case 'function':
      return CompletionItemKind.Function
    case 'interface':
      return CompletionItemKind.Interface
    case 'keyword':
      return CompletionItemKind.Keyword
    case 'method':
      return CompletionItemKind.Method
    case 'module':
      return CompletionItemKind.Module
    case 'property':
      return CompletionItemKind.Property
    case 'type':
      return CompletionItemKind.TypeParameter
    case 'value':
      return CompletionItemKind.EnumMember
    case 'variable':
      return CompletionItemKind.Variable
    default:
      return CompletionItemKind.Text
  }
}
