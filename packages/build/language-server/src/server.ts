#!/usr/bin/env node

import type { QuaScriptTextEdit, QuaScriptToolingConfig, SourceRange } from '@quajs/script-compiler'
import type { InitializeParams, Range, TextEdit } from 'vscode-languageserver/node'
import { pathToFileURL } from 'node:url'
import { loadQuaScriptToolingConfig, mergeQuaScriptToolingConfig } from '@quajs/script-compiler'
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
import {
  formatQuaScriptDocumentEdits,
  getQuaScriptCodeActions,
  getQuaScriptCompletions,
  getQuaScriptDefinitions,
  getQuaScriptHover,
  lintQuaScript,
  uriToFilePath,
} from './index'

const connection = createConnection(ProposedFeatures.all)
const documents = new TextDocuments(TextDocument)
let projectRoot: string | undefined
let initializationToolingConfig: QuaScriptToolingConfig = {}
let initializationWorkspaceConfig: QuaScriptToolingConfig = {}
let workspaceConfig: QuaScriptToolingConfig | undefined

connection.onInitialize((params: InitializeParams) => {
  projectRoot = resolveProjectRoot(params)
  const initializationConfig = resolveInitializationConfig(params)
  initializationToolingConfig = initializationConfig.toolingConfig
  initializationWorkspaceConfig = initializationConfig.workspaceConfig
  workspaceConfig = undefined
  return {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      completionProvider: {
        triggerCharacters: ['@', '$', '{', '.', ' '],
      },
      hoverProvider: true,
      definitionProvider: true,
      documentFormattingProvider: true,
      codeActionProvider: {
        codeActionKinds: [
          CodeActionKind.QuickFix,
          CodeActionKind.RefactorRewrite,
          `${CodeActionKind.SourceFixAll}.quascript`,
        ],
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
  }, documentOptions(document))

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
  }, documentOptions(document))
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
  }, documentOptions(document))

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

connection.onCodeAction(async (params) => {
  const document = documents.get(params.textDocument.uri)
  if (!document) {
    return []
  }
  const lint = await lintQuaScript(document.getText(), documentOptions(document))
  return getQuaScriptCodeActions(document.getText(), {
    line: params.range.start.line,
    character: params.range.start.character,
  }, {
    diagnostics: lint.diagnostics,
    includeFixAll: true,
    includeLintFixes: true,
    toolingConfig: currentToolingConfig(),
  }).map(action => ({
    title: action.title,
    kind: action.kind,
    diagnostics: action.diagnostics?.map(toLspDiagnostic),
    edit: {
      changes: {
        [document.uri]: action.edit.edits.map(toLspTextEdit),
      },
    },
  }))
})

connection.onDocumentFormatting((params) => {
  const document = documents.get(params.textDocument.uri)
  if (!document) {
    return []
  }
  return formatQuaScriptDocumentEdits(document.getText(), documentOptions(document)).map(toLspTextEdit)
})

connection.onDidChangeConfiguration((params) => {
  workspaceConfig = normalizeToolingConfig((params.settings as { quascript?: unknown } | undefined)?.quascript)
  validateAllOpenDocuments()
})

connection.onDidChangeWatchedFiles(() => {
  validateAllOpenDocuments()
})

documents.listen(connection)
connection.listen()

async function validateDocument(document: TextDocument): Promise<void> {
  const lint = await lintQuaScript(document.getText(), documentOptions(document))
  connection.sendDiagnostics({
    uri: document.uri,
    diagnostics: lint.diagnostics.map(toLspDiagnostic),
  })
}

function validateAllOpenDocuments(): void {
  documents.all().forEach((document) => {
    validateDocument(document).catch((error) => {
      connection.console.error(String(error))
    })
  })
}

function documentOptions(document: TextDocument) {
  return {
    filePath: uriToFilePath(document.uri),
    projectRoot,
    toolingConfig: currentToolingConfig(),
  }
}

function currentToolingConfig(): QuaScriptToolingConfig {
  const projectConfig = projectRoot ? loadQuaScriptToolingConfig(projectRoot) : {}
  return mergeQuaScriptToolingConfig(
    mergeQuaScriptToolingConfig(projectConfig, initializationToolingConfig),
    workspaceConfig ?? initializationWorkspaceConfig,
  )
}

function toLspDiagnostic(diagnostic: import('@quajs/script-compiler').QuaScriptDiagnostic) {
  return {
    code: diagnostic.code,
    message: diagnostic.message,
    range: toLspRange(diagnostic.range),
    severity: toDiagnosticSeverity(diagnostic.severity),
    source: diagnostic.source,
  }
}

function toLspTextEdit(edit: QuaScriptTextEdit): TextEdit {
  return {
    newText: edit.newText,
    range: toLspRange(edit.range),
  }
}

function toLspRange(range?: SourceRange): Range {
  return range
    ? {
        start: {
          line: range.start.line,
          character: range.start.column,
        },
        end: {
          line: range.end.line,
          character: range.end.column,
        },
      }
    : {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 0 },
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

function resolveInitializationConfig(params: InitializeParams): {
  toolingConfig: QuaScriptToolingConfig
  workspaceConfig: QuaScriptToolingConfig
} {
  const options = params.initializationOptions as { quascript?: unknown, settings?: unknown, toolingConfig?: unknown } | undefined
  return {
    toolingConfig: normalizeToolingConfig(options?.toolingConfig),
    workspaceConfig: normalizeToolingConfig(options?.quascript ?? options?.settings),
  }
}

function normalizeToolingConfig(value: unknown): QuaScriptToolingConfig {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as QuaScriptToolingConfig
    : {}
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
