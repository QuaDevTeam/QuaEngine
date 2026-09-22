import type { I18nCatalogOptions, I18nMessages, TranslateInput, TranslateOptions } from './i18n'
import type {
  AssetData,
  AssetInfo,
  AssetLocale,
  AssetManifestRecord,
  AssetProcessingPlugin,
  AssetProvider,
  AssetRuntimeAdapter,
  AssetType,
  BundleIndex,
  BundleLoadProgress,
  BundleStatus,
  DecompressionPlugin,
  DecryptionPlugin,
  DynamicBundleRecord,
  LoadAssetOptions,
  LoadBundleOptions,
  LoadDynamicBundleOptions,
  LoadWorkspaceBundlesOptions,
  MediaMetadata,
  QuaAssetsConfig,
  QuaAssetsEvents,
  QuaAssetsPlugin,
  StoredBundle,
  WorkspaceBundleIndex,
} from './types'
import { createLogger } from '@quajs/logger'
import { AssetManager } from './asset-manager'
import { assertBundleIdentity, assertLoadNotAborted, commitBundle, hasCompleteBundle } from './bundle-cache'
import { createBundleVersionKey, selectBestStoredBundle } from './bundle-identity'
import { BundleLoader } from './bundle-loader'
import { assertCompatibleGameVersion, assertValidAppVersion } from './compatibility'
import { bytesToUtf8 } from './encoding'
import {
  DEFAULT_I18N_LOCALE,
  DEFAULT_I18N_NAMESPACE,
  formatI18nMessage,
  i18nCatalogAssetName,

  mergeI18nCatalogs,
  normalizeI18nCatalog,
  normalizeTranslateOptions,

} from './i18n'
import { PatchManager } from './patch-manager'
import { createLocaleFallbackChain, findBestRankedAssetRecord, normalizeLocale } from './providers'
import { AssetNotFoundError, BundleLoadError } from './types'
import { resolveWorkspaceBundles } from './workspace-bundles'

const logger = createLogger('quaassets')

type QuaAssetsResolvedConfig = Required<Omit<QuaAssetsConfig, 'provider' | 'appVersion'>> & {
  appVersion?: string
  provider?: AssetProvider
}

export class QuaAssets {
  private config: QuaAssetsResolvedConfig
  private adapter: AssetRuntimeAdapter
  private bundleLoader: BundleLoader
  private assetManager: AssetManager
  private patchManager: PatchManager
  private bundleStatuses = new Map<string, BundleStatus>()
  private eventListeners = new Map<keyof QuaAssetsEvents, Array<(data: unknown) => void>>()
  private currentLocale: AssetLocale
  private pendingBundles = new Map<string, { promise: Promise<void>, listeners: Set<LoadBundleOptions>, state?: BundleLoadProgress }>()
  private initialized = false
  private provider?: AssetProvider
  private unwatchProvider?: () => void

