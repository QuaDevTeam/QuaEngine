import type {
  AssetFindCriteria,
  StoredAsset,
  StoredBundle,
} from '@quajs/assets'

declare const TextDecoder: {
  new(): { decode: (input: Uint8Array) => string }
}

declare const TextEncoder: {
  new(): { encode: (input: string) => Uint8Array }
}

export interface NativeAssetStorageIndex {
  format: 'qua-native-assets'
  version: 1
  assets: StoredAsset[]
  bundles: StoredBundle[]
}

export function matchesCriteria(asset: StoredAsset, criteria: AssetFindCriteria): boolean {
  return (!criteria.bundleVersionKey || asset.bundleVersionKey === criteria.bundleVersionKey)
    && (!criteria.bundleName || matchesBundleCriteria(asset, criteria.bundleName))
    && (!criteria.type || asset.type === criteria.type)
    && (!criteria.locale || asset.locale === criteria.locale)
    && (!criteria.name || matchesAssetName(asset, criteria.name))
}

export function matchesBundleForDeletion(asset: StoredAsset, bundleName: string, versionKey?: string): boolean {
  if (versionKey)
    return asset.bundleVersionKey === versionKey
  return matchesBundleCriteria(asset, bundleName)
}

export function cloneStoredAsset(asset: StoredAsset): StoredAsset {
  return {
    ...asset,
    data: new Uint8Array(asset.data),
    mediaMetadata: asset.mediaMetadata ? { ...asset.mediaMetadata } : undefined,
  }
}

export function cloneStoredBundle(bundle: StoredBundle): StoredBundle {
  return {
    ...bundle,
    locales: [...bundle.locales],
    manifest: structuredCloneFallback(bundle.manifest),
  }
}

export function normalizeRoot(root: string): string {
  const normalized = root.trim().replace(/^\/+|\/+$/g, '')
  if (!normalized)
    return 'qua-native-assets-cache'
  if (
    normalized.includes('\\')
    || /^[a-z][a-z0-9+.-]*:/i.test(normalized)
    || normalized.split('/').some(segment => !segment || segment === '.' || segment === '..')
  ) {
    throw new Error(`Native asset cache root "${root}" must be a safe package-relative storage prefix.`)
  }
  return normalized
}

export function encodeJson(value: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(value))
}

export function decodeJson<T>(bytes: Uint8Array): T {
  return JSON.parse(new TextDecoder().decode(bytes)) as T
}

function matchesBundleCriteria(asset: StoredAsset, bundleName: string): boolean {
  return asset.bundleName === bundleName
    || asset.logicalBundleName === bundleName
    || asset.bundleVersionKey === bundleName
}

function matchesAssetName(asset: StoredAsset, name: string): boolean {
  return asset.name === name || asset.path === name || asset.path?.endsWith(`/${name}`) === true
}

function structuredCloneFallback<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}
