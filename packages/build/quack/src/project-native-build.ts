export const QUA_NATIVE_JSC_CARGO_FEATURE = 'javascriptcore'

export interface QuaProjectNativeBuildConfig extends Record<string, unknown> {
  cargoFeatures?: string[]
  /** Rust workspace manifest, relative to the project. */
  cargoManifest?: string
  cargoPackage?: string
  viteConfig?: string
  appAsset?: string
  workspaceConfig?: string
}

export function normalizeQuaProjectNativeBuildConfig(value: unknown): QuaProjectNativeBuildConfig {
  const record = asRecord(value) || {}
  for (const key of ['cargoManifest', 'cargoPackage', 'viteConfig', 'appAsset', 'workspaceConfig']) {
    const entry = record[key]
    if (entry !== undefined && (typeof entry !== 'string' || !entry.trim() || [...entry].some(character => character.charCodeAt(0) < 32)))
      throw new Error(`targets.native.build.${key} must be a nonempty string without control characters.`)
  }
  const cargoFeatures = normalizeQuaProjectNativeCargoFeatures([
    ...readCargoFeatureInput(record.cargoFeatures),
    ...readCargoFeatureInput(record.features),
  ])
  return cargoFeatures.length > 0
    ? { ...record, cargoFeatures }
    : { ...record }
}

export function normalizeQuaProjectNativeCargoFeatures(value: unknown): string[] {
  return [...new Set(readCargoFeatureInput(value).map(feature => feature.trim()).filter(Boolean))]
}

export function hasQuaProjectNativeCargoFeature(
  build: QuaProjectNativeBuildConfig | undefined,
  feature: string,
): boolean {
  return normalizeQuaProjectNativeCargoFeatures([
    ...readCargoFeatureInput(build?.cargoFeatures),
    ...readCargoFeatureInput(build?.features),
  ]).includes(feature)
}

function readCargoFeatureInput(value: unknown): string[] {
  if (typeof value === 'string') {
    return value.split(/[,\s]+/g)
  }
  if (Array.isArray(value)) {
    return value.filter((feature): feature is string => typeof feature === 'string')
  }
  return []
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}
