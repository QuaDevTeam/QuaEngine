#!/usr/bin/env node

import type {
  InitializeParams,
  Range,
  TextEdit,
} from 'vscode-languageserver/node'
import type {
  NativeUiDiagnostic,
  NativeUiLanguageOptions,
  NativeUiTextEdit,
} from './index'
import { TextDocument } from 'vscode-languageserver-textdocument'
import {
  CompletionItemKind,
  createConnection,
  DiagnosticSeverity,
  MarkupKind,
  ProposedFeatures,
  TextDocuments,
  TextDocumentSyncKind,
} from 'vscode-languageserver/node'
import {
  formatNativeUiDocumentEdits,
  getNativeUiLanguageCompletions,
  getNativeUiLanguageHover,
  lintNativeUiDocument,
  uriToFilePath,
} from './index'

interface NativeLanguageServerSettings {
  format?: {
    indentSize?: number
    insertFinalNewline?: boolean
  }
  lint?: {
    allowPreviewFeatures?: boolean
    maxSelectorDepth?: number
    strictComponents?: boolean
  }
}

const connection = createConnection(ProposedFeatures.all)
const documents = new TextDocuments(TextDocument)
let initializationSettings: NativeLanguageServerSettings = {}
let workspaceSettings: NativeLanguageServerSettings | undefined

connection.onInitialize((params: InitializeParams) => {
  initializationSettings = normalizeSettings(
    (params.initializationOptions as { quaNative?: unknown, settings?: unknown } | undefined)?.quaNative
    ?? (params.initializationOptions as { settings?: unknown } | undefined)?.settings,
  )
  workspaceSettings = undefined

  return {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      completionProvider: {
        triggerCharacters: ['.', '#', ':', '-', '(', '{', ';', '"', '\''],
      },
      hoverProvider: true,
      documentFormattingProvider: true,
    },
  }
})

documents.onDidOpen((event) => {
  validateDocument(event.document)
})

documents.onDidChangeContent((change) => {
  validateDocument(change.document)
})

connection.onCompletion((params) => {
  const document = documents.get(params.textDocument.uri)
  if (!document)
    return []

  return getNativeUiLanguageCompletions(document.getText(), params.position, documentOptions(document))
    .map(item => ({
      label: item.label,
      kind: toCompletionKind(item.kind),
      detail: item.detail,
      insertText: item.insertText,
      sortText: item.sortText,
    }))
})

connection.onHover((params) => {
  const document = documents.get(params.textDocument.uri)
  if (!document)
    return null

  const hover = getNativeUiLanguageHover(document.getText(), params.position, documentOptions(document))
  if (!hover)
    return null

  return {
    contents: {
      kind: MarkupKind.Markdown,
      value: hover.contents,
    },
    range: hover.range ? toLspRange(hover.range) : undefined,
  }
})

connection.onDocumentFormatting((params) => {
  const document = documents.get(params.textDocument.uri)
  if (!document)
    return []

  return formatNativeUiDocumentEdits(document.getText(), documentOptions(document))
    .map(toLspTextEdit)
})

connection.onDidChangeConfiguration((params) => {
  workspaceSettings = normalizeSettings((params.settings as { quaNative?: unknown } | undefined)?.quaNative)
  validateAllOpenDocuments()
})

connection.onDidChangeWatchedFiles(() => {
  validateAllOpenDocuments()
})

documents.listen(connection)
connection.listen()

function validateDocument(document: TextDocument): void {
  const lint = lintNativeUiDocument(document.getText(), documentOptions(document))
  connection.sendDiagnostics({
    uri: document.uri,
    diagnostics: lint.diagnostics.map(toLspDiagnostic),
  })
}

function validateAllOpenDocuments(): void {
  documents.all().forEach(validateDocument)
}

function documentOptions(document: TextDocument): NativeUiLanguageOptions {
  const settings = currentSettings()
  return {
    filePath: uriToFilePath(document.uri),
    languageId: document.languageId,
    format: settings.format,
    lint: settings.lint,
  }
}

function currentSettings(): NativeLanguageServerSettings {
  return workspaceSettings ?? initializationSettings
}

function normalizeSettings(value: unknown): NativeLanguageServerSettings {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return {}

  const input = value as NativeLanguageServerSettings
  return {
    format: input.format && typeof input.format === 'object'
      ? input.format
      : undefined,
    lint: input.lint && typeof input.lint === 'object'
      ? input.lint
      : undefined,
  }
}

function toLspDiagnostic(diagnostic: NativeUiDiagnostic) {
  return {
    code: diagnostic.code,
    message: diagnostic.message,
    range: toLspRange(diagnostic.range),
    severity: toDiagnosticSeverity(diagnostic.severity),
    source: diagnostic.source,
  }
}

function toLspTextEdit(edit: NativeUiTextEdit): TextEdit {
  return {
    newText: edit.newText,
    range: toLspRange(edit.range),
  }
}

function toLspRange(range?: NativeUiRangeForServer): Range {
  return range
    ? {
        start: {
          line: range.start.line,
          character: range.start.character,
        },
        end: {
          line: range.end.line,
          character: range.end.character,
        },
      }
    : {
        start: {
          line: 0,
          character: 0,
        },
        end: {
          line: 0,
          character: 0,
        },
      }
}

function toDiagnosticSeverity(severity: string): DiagnosticSeverity {
  switch (severity) {
    case 'warning':
      return DiagnosticSeverity.Warning
    case 'info':
      return DiagnosticSeverity.Information
    default:
      return DiagnosticSeverity.Error
  }
}

function toCompletionKind(kind: string): CompletionItemKind {
  switch (kind) {
    case 'asset':
      return CompletionItemKind.File
    case 'component':
      return CompletionItemKind.Class
    case 'directive':
      return CompletionItemKind.Keyword
    case 'import':
      return CompletionItemKind.Module
    case 'keyword':
      return CompletionItemKind.Keyword
    case 'property':
      return CompletionItemKind.Property
    case 'selector':
      return CompletionItemKind.Reference
    case 'slot':
      return CompletionItemKind.Field
    case 'value':
      return CompletionItemKind.Value
    default:
      return CompletionItemKind.Text
  }
}

interface NativeUiRangeForServer {
  end: {
    character: number
    line: number
  }
  start: {
    character: number
    line: number
  }
}
