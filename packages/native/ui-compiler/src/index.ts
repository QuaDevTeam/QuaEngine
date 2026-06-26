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
import { analyzeQuiSource, formatQuiSource, getQuiCompletions, getQuiHover } from './qui'

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
  analyzeQuiSource,
  formatQuiSource,
  getQuiCompletions,
  getQuiHover,
} from './qui'
export {
  collectQuiActionDescriptors,
  parseQuiActionDescriptor,
} from './qui-actions'
export {
  parseQuiStructureTree,
} from './qui-structure'
export * from './registry'
export * from './types'

export function detectNativeUiDocumentKind(options: NativeUiLanguageOptions): NativeUiDocumentKind | undefined {
  if (options.languageId === 'qua-ui' || options.languageId === 'qui')
    return 'qui'
  if (options.languageId === 'qua-style' || options.languageId === 'qss')
    return 'qss'

  const extension = options.filePath ? fileExtension(options.filePath) : ''
  if (extension === '.qui')
    return 'qui'
  if (extension === '.qss')
    return 'qss'

  return undefined
}

export function analyzeNativeUiDocument(
  source: string,
  options: NativeUiLanguageOptions = {},
): NativeUiDocument {
  const kind = detectNativeUiDocumentKind(options) || 'qui'
  return kind === 'qss'
    ? analyzeQssSource(source, options)
    : analyzeQuiSource(source, options)
}

export function formatNativeUiDocument(
  source: string,
  options: NativeUiLanguageOptions = {},
): string {
  const kind = detectNativeUiDocumentKind(options) || 'qui'
  return kind === 'qss'
    ? formatQssSource(source, options)
    : formatQuiSource(source, options)
}

export function getNativeUiCompletions(
  source: string,
  offset: number,
  options: NativeUiLanguageOptions = {},
): NativeUiCompletionItem[] {
  const kind = detectNativeUiDocumentKind(options) || 'qui'
  return kind === 'qss'
    ? getQssCompletions(source, offset)
    : getQuiCompletions(source, offset)
}

export function getNativeUiHover(
  source: string,
  offset: number,
  options: NativeUiLanguageOptions = {},
): NativeUiHover | undefined {
  const kind = detectNativeUiDocumentKind(options) || 'qui'
  return kind === 'qss'
    ? getQssHover(source, offset)
    : getQuiHover(source, offset)
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
