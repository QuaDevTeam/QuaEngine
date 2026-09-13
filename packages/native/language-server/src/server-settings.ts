export interface NativeLanguageServerSettings {
  format?: {
    indentSize?: number
    insertFinalNewline?: boolean
  }
  lint?: {
    allowPreviewFeatures?: boolean
    maxSelectorDepth?: number
    strictComponents?: boolean
  }
}

export function normalizeSettings(value: unknown): NativeLanguageServerSettings {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return {}

  const input = value as NativeLanguageServerSettings
  return {
    format: input.format && typeof input.format === 'object'
      ? input.format
      : undefined,
    lint: input.lint && typeof input.lint === 'object'
      ? input.lint
      : undefined,
  }
}
