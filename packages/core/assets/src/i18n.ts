import type { AssetLocale } from './types'

export const DEFAULT_I18N_LOCALE = 'default'
export const DEFAULT_I18N_NAMESPACE = 'messages'

export type I18nMessageValue = string | number | boolean | null | undefined
export type I18nMessageValues = Record<string, I18nMessageValue> | I18nMessageValue[]
export type I18nMessages = Record<string, string>

export interface I18nCatalog {
  locale?: AssetLocale
  namespace?: string
  messages?: I18nMessages
  [key: string]: unknown
}

export interface I18nCatalogOptions {
  locale?: AssetLocale
  defaultLocale?: AssetLocale
  namespace?: string
  bundleName?: string
  targetPackageId?: string
}

export interface TranslateOptions extends I18nCatalogOptions {
  values?: I18nMessageValues
  fallback?: string
  missing?: 'empty' | 'key'
}

export type TranslateInput = TranslateOptions | I18nMessageValues

const TRANSLATE_OPTION_KEYS = new Set([
  'bundleName',
  'defaultLocale',
  'fallback',
  'locale',
  'missing',
  'namespace',
  'targetPackageId',
  'values',
])

export function i18nCatalogAssetName(namespace = DEFAULT_I18N_NAMESPACE): string {
  return `${namespace}.json`
}

export function normalizeTranslateOptions(input?: TranslateInput): TranslateOptions {
  if (!input) {
    return {}
  }

  if (Array.isArray(input)) {
    return { values: input }
  }

  if (isTranslateOptions(input)) {
    return input
  }

  return { values: input }
}

export function normalizeI18nCatalog(input: unknown): I18nMessages {
  if (!input || typeof input !== 'object') {
    return {}
  }

  const maybeCatalog = input as I18nCatalog
  const source = maybeCatalog.messages && typeof maybeCatalog.messages === 'object'
    ? maybeCatalog.messages
    : input as Record<string, unknown>

  return Object.fromEntries(
    Object.entries(source)
      .filter(([, value]) => typeof value === 'string')
      .map(([key, value]) => [key, value as string]),
  )
}

export function mergeI18nCatalogs(base: I18nMessages, localized: I18nMessages): I18nMessages {
  return {
    ...base,
    ...localized,
  }
}

export function formatI18nMessage(message: string, values?: I18nMessageValues): string {
  if (!values) {
    return message
  }

  return message.replace(/\{([A-Za-z_$][\w$]*|\d+)\}/g, (token, key: string) => {
    const value = Array.isArray(values)
      ? values[Number(key)]
      : values[key]
    return value === undefined || value === null ? token : String(value)
  })
}

function isTranslateOptions(input: I18nMessageValues | TranslateOptions): input is TranslateOptions {
  return !Array.isArray(input)
    && Object.keys(input).some(key => TRANSLATE_OPTION_KEYS.has(key))
}
