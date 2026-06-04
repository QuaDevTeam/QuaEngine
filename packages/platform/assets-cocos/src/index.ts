import type {
  AssetCacheStats,
  AssetData,
  AssetFetchResult,
  AssetFindCriteria,
  AssetPipelineDomain,
  AssetRuntimeAdapter,
  AssetStorage,
  AssetType,
  BundleManifest,
  CocosHybridAssetManifest,
  QuaAssetsConfig,
  StoredAsset,
  StoredBundle,
} from '@quajs/assets'
import type { CocosHost, CocosHostResource, CocosHostResourceKind } from '@quajs/cocos-host'
import {
  compareStoredBundles,
  findBestRankedAssetRecord,
  getBundleLogicalName,
  getBundleStorageKey,
  isBundleIdentityMatch,
  QuaAssets,
  selectBestStoredBundle,
} from '@quajs/assets'

export interface CocosAssetsAdapterOptions {
  host: CocosHost
  cacheRoot?: string
  now?: () => number
  storage?: AssetStorage
}

export interface CocosAssetMaterializerOptions {
  host: CocosHost
}

export interface CocosMaterializedAsset {
  key: string
  type: AssetType
  name: string
  resource: CocosHostResource
  retain: () => void
  release: () => void
}

export function createCocosAssetsAdapter(options: CocosAssetsAdapterOptions): AssetRuntimeAdapter {
  const now = options.now || options.host.runtime.now
  return {
    name: 'cocos',
    storage: options.storage || new CocosAssetStorage(options.host, { root: options.cacheRoot, now }),
    fetcher: {
      async fetchBytes(url, fetchOptions = {}): Promise<AssetFetchResult> {
        const bytes = await options.host.assets.loadBytes(url)
        fetchOptions.onProgress?.(bytes.byteLength, bytes.byteLength)
        return {
          data: bytes,
          size: bytes.byteLength,
        }
      },
      async fetchJSON<T = unknown>(url: string): Promise<T> {
        const bytes = await options.host.assets.loadBytes(url)
        return JSON.parse(bytesToUtf8(bytes)) as T
      },
    },
    crypto: {
      sha256,
    },
    now,
  }
}

export function createCocosAssets(config: Omit<QuaAssetsConfig, 'adapter'> & {
  adapter?: AssetRuntimeAdapter
  cocos?: CocosAssetsAdapterOptions
  staticOnly?: boolean
}): QuaAssets {
  if (!config.adapter && !config.cocos) {
    throw new Error('createCocosAssets requires either adapter or cocos options.')
  }
  const assets = new QuaAssets({
    ...config,
    adapter: config.adapter || createCocosAssetsAdapter(config.cocos!),
  })
  return config.staticOnly === false ? assets : createCocosStaticAssets(assets)
}

export function createCocosStaticAssets(assets: QuaAssets): QuaAssets {
  return Object.assign(assets, {
    async loadDynamicBundle(): Promise<never> {
      throw new Error('Cocos static-only assets do not support dynamic Runtime Package bundle loading.')
    },
  })
}

const HYBRID_ASSET_DOMAINS = new Set<AssetPipelineDomain>(['images', 'characters', 'audio', 'video', 'fonts'])

export function getCocosHybridAssetManifest(manifest: BundleManifest): CocosHybridAssetManifest | undefined {
  return manifest.assetTarget?.cocos?.hybrid
}

export function shouldUseCocosNativeAsset(manifest: BundleManifest, type: AssetType): boolean {
  if (!HYBRID_ASSET_DOMAINS.has(type as AssetPipelineDomain))
    return false
  const hybrid = getCocosHybridAssetManifest(manifest)
  return Boolean(hybrid?.enabled && hybrid.domains[type as AssetPipelineDomain] === 'cocos-bundle')
}

export class CocosAssetStorage implements AssetStorage {
  private readonly root: string
  private readonly now: () => number
  private assets = new Map<string, StoredAsset>()
  private bundles = new Map<string, StoredBundle>()
  private opened = false

  constructor(private readonly host: CocosHost, options: { root?: string, now?: () => number } = {}) {
    this.root = normalizeRoot(options.root || 'qua-assets-cache')
    this.now = options.now || host.runtime.now
  }

  async open(): Promise<void> {
    if (this.opened)
      return
    await this.host.storage.ensureDir(this.root)
    await this.loadIndex()
    this.opened = true
  }

  async close(): Promise<void> {
    await this.saveIndex()
  }

  async getAsset(id: string): Promise<StoredAsset | undefined> {
    const metadata = this.assets.get(id)
    if (!metadata)
      return undefined
    const data = await this.host.storage.readBytes(this.assetPath(id))
    if (!data)
      return undefined
    const asset = cloneStoredAsset({ ...metadata, data, lastAccessed: this.now() })
    this.assets.set(id, asset)
    await this.saveIndex()
    return cloneStoredAsset(asset)
  }

