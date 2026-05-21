import type {
  AssetData,
  AssetLocale,
  AssetManifest,
  AssetProcessingPlugin,
  AssetProvider,
  AssetManifestRecord,
  AssetQueryResult,
  AssetStorage,
  AssetType,
  LoadAssetOptions,
  MediaMetadata,
  StoredAsset,
  StoredBundle,
} from './types'
import { bytesToUtf8 } from './encoding'
import { createLocaleFallbackChain, findBestAssetRecord, findBestRankedAssetRecord, findBestTargetRankedAssetRecord, normalizeLocale } from './providers'
import { AssetNotFoundError } from './types'

export class AssetManager {
  private storage: AssetStorage
  private processingPlugins = new Map<AssetType, AssetProcessingPlugin[]>()
  private defaultLocale: AssetLocale
  private provider?: AssetProvider
  private providerManifest?: AssetManifest

  constructor(storage: AssetStorage, defaultLocale: AssetLocale = 'default', provider?: AssetProvider) {
    this.storage = storage
    this.defaultLocale = defaultLocale
    this.provider = provider
  }

  registerProcessingPlugin(plugin: AssetProcessingPlugin): void {
    for (const type of plugin.supportedTypes) {
      if (!this.processingPlugins.has(type)) {
        this.processingPlugins.set(type, [])
      }
      this.processingPlugins.get(type)!.push(plugin)
    }
  }

  setProvider(provider?: AssetProvider): void {
    this.provider = provider
    this.providerManifest = undefined
    this.cleanup()
  }

  clearManifestCache(): void {
    this.providerManifest = undefined
  }

  async getAsset(
    type: AssetType,
    name: string,
    options: LoadAssetOptions = {},
  ): Promise<AssetData> {
    const result = await this.getAssetQueryResult(type, name, options)
    return toAssetData(result)
  }

  async getBytes(
    type: AssetType,
    name: string,
    options: LoadAssetOptions = {},
  ): Promise<Uint8Array> {
    const result = await this.getAssetQueryResult(type, name, options)
    return new Uint8Array(result.data)
  }

  async getText(
    type: AssetType,
    name: string,
    options: LoadAssetOptions = {},
  ): Promise<string> {
    const bytes = await this.getBytes(type, name, options)
    return bytesToUtf8(bytes)
  }

  async getJSON<T = unknown>(
    type: AssetType,
    name: string,
    options: LoadAssetOptions = {},
  ): Promise<T> {
    return JSON.parse(await this.getText(type, name, options)) as T
  }

  async getAssetBatch(
    type: AssetType,
    names: string[],
    options: LoadAssetOptions = {},
  ): Promise<Map<string, AssetData>> {
    const results = new Map<string, AssetData>()
    await Promise.allSettled(names.map(async (name) => {
      results.set(name, await this.getAsset(type, name, options))
    }))
    return results
  }

  async hasAsset(
    type: AssetType,
    name: string,
    options: LoadAssetOptions = {},
  ): Promise<boolean> {
    try {
      await this.getAssetQueryResult(type, name, options)
      return true
    }
    catch {
      return false
    }
  }

  async getMediaMetadata(
    type: AssetType,
    name: string,
    options: LoadAssetOptions = {},
  ): Promise<MediaMetadata | null> {
    try {
      const result = await this.getAssetQueryResult(type, name, options)
      return result.asset.mediaMetadata || null
    }
    catch {
      return null
    }
  }

  cleanup(): void {}

  getCacheStats(): Record<string, never> {
    return {}
  }

  clearAssetCache(_assetId: string): void {}

  async preloadAssets(requests: Array<{
    type: AssetType
    name: string
    options?: LoadAssetOptions
  }>): Promise<void> {
    await Promise.allSettled(requests.map(({ type, name, options }) =>
      this.getAssetQueryResult(type, name, options),
    ))
  }

  private async getAssetQueryResult(
    type: AssetType,
    name: string,
    options: LoadAssetOptions = {},
  ): Promise<AssetQueryResult> {
    const locale = options.locale || this.defaultLocale
    const bundleName = options.bundleName
    const providerRecord = await this.getProviderRecord(type, name, options)
    let asset: StoredAsset | undefined

    if (options.targetPackageId) {
      const assets = await this.storage.findAssets({ type, name })
      const bundles = await this.storage.getAllBundles()
      asset = this.findBestTargetLocaleMatch(assets, bundles, options.targetPackageId, locale)
    }
    else if (bundleName) {
      asset = await this.storage.getAssetWithLocaleFallback(bundleName, type, name, locale)
    }
    else {
      const assets = await this.storage.findAssets({ type, name })
      asset = this.findBestLocaleMatch(assets, locale)
    }

    if (providerRecord && isProviderRecordPreferred(providerRecord, asset, locale)) {
      return await this.getProviderAsset(providerRecord)
    }

    if (!asset) {
      throw new AssetNotFoundError(type, name)
    }

    const processedAsset = await this.processAsset(asset)
    return {
      asset: processedAsset,
      data: new Uint8Array(processedAsset.data),
      fromCache: true,
    }
  }

