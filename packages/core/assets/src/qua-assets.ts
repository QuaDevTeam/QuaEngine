import type {
  AssetData,
  AssetLocale,
  AssetProcessingPlugin,
  AssetProvider,
  AssetRuntimeAdapter,
  AssetType,
  BundleIndex,
  BundleStatus,
  DecompressionPlugin,
  DecryptionPlugin,
  LoadAssetOptions,
  LoadBundleOptions,
  MediaMetadata,
  QuaAssetsConfig,
  QuaAssetsEvents,
  QuaAssetsPlugin,
  WorkspaceBundleIndex,
} from './types'
import { createLogger } from '@quajs/logger'
import { AssetManager } from './asset-manager'
import { BundleLoader } from './bundle-loader'
import { bytesToUtf8 } from './encoding'
import { PatchManager } from './patch-manager'
import { BundleLoadError } from './types'

const logger = createLogger('quaassets')

export class QuaAssets {
  private config: Required<Omit<QuaAssetsConfig, 'provider'>> & { provider?: AssetProvider }
  private adapter: AssetRuntimeAdapter
  private bundleLoader: BundleLoader
  private assetManager: AssetManager
  private patchManager: PatchManager
  private bundleStatuses = new Map<string, BundleStatus>()
  private eventListeners = new Map<keyof QuaAssetsEvents, Array<(data: unknown) => void>>()
  private currentLocale: AssetLocale
  private initialized = false
  private provider?: AssetProvider
  private unwatchProvider?: () => void

  constructor(config: QuaAssetsConfig) {
    validateConfig(config)

    this.config = {
      endpoint: config.endpoint?.replace(/\/$/, '') || '',
      locale: config.locale || 'default',
      enableCache: config.enableCache ?? true,
      cacheSize: config.cacheSize || 100 * 1024 * 1024,
      retryAttempts: config.retryAttempts || 3,
      timeout: config.timeout || 30000,
      plugins: config.plugins || [],
      adapter: config.adapter,
      provider: config.provider,
    }

    this.adapter = this.config.adapter
    this.provider = this.config.provider
    this.currentLocale = this.config.locale
    this.bundleLoader = new BundleLoader({
      crypto: this.adapter.crypto,
      codec: this.adapter.codec,
      now: this.adapter.now,
    })
    this.assetManager = new AssetManager(this.adapter.storage, this.currentLocale, this.provider)
    this.patchManager = new PatchManager(this.adapter.storage, this.bundleLoader, this.adapter.fetcher)

    for (const plugin of this.config.plugins) {
      this.registerPlugin(plugin)
    }
  }

  async initialize(): Promise<void> {
    if (this.initialized)
      return

    await this.adapter.storage.open?.()
    await this.provider?.init?.()
    this.setupProviderWatch()

    for (const plugin of this.config.plugins) {
      await plugin.initialize?.()
    }

    this.initialized = true
    logger.info('QuaAssets initialized successfully')
  }

  async checkLatest(): Promise<BundleIndex | WorkspaceBundleIndex> {
    this.ensureInitialized()
    const fetcher = this.ensureFetcher()
    if (fetcher.fetchJSON) {
      return await fetcher.fetchJSON<BundleIndex | WorkspaceBundleIndex>(this.resolveUrl('index.json'), {
        cache: this.config.enableCache,
      })
    }

    const result = await fetcher.fetchBytes(this.resolveUrl('index.json'), {
      cache: this.config.enableCache,
    })
    const bytes = result instanceof Uint8Array ? result : result.data
    return JSON.parse(bytesToUtf8(bytes)) as BundleIndex | WorkspaceBundleIndex
  }

