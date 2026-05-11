import type {
  AssetCacheStats,
  AssetFetchResult,
  AssetFindCriteria,
  AssetRuntimeAdapter,
  AssetStorage,
  QuaAssetsConfig,
  StoredAsset,
  StoredBundle,
} from '@quajs/assets'
import { createHash } from 'node:crypto'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { QuaAssets } from '@quajs/assets'
import lzma from 'lzma-native'

export interface NodeAssetsAdapterOptions {
  cacheDir?: string
  rootDir?: string
  storage?: AssetStorage
  now?: () => number
}

export function createNodeAssetsAdapter(options: NodeAssetsAdapterOptions = {}): AssetRuntimeAdapter {
  return {
    name: 'node',
    storage: options.storage || new FileSystemAssetStorage(options.cacheDir),
    fetcher: {
      async fetchBytes(url, fetchOptions = {}): Promise<AssetFetchResult> {
        if (/^https?:\/\//.test(url)) {
          const response = await fetch(url, { signal: fetchOptions.signal as AbortSignal | undefined })
          if (!response.ok) {
            throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`)
          }
          const data = new Uint8Array(await response.arrayBuffer())
          fetchOptions.onProgress?.(data.byteLength, Number(response.headers.get('content-length') || data.byteLength))
          return {
            data,
            mimeType: response.headers.get('content-type') || undefined,
            size: data.byteLength,
          }
        }

        const path = resolveFileUrl(url, options.rootDir)
        const data = new Uint8Array(await readFile(path))
        fetchOptions.onProgress?.(data.byteLength, data.byteLength)
        return {
          data,
          size: data.byteLength,
        }
      },
      async fetchJSON<T = unknown>(url: string): Promise<T> {
        const fetched = await this.fetchBytes(url)
        const bytes = fetched instanceof Uint8Array ? fetched : fetched.data
        return JSON.parse(new TextDecoder().decode(bytes)) as T
      },
    },
    crypto: {
      async sha256(data) {
        return createHash('sha256').update(data).digest('hex')
      },
    },
    codec: {
      async lzmaDecompress(data) {
        return new Uint8Array(await lzma.decompress(Buffer.from(data)))
      },
    },
    now: options.now,
  }
}

export function createNodeAssets(config: Omit<QuaAssetsConfig, 'adapter'> & {
  adapter?: AssetRuntimeAdapter
  node?: NodeAssetsAdapterOptions
}): QuaAssets {
  return new QuaAssets({
    ...config,
    adapter: config.adapter || createNodeAssetsAdapter(config.node),
  })
}

export class FileSystemAssetStorage implements AssetStorage {
  private assets = new Map<string, StoredAsset>()
  private bundles = new Map<string, StoredBundle>()
  private root: string

  constructor(cacheDir = join(process.cwd(), '.qua-assets-cache')) {
    this.root = cacheDir
  }

  async open(): Promise<void> {
    await mkdir(this.root, { recursive: true })
    await this.loadIndex()
  }

  async close(): Promise<void> {
    await this.saveIndex()
  }

  async getAsset(id: string): Promise<StoredAsset | undefined> {
    const metadata = this.assets.get(id)
    if (!metadata)
      return undefined
    const data = new Uint8Array(await readFile(this.assetPath(id)))
    const asset = { ...metadata, data, lastAccessed: Date.now() }
    this.assets.set(id, asset)
    return asset
  }

  async storeAsset(asset: StoredAsset): Promise<void> {
    await mkdir(dirname(this.assetPath(asset.id)), { recursive: true })
    await writeFile(this.assetPath(asset.id), asset.data)
    this.assets.set(asset.id, { ...asset, data: new Uint8Array(), lastAccessed: Date.now() })
    await this.saveIndex()
  }

  async storeAssets(assets: StoredAsset[]): Promise<void> {
    for (const asset of assets) {
      await this.storeAsset(asset)
    }
  }

  async findAssets(criteria: AssetFindCriteria): Promise<StoredAsset[]> {
    const results: StoredAsset[] = []
    for (const asset of this.assets.values()) {
      if ((!criteria.bundleName || asset.bundleName === criteria.bundleName)
        && (!criteria.type || asset.type === criteria.type)
        && (!criteria.locale || asset.locale === criteria.locale)
        && (!criteria.name || asset.name === criteria.name)) {
        const loaded = await this.getAsset(asset.id)
        if (loaded)
          results.push(loaded)
      }
    }
    return results
  }

  async getAssetWithLocaleFallback(bundleName: string, type: any, name: string, preferredLocale = 'default'): Promise<StoredAsset | undefined> {
    return await this.getAsset(`${bundleName}:${preferredLocale}:${type}:${name}`)
      || (preferredLocale !== 'default' ? await this.getAsset(`${bundleName}:default:${type}:${name}`) : undefined)
      || (await this.findAssets({ bundleName, type, name }))[0]
  }

  async deleteAsset(id: string): Promise<void> {
    this.assets.delete(id)
    await rm(this.assetPath(id), { force: true })
    await this.saveIndex()
  }

  async deleteAssetsByBundle(bundleName: string): Promise<number> {
    const ids = Array.from(this.assets.values()).filter(asset => asset.bundleName === bundleName).map(asset => asset.id)
    await Promise.all(ids.map(id => this.deleteAsset(id)))
    return ids.length
  }

  async storeBundle(bundle: StoredBundle): Promise<void> {
    this.bundles.set(bundle.name, bundle)
    await this.saveIndex()
  }

  async getBundle(name: string): Promise<StoredBundle | undefined> {
    return this.bundles.get(name)
  }

  async getAllBundles(): Promise<StoredBundle[]> {
    return Array.from(this.bundles.values())
  }

  async deleteBundle(name: string): Promise<void> {
    this.bundles.delete(name)
    await this.deleteAssetsByBundle(name)
    await this.saveIndex()
  }

  async clearAll(): Promise<void> {
    this.assets.clear()
    this.bundles.clear()
    await rm(this.root, { recursive: true, force: true })
    await mkdir(this.root, { recursive: true })
    await this.saveIndex()
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
      await this.deleteAsset(asset.id)
      removed++
      removedSize += asset.size
      if (current - removedSize <= maxSize)
        break
    }
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

  private assetPath(id: string): string {
    return join(this.root, 'assets', encodeURIComponent(id))
  }

  private async loadIndex(): Promise<void> {
    try {
      const index = JSON.parse(await readFile(join(this.root, 'index.json'), 'utf8')) as {
        assets: StoredAsset[]
        bundles: StoredBundle[]
      }
      this.assets = new Map(index.assets.map(asset => [asset.id, asset]))
      this.bundles = new Map(index.bundles.map(bundle => [bundle.name, bundle]))
    }
    catch {
      this.assets.clear()
      this.bundles.clear()
    }
  }

  private async saveIndex(): Promise<void> {
    await mkdir(this.root, { recursive: true })
    await writeFile(join(this.root, 'index.json'), JSON.stringify({
      assets: Array.from(this.assets.values()).map(asset => ({ ...asset, data: [] })),
      bundles: Array.from(this.bundles.values()),
    }))
  }
}

function resolveFileUrl(url: string, rootDir = process.cwd()): string {
  if (url.startsWith('file://')) {
    return new URL(url).pathname
  }
  return resolve(rootDir, url)
}
