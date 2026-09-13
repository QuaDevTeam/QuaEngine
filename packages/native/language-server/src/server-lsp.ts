import type {
  DocumentLink,
  Location,
  Position,
  Range,
  TextEdit,
  WorkspaceEdit,
} from 'vscode-languageserver/node.js'
import type {
  NativeUiDiagnostic,
  NativeUiProjectDocumentLink,
  NativeUiProjectReference,
  NativeUiProjectRenameEdit,
  NativeUiRange,
  NativeUiTextEdit,
} from './index'
import { existsSync } from 'node:fs'
import {
  CompletionItemKind,
  DiagnosticSeverity,
} from 'vscode-languageserver/node.js'
import { fileURLToPath } from 'node:url'

export function toLspDiagnostic(diagnostic: NativeUiDiagnostic) {
  return {
    code: diagnostic.code,
    message: diagnostic.message,
    range: toLspRange(diagnostic.range),
    severity: toDiagnosticSeverity(diagnostic.severity),
    source: diagnostic.source,
  }
}

export function toLspTextEdit(edit: NativeUiTextEdit): TextEdit {
  return {
    newText: edit.newText,
    range: toLspRange(edit.range),
  }
}

export function toLspDocumentLink(link: NativeUiProjectDocumentLink): DocumentLink {
  return {
    range: toLspRange(link.pathRange),
    target: link.targetUri,
    tooltip: link.resolved
      ? `Open ${link.path}`
      : `Missing ${link.path}`,
  }
}

export function resolveExistingFileDocumentLink(
  link: NativeUiProjectDocumentLink,
): NativeUiProjectDocumentLink {
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

export function toLspRange(range?: NativeUiRange): Range {
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

export function toCompletionKind(kind: string): CompletionItemKind {
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

export function toLspLocation(reference: NativeUiProjectReference): Location {
  return {
    range: toLspRange(reference.range),
    uri: reference.uri,
  }
}

export function toWorkspaceEdit(edits: readonly NativeUiProjectRenameEdit[]): WorkspaceEdit {
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

export function containsPosition(range: NativeUiRange, position: Position): boolean {
  return comparePosition(position, range.start) >= 0 && comparePosition(position, range.end) <= 0
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

function comparePosition(left: Position, right: Position): number {
  return left.line - right.line || left.character - right.character
}
