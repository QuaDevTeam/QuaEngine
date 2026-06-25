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

export type {
  NativeUiProjectFile,
  NativeUiProjectIndex,
  NativeUiProjectIndexChange,
  NativeUiProjectIndexedDocument,
  NativeUiProjectIndexOptions,
  NativeUiProjectIndexSummary,
} from './project-index'
export {
  buildNativeUiProjectIndex,
  updateNativeUiProjectIndex,
} from './project-index'
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
