import type {
  AssetCacheStats,
  AssetFindCriteria,
  AssetLocale,
  AssetStorage,
  AssetType,
  StoredAsset,
  StoredBundle,
} from '@quajs/assets'
import type { QuaNativeHostApi } from '@quajs/native-contracts'
import {
  compareStoredBundles,
  findBestRankedAssetRecord,
  getBundleLogicalName,
  getBundleStorageKey,
  isBundleIdentityMatch,
  selectBestStoredBundle,
} from '@quajs/assets'
import {
  cloneStoredAsset,
  cloneStoredBundle,
  decodeJson,
  encodeJson,
  matchesBundleForDeletion,
  matchesCriteria,
  normalizeRoot,
  type NativeAssetStorageIndex,
} from './storage-records'

export class NativeHostAssetStorage implements AssetStorage {
  private readonly root: string
  private readonly now: () => number
  private assets = new Map<string, StoredAsset>()
  private bundles = new Map<string, StoredBundle>()
  private opened = false

  constructor(
    private readonly host: QuaNativeHostApi,
    options: { root?: string, now?: () => number } = {},
  ) {
    this.root = normalizeRoot(options.root || 'qua-native-assets-cache')
    this.now = options.now || (() => Date.now())
  }

  async open(): Promise<void> {
    if (this.opened)
      return
    await this.loadIndex()
    this.opened = true
  }

  async close(): Promise<void> {
    if (!this.opened)
      return
    await this.saveIndex()
    this.opened = false
  }

  async getAsset(id: string): Promise<StoredAsset | undefined> {
    const metadata = this.assets.get(id)
    if (!metadata)
      return undefined
    const data = await this.host.readStorage(this.assetPath(id))
    if (!data)
      return undefined
    const asset = cloneStoredAsset({ ...metadata, data, lastAccessed: this.now() })
    this.assets.set(id, cloneStoredAsset({ ...asset, data: new Uint8Array() }))
    await this.saveIndex()
    return cloneStoredAsset(asset)
  }

  async storeAsset(asset: StoredAsset): Promise<void> {
    await this.host.writeStorage(this.assetPath(asset.id), asset.data)
    const metadata = cloneStoredAsset({
      ...asset,
      data: new Uint8Array(),
      lastAccessed: this.now(),
    })
    this.assets.set(asset.id, metadata)
    await this.saveIndex()
  }

  async storeAssets(assets: StoredAsset[]): Promise<void> {
    for (const asset of assets) {
      await this.host.writeStorage(this.assetPath(asset.id), asset.data)
      this.assets.set(asset.id, cloneStoredAsset({
        ...asset,
        data: new Uint8Array(),
        lastAccessed: this.now(),
      }))
    }
    await this.saveIndex()
  }

  async findAssets(criteria: AssetFindCriteria): Promise<StoredAsset[]> {
    const results: StoredAsset[] = []
    for (const asset of this.assets.values()) {
      if (!matchesCriteria(asset, criteria))
        continue
      const loaded = await this.getAsset(asset.id)
      if (loaded)
        results.push(loaded)
    }
    return results
  }

  async getAssetWithLocaleFallback(
    bundleName: string,
    type: AssetType,
    name: string,
    preferredLocale: AssetLocale = 'default',
    bundleVersionKey?: string,
  ): Promise<StoredAsset | undefined> {
    const activeBundle = bundleVersionKey ? undefined : this.resolveBundle(bundleName)
    return findBestRankedAssetRecord(await this.findAssets({
      bundleName,
      bundleVersionKey: bundleVersionKey || activeBundle?.versionKey,
      type,
      name,
    }), preferredLocale)
  }

  async deleteAsset(id: string): Promise<void> {
    this.assets.delete(id)
    await this.host.deleteStorage(this.assetPath(id))
    await this.saveIndex()
  }