  async loadBundle(bundleName: string, options: LoadBundleOptions = {}): Promise<void> {
    const baseBundleName = bundleName.replace(/\.(qpk|zip|bundle)$/, '')
    this.bundleStatuses.set(baseBundleName, createBundleStatus(baseBundleName, 'loading'))

    try {
      this.ensureInitialized()
      this.emit('bundle:loading', { bundleName: baseBundleName })

      if (!options.force) {
        const existingBundle = await this.adapter.storage.getBundle(baseBundleName)
        if (existingBundle) {
          const status = {
            name: baseBundleName,
            version: existingBundle.version,
            state: 'loaded' as const,
            progress: 1,
            assetCount: existingBundle.assetCount,
            loadedAssets: existingBundle.assetCount,
            lastUpdated: existingBundle.lastUpdated,
          }
          this.bundleStatuses.set(baseBundleName, status)
          this.emit('bundle:loaded', { bundleName: baseBundleName, status })
          return
        }
      }

      const fetcher = this.ensureFetcher()
      const fetched = await fetcher.fetchBytes(this.resolveUrl(bundleName), {
        cache: options.enableCache !== false,
        signal: options.signal,
        onProgress: (loaded, total) => {
          this.updateBundleProgress(baseBundleName, total > 0 ? (loaded / total) * 0.8 : 0)
          options.onProgress?.(loaded, total)
        },
      })
      const bytes = fetched instanceof Uint8Array ? fetched : fetched.data
      const { manifest, assets } = await this.bundleLoader.loadBundle(bytes, baseBundleName, options)

      this.updateBundleProgress(baseBundleName, 0.8)

      if (options.enableCache !== false && this.config.enableCache) {
        await this.adapter.storage.storeBundle({
          name: baseBundleName,
          version: manifest.bundleVersion || 1,
          buildNumber: manifest.buildNumber || 'unknown',
          format: manifest.format,
          hash: '',
          size: assets.reduce((sum, asset) => sum + asset.size, 0),
          assetCount: assets.length,
          locales: manifest.locales || ['default'],
          createdAt: this.now(),
          lastUpdated: this.now(),
          manifest,
        })
        await this.adapter.storage.storeAssets(assets)
        await this.manageCacheSize()
      }

      const status = {
        name: baseBundleName,
        version: manifest.bundleVersion || 1,
        state: 'loaded' as const,
        progress: 1,
        assetCount: assets.length,
        loadedAssets: assets.length,
        lastUpdated: this.now(),
      }
      this.bundleStatuses.set(baseBundleName, status)
      this.emit('bundle:loaded', { bundleName: baseBundleName, status })
      logger.info(`Bundle ${baseBundleName} loaded successfully (${assets.length} assets)`)
    }
    catch (error) {
      const bundleError = error instanceof BundleLoadError
        ? error
        : new BundleLoadError(`Failed to load bundle: ${error instanceof Error ? error.message : String(error)}`, baseBundleName)
      this.bundleStatuses.set(baseBundleName, {
        ...createBundleStatus(baseBundleName, 'error'),
        error: bundleError,
      })
      this.emit('bundle:error', { bundleName: baseBundleName, error: bundleError })
      throw bundleError
    }
  }

  setLocale(locale: AssetLocale): void {
    this.currentLocale = locale
    this.assetManager.cleanup()
    this.assetManager = new AssetManager(this.adapter.storage, locale, this.provider)
    for (const plugin of this.config.plugins) {
      if (isAssetProcessingPlugin(plugin)) {
        this.assetManager.registerProcessingPlugin(plugin)
      }
    }
  }

  getLocale(): AssetLocale {
    return this.currentLocale
  }

  async getAsset(type: AssetType, name: string, options?: LoadAssetOptions): Promise<AssetData> {
    this.ensureInitialized()
    return await this.assetManager.getAsset(type, name, {
      locale: this.currentLocale,
      ...options,
    })
  }

  async getBytes(type: AssetType, name: string, options?: LoadAssetOptions): Promise<Uint8Array> {
    this.ensureInitialized()
    return await this.assetManager.getBytes(type, name, {
      locale: this.currentLocale,
      ...options,
    })
  }

  async getText(type: AssetType, name: string, options?: LoadAssetOptions): Promise<string> {
    this.ensureInitialized()
    return await this.assetManager.getText(type, name, {
      locale: this.currentLocale,
      ...options,
    })
  }

  async getJSON<T = unknown>(type: AssetType, name: string, options?: LoadAssetOptions): Promise<T> {
    this.ensureInitialized()
    return await this.assetManager.getJSON<T>(type, name, {
      locale: this.currentLocale,
      ...options,
    })
  }

  async hasAsset(type: AssetType, name: string, options?: LoadAssetOptions): Promise<boolean> {
    this.ensureInitialized()
    return await this.assetManager.hasAsset(type, name, {
      locale: this.currentLocale,
      ...options,
    })
  }

  async getMediaMetadata(type: AssetType, name: string, options?: LoadAssetOptions): Promise<MediaMetadata | null> {
    this.ensureInitialized()
    return await this.assetManager.getMediaMetadata(type, name, {
      locale: this.currentLocale,
      ...options,
    })
  }

  async getAssetBatch(type: AssetType, names: string[], options?: LoadAssetOptions): Promise<Map<string, AssetData>> {
    this.ensureInitialized()
    return await this.assetManager.getAssetBatch(type, names, {
      locale: this.currentLocale,
      ...options,
    })
  }

  async preloadAssets(requests: Array<{
    type: AssetType
    name: string
    options?: LoadAssetOptions
  }>): Promise<void> {
    this.ensureInitialized()
    await this.assetManager.preloadAssets(requests.map(request => ({
      ...request,
      options: {
        locale: this.currentLocale,
        ...request.options,
      },
    })))
  }