  constructor(config: QuaAssetsConfig) {
    validateConfig(config)

    this.config = {
      endpoint: config.endpoint?.replace(/\/$/, '') || '',
      locale: normalizeLocale(config.locale || 'default'),
      appVersion: config.appVersion,
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
    this.assetManager = new AssetManager(this.adapter.storage, this.currentLocale, this.provider, this.config.appVersion)
    this.patchManager = new PatchManager(this.adapter.storage, this.bundleLoader, this.adapter.crypto, this.adapter.fetcher)

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

  async checkLatest(indexFile = 'index.json'): Promise<BundleIndex | WorkspaceBundleIndex> {
    this.ensureInitialized()
    const fetcher = this.ensureFetcher()
    if (fetcher.fetchJSON) {
      return await fetcher.fetchJSON<BundleIndex | WorkspaceBundleIndex>(this.resolveUrl(indexFile), {
        cache: false,
        timeout: this.config.timeout,
      })
    }

    const result = await fetcher.fetchBytes(this.resolveUrl(indexFile), {
      cache: false,
      timeout: this.config.timeout,
    })
    const bytes = result instanceof Uint8Array ? result : result.data
    return JSON.parse(bytesToUtf8(bytes)) as BundleIndex | WorkspaceBundleIndex
  }

  async loadBundle(bundleName: string, options: LoadBundleOptions = {}): Promise<void> {
    // Signalled requests retain independent cancellation ownership.
    if (options.signal)
      return await this.loadBundleInternal(bundleName, options)
    const key = JSON.stringify([bundleName, options.expected, options.force, options.enableCache, options.appVersion, options.format])
    const pending = this.pendingBundles.get(key)
    if (pending) {
      pending.listeners.add(options)
      if (pending.state)
        options.onState?.(pending.state)
      return await pending.promise
    }
    const entry = { listeners: new Set([options]), promise: Promise.resolve(), state: undefined as BundleLoadProgress | undefined }
    // Defer execution until the entry is registered, including synchronous failures.
    entry.promise = Promise.resolve().then(() => this.loadBundleInternal(bundleName, {
      ...options,
      onProgress: (loaded, total) => { for (const listener of entry.listeners) listener.onProgress?.(loaded, total) },
      onState: (state) => {
        entry.state = state
        for (const listener of entry.listeners) listener.onState?.(state)
      },
    })).finally(() => { this.pendingBundles.delete(key) })
    this.pendingBundles.set(key, entry)
    return await entry.promise
  }

  private async loadBundleInternal(bundleName: string, options: LoadBundleOptions): Promise<void> {
    const sourceName = bundleName.replace(/\.(qpk|zip|bundle)$/, '')
    this.bundleStatuses.set(sourceName, createBundleStatus(sourceName, 'loading'))
    let loaded = 0
    let total = 0
    const report = (phase: BundleLoadProgress['phase'], progress: number | null, cacheHit = false) => {
      this.updateBundleProgress(sourceName, progress ?? 0)
      options.onState?.({ bundleName, phase, progress, loaded, total, cacheHit })
    }
    const appVersion = options.appVersion || this.config.appVersion
    const finish = (bundle: StoredBundle, cacheHit: boolean) => {
      const status: BundleStatus = {
        name: bundle.name,
        version: bundle.version,
        state: 'loaded',
        progress: 1,
        assetCount: bundle.assetCount,
        loadedAssets: bundle.assetCount,
        lastUpdated: this.now(),
      }
      this.bundleStatuses.set(sourceName, status)
      this.bundleStatuses.set(bundle.name, status)
      this.assetManager.clearManifestCache()
      report('ready', 1, cacheHit)
      this.emit('bundle:loaded', { bundleName: bundle.name, status })
      this.emit('asset:changed', { type: 'changed', assetId: `bundle:${bundle.versionKey}`, timestamp: this.now() })
    }
    try {
      this.ensureInitialized()
      assertLoadNotAborted(options.signal)
      assertValidAppVersion(appVersion)
      this.emit('bundle:loading', { bundleName: sourceName })
      report('checking-cache', null)
      if (options.expected && !options.force && options.enableCache !== false && this.config.enableCache) {
        const identity = options.expected
        const cached = await this.adapter.storage.getBundle(createBundleVersionKey(identity.name, identity.version, identity.buildNumber, identity.target))
        if (cached && cached.hash === identity.hash && await hasCompleteBundle(this.adapter.storage, cached)) {
          assertBundleIdentity(cached.manifest, cached.hash, identity)
          assertCompatibleGameVersion(cached.compatibility, appVersion, `Bundle "${cached.name}"`)
          assertLoadNotAborted(options.signal)
          await this.adapter.storage.storeBundle({ ...cached, active: true, loadedAt: this.now() })
          assertLoadNotAborted(options.signal)
          finish(cached, true)
          return
        }
      }
      report('downloading', null)
      const fetched = await this.ensureFetcher().fetchBytes(this.resolveUrl(bundleName), {
        cache: !options.force && options.enableCache !== false && this.config.enableCache,
        signal: options.signal,
        timeout: this.config.timeout,
        onProgress: (bytes, size) => {
          loaded = bytes
          total = size
          report('downloading', size > 0 ? Math.min(bytes / size, 1) * 0.8 : null)
          options.onProgress?.(bytes, size)
        },
      })
      const bytes = fetched instanceof Uint8Array ? fetched : fetched.data
      report('verifying', 0.8)
      const hash = await this.adapter.crypto.sha256(bytes)
      if (options.expected && hash !== options.expected.hash)
        throw new Error(`Bundle hash does not match the deployment manifest: ${bundleName}`)
      const { manifest, assets } = await this.bundleLoader.loadBundle(bytes, sourceName, options)
      assertBundleIdentity(manifest, hash, options.expected)
      const loadedAt = this.now()
      const logicalName = manifest.name || sourceName
      const version = manifest.bundleVersion || 1
      const buildNumber = manifest.buildNumber || 'unknown'
      const versionKey = createBundleVersionKey(logicalName, version, buildNumber, manifest.assetTarget?.name)
      const compatibility = manifest.runtimePackage?.compatibility || manifest.compatibility
      assertCompatibleGameVersion(manifest.compatibility, appVersion, `Bundle "${logicalName}"`)
      assertCompatibleGameVersion(compatibility, appVersion, `Bundle "${logicalName}"`)
      const existing = await this.adapter.storage.getBundle(versionKey)
      if (existing?.hash && existing.hash !== hash)
        throw new Error(`Bundle identity is immutable; increment version/build before replacing ${versionKey}`)
      const runtimePackageId = manifest.runtimePackage?.id
      const priority = manifest.runtimePackage?.priority ?? manifest.workspaceBundle?.priority ?? 0
      const storedAssets = assets.map(asset => ({
        ...asset,
        id: `${versionKey}:${asset.locale}:${asset.type}:${asset.path || asset.name}`,
        bundleName: logicalName,
        logicalBundleName: logicalName,
        bundleVersionKey: versionKey,
        bundleVersion: version,
        runtimePackageId,
        bundlePriority: priority,
        loadedAt,
        compatibility: asset.compatibility || compatibility,
      }))
      const bundle: StoredBundle = {
        name: logicalName,
        logicalName,
        versionKey,
        version,
        buildNumber,
        format: manifest.format,
        hash,
        size: storedAssets.reduce((sum, asset) => sum + asset.size, 0),
        assetCount: storedAssets.length,
        locales: manifest.locales || ['default'],
        createdAt: loadedAt,
        lastUpdated: loadedAt,
        manifest,
        runtimePackageId,
        priority,
        loadedAt,
        active: true,
        compatibility,
      }
      report('caching', 0.9)
      // Storage is also the mounted asset source, even with cache reuse disabled.
      assertLoadNotAborted(options.signal)
      await commitBundle(this.adapter.storage, bundle, storedAssets)
      await this.manageCacheSize()
      assertLoadNotAborted(options.signal)
      finish(bundle, false)
    }
    catch (error) {
      const bundleError = error instanceof BundleLoadError
        ? error
        : new BundleLoadError(`Failed to load bundle: ${error instanceof Error ? error.message : String(error)}`, sourceName)
      this.bundleStatuses.set(sourceName, { ...createBundleStatus(sourceName, 'error'), error: bundleError })
      this.emit('bundle:error', { bundleName: sourceName, error: bundleError })
      throw bundleError
    }
  }

  /** Load only the requested static packs and their dependencies. Defaults to immediate packs. */
  async loadWorkspaceBundles(index: WorkspaceBundleIndex, names?: readonly string[], options: LoadWorkspaceBundlesOptions = {}): Promise<void> {
    const plan = resolveWorkspaceBundles(index, names, options.target)
    for (let bundleIndex = 0; bundleIndex < plan.length; bundleIndex++) {
      const { name, record } = plan[bundleIndex]
      await this.loadBundle(record.filename, {
        ...options,
        expected: { name, version: record.version, buildNumber: record.buildNumber, hash: record.hash, target: record.assetTarget?.name },
        onState: (state) => {
          options.onState?.(state)
          options.onBundleState?.({ ...state, bundleIndex, bundleCount: plan.length })
        },
      })
    }
  }

  setLocale(locale: AssetLocale): void {
    const normalizedLocale = normalizeLocale(locale)
    if (this.currentLocale === normalizedLocale) {
      return
    }
    this.currentLocale = normalizedLocale
    this.assetManager.cleanup()
    this.assetManager = new AssetManager(this.adapter.storage, normalizedLocale, this.provider, this.config.appVersion)
    for (const plugin of this.config.plugins) {
      if (isAssetProcessingPlugin(plugin)) {
        this.assetManager.registerProcessingPlugin(plugin)
      }
    }
    this.emit('asset:changed', {
      type: 'changed',
      assetId: `locale:${normalizedLocale}`,
      path: 'locale',
      timestamp: this.now(),
    })
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

  async getI18nCatalog(namespace = DEFAULT_I18N_NAMESPACE, options: I18nCatalogOptions = {}): Promise<I18nMessages> {
    this.ensureInitialized()
    const assetName = i18nCatalogAssetName(options.namespace || namespace)
    const locale = options.locale || this.currentLocale
    const defaultLocale = options.defaultLocale || DEFAULT_I18N_LOCALE
    const base = await this.readI18nCatalogAsset(assetName, {
      bundleName: options.bundleName,
      locale: defaultLocale,
      targetPackageId: options.targetPackageId,
    })

    if (locale === defaultLocale) {
      return base.messages
    }

    const localized = await this.readI18nCatalogAsset(assetName, {
      bundleName: options.bundleName,
      locale,
      targetPackageId: options.targetPackageId,
    })

    if (localized.locale === defaultLocale) {
      return base.messages
    }

    return mergeI18nCatalogs(base.messages, localized.messages)
  }

  async translate(key: string, input?: TranslateInput): Promise<string> {
    this.ensureInitialized()
    const options = normalizeTranslateOptions(input)
    const catalog = await this.getI18nCatalog(options.namespace, options)
    const message = catalog[key] ?? resolveMissingTranslation(key, options)
    return formatI18nMessage(message, options.values)
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

  private async readI18nCatalogAsset(
    assetName: string,
    options: LoadAssetOptions,
  ): Promise<{ locale: AssetLocale, messages: I18nMessages }> {
    try {
      const asset = await this.getAsset('data', assetName, options)
      return {
        locale: asset.locale,
        messages: normalizeI18nCatalog(JSON.parse(bytesToUtf8(asset.data))),
      }
    }
    catch (error) {
      if (!(error instanceof AssetNotFoundError)) {
        throw error
      }
      return {
        locale: options.locale || DEFAULT_I18N_LOCALE,
        messages: {},
      }
    }
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
    const result = await this.patchManager.applyPatch(this.resolveUrl(patchNameOrUrl), targetBundleName, {
      ...options,
      appVersion: options?.appVersion || this.config.appVersion,
    })
    if (result.success) {
      this.assetManager.clearManifestCache()
      this.emit('asset:changed', { type: 'changed', assetId: `bundle:${targetBundleName}`, timestamp: this.now() })
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
    return await this.patchManager.previewPatch(this.resolveUrl(patchNameOrUrl), targetBundleName, this.config.appVersion)
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
    return await this.patchManager.canApplyPatch(this.resolveUrl(patchNameOrUrl), targetBundleName, this.config.appVersion)
  }

  async loadDynamicBundle(bundleNameOrUrl: string, options: LoadDynamicBundleOptions = {}): Promise<DynamicBundleRecord> {
    this.ensureInitialized()
    const sourceName = bundleNameOrUrl.replace(/\.(qpk|zip|bundle)$/, '')
    this.bundleStatuses.set(sourceName, createBundleStatus(sourceName, 'loading'))
    let downloaded = 0
    let downloadTotal = 0
    const report = (phase: BundleLoadProgress['phase'], progress: number | null, cacheHit = false) => {
      options.onState?.({ bundleName: bundleNameOrUrl, phase, progress, loaded: downloaded, total: downloadTotal, cacheHit })
    }

    try {
      this.emit('bundle:loading', { bundleName: sourceName })
      report('downloading', null)
      const fetcher = this.ensureFetcher()
      const fetched = await fetcher.fetchBytes(this.resolveUrl(bundleNameOrUrl), {
        cache: options.enableCache !== false,
        signal: options.signal,
        timeout: this.config.timeout,
        onProgress: (loaded, total) => {
          downloaded = loaded
          downloadTotal = total
          report('downloading', total > 0 ? Math.min(loaded / total, 1) * 0.8 : null)
          this.updateBundleProgress(sourceName, total > 0 ? (loaded / total) * 0.8 : 0)
          options.onProgress?.(loaded, total)
        },
      })
      const bytes = fetched instanceof Uint8Array ? fetched : fetched.data
      report('verifying', 0.8)
      const bundleHash = await this.adapter.crypto.sha256(bytes)
      const loaded = await this.bundleLoader.loadBundle(bytes, sourceName, options)
      assertBundleIdentity(loaded.manifest, bundleHash, options.expected)
      const runtimePackage = loaded.manifest.runtimePackage
      if (!runtimePackage) {
        throw new BundleLoadError('Dynamic bundle manifest missing runtimePackage metadata', sourceName)
      }
      const logicalBundleName = options.bundleName || loaded.manifest.name || runtimePackage.id || sourceName
      const bundleVersion = loaded.manifest.bundleVersion || 1
      const buildNumber = loaded.manifest.buildNumber || 'unknown'
      const bundleVersionKey = createBundleVersionKey(logicalBundleName, bundleVersion, buildNumber, loaded.manifest.assetTarget?.name)
      const appVersion = options.appVersion || this.config.appVersion
      assertValidAppVersion(appVersion)
      assertCompatibleGameVersion(loaded.manifest.compatibility, appVersion, `Bundle "${logicalBundleName}"`)
      assertCompatibleGameVersion(
        runtimePackage.compatibility || loaded.manifest.compatibility,
        appVersion,
        `Runtime package "${runtimePackage.id}"`,
      )

      const existingBundle = await this.adapter.storage.getBundle(bundleVersionKey)
      if (existingBundle?.hash && existingBundle.hash !== bundleHash)
        throw new Error(`Bundle identity is immutable; increment version/build before replacing ${bundleVersionKey}`)
      if (!options.force && existingBundle && existingBundle.hash === bundleHash && await hasCompleteBundle(this.adapter.storage, existingBundle)) {
        const existingRuntimePackage = existingBundle.manifest.runtimePackage || runtimePackage
        await this.adapter.storage.storeBundle({
          ...existingBundle,
          active: true,
          loadedAt: existingBundle.loadedAt || this.now(),
        })
        const status = {
          name: logicalBundleName,
          version: existingBundle.version,
          state: 'loaded' as const,
          progress: 1,
          assetCount: existingBundle.assetCount,
          loadedAssets: existingBundle.assetCount,
          lastUpdated: existingBundle.lastUpdated,
        }
        this.bundleStatuses.set(sourceName, status)
        this.bundleStatuses.set(logicalBundleName, status)
        report('ready', 1, true)
        this.emit('bundle:loaded', { bundleName: logicalBundleName, status })
        return {
          packageId: existingRuntimePackage.id,
          bundleName: logicalBundleName,
          logicalBundleName,
          bundleVersionKey,
          version: existingRuntimePackage.version,
          bundleVersion,
          hash: existingBundle.hash,
          priority: existingBundle.priority || 0,
          loadedAt: existingBundle.loadedAt || this.now(),
          assetCount: existingBundle.assetCount,
          manifest: existingBundle.manifest,
          compatibility: existingBundle.compatibility || loaded.manifest.compatibility || runtimePackage.compatibility,
        }
      }
      const loadedAt = this.now()
      const priority = options.priority ?? runtimePackage.priority ?? 0
      const compatibility = runtimePackage.compatibility || loaded.manifest.compatibility
      const assets = loaded.assets.map((asset) => {
        const logicalPath = asset.path || asset.name
        return {
          ...asset,
          id: `${bundleVersionKey}:${asset.locale}:${asset.type}:${logicalPath}`,
          bundleName: logicalBundleName,
          logicalBundleName,
          bundleVersionKey,
          path: logicalPath,
          runtimePackageId: runtimePackage.id,
          bundlePriority: priority,
          loadedAt,
          compatibility: asset.compatibility || compatibility,
          bundleVersion,
        }
      })

      report('caching', 0.9)
      assertLoadNotAborted(options.signal)
      await commitBundle(this.adapter.storage, {
        name: logicalBundleName,
        logicalName: logicalBundleName,
        versionKey: bundleVersionKey,
        version: bundleVersion,
        buildNumber,
        format: loaded.manifest.format,
        hash: bundleHash,
        size: assets.reduce((sum, asset) => sum + asset.size, 0),
        assetCount: assets.length,
        locales: loaded.manifest.locales || ['default'],
        createdAt: loadedAt,
        lastUpdated: loadedAt,
        manifest: loaded.manifest,
        runtimePackageId: runtimePackage.id,
        priority,
        loadedAt,
        active: true,
        compatibility,
      }, assets)
      if (options.enableCache !== false && this.config.enableCache) {
        await this.manageCacheSize()
      }

      const status = {
        name: logicalBundleName,
        version: bundleVersion,
        state: 'loaded' as const,
        progress: 1,
        assetCount: assets.length,
        loadedAssets: assets.length,
        lastUpdated: loadedAt,
      }
      this.bundleStatuses.delete(sourceName)
      this.bundleStatuses.set(logicalBundleName, status)

      const record: DynamicBundleRecord = {
        packageId: runtimePackage.id,
        bundleName: logicalBundleName,
        logicalBundleName,
        bundleVersionKey,
        version: runtimePackage.version,
        bundleVersion,
        hash: bundleHash,
        priority,
        loadedAt,
        assetCount: assets.length,
        compatibility,
        manifest: loaded.manifest,
      }
      this.emit('bundle:loaded', { bundleName: logicalBundleName, status })
      report('ready', 1)
      this.emit('dynamic-bundle:loaded', record)
      return record
    }
    catch (error) {
      const bundleError = error instanceof BundleLoadError
        ? error
        : new BundleLoadError(`Failed to load dynamic bundle: ${error instanceof Error ? error.message : String(error)}`, sourceName)
      this.bundleStatuses.set(sourceName, {
        ...createBundleStatus(sourceName, 'error'),
        error: bundleError,
      })
      this.emit('bundle:error', { bundleName: sourceName, error: bundleError })
      throw bundleError
    }
  }

  async unloadDynamicBundle(bundleNameOrPackageId: string): Promise<void> {
    this.ensureInitialized()
    const bundles = await this.adapter.storage.getAllBundles()
    const targets = bundles.filter(bundle =>
      bundle.versionKey === bundleNameOrPackageId
      || bundle.name === bundleNameOrPackageId
      || bundle.logicalName === bundleNameOrPackageId
      || bundle.runtimePackageId === bundleNameOrPackageId
      || bundle.manifest.runtimePackage?.id === bundleNameOrPackageId,
    )
    if (targets.length === 0) {
      throw new Error(`Dynamic bundle not found: ${bundleNameOrPackageId}`)
    }

    const bundle = selectBestStoredBundle(targets) || targets[0]
    if (!bundle) {
      throw new Error(`Dynamic bundle not found: ${bundleNameOrPackageId}`)
    }

    await this.removeBundleAssets(bundle)
    if (bundle.active) {
      const remaining = (await this.adapter.storage.getAllBundles()).filter(candidate =>
        candidate.logicalName === bundle.logicalName
        || candidate.name === bundle.logicalName,
      )
      const nextActive = selectBestStoredBundle(remaining)
      if (nextActive) {
        this.bundleStatuses.set(nextActive.name, {
          name: nextActive.name,
          version: nextActive.version,
          state: 'loaded',
          progress: 1,
          assetCount: nextActive.assetCount,
          loadedAssets: nextActive.assetCount,
          lastUpdated: nextActive.lastUpdated,
        })
      }
    }
    this.emit('dynamic-bundle:unloaded', {
      packageId: bundle.runtimePackageId || bundle.manifest.runtimePackage?.id || bundle.name,
      bundleName: bundle.name,
    })
  }

  async getBundleManifest(bundleName: string) {
    this.ensureInitialized()
    return (await this.adapter.storage.getBundle(bundleName))?.manifest
  }

  async getAssetManifestRecord(
    type: AssetType,
    name: string,
    options: LoadAssetOptions = {},
  ): Promise<AssetManifestRecord | undefined> {
    this.ensureInitialized()
    const records: AssetManifestRecord[] = []
    const locale = options.locale || this.currentLocale
    const appVersion = options.appVersion || this.config.appVersion
    const bundles = filterAssetManifestBundles(await this.adapter.storage.getAllBundles(), options, locale)

    for (const bundle of bundles) {
      const assets = bundle.manifest.assets[type]
      if (!assets)
        continue
      for (const [key, asset] of Object.entries(assets)) {
        if (!matchesManifestAssetName(asset, key, name))
          continue
        records.push(...createAssetManifestRecords(bundle, type, key, asset))
      }
    }

    return findBestRankedAssetRecord(records, locale, appVersion)
  }

  private async removeBundleAssets(bundle: StoredBundle): Promise<void> {
    const lookupKey = bundle.versionKey || bundle.name
    const assets = await this.adapter.storage.findAssets({ bundleName: bundle.name, bundleVersionKey: lookupKey })
    await this.adapter.storage.deleteBundle(lookupKey)
    this.bundleStatuses.delete(bundle.name)
    this.bundleStatuses.delete(lookupKey)
    for (const asset of assets) {
      this.emit('asset:changed', {
        type: 'removed',
        assetId: asset.id,
        path: asset.path || asset.name,
        timestamp: this.now(),
      })
    }
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
  assertValidAppVersion(config.appVersion)
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

function resolveMissingTranslation(key: string, options: TranslateOptions): string {
  if (options.fallback !== undefined) {
    return options.fallback
  }
  if (options.missing === 'key') {
    return key
  }
  return ''
}

function filterAssetManifestBundles(
  bundles: StoredBundle[],
  options: LoadAssetOptions,
  locale: AssetLocale,
): StoredBundle[] {
  const matches = bundles.filter(bundle => matchesAssetManifestBundle(bundle, options, locale))
  if (options.bundleVersionKey) {
    return matches
  }
  const active = matches.filter(bundle => bundle.active !== false)
  return active.length > 0 ? active : matches
}

function matchesAssetManifestBundle(bundle: StoredBundle, options: LoadAssetOptions, locale: AssetLocale): boolean {
  if (options.bundleVersionKey && bundle.versionKey !== options.bundleVersionKey && bundle.name !== options.bundleVersionKey)
    return false
  if (options.targetPackageId) {
    const packageId = bundle.runtimePackageId || bundle.manifest.runtimePackage?.id
    if (packageId !== options.targetPackageId && !localePackTargetsRuntimePackage(bundle, options.targetPackageId, locale))
      return false
  }
  if (options.bundleName) {
    const logicalName = bundle.logicalName || bundle.manifest.name
    if (bundle.name !== options.bundleName && logicalName !== options.bundleName && bundle.manifest.name !== options.bundleName)
      return false
  }
  return true
}

function localePackTargetsRuntimePackage(bundle: StoredBundle, targetPackageId: string, locale: AssetLocale): boolean {
  const localePack = bundle.manifest.runtimePackage?.localePack
  if (!localePack)
    return false
  if (!createLocaleFallbackChain(locale).includes(normalizeLocale(localePack.locale)))
    return false
  return localePack.targets.some(target =>
    target.kind === 'runtimePackage'
    && target.id === targetPackageId,
  )
}

function matchesManifestAssetName(asset: AssetInfo, key: string, name: string): boolean {
  return key === name
    || asset.name === name
    || asset.path === name
    || asset.relativePath === name
    || asset.path?.endsWith(`/${name}`) === true
    || asset.relativePath?.endsWith(`/${name}`) === true
}

function createAssetManifestRecords(
  bundle: StoredBundle,
  type: AssetType,
  key: string,
  asset: AssetInfo,
): AssetManifestRecord[] {
  const records: AssetManifestRecord[] = []
  const variants = Object.entries(asset.variants || {})
  const variantLocales = new Set<AssetLocale>()
  for (const [locale, variant] of variants) {
    const variantLocale = variant.locale || locale
    variantLocales.add(variantLocale)
    records.push(createAssetManifestRecord(bundle, type, key, {
      ...asset,
      ...variant,
      name: asset.name,
      type,
      locales: [variantLocale],
      compatibility: variant.compatibility || asset.compatibility,
      mediaMetadata: variant.mediaMetadata || asset.mediaMetadata,
      mimeType: variant.mimeType || asset.mimeType,
    }, variantLocale))
  }

  const baseLocales = (asset.locales?.length ? asset.locales : [bundle.manifest.defaultLocale || 'default'])
    .filter(locale => !variantLocales.has(locale))
  for (const locale of baseLocales) {
    records.push(createAssetManifestRecord(bundle, type, key, asset, locale))
  }

  return records
}

function createAssetManifestRecord(
  bundle: StoredBundle,
  type: AssetType,
  key: string,
  asset: AssetInfo,
  locale: AssetLocale,
): AssetManifestRecord {
  const name = asset.name || key
  const path = asset.path || asset.relativePath || name
  return {
    id: `${bundle.versionKey || bundle.name}:${locale}:${type}:${path}`,
    bundleName: bundle.name,
    logicalBundleName: bundle.logicalName || bundle.manifest.name || bundle.name,
    bundleVersionKey: bundle.versionKey,
    name,
    type,
    locale,
    path,
    hash: asset.hash,
    size: asset.size,
    version: asset.version,
    bundleVersion: bundle.version,
    mtime: asset.mtime,
    mimeType: asset.mimeType,
    mediaMetadata: asset.mediaMetadata,
    compatibility: asset.compatibility || bundle.compatibility || bundle.manifest.compatibility,
    runtimePackageId: bundle.runtimePackageId || bundle.manifest.runtimePackage?.id,
    bundlePriority: bundle.priority,
    loadedAt: bundle.loadedAt,
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