  async deleteAssetsByBundle(bundleName: string): Promise<number> {
    const bundle = this.resolveBundle(bundleName)
    const versionKey = bundle?.versionKey
    const ids = Array.from(this.assets.values())
      .filter(asset => matchesBundleForDeletion(asset, bundleName, versionKey))
      .map(asset => asset.id)
    for (const id of ids) {
      await this.host.deleteStorage(this.assetPath(id))
      this.assets.delete(id)
    }
    await this.saveIndex()
    return ids.length
  }

  async storeBundle(bundle: StoredBundle): Promise<void> {
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
      lastUpdated: this.now(),
    })
    this.bundles.set(getBundleStorageKey(stored), stored)
    await this.saveIndex()
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
    if (!bundle)
      return
    await this.deleteAssetsByBundle(bundle.versionKey || bundle.name)
    this.bundles.delete(getBundleStorageKey(bundle))
    if (bundle.active)
      this.promoteNextActiveBundle(getBundleLogicalName(bundle))
    await this.saveIndex()
  }

  async clearAll(): Promise<void> {
    await this.deleteStoragePrefix(`${this.root}/`)
    this.assets.clear()
    this.bundles.clear()
  }

  async getDatabaseSize(): Promise<number> {
    let total = 0
    for (const asset of this.assets.values()) {
      total += asset.size
    }
    return total
  }

  async cleanupAssets(maxSize: number): Promise<number> {
    const current = await this.getDatabaseSize()
    if (current <= maxSize)
      return 0
    const assets = Array.from(this.assets.values()).sort((a, b) => a.lastAccessed - b.lastAccessed)
    let removed = 0
    let removedSize = 0
    for (const asset of assets) {
      await this.host.deleteStorage(this.assetPath(asset.id))
      this.assets.delete(asset.id)
      removed += 1
      removedSize += asset.size
      if (current - removedSize <= maxSize)
        break
    }
    await this.saveIndex()
    return removed
  }

  async getCacheStats(): Promise<AssetCacheStats> {
    const assets = Array.from(this.assets.values())
    const totalSize = await this.getDatabaseSize()
    return {
      totalAssets: assets.length,
      totalBundles: this.bundles.size,
      totalSize,
      oldestAsset: assets.length ? new Date(Math.min(...assets.map(asset => asset.lastAccessed))) : null,
      newestAsset: assets.length ? new Date(Math.max(...assets.map(asset => asset.lastAccessed))) : null,
    }
  }

  private resolveBundle(name: string): StoredBundle | undefined {
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

  private async loadIndex(): Promise<void> {
    const data = await this.host.readStorage(this.indexPath())
    if (!data) {
      this.assets.clear()
      this.bundles.clear()
      return
    }
    const parsed = decodeJson<NativeAssetStorageIndex>(data)
    this.assets = new Map((parsed.assets || []).map(asset => [asset.id, cloneStoredAsset({
      ...asset,
      data: new Uint8Array(),
    })]))
    this.bundles = new Map((parsed.bundles || []).map(bundle => [getBundleStorageKey(bundle), cloneStoredBundle(bundle)]))
  }

  private async saveIndex(): Promise<void> {
    const index: NativeAssetStorageIndex = {
      format: 'qua-native-assets',
      version: 1,
      assets: Array.from(this.assets.values()).map(asset => cloneStoredAsset({
        ...asset,
        data: new Uint8Array(),
      })),
      bundles: Array.from(this.bundles.values()).map(cloneStoredBundle),
    }
    await this.host.writeStorage(this.indexPath(), encodeJson(index))
  }

  private async deleteStoragePrefix(prefix: string): Promise<void> {
    if (this.host.listStorageKeys) {
      const keys = await this.host.listStorageKeys(prefix)
      await Promise.all(keys.map(key => this.host.deleteStorage(key)))
      return
    }

    for (const assetId of Array.from(this.assets.keys())) {
      await this.host.deleteStorage(this.assetPath(assetId))
    }
    await this.host.deleteStorage(this.indexPath())
  }

  private indexPath(): string {
    return `${this.root}/index.json`
  }

  private assetPath(id: string): string {
    return `${this.root}/assets/${encodeURIComponent(id)}.bin`
  }
}