  getProvider(): AssetProvider | undefined {
    return this.provider
  }

  async setProvider(provider?: AssetProvider): Promise<void> {
    this.ensureInitialized()
    this.unwatchProvider?.()
    this.unwatchProvider = undefined
    await this.provider?.cleanup?.()
    this.provider = provider
    this.assetManager.setProvider(provider)
    await provider?.init?.()
    this.setupProviderWatch()
  }

  async checkAssetUpdates(): Promise<ReturnType<NonNullable<AssetProvider['checkUpdates']>> | null> {
    this.ensureInitialized()
    if (!this.provider?.checkUpdates)
      return null

    const update = await this.provider.checkUpdates()
    if (update) {
      this.emit('update:available', update)
    }
    return update
  }

  async applyAssetUpdate(update: Parameters<NonNullable<AssetProvider['applyUpdate']>>[0]): Promise<void> {
    this.ensureInitialized()
    if (!this.provider?.applyUpdate) {
      throw new Error('Active asset provider does not support updates')
    }
    await this.provider.applyUpdate(update)
    for (const change of update.changes) {
      this.handleProviderChange(change)
    }
    this.emit('update:applied', update)
  }

  getBundleStatus(bundleName: string): BundleStatus | undefined {
    return this.bundleStatuses.get(bundleName)
  }

  getAllBundleStatuses(): Map<string, BundleStatus> {
    return new Map(this.bundleStatuses)
  }

  registerPlugin(plugin: QuaAssetsPlugin): void {
    if (isDecompressionPlugin(plugin)) {
      this.bundleLoader.registerDecompressionPlugin(plugin)
    }
    if (isDecryptionPlugin(plugin)) {
      this.bundleLoader.registerDecryptionPlugin(plugin)
    }
    if (isAssetProcessingPlugin(plugin)) {
      this.assetManager.registerProcessingPlugin(plugin)
    }
  }

  async applyPatch(patchNameOrUrl: string, targetBundleName: string, options?: LoadBundleOptions): Promise<{
    success: boolean
    changes: { added: number, modified: number, deleted: number }
    errors: string[]
  }> {
    this.ensureInitialized()
    const result = await this.patchManager.applyPatch(this.resolveUrl(patchNameOrUrl), targetBundleName, options)
    if (result.success) {
      this.emit('patch:applied', {
        bundleName: targetBundleName,
        fromVersion: 0,
        toVersion: 0,
      })
    }
    return result
  }

  async previewPatch(patchNameOrUrl: string, targetBundleName: string): Promise<{
    valid: boolean
    changes: { willAdd: string[], willModify: string[], willDelete: string[] }
    errors: string[]
    fromVersion: number
    toVersion: number
  }> {
    this.ensureInitialized()
    return await this.patchManager.previewPatch(this.resolveUrl(patchNameOrUrl), targetBundleName)
  }

  async getAvailablePatches(bundleName: string, currentVersion?: number): Promise<Array<{
    filename: string
    fromVersion: number
    toVersion: number
    size: number
    changeCount: number
  }>> {
    this.ensureInitialized()
    const version = currentVersion || this.bundleStatuses.get(bundleName)?.version || 1
    return await this.patchManager.getAvailablePatches(this.config.endpoint, bundleName, version)
  }

  async canApplyPatch(patchNameOrUrl: string, targetBundleName: string): Promise<boolean> {
    this.ensureInitialized()
    return await this.patchManager.canApplyPatch(this.resolveUrl(patchNameOrUrl), targetBundleName)
  }

  async clearBundleCache(bundleName: string): Promise<void> {
    this.ensureInitialized()
    await this.adapter.storage.deleteBundle(bundleName)
    this.bundleStatuses.delete(bundleName)
  }

  async clearAllCache(): Promise<void> {
    this.ensureInitialized()
    await this.adapter.storage.clearAll()
    this.bundleStatuses.clear()
    this.assetManager.cleanup()
  }

  async getCacheStats(): Promise<{
    database: unknown
    assetManager: unknown
    bundles: number
    totalSize: number
  }> {
    this.ensureInitialized()
    const databaseStats = await this.adapter.storage.getCacheStats()
    return {
      database: databaseStats,
      assetManager: this.assetManager.getCacheStats(),
      bundles: this.bundleStatuses.size,
      totalSize: databaseStats.totalSize,
    }
  }

