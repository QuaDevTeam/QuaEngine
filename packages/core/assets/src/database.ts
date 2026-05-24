import type {
  AssetCacheStats,
  AssetFindCriteria,
  AssetLocale,
  AssetStorage,
  AssetType,
  StoredAsset,
  StoredBundle,
} from './types'
import {
  compareStoredBundles,
  getBundleLogicalName,
  getBundleStorageKey,
  isBundleIdentityMatch,
  selectBestStoredBundle,
} from './bundle-identity'
import { findBestRankedAssetRecord } from './providers'

/**
 * Platform-neutral in-memory storage used by the core package and tests.
 * Persistent storage belongs in platform adapters.
 */
export class MemoryAssetStorage implements AssetStorage {
  protected assets = new Map<string, StoredAsset>()
  protected bundles = new Map<string, StoredBundle>()

  async open(): Promise<void> {}

  async close(): Promise<void> {}

  async getAsset(id: string): Promise<StoredAsset | undefined> {
    const asset = this.assets.get(id)
    if (!asset)
      return undefined

    const updated = { ...asset, lastAccessed: Date.now() }
    this.assets.set(id, updated)
    return cloneStoredAsset(updated)
  }

  async storeAsset(asset: StoredAsset): Promise<void> {
    this.assets.set(asset.id, cloneStoredAsset({ ...asset, lastAccessed: Date.now() }))
  }

  async storeAssets(assets: StoredAsset[]): Promise<void> {
    const now = Date.now()
    for (const asset of assets) {
      this.assets.set(asset.id, cloneStoredAsset({ ...asset, lastAccessed: now }))
    }
  }

  async findAssets(criteria: AssetFindCriteria): Promise<StoredAsset[]> {
    return Array.from(this.assets.values())
      .filter(asset => matchesCriteria(asset, criteria))
      .map(cloneStoredAsset)
  }

  async getAssetWithLocaleFallback(
    bundleName: string,
    type: AssetType,
    name: string,
    preferredLocale: AssetLocale = 'default',
    bundleVersionKey?: string,
  ): Promise<StoredAsset | undefined> {
    const activeBundle = bundleVersionKey ? undefined : this.resolveBundle(bundleName)
    const matches = await this.findAssets({
      bundleName,
      bundleVersionKey: bundleVersionKey || activeBundle?.versionKey,
      type,
      name,
    })
    return findBestRankedAssetRecord(matches, preferredLocale)
  }

  async deleteAsset(id: string): Promise<void> {
    this.assets.delete(id)
  }

  async deleteAssetsByBundle(bundleName: string): Promise<number> {
    const bundle = this.resolveBundle(bundleName)
    const versionKey = bundle?.versionKey
    let count = 0
    for (const asset of this.assets.values()) {
      if (matchesBundleForDeletion(asset, bundleName, versionKey)) {
        this.assets.delete(asset.id)
        count++
      }
    }
    return count
  }

  async storeBundle(bundle: StoredBundle): Promise<void> {
    const now = Date.now()
    const logicalName = getBundleLogicalName(bundle)
    const active = bundle.active !== false
    if (active) {
      for (const [key, existing] of this.bundles.entries()) {
        if (getBundleLogicalName(existing) === logicalName) {
          this.bundles.set(key, cloneStoredBundle({ ...existing, active: false }))
        }
      }
    }
    const stored = cloneStoredBundle({
      ...bundle,
      logicalName,
      versionKey: bundle.versionKey || bundle.name,
      active,
      lastUpdated: now,
    })
    this.bundles.set(getBundleStorageKey(stored), stored)
  }

  async getBundle(name: string): Promise<StoredBundle | undefined> {
    const bundle = this.resolveBundle(name)
    return bundle ? cloneStoredBundle(bundle) : undefined
  }

  async getAllBundles(): Promise<StoredBundle[]> {
    return Array.from(this.bundles.values()).map(cloneStoredBundle)
  }

  async deleteBundle(name: string): Promise<void> {
    const bundle = this.resolveBundle(name)
    if (!bundle) {
      return
    }
    await this.deleteAssetsByBundle(bundle.versionKey || bundle.name)
    this.bundles.delete(getBundleStorageKey(bundle))
    if (bundle.active) {
      this.promoteNextActiveBundle(getBundleLogicalName(bundle))
    }
  }

