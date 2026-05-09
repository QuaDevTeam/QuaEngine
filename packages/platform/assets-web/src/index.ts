import type {
  AssetChange,
  AssetChangeListener,
  AssetData,
  AssetFetchResult,
  AssetManifest,
  AssetManifestRecord,
  AssetProvider,
  AssetRuntimeAdapter,
  AssetStorage,
  LoadBundleOptions,
  QuaAssetsConfig,
  StoredAsset,
  StoredBundle,
} from '@quajs/assets'
import type { Table } from 'dexie'
import { QuaAssets } from '@quajs/assets'
import Dexie from 'dexie'
import LZMA from 'lzma-web'

export interface WebAssetsAdapterOptions {
  databaseName?: string
  databaseVersion?: number
  fetcher?: typeof fetch
  now?: () => number
  storage?: AssetStorage
}

export interface WebAssetObjectUrlHandle {
  url: string
  revoke: () => void
}

export function createWebAssetsAdapter(options: WebAssetsAdapterOptions = {}): AssetRuntimeAdapter {
  const fetcher = options.fetcher || fetch
  return {
    name: 'web',
    storage: options.storage || (new IndexedDBAssetStorage(options.databaseName, options.databaseVersion) as unknown as AssetStorage),
    fetcher: {
      async fetchBytes(url, fetchOptions = {}): Promise<AssetFetchResult> {
        const response = await fetcher(url, {
          cache: fetchOptions.cache === false ? 'no-cache' : 'default',
          signal: fetchOptions.signal as AbortSignal | undefined,
        })
        if (!response.ok) {
          throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`)
        }

        const total = Number(response.headers.get('content-length') || 0)
        if (!response.body || !fetchOptions.onProgress) {
          const data = new Uint8Array(await response.arrayBuffer())
          fetchOptions.onProgress?.(data.byteLength, total)
          return {
            data,
            mimeType: response.headers.get('content-type') || undefined,
            size: data.byteLength,
          }
        }

        const reader = response.body.getReader()
        const chunks: Uint8Array[] = []
        let loaded = 0
        while (true) {
          const { done, value } = await reader.read()
          if (done)
            break
          chunks.push(value)
          loaded += value.byteLength
          fetchOptions.onProgress(loaded, total)
        }

        return {
          data: concatBytes(chunks),
          mimeType: response.headers.get('content-type') || undefined,
          size: loaded,
        }
      },
      async fetchJSON<T = unknown>(url: string, options: { cache?: boolean, signal?: unknown } = {}): Promise<T> {
        const response = await fetcher(url, {
          cache: options.cache === false ? 'no-cache' : 'default',
          signal: options.signal as AbortSignal | undefined,
        })
        if (!response.ok) {
          throw new Error(`Failed to fetch JSON ${url}: ${response.status} ${response.statusText}`)
        }
        return await response.json() as T
      },
    },
    crypto: {
      async sha256(data) {
        const hash = await crypto.subtle.digest('SHA-256', toArrayBuffer(data))
        return Array.from(new Uint8Array(hash)).map(byte => byte.toString(16).padStart(2, '0')).join('')
      },
    },
    codec: {
      async lzmaDecompress(data) {
        const lzma = new LZMA()
        const result = await lzma.decompress(data)
        if (typeof result === 'string')
          return new TextEncoder().encode(result)
        if (Array.isArray(result))
          return new Uint8Array(result)
        return result instanceof Uint8Array ? result : new Uint8Array(result as ArrayBuffer)
      },
    },
    now: options.now,
  }
}

export function createWebAssets(config: Omit<QuaAssetsConfig, 'adapter'> & {
  adapter?: AssetRuntimeAdapter
  web?: WebAssetsAdapterOptions
}): QuaAssets {
  return new QuaAssets({
    ...config,
    adapter: config.adapter || createWebAssetsAdapter(config.web),
  })
}

export interface WebAssetRuntimeProgress {
  bundleName: string
  bundleIndex: number
  bundleCount: number
  loaded: number
  total: number
  progress: number
}

export interface WebAssetRuntimeConfig extends Omit<QuaAssetsConfig, 'adapter'> {
  adapter?: AssetRuntimeAdapter
  web?: WebAssetsAdapterOptions
  initialBundles?: string | readonly string[]
  initialBundleOptions?: LoadBundleOptions
  onProgress?: (progress: WebAssetRuntimeProgress) => void
}

export async function createWebAssetRuntime(config: WebAssetRuntimeConfig): Promise<QuaAssets> {
  const { initialBundles, initialBundleOptions, onProgress, ...assetsConfig } = config
  const assets = createWebAssets(assetsConfig)
  await assets.initialize()
  const bundleList = normalizeBundleList(initialBundles)
  for (let index = 0; index < bundleList.length; index++) {
    const bundleName = bundleList[index]
    await assets.loadBundle(bundleName, {
      ...initialBundleOptions,
      onProgress: (loaded, total) => {
        initialBundleOptions?.onProgress?.(loaded, total)
        onProgress?.({
          bundleName,
          bundleIndex: index,
          bundleCount: bundleList.length,
          loaded,
          total,
          progress: total > 0 ? loaded / total : 0,
        })
      },
    })
  }
  return assets
}

export interface ViteDevAssetRuntimeConfig extends WebAssetRuntimeConfig {
  hmr?: DevVfsAssetProviderOptions['hmr']
  fetcher?: typeof fetch
  manifestUrl?: string
  assetBaseUrl?: string
}

export async function createViteDevAssetRuntime(options: ViteDevAssetRuntimeConfig = {}): Promise<QuaAssets> {
  const provider = createDevVfsProvider({
    manifestUrl: options.manifestUrl,
    assetBaseUrl: options.assetBaseUrl,
    hmr: options.hmr,
    fetcher: options.fetcher,
  })
  return await createWebAssetRuntime({
    ...options,
    provider,
    web: {
      databaseName: 'QuaAssetsDev',
      ...options.web,
      fetcher: options.web?.fetcher || options.fetcher,
    },
  })
}

export async function getBlob(assets: QuaAssets, type: Parameters<QuaAssets['getAsset']>[0], name: string, options?: Parameters<QuaAssets['getAsset']>[2]): Promise<Blob> {
  return assetDataToBlob(await assets.getAsset(type, name, options))
}

export async function getBlobURL(assets: QuaAssets, type: Parameters<QuaAssets['getAsset']>[0], name: string, options?: Parameters<QuaAssets['getAsset']>[2]): Promise<string> {
  const asset = await assets.getAsset(type, name, options)
  return createObjectURL(asset)
}

export function assetDataToBlob(assetData: AssetData): Blob {
  return new Blob([toArrayBuffer(assetData.data)], { type: assetData.mimeType || 'application/octet-stream' })
}

export function createObjectURL(assetData: AssetData): string {
  return URL.createObjectURL(assetDataToBlob(assetData))
}

export function createObjectURLHandle(assetData: AssetData): WebAssetObjectUrlHandle {
  const url = createObjectURL(assetData)
  return {
    url,
    revoke: () => revokeObjectURL(url),
  }
}

export function revokeObjectURL(url: string): void {
  URL.revokeObjectURL(url)
}

export interface DevVfsAssetProviderOptions {
  manifestUrl?: string
  assetBaseUrl?: string
  hmr?: {
    on: (event: string, listener: (change: AssetChange) => void) => void
    off?: (event: string, listener: (change: AssetChange) => void) => void
  }
  fetcher?: typeof fetch
}

export class DevVfsAssetProvider implements AssetProvider {
  mode = 'dev-vfs' as const
  private manifestUrl: string
  private assetBaseUrl: string
  private hmr?: DevVfsAssetProviderOptions['hmr']
  private fetcher: typeof fetch
  private manifest: AssetManifest | null = null
  private recordsById = new Map<string, AssetManifestRecord>()

  constructor(options: DevVfsAssetProviderOptions = {}) {
    this.manifestUrl = options.manifestUrl || '/@qua-assets/manifest.json'
    this.assetBaseUrl = options.assetBaseUrl || '/@qua-assets/'
    this.hmr = options.hmr
    this.fetcher = options.fetcher || fetch
  }

  async init(): Promise<void> {
    await this.refreshManifest()
  }

  async getManifest(): Promise<AssetManifest> {
    if (!this.manifest) {
      await this.refreshManifest()
    }
    return this.manifest!
  }

  async getAsset(id: string, record?: AssetManifestRecord): Promise<AssetData> {
    const assetRecord = record || this.recordsById.get(id)
    if (!assetRecord) {
      throw new Error(`Asset not found in dev VFS manifest: ${id}`)
    }
    const response = await this.fetcher(this.getAssetUrl(assetRecord), { cache: 'no-cache' })
    if (!response.ok) {
      throw new Error(`Failed to fetch dev VFS asset ${id}: ${response.status} ${response.statusText}`)
    }
    const data = new Uint8Array(await response.arrayBuffer())
    return {
      id: assetRecord.id,
      type: assetRecord.type,
      name: assetRecord.name,
      bundleName: assetRecord.bundleName || this.mode,
      locale: assetRecord.locale || 'default',
      data,
      hash: assetRecord.hash,
      mimeType: assetRecord.mimeType || response.headers.get('content-type') || undefined,
      mediaMetadata: assetRecord.mediaMetadata,
      size: assetRecord.size ?? data.byteLength,
      version: assetRecord.version || 1,
      mtime: assetRecord.mtime || Date.now(),
      fromCache: false,
    }
  }

  watch(listener: AssetChangeListener): () => void {
    if (!this.hmr)
      return () => {}

    const handler = (change: AssetChange) => {
      this.applyManifestChange(change)
      listener(change)
    }
    this.hmr.on('qua-assets:update', handler)
    return () => this.hmr?.off?.('qua-assets:update', handler)
  }

  private async refreshManifest(): Promise<void> {
    const response = await this.fetcher(this.manifestUrl, { cache: 'no-cache' })
    if (!response.ok) {
      throw new Error(`Failed to fetch dev VFS manifest: ${response.status} ${response.statusText}`)
    }
    this.setManifest(await response.json() as AssetManifest)
  }

  private setManifest(manifest: AssetManifest): void {
    this.manifest = manifest
    this.recordsById.clear()
    for (const record of manifest.assets) {
      this.recordsById.set(record.id, record)
    }
  }

  private applyManifestChange(change: AssetChange): void {
    if (!this.manifest)
      return
    if (change.type === 'removed') {
      this.recordsById.delete(change.assetId)
      this.manifest.assets = this.manifest.assets.filter(record => record.id !== change.assetId)
      return
    }
    if (!change.record)
      return
    const index = this.manifest.assets.findIndex(record => record.id === change.assetId)
    if (index === -1) {
      this.manifest.assets.push(change.record)
    }
    else {
      this.manifest.assets[index] = change.record
    }
    this.recordsById.set(change.assetId, change.record)
  }

  private getAssetUrl(record: AssetManifestRecord): string {
    if (/^https?:\/\//.test(record.path) || record.path.startsWith('/')) {
      return record.path
    }
    return `${this.assetBaseUrl.replace(/\/$/, '')}/${record.path.replace(/^\//, '')}`
  }
}

export function createDevVfsProvider(options?: DevVfsAssetProviderOptions): DevVfsAssetProvider {
  return new DevVfsAssetProvider(options)
}

function normalizeBundleList(bundles: WebAssetRuntimeConfig['initialBundles']): string[] {
  if (!bundles)
    return []
  return typeof bundles === 'string' ? [bundles] : [...bundles]
}

class IndexedDBAssetStorage extends Dexie {
  assets!: Table<StoredAsset, string>
  bundles!: Table<StoredBundle, string>

  constructor(databaseName = 'QuaAssetsDB', version = 1) {
    super(databaseName)
    this.version(version).stores({
      assets: 'id, bundleName, name, type, locale, hash, version, lastAccessed, createdAt',
      bundles: 'name, version, buildNumber, hash, lastUpdated, createdAt',
    })
  }

  async storeAsset(asset: StoredAsset): Promise<void> {
    await this.assets.put({ ...asset, lastAccessed: Date.now() })
  }

  async storeAssets(assets: StoredAsset[]): Promise<void> {
    const now = Date.now()
    await this.assets.bulkPut(assets.map(asset => ({ ...asset, lastAccessed: now })))
  }

  async getAsset(id: string): Promise<StoredAsset | undefined> {
    const asset = await this.assets.get(id)
    if (asset) {
      await this.assets.put({ ...asset, lastAccessed: Date.now() })
    }
    return asset
  }

  async findAssets(criteria: { bundleName?: string, type?: any, locale?: string, name?: string }): Promise<StoredAsset[]> {
    return await this.assets
      .filter(asset =>
        (!criteria.bundleName || asset.bundleName === criteria.bundleName)
        && (!criteria.type || asset.type === criteria.type)
        && (!criteria.locale || asset.locale === criteria.locale)
        && (!criteria.name || asset.name === criteria.name),
      )
      .toArray()
  }

  async getAssetWithLocaleFallback(bundleName: string, type: any, name: string, preferredLocale = 'default'): Promise<StoredAsset | undefined> {
    return await this.getAsset(`${bundleName}:${preferredLocale}:${type}:${name}`)
      || (preferredLocale !== 'default' ? await this.getAsset(`${bundleName}:default:${type}:${name}`) : undefined)
      || (await this.findAssets({ bundleName, type, name }))[0]
  }

  async deleteAsset(id: string): Promise<void> {
    await this.assets.delete(id)
  }

  async deleteAssetsByBundle(bundleName: string): Promise<number> {
    return await this.assets.where('bundleName').equals(bundleName).delete()
  }

  async storeBundle(bundle: StoredBundle): Promise<void> {
    await this.bundles.put({ ...bundle, lastUpdated: Date.now() })
  }

  async getBundle(name: string): Promise<StoredBundle | undefined> {
    return await this.bundles.get(name)
  }

  async getAllBundles(): Promise<StoredBundle[]> {
    return await this.bundles.toArray()
  }

  async deleteBundle(name: string): Promise<void> {
    await this.transaction('rw', this.bundles, this.assets, async () => {
      await this.bundles.delete(name)
      await this.deleteAssetsByBundle(name)
    })
  }

  async clearAll(): Promise<void> {
    await this.transaction('rw', this.bundles, this.assets, async () => {
      await this.bundles.clear()
      await this.assets.clear()
    })
  }

  async getDatabaseSize(): Promise<number> {
    let size = 0
    await this.assets.each((asset) => {
      size += asset.size
    })
    return size
  }

  async cleanupAssets(maxSize: number): Promise<number> {
    const currentSize = await this.getDatabaseSize()
    if (currentSize <= maxSize)
      return 0
    const assets = await this.assets.orderBy('lastAccessed').toArray()
    let removedSize = 0
    const ids: string[] = []
    for (const asset of assets) {
      ids.push(asset.id)
      removedSize += asset.size
      if (currentSize - removedSize <= maxSize)
        break
    }
    await this.assets.bulkDelete(ids)
    return ids.length
  }

  async getCacheStats() {
    const assets = await this.assets.toArray()
    const totalSize = assets.reduce((sum, asset) => sum + asset.size, 0)
    return {
      totalAssets: assets.length,
      totalBundles: await this.bundles.count(),
      totalSize,
      oldestAsset: assets.length ? new Date(Math.min(...assets.map(asset => asset.lastAccessed))) : null,
      newestAsset: assets.length ? new Date(Math.max(...assets.map(asset => asset.lastAccessed))) : null,
    }
  }
}

function concatBytes(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0)
  const result = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.byteLength
  }
  return result
}

function toArrayBuffer(data: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(data.byteLength)
  new Uint8Array(buffer).set(data)
  return buffer
}
