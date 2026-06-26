import type {
  NativeUiCompletionItem,
  NativeUiDiagnostic,
  NativeUiHover,
  NativeUiLanguageOptions,
  NativeUiRange,
} from '@quajs/native-ui-compiler'
import { fileURLToPath } from 'node:url'
import {
  analyzeNativeUiDocument,
  formatNativeUiDocument,
  getNativeUiCompletions,
  getNativeUiHover,
} from '@quajs/native-ui-compiler'
import { DiagnosticSeverity } from 'vscode-languageserver/node.js'
import { createNativeUiAssetCodeActions } from './code-actions'

export type {
  NativeUiProjectAssetReference,
  NativeUiProjectAssetReferenceSource,
} from './asset-references'
export {
  isSafeNativeUiProjectAssetName,
} from './asset-references'
export type {
  NativeUiProjectClassReference,
  NativeUiProjectComponentReference,
  NativeUiProjectDocumentLink,
  NativeUiProjectFile,
  NativeUiProjectImport,
  NativeUiProjectIndex,
  NativeUiProjectIndexChange,
  NativeUiProjectIndexedDocument,
  NativeUiProjectIndexOptions,
  NativeUiProjectIndexSummary,
  NativeUiProjectReference,
  NativeUiProjectReferenceKind,
} from './project-index'
export {
  buildNativeUiProjectIndex,
  updateNativeUiProjectIndex,
} from './project-index'
export type {
  CreateNativeUiProjectRenameEditsOptions,
  FindNativeUiProjectReferencesOptions,
  NativeUiProjectRenameEdit,
} from './project-references'
export {
  createNativeUiProjectRenameEdits,
  findNativeUiProjectDefinitions,
  findNativeUiProjectReferences,
  getNativeUiProjectDocumentLinks,
} from './project-references'
export type {
  NativeUiCompletionItem,
  NativeUiDiagnostic,
  NativeUiDocument,
  NativeUiHover,
  NativeUiLanguageOptions,
  NativeUiRange,
} from '@quajs/native-ui-compiler'

export {
  analyzeNativeUiDocument,
  detectNativeUiDocumentKind,
  getNativeUiCompletions,
  getNativeUiHover,
  nativeQssProperties,
  nativeQssPseudoStates,
  nativeQuiDirectiveNames,
  nativeUiComponents,
  nativeWgpuQssFeatureNames,
  nativeWgpuQuiComponentNames,
  QUA_STYLE_FILE_EXTENSIONS,
  QUA_STYLE_LANGUAGE_ID,
  QUA_UI_FILE_EXTENSIONS,
  QUA_UI_LANGUAGE_ID,
} from '@quajs/native-ui-compiler'

export interface NativeUiLintResult {
  diagnostics: NativeUiDiagnostic[]
}

export interface NativeUiPosition {
  character: number
  line: number
}

export interface NativeUiTextEdit {
  newText: string
  range: NativeUiRange
}

export interface NativeUiAssetCodeAction {
  diagnostics: NativeUiDiagnostic[]
  edits: NativeUiTextEdit[]
  kind: 'quickfix' | 'source.fixAll.quaNativeAssets'
  title: string
}

export interface NativeUiAssetCodeActionOptions {
  diagnostics: readonly NativeUiDiagnostic[]
  range: NativeUiRange
  source: string
  uri?: string
}

export function lintNativeUiDocument(
  source: string,
  options: NativeUiLanguageOptions = {},
): NativeUiLintResult {
  return {
    diagnostics: analyzeNativeUiDocument(source, options).diagnostics,
  }
}

export function formatNativeUiDocumentEdits(
  source: string,
  options: NativeUiLanguageOptions = {},
): NativeUiTextEdit[] {
  const formatted = formatNativeUiDocument(source, options)
  if (formatted === source)
    return []

  return [{
    newText: formatted,
    range: fullDocumentRange(source),
  }]
}

export function getNativeUiLanguageCompletions(
  source: string,
  position: NativeUiPosition,
  options: NativeUiLanguageOptions = {},
): NativeUiCompletionItem[] {
  return getNativeUiCompletions(source, offsetAtPosition(source, position), options)
}

export function getNativeUiLanguageHover(
  source: string,
  position: NativeUiPosition,
  options: NativeUiLanguageOptions = {},
): NativeUiHover | undefined {
  return getNativeUiHover(source, offsetAtPosition(source, position), options)
}

export function getNativeUiAssetCodeActions(
  options: NativeUiAssetCodeActionOptions,
): NativeUiAssetCodeAction[] {
  const uri = options.uri ?? 'file:///native-ui-document'
  return createNativeUiAssetCodeActions({
    diagnostics: options.diagnostics.map(toLspDiagnostic),
    range: options.range,
    source: options.source,
    uri,
  }).map(action => ({
    diagnostics: (action.diagnostics ?? []).map(toNativeUiDiagnostic),
    edits: action.edit?.changes?.[uri] ?? [],
    kind: action.kind === 'source.fixAll.quaNativeAssets'
      ? 'source.fixAll.quaNativeAssets'
      : 'quickfix',
    title: action.title,
  }))
}

export function fullDocumentRange(source: string): NativeUiRange {
  const lines = source.split(/\r?\n/)
  return {
    start: {
      line: 0,
      character: 0,
    },
    end: {
      line: Math.max(0, lines.length - 1),
      character: lines.length > 0 ? lines[lines.length - 1].length : 0,
    },
  }
}

export function offsetAtPosition(source: string, position: NativeUiPosition): number {
  const targetLine = Math.max(0, position.line)
  const targetCharacter = Math.max(0, position.character)
  let offset = 0
  let line = 0

  while (line < targetLine && offset < source.length) {
    const nextLine = source.indexOf('\n', offset)
    if (nextLine === -1)
      return source.length
    offset = nextLine + 1
    line += 1
  }

  const lineEnd = source.indexOf('\n', offset)
  const maxOffset = lineEnd === -1 ? source.length : lineEnd
  return Math.min(maxOffset, offset + targetCharacter)
}

export function uriToFilePath(uri: string): string | undefined {
  try {
    return fileURLToPath(uri)
  }
  catch {
    return undefined
  }
}

function toLspDiagnostic(diagnostic: NativeUiDiagnostic) {
  return {
    code: diagnostic.code,
    message: diagnostic.message,
    range: diagnostic.range ?? zeroRange(),
    severity: toLspDiagnosticSeverity(diagnostic.severity),
    source: diagnostic.source,
  }
}

function toLspDiagnosticSeverity(severity: NativeUiDiagnostic['severity']): DiagnosticSeverity {
  if (severity === 'error')
    return DiagnosticSeverity.Error
  if (severity === 'warning')
    return DiagnosticSeverity.Warning
  return DiagnosticSeverity.Information
}

function toNativeUiDiagnostic(diagnostic: {
  code?: number | string
  message: string
  range: NativeUiRange
  severity?: number
  source?: string
}): NativeUiDiagnostic {
  return {
    code: String(diagnostic.code ?? 'UNKNOWN'),
    message: diagnostic.message,
    range: diagnostic.range,
    severity: diagnostic.severity === 1
      ? 'error'
      : diagnostic.severity === 2
        ? 'warning'
        : 'info',
    source: diagnostic.source === 'qui' || diagnostic.source === 'qss' || diagnostic.source === 'native-ui'
      ? diagnostic.source
      : 'native-ui',
  }
}

function zeroRange(): NativeUiRange {
  return {
    start: {
      character: 0,
      line: 0,
    },
    end: {
      character: 0,
      line: 0,
    },
  }
}
