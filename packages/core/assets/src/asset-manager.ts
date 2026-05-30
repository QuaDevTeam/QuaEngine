import type {
  AssetData,
  AssetLocale,
  AssetManifest,
  AssetManifestRecord,
  AssetProcessingPlugin,
  AssetProvider,
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
  private appVersion?: string

  constructor(storage: AssetStorage, defaultLocale: AssetLocale = 'default', provider?: AssetProvider, appVersion?: string) {
    this.storage = storage
    this.defaultLocale = defaultLocale
    this.provider = provider
    this.appVersion = appVersion
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
    const appVersion = options.appVersion || this.appVersion
    const providerRecord = await this.getProviderRecord(type, name, options)
    let asset: StoredAsset | undefined

    if (options.bundleVersionKey && !bundleName && !options.targetPackageId) {
      const assets = await this.storage.findAssets({
        bundleVersionKey: options.bundleVersionKey,
        type,
        name,
      })
      asset = findBestRankedAssetRecord(assets, locale, appVersion)
    }
    else if (options.targetPackageId) {
      const assets = await this.storage.findAssets({ type, name, bundleVersionKey: options.bundleVersionKey })
      const bundles = await this.storage.getAllBundles()
      asset = this.findBestTargetLocaleMatch(assets, bundles, options.targetPackageId, locale, appVersion, options.bundleVersionKey)
    }
    else if (bundleName) {
      const assets = await this.storage.findAssets({
        bundleName,
        bundleVersionKey: options.bundleVersionKey,
        type,
        name,
      })
      const bundles = await this.storage.getAllBundles()
      asset = this.findBestBundleLocaleMatch(assets, bundles, bundleName, locale, appVersion, options.bundleVersionKey)
    }
    else {
      const assets = await this.storage.findAssets({ type, name })
      const bundles = await this.storage.getAllBundles()
      asset = this.findBestLocaleMatch(assets, bundles, locale, appVersion)
    }

    if (providerRecord && isProviderRecordPreferred(providerRecord, asset, locale, appVersion)) {
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
    const records = options.targetPackageId
      ? manifest.assets.filter(record => record.runtimePackageId === options.targetPackageId)
      : manifest.assets
    const record = findBestAssetRecord(
      records,
      type,
      name,
      options.locale || this.defaultLocale,
      options.bundleName,
      options.appVersion || this.appVersion,
    )

    return record || null
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
      logicalBundleName: record.bundleName || provider.mode,
      bundleVersionKey: record.bundleVersionKey,
      name: record.name,
      type: record.type,
      locale: record.locale || 'default',
      data: new Uint8Array(data),
      hash: record.hash || (providerResult instanceof Uint8Array ? '' : providerResult.hash || ''),
      mimeType: record.mimeType || (providerResult instanceof Uint8Array ? undefined : providerResult.mimeType),
      size: record.size ?? data.byteLength,
      version: record.version || 1,
      bundleVersion: record.bundleVersion,
      mtime: record.mtime || now,
      path: record.path,
      createdAt: now,
      lastAccessed: now,
      mediaMetadata: record.mediaMetadata,
      compatibility: record.compatibility,
      runtimePackageId: record.runtimePackageId,
      bundlePriority: record.bundlePriority,
      loadedAt: record.loadedAt,
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

  private findBestLocaleMatch(
    assets: StoredAsset[],
    bundles: StoredBundle[],
    preferredLocale: AssetLocale,
    appVersion?: string,
  ): StoredAsset | undefined {
    return findBestRankedAssetRecord(filterActiveBundleAssets(assets, bundles), preferredLocale, appVersion)
  }

  private findBestBundleLocaleMatch(
    assets: StoredAsset[],
    bundles: StoredBundle[],
    bundleName: string,
    preferredLocale: AssetLocale,
    appVersion?: string,
    bundleVersionKey?: string,
  ): StoredAsset | undefined {
    if (bundleVersionKey) {
      return findBestRankedAssetRecord(assets, preferredLocale, appVersion)
    }

    const activeBundle = this.selectActiveBundle(bundles, bundleName)
    if (activeBundle?.versionKey) {
      const activeAssets = assets.filter(asset => asset.bundleVersionKey === activeBundle.versionKey)
      return findBestRankedAssetRecord(activeAssets, preferredLocale, appVersion)
    }

    return findBestRankedAssetRecord(assets, preferredLocale, appVersion)
  }

  private findBestTargetLocaleMatch(
    assets: StoredAsset[],
    bundles: StoredBundle[],
    targetPackageId: string,
    preferredLocale: AssetLocale,
    appVersion?: string,
    bundleVersionKey?: string,
  ): StoredAsset | undefined {
    const bundleByName = new Map(bundles.map(bundle => [bundle.versionKey || bundle.name, bundle]))
    const activeKeys = new Set(bundles.filter(bundle => bundle.active).map(bundle => bundle.versionKey || bundle.name))
    const fallbackChain = createLocaleFallbackChain(preferredLocale)
    const candidates = assets.filter((asset) => {
      const bundle = bundleByName.get(asset.bundleVersionKey || asset.bundleName)
      if (!bundleVersionKey && activeKeys.size > 0 && asset.bundleVersionKey && !activeKeys.has(asset.bundleVersionKey)) {
        return false
      }
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
    return findBestTargetRankedAssetRecord(candidates, preferredLocale, appVersion)
  }

  private selectActiveBundle(bundles: StoredBundle[], bundleName: string): StoredBundle | undefined {
    const matches = bundles.filter(bundle =>
      bundle.name === bundleName
      || bundle.logicalName === bundleName
      || bundle.versionKey === bundleName,
    )
    const active = matches.filter(bundle => bundle.active)
    return active[0] || matches[0]
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
    logicalBundleName: result.asset.logicalBundleName,
    bundleVersionKey: result.asset.bundleVersionKey,
    locale: result.asset.locale,
    data: new Uint8Array(result.data),
    hash: result.asset.hash,
    mimeType: result.asset.mimeType,
    mediaMetadata: result.asset.mediaMetadata,
    size: result.asset.size,
    version: result.asset.version,
    bundleVersion: result.asset.bundleVersion,
    mtime: result.asset.mtime,
    fromCache: result.fromCache,
    path: result.asset.path,
    compatibility: result.asset.compatibility,
    runtimePackageId: result.asset.runtimePackageId,
    bundlePriority: result.asset.bundlePriority,
    loadedAt: result.asset.loadedAt,
  }
}

function isProviderRecordPreferred(
  providerRecord: AssetManifestRecord,
  storageAsset: StoredAsset | undefined,
  locale: AssetLocale,
  appVersion?: string,
): boolean {
  if (!storageAsset) {
    return true
  }
  return findBestRankedAssetRecord([providerRecord, storageAsset], locale, appVersion) === providerRecord
}

function filterActiveBundleAssets(assets: StoredAsset[], bundles: StoredBundle[]): StoredAsset[] {
  if (bundles.length === 0) {
    return assets
  }

  const activeKeys = new Set(
    bundles
      .filter(bundle => bundle.active)
      .map(bundle => bundle.versionKey || bundle.name),
  )
  if (activeKeys.size === 0) {
    return assets
  }
  return assets.filter(asset => !asset.bundleVersionKey || activeKeys.has(asset.bundleVersionKey))
}
