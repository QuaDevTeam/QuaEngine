import type {
  AssetCacheStats,
  AssetFindCriteria,
  AssetLocale,
  AssetStorage,
  AssetType,
  StoredAsset,
  StoredBundle,
} from './types'

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
  ): Promise<StoredAsset | undefined> {
    const preferred = await this.getAsset(`${bundleName}:${preferredLocale}:${type}:${name}`)
    if (preferred)
      return preferred

    if (preferredLocale !== 'default') {
      const fallback = await this.getAsset(`${bundleName}:default:${type}:${name}`)
      if (fallback)
        return fallback
    }

    const matches = await this.findAssets({ bundleName, type, name })
    return matches[0]
  }

  async deleteAsset(id: string): Promise<void> {
    this.assets.delete(id)
  }

  async deleteAssetsByBundle(bundleName: string): Promise<number> {
    let count = 0
    for (const asset of this.assets.values()) {
      if (asset.bundleName === bundleName) {
        this.assets.delete(asset.id)
        count++
      }
    }
    return count
  }

  async storeBundle(bundle: StoredBundle): Promise<void> {
    this.bundles.set(bundle.name, cloneStoredBundle({ ...bundle, lastUpdated: Date.now() }))
  }

  async getBundle(name: string): Promise<StoredBundle | undefined> {
    const bundle = this.bundles.get(name)
    return bundle ? cloneStoredBundle(bundle) : undefined
  }

  async getAllBundles(): Promise<StoredBundle[]> {
    return Array.from(this.bundles.values()).map(cloneStoredBundle)
  }

  async deleteBundle(name: string): Promise<void> {
    this.bundles.delete(name)
    await this.deleteAssetsByBundle(name)
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
}

export class QuaAssetsDatabase extends MemoryAssetStorage {}

function matchesCriteria(asset: StoredAsset, criteria: AssetFindCriteria): boolean {
  return (!criteria.bundleName || asset.bundleName === criteria.bundleName)
    && (!criteria.type || asset.type === criteria.type)
    && (!criteria.locale || asset.locale === criteria.locale)
    && (!criteria.name || asset.name === criteria.name)
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
