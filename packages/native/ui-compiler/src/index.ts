import type {
  NativeQssDocument,
  NativeQuiDocument,
  NativeUiCompletionItem,
  NativeUiDocument,
  NativeUiDocumentKind,
  NativeUiHover,
  NativeUiLanguageOptions,
} from './types'
import { analyzeQssSource, formatQssSource, getQssCompletions, getQssHover } from './qss'

export {
  isSafeNativeAssetType,
  isSafePackageAssetName,
  literalStringValue,
} from './assets'
export {
  createNativeUiSurfaceCompatibilityFromProjection,
  createNativeUiSurfaceCompatibilityFromDocuments,
} from './compatibility'
export type {
  CreateNativeUiSurfaceCompatibilityFromProjectionOptions,
  CreateNativeUiSurfaceCompatibilityFromDocumentsOptions,
} from './compatibility'
export {
  analyzeQssSource,
  formatQssSource,
  getQssCompletions,
  getQssHover,
} from './qss'
export {
  resolveNativeQssDeclarations,
} from './qss-resolved-style'
export {
  compileNativeUiSurfaceProjection,
} from './projection'
export type {
  CompileNativeUiSurfaceProjectionOptions,
} from './projection'
export {
  compileQuiTsxProjection,
} from './tsx-projection-compiler'
export type {
  CompileQuiTsxProjectionOptions,
} from './tsx-projection-compiler'
export {
  compileQssScss,
} from './qss-scss'
export type {
  CompileQssScssOptions,
  QssScssCompileResult,
} from './qss-scss'
export {
  collectNativeUiSurfaceProjectionRequirements,
} from './projection-requirements'
export type {
  NativeUiSurfaceProjectionRequirements,
} from './projection-requirements'
export * from './registry'
export * from './types'

// ─── Document-kind detection ──────────────────────────────────────────────────
// .qui support has been removed; files should be TSX + .scss.
// The 'qui' kind is kept in the type union for backward compat only.

export function detectNativeUiDocumentKind(options: NativeUiLanguageOptions): NativeUiDocumentKind | undefined {
  if (options.languageId === 'qua-style' || options.languageId === 'qss')
    return 'qss'

  const extension = options.filePath ? fileExtension(options.filePath) : ''
  if (extension === '.qss' || extension === '.scss')
    return 'qss'

  return undefined
}

export function analyzeNativeUiDocument(
  source: string,
  options: NativeUiLanguageOptions = {},
): NativeUiDocument {
  return analyzeQssSource(source, options)
}

export function formatNativeUiDocument(
  source: string,
  options: NativeUiLanguageOptions = {},
): string {
  return formatQssSource(source, options)
}

export function getNativeUiCompletions(
  source: string,
  offset: number,
  _options: NativeUiLanguageOptions = {},
): NativeUiCompletionItem[] {
  return getQssCompletions(source, offset)
}

export function getNativeUiHover(
  source: string,
  offset: number,
  _options: NativeUiLanguageOptions = {},
): NativeUiHover | undefined {
  return getQssHover(source, offset)
}

export function isNativeQuiDocument(document: NativeUiDocument): document is NativeQuiDocument {
  return document.kind === 'qui'
}

export function isNativeQssDocument(document: NativeUiDocument): document is NativeQssDocument {
  return document.kind === 'qss'
}

function fileExtension(filePath: string): string {
  const withoutQuery = filePath.split(/[?#]/, 1)[0] || filePath
  const slashIndex = Math.max(withoutQuery.lastIndexOf('/'), withoutQuery.lastIndexOf('\\'))
  const dotIndex = withoutQuery.lastIndexOf('.')
  return dotIndex > slashIndex ? withoutQuery.slice(dotIndex) : ''
}
