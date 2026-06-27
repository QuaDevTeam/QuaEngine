#!/usr/bin/env node

import type {
  InitializeParams,
  Location,
  ReferenceParams,
  RenameParams,
  TextDocumentPositionParams,
} from 'vscode-languageserver/node.js'
import type {
  NativeUiDiagnostic,
  NativeUiLanguageOptions,
} from './index'
import type { NativeLanguageServerSettings } from './server-settings'
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
  buildNativeUiProjectIndex,
  createNativeUiProjectRenameEdits,
  findNativeUiProjectDefinitions,
  findNativeUiProjectReferences,
  formatNativeUiDocumentEdits,
  getNativeUiLanguageCompletions,
  getNativeUiLanguageHover,
  getNativeUiProjectDocumentLinks,
  uriToFilePath,
} from './index'
import {
  containsPosition,
  resolveExistingFileDocumentLink,
  toCompletionKind,
  toLspDiagnostic,
  toLspDocumentLink,
  toLspLocation,
  toLspRange,
  toLspTextEdit,
  toWorkspaceEdit,
} from './server-lsp'
import { normalizeSettings } from './server-settings'

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
  const index = currentProjectIndex()
  const compilerDiagnostics = index.documents.find(item => item.uri === document.uri)?.diagnostics ?? []
  const assetDiagnostics = missingAssetDiagnosticsForDocument(index, document.uri)
  connection.sendDiagnostics({
    uri: document.uri,
    diagnostics: [
      ...compilerDiagnostics,
      ...assetDiagnostics,
    ].map(toLspDiagnostic),
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

function missingAssetDiagnosticsForDocument(
  index: ReturnType<typeof currentProjectIndex>,
  uri: string,
): NativeUiDiagnostic[] {
  return getNativeUiProjectDocumentLinks(index, uri)
    .filter(link => link.kind === 'asset')
    .map(resolveExistingFileDocumentLink)
    .filter(link => !link.resolved)
    .map(link => ({
      code: 'NATIVE_UI_ASSET_MISSING',
      message: `Native UI asset "${link.path}" could not be resolved.`,
      range: link.pathRange,
      severity: 'warning' as const,
      source: 'native-ui' as const,
    }))
}

function findReferenceAtPosition(
  index: ReturnType<typeof currentProjectIndex>,
  params: ReferenceParams | RenameParams | TextDocumentPositionParams,
) {
  return findNativeUiProjectReferences(index, {
    uri: params.textDocument.uri,
  }).find(reference => containsPosition(reference.range, params.position))
}