  on<K extends keyof QuaAssetsEvents>(event: K, listener: (data: QuaAssetsEvents[K]) => void): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, [])
    }
    this.eventListeners.get(event)!.push(listener as (data: unknown) => void)
  }

  off<K extends keyof QuaAssetsEvents>(event: K, listener: (data: QuaAssetsEvents[K]) => void): void {
    const listeners = this.eventListeners.get(event)
    if (!listeners)
      return

    const index = listeners.indexOf(listener as (data: unknown) => void)
    if (index !== -1) {
      listeners.splice(index, 1)
    }
  }

  async cleanup(): Promise<void> {
    this.unwatchProvider?.()
    this.unwatchProvider = undefined
    this.assetManager.cleanup()
    await this.provider?.cleanup?.()
    for (const plugin of this.config.plugins) {
      await plugin.cleanup?.()
    }
    await this.adapter.storage.close?.()
    this.eventListeners.clear()
    this.initialized = false
  }

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('QuaAssets not initialized. Call initialize() first.')
    }
  }

  private ensureFetcher() {
    if (!this.adapter.fetcher) {
      throw new Error(`Asset adapter "${this.adapter.name}" does not provide a fetcher`)
    }
    return this.adapter.fetcher
  }

  private resolveUrl(pathOrUrl: string): string {
    if (/^[a-z]+:\/\//i.test(pathOrUrl) || pathOrUrl.startsWith('/')) {
      return pathOrUrl
    }
    if (!this.config.endpoint) {
      return pathOrUrl
    }
    return `${this.config.endpoint}/${pathOrUrl.replace(/^\//, '')}`
  }

  private updateBundleProgress(bundleName: string, progress: number): void {
    const status = this.bundleStatuses.get(bundleName)
    if (status) {
      status.progress = Math.max(0, Math.min(1, progress))
      this.emit('bundle:progress', { bundleName, progress: status.progress })
    }
  }

  private emit<K extends keyof QuaAssetsEvents>(event: K, data: QuaAssetsEvents[K]): void {
    const listeners = this.eventListeners.get(event) || []
    for (const listener of listeners) {
      listener(data)
    }
  }

  private setupProviderWatch(): void {
    if (!this.provider?.watch)
      return

    this.unwatchProvider = this.provider.watch(change => this.handleProviderChange(change))
  }

  private handleProviderChange(change: QuaAssetsEvents['asset:changed']): void {
    this.assetManager.clearAssetCache(change.assetId)
    this.assetManager.clearManifestCache()
    this.emit('asset:changed', change)
  }

  private async manageCacheSize(): Promise<void> {
    if (!this.config.enableCache)
      return

    const currentSize = await this.adapter.storage.getDatabaseSize()
    if (currentSize > this.config.cacheSize) {
      const cleanedAssets = await this.adapter.storage.cleanupAssets(this.config.cacheSize)
      if (cleanedAssets > 0) {
        this.emit('cache:full', { size: currentSize, limit: this.config.cacheSize })
      }
    }
  }

  private now(): number {
    return this.adapter.now?.() || Date.now()
  }
}

function validateConfig(config: QuaAssetsConfig): void {
  if (!config.adapter) {
    throw new Error('QuaAssets requires an asset runtime adapter')
  }
  if (config.cacheSize !== undefined && config.cacheSize <= 0) {
    throw new Error('Cache size must be positive')
  }
  if (config.retryAttempts !== undefined && config.retryAttempts < 0) {
    throw new Error('Retry attempts must be non-negative')
  }
  if (config.timeout !== undefined && config.timeout <= 0) {
    throw new Error('Timeout must be positive')
  }
  if (config.locale !== undefined) {
    if (typeof config.locale !== 'string') {
      throw new TypeError('Locale must be a string')
    }
    const localePattern = /^(?:default|[a-z]{2}(?:-[a-z]{2})?|[a-z]{2}-[A-Z]{2})$/
    if (!localePattern.test(config.locale)) {
      throw new Error('Invalid locale format')
    }
  }
}

function createBundleStatus(name: string, state: BundleStatus['state']): BundleStatus {
  return {
    name,
    version: 0,
    state,
    progress: 0,
    assetCount: 0,
    loadedAssets: 0,
    lastUpdated: Date.now(),
  }
}

function isDecompressionPlugin(plugin: QuaAssetsPlugin): plugin is DecompressionPlugin {
  return 'supportedFormats' in plugin && 'decompress' in plugin
}

function isDecryptionPlugin(plugin: QuaAssetsPlugin): plugin is DecryptionPlugin {
  return 'decrypt' in plugin
}

function isAssetProcessingPlugin(plugin: QuaAssetsPlugin): plugin is AssetProcessingPlugin {
  return 'supportedTypes' in plugin && 'processAsset' in plugin
}
