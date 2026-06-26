#!/usr/bin/env node

import type {
  DocumentLink,
  InitializeParams,
  Location,
  Position,
  Range,
  ReferenceParams,
  RenameParams,
  TextDocumentPositionParams,
  TextEdit,
  WorkspaceEdit,
} from 'vscode-languageserver/node.js'
import type {
  NativeUiDiagnostic,
  NativeUiLanguageOptions,
  NativeUiTextEdit,
} from './index'
import { existsSync } from 'node:fs'
import { TextDocument } from 'vscode-languageserver-textdocument'
import {
  CompletionItemKind,
  createConnection,
  DiagnosticSeverity,
  MarkupKind,
  ProposedFeatures,
  TextDocuments,
  TextDocumentSyncKind,
} from 'vscode-languageserver/node.js'
import {
  fileURLToPath,
} from 'node:url'
import {
  buildNativeUiProjectIndex,
  createNativeUiProjectRenameEdits,
  findNativeUiProjectDefinitions,
  findNativeUiProjectReferences,
  formatNativeUiDocumentEdits,
  getNativeUiLanguageCompletions,
  getNativeUiLanguageHover,
  getNativeUiProjectDocumentLinks,
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
      documentLinkProvider: {
        resolveProvider: false,
      },
      definitionProvider: true,
      referencesProvider: true,
      renameProvider: true,
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

connection.onDocumentLinks((params) => {
  return getNativeUiProjectDocumentLinks(currentProjectIndex(), params.textDocument.uri)
    .map(resolveExistingFileDocumentLink)
    .map(toLspDocumentLink)
})

connection.onReferences((params) => {
  const index = currentProjectIndex()
  const target = findReferenceAtPosition(index, params)
  if (!target)
    return []

  return findNativeUiProjectReferences(index, {
    kind: target.kind,
    name: target.name,
  }).map((reference): Location => ({
    range: toLspRange(reference.range),
    uri: reference.uri,
  }))
})

connection.onDefinition((params) => {
  const index = currentProjectIndex()
  const target = findReferenceAtPosition(index, params)
  if (!target)
    return []

  return findNativeUiProjectDefinitions(index, {
    kind: target.kind,
    name: target.name,
  }).map(toLspLocation)
})

connection.onRenameRequest((params) => {
  const index = currentProjectIndex()
  const target = findReferenceAtPosition(index, params)
  if (!target)
    return null

  const edits = createNativeUiProjectRenameEdits(index, {
    kind: target.kind,
    name: target.name,
    newName: params.newName,
  })
  if (edits.length === 0)
    return null

  return toWorkspaceEdit(edits)
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

function currentProjectIndex() {
  const settings = currentSettings()
  return buildNativeUiProjectIndex(documents.all().map(document => ({
    filePath: uriToFilePath(document.uri),
    languageId: document.languageId,
    source: document.getText(),
    uri: document.uri,
    version: document.version,
  })), {
    language: {
      lint: settings.lint,
    },
  })
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

function toLspDocumentLink(link: ReturnType<typeof getNativeUiProjectDocumentLinks>[number]): DocumentLink {
  return {
    range: toLspRange(link.pathRange),
    target: link.targetUri,
    tooltip: link.resolved
      ? `Open ${link.path}`
      : `Missing ${link.path}`,
  }
}

function resolveExistingFileDocumentLink(
  link: ReturnType<typeof getNativeUiProjectDocumentLinks>[number],
): ReturnType<typeof getNativeUiProjectDocumentLinks>[number] {
  if (link.resolved || !link.candidateUri || !link.candidateUri.startsWith('file:'))
    return link

  try {
    if (!existsSync(fileURLToPath(link.candidateUri)))
      return link

    return {
      ...link,
      resolved: true,
      targetUri: link.candidateUri,
    }
  }
  catch {
    return link
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

function findReferenceAtPosition(
  index: ReturnType<typeof currentProjectIndex>,
  params: ReferenceParams | RenameParams | TextDocumentPositionParams,
) {
  return findNativeUiProjectReferences(index, {
    uri: params.textDocument.uri,
  }).find(reference => containsPosition(reference.range, params.position))
}

function toLspLocation(reference: ReturnType<typeof findNativeUiProjectReferences>[number]): Location {
  return {
    range: toLspRange(reference.range),
    uri: reference.uri,
  }
}

function toWorkspaceEdit(edits: ReturnType<typeof createNativeUiProjectRenameEdits>): WorkspaceEdit {
  const changes: NonNullable<WorkspaceEdit['changes']> = {}
  for (const edit of edits) {
    changes[edit.uri] = [
      ...(changes[edit.uri] ?? []),
      {
        newText: edit.newText,
        range: toLspRange(edit.range),
      },
    ]
  }
  return { changes }
}

function containsPosition(range: NativeUiRangeForServer, position: Position): boolean {
  return comparePosition(position, range.start) >= 0 && comparePosition(position, range.end) <= 0
}

function comparePosition(left: Position, right: Position): number {
  return left.line - right.line || left.character - right.character
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
