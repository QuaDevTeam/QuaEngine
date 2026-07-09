export const QUA_NATIVE_QUICKJS_CARGO_FEATURE = 'quickjs-rquickjs'

export interface QuaProjectNativeBuildConfig extends Record<string, unknown> {
  cargoFeatures?: string[]
}

export function normalizeQuaProjectNativeBuildConfig(value: unknown): QuaProjectNativeBuildConfig {
  const record = asRecord(value) || {}
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
