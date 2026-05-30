export const FONTS_PLUGIN_ID = 'fonts' as const
export const FONTS_WEB_RENDERER_ENTRY = '@quajs/renderer-web/plugins/fonts' as const
export const FONTS_VUE_RENDERER_ENTRY = '@quajs/renderer-vue/plugins/fonts' as const
export const FONTS_RENDERER_ENTRY = FONTS_WEB_RENDERER_ENTRY

export type FontFaceDisplay = 'auto' | 'block' | 'swap' | 'fallback' | 'optional' | string

export interface FontFaceProjection {
  id?: string
  family: string
  assetName: string
  bundleName?: string
  locale?: string
  style?: string
  weight?: string | number
  stretch?: string
  display?: FontFaceDisplay
  unicodeRange?: string
  featureSettings?: string
  variationSettings?: string
  ascentOverride?: string
  descentOverride?: string
  lineGapOverride?: string
  contentPackageId?: string
  metadata?: Readonly<Record<string, unknown>>
}

export interface FontsProjection {
  revision: number
  requiredRuntimePackages?: readonly string[]
  faces: readonly Readonly<FontFaceProjection>[]
}

export function createInitialFontsProjection(): FontsProjection {
  return {
    revision: 0,
    requiredRuntimePackages: [],
    faces: [],
  }
}

export function cloneFontsProjection(projection: Readonly<FontsProjection> | undefined): FontsProjection {
  if (!projection) {
    return createInitialFontsProjection()
  }
  return {
    revision: projection.revision,
    requiredRuntimePackages: projection.requiredRuntimePackages ? [...projection.requiredRuntimePackages] : undefined,
    faces: projection.faces.map(face => cloneFontFaceProjection(face)),
  }
}

export function cloneFontFaceProjection(face: Readonly<FontFaceProjection>): FontFaceProjection {
  return {
    ...face,
    metadata: face.metadata ? { ...face.metadata } : undefined,
  }
}

export function fontFaceProjectionIdentity(face: Readonly<FontFaceProjection>): string {
  return face.id || [
    normalizeFontKeySegment(face.family),
    normalizeFontKeySegment(face.style || 'normal'),
    normalizeFontKeySegment(face.weight ?? 'normal'),
    normalizeFontKeySegment(face.stretch || 'normal'),
    normalizeFontKeySegment(face.unicodeRange || 'all'),
  ].join(':')
}

export function fontFaceProjectionSignature(face: Readonly<FontFaceProjection>): string {
  return JSON.stringify({
    id: face.id,
    family: face.family,
    assetName: face.assetName,
    bundleName: face.bundleName,
    locale: face.locale,
    style: face.style,
    weight: face.weight,
    stretch: face.stretch,
    display: face.display,
    unicodeRange: face.unicodeRange,
    featureSettings: face.featureSettings,
    variationSettings: face.variationSettings,
    ascentOverride: face.ascentOverride,
    descentOverride: face.descentOverride,
    lineGapOverride: face.lineGapOverride,
    contentPackageId: face.contentPackageId,
  })
}

function normalizeFontKeySegment(value: unknown): string {
  return String(value).trim().toLowerCase().replace(/\s+/g, '-')
}
