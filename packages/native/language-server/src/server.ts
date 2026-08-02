#!/usr/bin/env node

import type {
  InitializeParams,
  Location,
} from 'vscode-languageserver/node.js'
import { TextDocument } from 'vscode-languageserver-textdocument'
import {
  CodeActionKind,
  createConnection,
  MarkupKind,
  ProposedFeatures,
  TextDocuments,
  TextDocumentSyncKind,
} from 'vscode-languageserver/node.js'
import { createNativeUiAssetCodeActions } from './code-actions'
import {
  createNativeUiProjectRenameEdits,
  findNativeUiProjectDefinitions,
  findNativeUiProjectReferences,
  formatNativeUiDocumentEdits,
  getNativeUiLanguageCompletions,
  getNativeUiLanguageHover,
  getNativeUiProjectDocumentLinks,
} from './index'
import {
  resolveExistingFileDocumentLink,
  toCompletionKind,
  toLspDiagnostic,
  toLspDocumentLink,
  toLspLocation,
  toLspRange,
  toLspTextEdit,
  toWorkspaceEdit,
} from './server-lsp'
import { NativeLanguageServerSession } from './server-session'

const connection = createConnection(ProposedFeatures.all)
const documents = new TextDocuments(TextDocument)
const session = new NativeLanguageServerSession({
  resolveDocumentLink: resolveExistingFileDocumentLink,
})

connection.onInitialize((params: InitializeParams) => {
  session.setInitializationOptions(params.initializationOptions)

  return {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      completionProvider: {
        // QSS trigger characters
        triggerCharacters: ['.', '#', ':', '-', '{', ';', '"', '\''],
      },
      hoverProvider: true,
      documentLinkProvider: {
        resolveProvider: false,
      },
      documentFormattingProvider: true,
      codeActionProvider: {
        codeActionKinds: [
          CodeActionKind.QuickFix,
          `${CodeActionKind.SourceFixAll}.quaNativeAssets`,
        ],
      },
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

connection.onCodeAction((params) => {
  const document = documents.get(params.textDocument.uri)
  if (!document)
    return []

  return createNativeUiAssetCodeActions({
    diagnostics: params.context.diagnostics,
    range: params.range,
    source: document.getText(),
    uri: document.uri,
  })
})

connection.onReferences((params) => {
  const index = currentProjectIndex()
  const target = session.findReferenceAtPosition(index, params)
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
  const target = session.findReferenceAtPosition(index, params)
  if (!target)
    return []

  return findNativeUiProjectDefinitions(index, {
    kind: target.kind,
    name: target.name,
  }).map(toLspLocation)
})

connection.onRenameRequest((params) => {
  const index = currentProjectIndex()
  const target = session.findReferenceAtPosition(index, params)
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
  session.setWorkspaceConfiguration(params.settings)
  validateAllOpenDocuments()
})

connection.onDidChangeWatchedFiles(() => {
  validateAllOpenDocuments()
})

documents.listen(connection)
connection.listen()

function validateDocument(document: TextDocument): void {
  const index = currentProjectIndex()
  connection.sendDiagnostics({
    uri: document.uri,
    diagnostics: session.diagnosticsForDocument(index, document.uri).map(toLspDiagnostic),
  })
}

function validateAllOpenDocuments(): void {
  documents.all().forEach(validateDocument)
}

function currentProjectIndex() {
  return session.projectIndex(documents.all())
}

function documentOptions(document: TextDocument) {
  return session.documentOptions(document)
}
