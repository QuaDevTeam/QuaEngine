import type {
  AssetLocale,
  AssetProcessingPlugin,
  AssetType,
  BundleIndex,
  BundleStatus,
  DecompressionPlugin,
  DecryptionPlugin,
  JSExecutionResult,
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
import { QuaAssetsDatabase } from './database'
import { PatchManager } from './patch-manager'
import { BundleLoadError } from './types'

const logger = createLogger('quaassets')

/**
 * QuaAssets - Browser-based asset manager for QuaEngine
 * Manages Quack bundles with IndexedDB storage and progressive loading
 */
export class QuaAssets {
  private config: Required<QuaAssetsConfig>
  private database: QuaAssetsDatabase
  private bundleLoader: BundleLoader
  private assetManager: AssetManager
  private patchManager: PatchManager
  private bundleStatuses = new Map<string, BundleStatus>()
  private eventListeners = new Map<keyof QuaAssetsEvents, Function[]>()
  private currentLocale: AssetLocale
  private initialized = false

  constructor(endpoint: string, config: Partial<QuaAssetsConfig> = {}) {
    // Validate parameters
    if (!endpoint || typeof endpoint !== 'string' || endpoint.trim() === '') {
      throw new Error('Invalid endpoint URL')
    }

    // Validate URL format
    try {
      const url = new URL(endpoint)
      if (!['http:', 'https:'].includes(url.protocol)) {
        throw new Error('Invalid endpoint URL protocol')
      }
    }
    catch (error) {
      throw new Error('Invalid endpoint URL format')
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
      // Validate locale format (allow 'default' or standard locale codes)
      const localePattern = /^(default|[a-z]{2}(-[a-z]{2})?|[a-z]{2}-[A-Z]{2})$/
      if (!localePattern.test(config.locale)) {
        throw new Error('Invalid locale format')
      }
    }

    // Merge with defaults
    this.config = {
      endpoint: endpoint.replace(/\/$/, ''), // Remove trailing slash
      locale: 'default',
      enableCache: true,
      cacheSize: 100 * 1024 * 1024, // 100MB
      retryAttempts: 3,
      timeout: 30000,
      plugins: [],
      enableServiceWorker: false,
      indexedDBName: 'QuaAssetsDB',
      indexedDBVersion: 1,
      enableIntegrityCheck: true,
      enableCompression: true,
      ...config,
    }

    this.currentLocale = this.config.locale

    // Initialize components
    this.database = new QuaAssetsDatabase(
      this.config.indexedDBName,
      this.config.indexedDBVersion,
    )

    this.bundleLoader = new BundleLoader(
      this.config.retryAttempts,
      this.config.timeout,
    )

    this.assetManager = new AssetManager(this.database, this.currentLocale)
    this.patchManager = new PatchManager(this.database, this.bundleLoader)

    // Register plugins
    for (const plugin of this.config.plugins) {
      this.registerPlugin(plugin)
    }
  }

  /**
   * Initialize QuaAssets (must be called before use)
   */
  async initialize(): Promise<void> {
    if (this.initialized)
      return

    try {
      await this.database.open()

      // Initialize plugins
      for (const plugin of this.config.plugins) {
        if (plugin.initialize) {
          await plugin.initialize()
        }
      }

      this.initialized = true
      logger.info('QuaAssets initialized successfully')
    }
    catch (error) {
      logger.error('Failed to initialize QuaAssets:', error)
      throw error
    }
  }

  /**
   * Check latest version information from index.json
   */
  async checkLatest(): Promise<BundleIndex | WorkspaceBundleIndex> {
    this.ensureInitialized()

    try {
      const indexUrl = `${this.config.endpoint}/index.json`
      const response = await fetch(indexUrl, {
        cache: this.config.enableCache ? 'default' : 'no-cache',
      })

      if (!response.ok) {
        throw new Error(`Failed to fetch index: ${response.status} ${response.statusText}`)
      }

      const index = await response.json()

      // Detect if it's a workspace index or single bundle index
      if ('workspace' in index) {
        return index as WorkspaceBundleIndex
      }
      else {
        return index as BundleIndex
      }
    }
    catch (error) {
      logger.error('Failed to check latest version:', error)
      throw error
    }
  }

  /**
   * Load bundle from remote endpoint
   */
  async loadBundle(bundleName: string, options: LoadBundleOptions = {}): Promise<void> {
    // Extract bundle name without extension for consistent status tracking
    const baseBundleName = bundleName.replace(/\.(qpk|bundle)$/, '')

    // Always set bundle status first, regardless of initialization
    this.bundleStatuses.set(baseBundleName, {
      name: baseBundleName,
      version: 0,
      state: 'loading',
      progress: 0,
      assetCount: 0,
      loadedAssets: 0,
      lastUpdated: Date.now(),
    })

    try {
      this.ensureInitialized()

      const bundleUrl = `${this.config.endpoint}/${bundleName}`

      this.emit('bundle:loading', { bundleName: baseBundleName })

      // Check if bundle already exists and force flag
      if (!options.force) {
        const existingBundle = await this.database.getBundle(baseBundleName)
        if (existingBundle) {
          this.bundleStatuses.set(baseBundleName, {
            name: baseBundleName,
            version: existingBundle.version,
            state: 'loaded',
            progress: 1,
            assetCount: existingBundle.assetCount,
            loadedAssets: existingBundle.assetCount,
            lastUpdated: existingBundle.lastUpdated,
          })

          this.emit('bundle:loaded', { bundleName: baseBundleName, status: this.bundleStatuses.get(baseBundleName)! })
          return
        }
      }

      // Load bundle with progress tracking
      const loadOptions: LoadBundleOptions = {
        ...options,
        onProgress: (loaded, total) => {
          const progress = total > 0 ? loaded / total : 0
          this.updateBundleProgress(baseBundleName, progress * 0.8) // Reserve 20% for processing

          if (options.onProgress) {
            options.onProgress(loaded, total)
          }
        },
      }

      const { manifest, assets } = await this.bundleLoader.loadBundle(bundleUrl, baseBundleName, loadOptions)

      // Update progress for processing
      this.updateBundleProgress(baseBundleName, 0.8)

      // Store bundle and assets in database
      if (options.enableCache !== false && this.config.enableCache) {
        await this.database.transaction('rw', [this.database.bundles, this.database.assets], async () => {
          // Store bundle metadata
          await this.database.storeBundle({
            name: baseBundleName,
            version: manifest.bundleVersion || 1,
            buildNumber: manifest.buildNumber || 'unknown',
            format: manifest.format,
            hash: '', // Will be calculated if needed
            size: assets.reduce((sum, asset) => sum + asset.size, 0),
            assetCount: assets.length,
            locales: manifest.locales,
            createdAt: Date.now(),
            lastUpdated: Date.now(),
            manifest,
          })

          // Store assets
          await this.database.storeAssets(assets)
        })

        // Manage cache size
        await this.manageCacheSize()
      }

      // Update final status
      this.bundleStatuses.set(baseBundleName, {
        name: baseBundleName,
        version: manifest.bundleVersion || 1,
        state: 'loaded',
        progress: 1,
        assetCount: assets.length,
        loadedAssets: assets.length,
        lastUpdated: Date.now(),
      })

      this.emit('bundle:loaded', { bundleName: baseBundleName, status: this.bundleStatuses.get(baseBundleName)! })
      logger.info(`Bundle ${baseBundleName} loaded successfully (${assets.length} assets)`)
    }
    catch (error) {
      const bundleError = error instanceof BundleLoadError
        ? error
        : new BundleLoadError(`Failed to load bundle: ${error instanceof Error ? error.message : String(error)}`, baseBundleName)

      this.bundleStatuses.set(baseBundleName, {
        name: baseBundleName,
        version: 0,
        state: 'error',
        progress: 0,
        assetCount: 0,
        loadedAssets: 0,
        error: bundleError,
        lastUpdated: Date.now(),
      })

      this.emit('bundle:error', { bundleName: baseBundleName, error: bundleError })
      logger.error(`Failed to load bundle ${baseBundleName}:`, error)
      throw bundleError
    }
  }

  /**
   * Set current locale for asset loading
   */
  setLocale(locale: AssetLocale): void {
    this.currentLocale = locale
    this.assetManager = new AssetManager(this.database, locale)
    logger.info(`Locale changed to: ${locale}`)
  }

  /**
   * Get current locale
   */
  getLocale(): AssetLocale {
    return this.currentLocale
  }

  /**
   * Get asset as blob
   */
  async getBlob(type: AssetType, name: string, options?: LoadAssetOptions): Promise<Blob> {
    this.ensureInitialized()
    return await this.assetManager.getBlob(type, name, {
      locale: this.currentLocale,
      ...options,
    })
  }

  /**
   * Get asset as blob URL
   */
  async getBlobURL(type: AssetType, name: string, options?: LoadAssetOptions): Promise<string> {
    this.ensureInitialized()
    return await this.assetManager.getBlobURL(type, name, {
      locale: this.currentLocale,
      ...options,
    })
  }

  /**
   * Get asset as ArrayBuffer
   */
  async getArrayBuffer(type: AssetType, name: string, options?: LoadAssetOptions): Promise<ArrayBuffer> {
    this.ensureInitialized()
    return await this.assetManager.getArrayBuffer(type, name, {
      locale: this.currentLocale,
      ...options,
    })
  }

  /**
   * Get asset as text
   */
  async getText(type: AssetType, name: string, options?: LoadAssetOptions): Promise<string> {
    this.ensureInitialized()
    return await this.assetManager.getText(type, name, {
      locale: this.currentLocale,
      ...options,
    })
  }

  /**
   * Get asset as JSON
   */
  async getJSON<T = any>(type: AssetType, name: string, options?: LoadAssetOptions): Promise<T> {
    this.ensureInitialized()
    return await this.assetManager.getJSON<T>(type, name, {
      locale: this.currentLocale,
      ...options,
    })
  }

  /**
   * Execute JavaScript asset
   */
  async executeJS(name: string, options?: LoadAssetOptions): Promise<JSExecutionResult> {
    this.ensureInitialized()
    return await this.assetManager.executeJS(name, {
      locale: this.currentLocale,
      ...options,
    })
  }

  /**
   * Check if asset exists
   */
  async hasAsset(type: AssetType, name: string, options?: LoadAssetOptions): Promise<boolean> {
    this.ensureInitialized()
    return await this.assetManager.hasAsset(type, name, {
      locale: this.currentLocale,
      ...options,
    })
  }

  /**
   * Get media metadata for an asset
   */
  async getMediaMetadata(type: AssetType, name: string, options?: LoadAssetOptions): Promise<MediaMetadata | null> {
    this.ensureInitialized()
    return await this.assetManager.getMediaMetadata(type, name, {
      locale: this.currentLocale,
      ...options,
    })
  }

  /**
   * Get multiple assets as blobs
   */
  async getBlobBatch(type: AssetType, names: string[], options?: LoadAssetOptions): Promise<Map<string, Blob>> {
    this.ensureInitialized()
    return await this.assetManager.getBlobBatch(type, names, {
      locale: this.currentLocale,
      ...options,
    })
  }

  /**
   * Preload assets for better performance
   */
  async preloadAssets(requests: Array<{
    type: AssetType
    name: string
    options?: LoadAssetOptions
  }>): Promise<void> {
    this.ensureInitialized()

    const enhancedRequests = requests.map(req => ({
      ...req,
      options: {
        locale: this.currentLocale,
        ...req.options,
      },
    }))

    await this.assetManager.preloadAssets(enhancedRequests)
  }

  /**
   * Get bundle status
   */
  getBundleStatus(bundleName: string): BundleStatus | undefined {
    return this.bundleStatuses.get(bundleName)
  }

  /**
   * Get all bundle statuses
   */
  getAllBundleStatuses(): Map<string, BundleStatus> {
    return new Map(this.bundleStatuses)
  }

  /**
   * Register a plugin
   */
  registerPlugin(plugin: QuaAssetsPlugin): void {
    if (plugin instanceof Object && 'supportedFormats' in plugin) {
      this.bundleLoader.registerDecompressionPlugin(plugin as DecompressionPlugin)
    }

    if (plugin instanceof Object && 'decrypt' in plugin) {
      this.bundleLoader.registerDecryptionPlugin(plugin as DecryptionPlugin)
    }

    if (plugin instanceof Object && 'supportedTypes' in plugin) {
      this.assetManager.registerProcessingPlugin(plugin as AssetProcessingPlugin)
    }

    logger.info(`Plugin registered: ${plugin.name} v${plugin.version}`)
  }

  /**
   * Apply a patch to an existing bundle
   */
  async applyPatch(patchUrl: string, targetBundleName: string, options?: LoadBundleOptions): Promise<{
    success: boolean
    changes: { added: number, modified: number, deleted: number }
    errors: string[]
  }> {
    this.ensureInitialized()

    // Extract patch filename (currently unused)
    patchUrl.split('/').pop() || 'patch' // patchFileName

    // Update bundle status to show patching
    const existingStatus = this.bundleStatuses.get(targetBundleName)
    if (existingStatus) {
      existingStatus.state = 'loading'
      existingStatus.progress = 0
    }

    try {
      const result = await this.patchManager.applyPatch(patchUrl, targetBundleName, options)

      if (result.success) {
        // Update bundle status
        if (existingStatus) {
          existingStatus.state = 'loaded'
          existingStatus.progress = 1
          existingStatus.lastUpdated = Date.now()
        }

        // Emit patch applied event
        this.emit('patch:applied', {
          bundleName: targetBundleName,
          fromVersion: 0, // Would need to track this properly
          toVersion: 0, // Would need to track this properly
        })

        logger.info(`Patch applied to ${targetBundleName}: ${result.changes.added + result.changes.modified + result.changes.deleted} total changes`)
      }

      return result
    }
    catch (error) {
      if (existingStatus) {
        existingStatus.state = 'error'
        existingStatus.error = error as Error
      }

      // Log the error
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('Patch application failed:', error)

      // Return error result instead of throwing
      return {
        success: false,
        changes: { added: 0, modified: 0, deleted: 0 },
        errors: [errorMessage],
      }
    }
  }

  /**
   * Preview patch changes without applying
   */
  async previewPatch(patchUrl: string, targetBundleName: string): Promise<{
    valid: boolean
    changes: { willAdd: string[], willModify: string[], willDelete: string[] }
    errors: string[]
    fromVersion: number
    toVersion: number
  }> {
    this.ensureInitialized()
    return await this.patchManager.previewPatch(patchUrl, targetBundleName)
  }

  /**
   * Get available patches for a bundle
   */
  async getAvailablePatches(bundleName: string, currentVersion?: number): Promise<Array<{
    filename: string
    fromVersion: number
    toVersion: number
    size: number
    changeCount: number
  }>> {
    this.ensureInitialized()

    const version = currentVersion || this.bundleStatuses.get(bundleName)?.version || 1
    return await this.patchManager.getAvailablePatches(
      this.config.endpoint,
      bundleName,
      version,
    )
  }

  /**
   * Check if a patch can be applied to current bundle state
   */
  async canApplyPatch(patchUrl: string, targetBundleName: string): Promise<boolean> {
    this.ensureInitialized()

    try {
      const { manifest } = await this.bundleLoader.loadBundle(
        patchUrl,
        'temp_patch_check',
        { enableCache: false },
      )

      return await this.patchManager.canApplyPatch(manifest, targetBundleName)
    }
    catch (error) {
      return false
    }
  }

  /**
   * Clear asset cache for specific bundle
   */
  async clearBundleCache(bundleName: string): Promise<void> {
    this.ensureInitialized()
    await this.database.deleteBundle(bundleName)
    this.bundleStatuses.delete(bundleName)
    logger.info(`Cache cleared for bundle: ${bundleName}`)
  }

  /**
   * Clear all cached data
   */
  async clearAllCache(): Promise<void> {
    this.ensureInitialized()
    await this.database.clearAll()
    this.bundleStatuses.clear()
    this.assetManager.cleanup()
    logger.info('All cache cleared')
  }

  /**
   * Get cache statistics
   */
  async getCacheStats(): Promise<{
    database: any
    assetManager: any
    bundles: number
    totalSize: number
  }> {
    this.ensureInitialized()

    const [databaseStats, assetManagerStats] = await Promise.all([
      this.database.getCacheStats(),
      Promise.resolve(this.assetManager.getCacheStats()),
    ])

    return {
      database: databaseStats,
      assetManager: assetManagerStats,
      bundles: this.bundleStatuses.size,
      totalSize: databaseStats.totalSize,
    }
  }

  /**
   * Event handling
   */
  on<K extends keyof QuaAssetsEvents>(event: K, listener: (data: QuaAssetsEvents[K]) => void): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, [])
    }
    this.eventListeners.get(event)!.push(listener)
  }

  off<K extends keyof QuaAssetsEvents>(event: K, listener: (data: QuaAssetsEvents[K]) => void): void {
    const listeners = this.eventListeners.get(event)
    if (listeners) {
      const index = listeners.indexOf(listener)
      if (index !== -1) {
        listeners.splice(index, 1)
      }
    }
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    this.assetManager.cleanup()

    // Cleanup plugins
    for (const plugin of this.config.plugins) {
      if (plugin.cleanup) {
        try {
          await plugin.cleanup()
        }
        catch (error) {
          logger.warn(`Plugin cleanup failed for ${plugin.name}:`, error)
        }
      }
    }

    await this.database.close()
    this.eventListeners.clear()
    this.initialized = false

    logger.info('QuaAssets cleaned up')
  }

  /**
   * Private helper methods
   */
  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('QuaAssets not initialized. Call initialize() first.')
    }
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
      try {
        listener(data)
      }
      catch (error) {
        logger.warn(`Event listener error for ${event}:`, error)
      }
    }
  }

  private async manageCacheSize(): Promise<void> {
    if (!this.config.enableCache)
      return

    try {
      const currentSize = await this.database.getDatabaseSize()

      if (currentSize > this.config.cacheSize) {
        const cleanedAssets = await this.database.cleanupAssets(this.config.cacheSize)

        if (cleanedAssets > 0) {
          this.emit('cache:full', { size: currentSize, limit: this.config.cacheSize })
          logger.info(`Cache cleanup: removed ${cleanedAssets} assets`)
        }
      }
    }
    catch (error) {
      logger.warn('Cache management failed:', error)
    }
  }
}