  async storeAsset(asset: StoredAsset): Promise<void> {
    await this.host.storage.writeBytes(this.assetPath(asset.id), asset.data)
    this.assets.set(asset.id, cloneStoredAsset({ ...asset, data: new Uint8Array(), lastAccessed: this.now() }))
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
      if (!matchesAsset(asset, criteria))
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
    preferredLocale = 'default',
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
    await this.host.storage.delete(this.assetPath(id))
    await this.saveIndex()
  }

  async deleteAssetsByBundle(bundleName: string): Promise<number> {
    const bundle = this.resolveBundle(bundleName)
    const versionKey = bundle?.versionKey
    const ids = Array.from(this.assets.values())
      .filter(asset => matchesBundleForDeletion(asset, bundleName, versionKey))
      .map(asset => asset.id)
    for (const id of ids) {
      await this.deleteAsset(id)
    }
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
    if (bundle.active) {
      this.promoteNextActiveBundle(getBundleLogicalName(bundle))
    }
    await this.saveIndex()
  }

  async clearAll(): Promise<void> {
    for (const assetId of Array.from(this.assets.keys())) {
      await this.host.storage.delete(this.assetPath(assetId))
    }
    this.assets.clear()
    this.bundles.clear()
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
      removed += 1
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
    const text = await this.host.storage.readText(this.indexPath())
    if (!text)
      return
    const parsed = JSON.parse(text) as { assets?: StoredAsset[], bundles?: StoredBundle[] }
    this.assets = new Map((parsed.assets || []).map(asset => [asset.id, reviveStoredAsset(asset)]))
    this.bundles = new Map((parsed.bundles || []).map(bundle => [getBundleStorageKey(bundle), cloneStoredBundle(bundle)]))
  }

  private async saveIndex(): Promise<void> {
    await this.host.storage.ensureDir(this.root)
    await this.host.storage.writeText(this.indexPath(), JSON.stringify({
      assets: Array.from(this.assets.values()).map(asset => ({ ...asset, data: undefined })),
      bundles: Array.from(this.bundles.values()),
    }))
  }

  private indexPath(): string {
    return `${this.root}/index.json`
  }

  private assetPath(id: string): string {
    return `${this.root}/assets/${encodeURIComponent(id)}.bin`
  }
}

export class CocosAssetMaterializer {
  private refs = new Map<string, { resource: CocosHostResource, count: number }>()

  constructor(private readonly options: CocosAssetMaterializerOptions) {}

  async materialize(asset: AssetData, kind = inferResourceKind(asset)): Promise<CocosMaterializedAsset> {
    const key = `${asset.id}:${kind}`
    const existing = this.refs.get(key)
    if (existing) {
      existing.count += 1
      return this.createHandle(key, asset, existing.resource)
    }
    const resource = await this.options.host.assets.createResource(kind, asset.data, {
      id: key,
      source: asset.path || asset.name,
      mimeType: asset.mimeType,
      metadata: asset.mediaMetadata,
    })
    this.refs.set(key, { resource, count: 1 })
    return this.createHandle(key, asset, resource)
  }

  retain(key: string): void {
    const current = this.refs.get(key)
    if (current) {
      current.count += 1
      this.options.host.assets.retainResource?.(current.resource)
    }
  }

  release(key: string): void {
    const current = this.refs.get(key)
    if (!current)
      return
    current.count -= 1
    if (current.count <= 0) {
      this.refs.delete(key)
      this.options.host.assets.releaseResource(current.resource)
    }
  }

  clear(): void {
    for (const [key, ref] of Array.from(this.refs.entries())) {
      this.refs.delete(key)
      this.options.host.assets.releaseResource(ref.resource)
    }
  }

  private createHandle(key: string, asset: AssetData, resource: CocosHostResource): CocosMaterializedAsset {
    return {
      key,
      type: asset.type,
      name: asset.name,
      resource,
      retain: () => this.retain(key),
      release: () => this.release(key),
    }
  }
}

function inferResourceKind(asset: AssetData): CocosHostResourceKind {
  switch (asset.type) {
    case 'images':
    case 'characters':
      return 'spriteFrame'
    case 'audio':
      return 'audio'
    case 'video':
      return 'video'
    case 'fonts':
      return 'font'
    default:
      return 'custom'
  }
}

function matchesAsset(asset: StoredAsset, criteria: AssetFindCriteria): boolean {
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

function reviveStoredAsset(asset: StoredAsset): StoredAsset {
  return {
    ...asset,
    data: new Uint8Array(asset.data || []),
  }
}

function cloneStoredBundle(bundle: StoredBundle): StoredBundle {
  return {
    ...bundle,
    locales: [...bundle.locales],
    manifest: JSON.parse(JSON.stringify(bundle.manifest)),
  }
}

function normalizeRoot(root: string): string {
  return root.replace(/\/+$/, '')
}

function bytesToUtf8(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes)
}

