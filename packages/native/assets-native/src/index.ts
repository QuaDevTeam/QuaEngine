import type {
  AssetCacheStats,
  AssetFetchResult,
  AssetFindCriteria,
  AssetLocale,
  AssetRuntimeAdapter,
  AssetStorage,
  AssetType,
  QuaAssetsConfig,
  StoredAsset,
  StoredBundle,
} from '@quajs/assets'
import type { QuaNativeHostApi } from '@quajs/native-contracts'
import {
  QuaAssets,
  compareStoredBundles,
  findBestRankedAssetRecord,
  getBundleLogicalName,
  getBundleStorageKey,
  isBundleIdentityMatch,
  selectBestStoredBundle,
} from '@quajs/assets'

declare const TextDecoder: {
  new(): { decode: (input: Uint8Array) => string }
}

declare const TextEncoder: {
  new(): { encode: (input: string) => Uint8Array }
}

export interface NativeAssetsAdapterOptions {
  host: QuaNativeHostApi
  storage?: AssetStorage
  now?: () => number
  cacheRoot?: string
}

export function createNativeAssetsAdapter(options: NativeAssetsAdapterOptions): AssetRuntimeAdapter {
  return {
    name: 'native',
    storage: options.storage || new NativeHostAssetStorage(options.host, {
      root: options.cacheRoot,
      now: options.now,
    }),
    fetcher: {
      async fetchBytes(url): Promise<AssetFetchResult> {
        const data = await options.host.readAssetBytes({ url })
        return {
          data,
          size: data.byteLength,
        }
      },
      async fetchJSON<T = unknown>(url: string): Promise<T> {
        const data = await options.host.readAssetBytes({ url })
        return JSON.parse(new TextDecoder().decode(data)) as T
      },
    },
    crypto: {
      async sha256(data) {
        return await options.host.hashBytes(data, 'sha256')
      },
    },
    now: options.now,
  }
}

export function createNativeAssets(config: Omit<QuaAssetsConfig, 'adapter'> & {
  adapter?: AssetRuntimeAdapter
  native: NativeAssetsAdapterOptions
}): QuaAssets {
  return new QuaAssets({
    ...config,
    adapter: config.adapter || createNativeAssetsAdapter(config.native),
  })
}

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
    for (const assetId of Array.from(this.assets.keys())) {
      await this.host.deleteStorage(this.assetPath(assetId))
    }
    this.assets.clear()
    this.bundles.clear()
    await this.host.deleteStorage(this.indexPath())
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

  private indexPath(): string {
    return `${this.root}/index.json`
  }

  private assetPath(id: string): string {
    return `${this.root}/assets/${encodeURIComponent(id)}.bin`
  }
}

interface NativeAssetStorageIndex {
  format: 'qua-native-assets'
  version: 1
  assets: StoredAsset[]
  bundles: StoredBundle[]
}

function matchesCriteria(asset: StoredAsset, criteria: AssetFindCriteria): boolean {
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
  if (versionKey)
    return asset.bundleVersionKey === versionKey
  return matchesBundleCriteria(asset, bundleName)
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

function normalizeRoot(root: string): string {
  return root.replace(/^\/+|\/+$/g, '') || 'qua-native-assets-cache'
}

function encodeJson(value: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(value))
}

function decodeJson<T>(bytes: Uint8Array): T {
  return JSON.parse(new TextDecoder().decode(bytes)) as T
}

function structuredCloneFallback<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}