  private async getProviderRecord(
    type: AssetType,
    name: string,
    options: LoadAssetOptions,
  ): Promise<AssetManifestRecord | null> {
    if (!this.provider)
      return null

    const manifest = await this.getProviderManifest()
    const record = findBestAssetRecord(
      manifest.assets,
      type,
      name,
      options.locale || this.defaultLocale,
      options.bundleName,
    )

    if (!record)
      return null

    if (options.targetPackageId && record.runtimePackageId !== options.targetPackageId) {
      return null
    }

    return record
  }

  private async getProviderAsset(
    record: AssetManifestRecord,
  ): Promise<AssetQueryResult> {
    const provider = this.provider
    if (!provider) {
      throw new AssetNotFoundError(record.type, record.name)
    }
    const providerResult = await provider.getAsset(record.id, record)
    const now = Date.now()
    const data = providerResult instanceof Uint8Array
      ? providerResult
      : providerResult.data
    const asset: StoredAsset = {
      id: record.id,
      bundleName: record.bundleName || provider.mode,
      name: record.name,
      type: record.type,
      locale: record.locale || 'default',
      data: new Uint8Array(data),
      hash: record.hash || (providerResult instanceof Uint8Array ? '' : providerResult.hash || ''),
      mimeType: record.mimeType || (providerResult instanceof Uint8Array ? undefined : providerResult.mimeType),
      size: record.size ?? data.byteLength,
      version: record.version || 1,
      mtime: record.mtime || now,
      createdAt: now,
      lastAccessed: now,
      mediaMetadata: record.mediaMetadata,
    }

    const processedAsset = await this.processAsset(asset)
    return {
      asset: processedAsset,
      data: new Uint8Array(processedAsset.data),
      fromCache: false,
    }
  }

  private async getProviderManifest(): Promise<AssetManifest> {
    if (!this.providerManifest) {
      this.providerManifest = await this.provider!.getManifest()
    }
    return this.providerManifest
  }

  private findBestLocaleMatch(assets: StoredAsset[], preferredLocale: AssetLocale): StoredAsset | undefined {
    return findBestRankedAssetRecord(assets, preferredLocale)
  }

  private findBestTargetLocaleMatch(
    assets: StoredAsset[],
    bundles: StoredBundle[],
    targetPackageId: string,
    preferredLocale: AssetLocale,
  ): StoredAsset | undefined {
    const bundleByName = new Map(bundles.map(bundle => [bundle.name, bundle]))
    const fallbackChain = createLocaleFallbackChain(preferredLocale)
    const candidates = assets.filter((asset) => {
      const bundle = bundleByName.get(asset.bundleName)
      if (asset.runtimePackageId === targetPackageId) {
        return true
      }
      const localePack = bundle?.manifest.runtimePackage?.localePack
      if (!localePack || !fallbackChain.includes(normalizeLocale(localePack.locale))) {
        return false
      }
      return localePack.targets.some(target =>
        target.kind === 'runtimePackage'
        && target.id === targetPackageId,
      )
    })
    return findBestTargetRankedAssetRecord(candidates, preferredLocale)
  }

  private async processAsset(asset: StoredAsset): Promise<StoredAsset> {
    const plugins = this.processingPlugins.get(asset.type) || []
    let processedAsset = asset

    for (const plugin of plugins) {
      processedAsset = await plugin.processAsset(processedAsset)
    }

    return processedAsset
  }
}

function toAssetData(result: AssetQueryResult): AssetData {
  return {
    id: result.asset.id,
    type: result.asset.type,
    name: result.asset.name,
    bundleName: result.asset.bundleName,
    locale: result.asset.locale,
    data: new Uint8Array(result.data),
    hash: result.asset.hash,
    mimeType: result.asset.mimeType,
    mediaMetadata: result.asset.mediaMetadata,
    size: result.asset.size,
    version: result.asset.version,
    mtime: result.asset.mtime,
    fromCache: result.fromCache,
    runtimePackageId: result.asset.runtimePackageId,
    bundlePriority: result.asset.bundlePriority,
    loadedAt: result.asset.loadedAt,
  }
}

function isProviderRecordPreferred(
  providerRecord: AssetManifestRecord,
  storageAsset: StoredAsset | undefined,
  locale: AssetLocale,
): boolean {
  if (!storageAsset) {
    return true
  }
  return findBestRankedAssetRecord([providerRecord, storageAsset], locale) === providerRecord
}