async function sha256(data: Uint8Array): Promise<string> {
  const digest = await cryptoSubtleDigest(data)
  return Array.from(digest).map(byte => byte.toString(16).padStart(2, '0')).join('')
}

async function cryptoSubtleDigest(data: Uint8Array): Promise<Uint8Array> {
  if (globalThis.crypto?.subtle) {
    const copy = new Uint8Array(data.byteLength)
    copy.set(data)
    return new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', copy.buffer))
  }
  return sha256Bytes(data)
}

function sha256Bytes(message: Uint8Array): Uint8Array {
  const h = new Uint32Array([
    0x6A09E667,
    0xBB67AE85,
    0x3C6EF372,
    0xA54FF53A,
    0x510E527F,
    0x9B05688C,
    0x1F83D9AB,
    0x5BE0CD19,
  ])
  const k = new Uint32Array([
    0x428A2F98,
    0x71374491,
    0xB5C0FBCF,
    0xE9B5DBA5,
    0x3956C25B,
    0x59F111F1,
    0x923F82A,
    0xAB1C5ED5,
    0xD807AA98,
    0x12835B01,
    0x243185BE,
    0x550C7DC3,
    0x72BE5D74,
    0x80DEB1FE,
    0x9BDC06A7,
    0xC19BF174,
    0xE49B69C1,
    0xEFBE4786,
    0x0FC19DC6,
    0x240CA1CC,
    0x2DE92C6F,
    0x4A7484AA,
    0x5CB0A9DC,
    0x76F988DA,
    0x983E5152,
    0xA831C66D,
    0xB00327C8,
    0xBF597FC7,
    0xC6E00BF3,
    0xD5A79147,
    0x06CA6351,
    0x14292967,
    0x27B70A85,
    0x2E1B2138,
    0x4D2C6DFC,
    0x53380D13,
    0x650A7354,
    0x766A0ABB,
    0x81C2C92E,
    0x92722C85,
    0xA2BFE8A1,
    0xA81A664B,
    0xC24B8B70,
    0xC76C51A3,
    0xD192E819,
    0xD6990624,
    0xF40E3585,
    0x106AA070,
    0x19A4C116,
    0x1E376C08,
    0x2748774C,
    0x34B0BCB5,
    0x391C0CB3,
    0x4ED8AA4A,
    0x5B9CCA4F,
    0x682E6FF3,
    0x748F82EE,
    0x78A5636F,
    0x84C87814,
    0x8CC70208,
    0x90BEFFFA,
    0xA4506CEB,
    0xBEF9A3F7,
    0xC67178F2,
  ])
  const bitLength = message.length * 8
  const paddedLength = (((message.length + 9 + 63) >> 6) << 6)
  const padded = new Uint8Array(paddedLength)
  padded.set(message)
  padded[message.length] = 0x80
  const view = new DataView(padded.buffer)
  view.setUint32(paddedLength - 8, Math.floor(bitLength / 2 ** 32), false)
  view.setUint32(paddedLength - 4, bitLength >>> 0, false)
  const w = new Uint32Array(64)
  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let i = 0; i < 16; i++) {
      w[i] = view.getUint32(offset + i * 4, false)
    }
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3)
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10)
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0
    }
    let [a, b, c, d, e, f, g, hh] = h
    for (let i = 0; i < 64; i++) {
      const s1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)
      const ch = (e & f) ^ (~e & g)
      const temp1 = (hh + s1 + ch + k[i] + w[i]) >>> 0
      const s0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)
      const maj = (a & b) ^ (a & c) ^ (b & c)
      const temp2 = (s0 + maj) >>> 0
      hh = g
      g = f
      f = e
      e = (d + temp1) >>> 0
      d = c
      c = b
      b = a
      a = (temp1 + temp2) >>> 0
    }
    h[0] = (h[0] + a) >>> 0
    h[1] = (h[1] + b) >>> 0
    h[2] = (h[2] + c) >>> 0
    h[3] = (h[3] + d) >>> 0
    h[4] = (h[4] + e) >>> 0
    h[5] = (h[5] + f) >>> 0
    h[6] = (h[6] + g) >>> 0
    h[7] = (h[7] + hh) >>> 0
  }
  const out = new Uint8Array(32)
  const outView = new DataView(out.buffer)
  for (let i = 0; i < 8; i++) {
    outView.setUint32(i * 4, h[i], false)
  }
  return out
}

function rotr(value: number, bits: number): number {
  return (value >>> bits) | (value << (32 - bits))
}
