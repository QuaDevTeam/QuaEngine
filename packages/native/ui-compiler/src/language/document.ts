import type {
  NativeQssDocument,
  NativeQuiDocument,
  NativeUiCompletionItem,
  NativeUiDocument,
  NativeUiDocumentKind,
  NativeUiHover,
  NativeUiLanguageOptions,
} from '../model/types'
import { analyzeQssSource, formatQssSource, getQssCompletions, getQssHover } from '../qss'

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