  async clearAll(): Promise<void> {
    this.assets.clear()
    this.bundles.clear()
  }

  async getDatabaseSize(): Promise<number> {
    let size = 0
    for (const asset of this.assets.values()) {
      size += asset.size
    }
    return size
  }

  async cleanupAssets(maxSize: number): Promise<number> {
    const currentSize = await this.getDatabaseSize()
    if (currentSize <= maxSize)
      return 0

    const sorted = Array.from(this.assets.values())
      .sort((a, b) => a.lastAccessed - b.lastAccessed)

    let removedSize = 0
    let removedCount = 0
    for (const asset of sorted) {
      this.assets.delete(asset.id)
      removedSize += asset.size
      removedCount++
      if (currentSize - removedSize <= maxSize)
        break
    }

    return removedCount
  }

  async getCacheStats(): Promise<AssetCacheStats> {
    const assets = Array.from(this.assets.values())
    const totalSize = await this.getDatabaseSize()
    const oldestAsset = assets.length
      ? new Date(Math.min(...assets.map(asset => asset.lastAccessed)))
      : null
    const newestAsset = assets.length
      ? new Date(Math.max(...assets.map(asset => asset.lastAccessed)))
      : null

    return {
      totalAssets: assets.length,
      totalBundles: this.bundles.size,
      totalSize,
      oldestAsset,
      newestAsset,
    }
  }

  protected resolveBundle(name: string): StoredBundle | undefined {
    const exact = this.bundles.get(name)
    if (exact)
      return exact

    const matches = Array.from(this.bundles.values()).filter(bundle => isBundleIdentityMatch(bundle, name))
    const active = matches.filter(bundle => bundle.active)
    return selectBestStoredBundle(active.length > 0 ? active : matches)
  }

  private promoteNextActiveBundle(logicalName: string): void {
    const candidates = Array.from(this.bundles.entries())
      .filter(([, bundle]) => getBundleLogicalName(bundle) === logicalName)
      .sort(([, left], [, right]) => compareStoredBundles(left, right))
    const next = candidates[0]
    if (!next)
      return
    const [key, bundle] = next
    this.bundles.set(key, cloneStoredBundle({ ...bundle, active: true }))
  }
}

export class QuaAssetsDatabase extends MemoryAssetStorage {}

function matchesCriteria(
  asset: StoredAsset,
  criteria: AssetFindCriteria,
): boolean {
  return (!criteria.bundleVersionKey || asset.bundleVersionKey === criteria.bundleVersionKey)
    && (!criteria.bundleName || matchesBundleCriteria(asset, criteria.bundleName))
    && (!criteria.type || asset.type === criteria.type)
    && (!criteria.locale || asset.locale === criteria.locale)
    && (!criteria.name || matchesAssetName(asset, criteria.name))
}

function matchesBundleCriteria(asset: StoredAsset, bundleName: string): boolean {
  return asset.bundleName === bundleName
    || asset.logicalBundleName === bundleName
    || asset.bundleVersionKey === bundleName
}

function matchesAssetName(asset: StoredAsset, name: string): boolean {
  return asset.name === name || asset.path === name || asset.path?.endsWith(`/${name}`) === true
}

function matchesBundleForDeletion(asset: StoredAsset, bundleName: string, versionKey?: string): boolean {
  if (versionKey) {
    return asset.bundleVersionKey === versionKey
  }
  return asset.bundleName === bundleName
    || asset.logicalBundleName === bundleName
    || asset.bundleVersionKey === bundleName
}

function cloneStoredAsset(asset: StoredAsset): StoredAsset {
  return {
    ...asset,
    data: new Uint8Array(asset.data),
    mediaMetadata: asset.mediaMetadata ? { ...asset.mediaMetadata } : undefined,
  }
}

function cloneStoredBundle(bundle: StoredBundle): StoredBundle {
  return {
    ...bundle,
    locales: [...bundle.locales],
    manifest: structuredCloneFallback(bundle.manifest),
  }
}

function structuredCloneFallback<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}
