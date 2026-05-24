export { AssetManager } from './asset-manager'

export {
  compareStoredBundles,
  createBundleVersionKey,
  getBundleLogicalName,
  getBundleStorageKey,
  isBundleIdentityMatch,
  selectBestStoredBundle,
} from './bundle-identity'

export { BundleLoader } from './bundle-loader'
export {
  assertCompatibleGameVersion,
  assertValidAppVersion,
  assertValidCompatibility,
  getCompatibilityErrors,
  isCompatibleWithGameVersion,
} from './compatibility'
export {
  DEFAULT_I18N_LOCALE,
  DEFAULT_I18N_NAMESPACE,
  formatI18nMessage,
  i18nCatalogAssetName,
  mergeI18nCatalogs,
  normalizeI18nCatalog,
  normalizeTranslateOptions,
} from './i18n'
export {
  createLocaleFallbackChain,
  findBestAssetRecord,
  findBestRankedAssetRecord,
  findBestTargetRankedAssetRecord,
  normalizeLocale,
} from './providers'
// Core components
export { MemoryAssetStorage, QuaAssetsDatabase } from './database'
export { PatchManager } from './patch-manager'
// Built-in plugins
export {
  CacheWarmingPlugin,
  CompressionDetectionPlugin,
  NoopDecompressionPlugin,
  XORDecryptionPlugin,
} from './plugins/index'

// Main QuaAssets class
export { QuaAssets } from './qua-assets'

// Types and interfaces
export type {
  AssetCacheStats,
  AssetChange,
  AssetChangeListener,
  AssetChangeType,
  AssetCodec,
  AssetCrypto,
  AssetData,
  AssetDiff,
  AssetFetcher,
  AssetFetchResult,
  AssetFindCriteria,
  AssetLocale,
  AssetInfo,
  AssetManifest,
  AssetManifestRecord,
  AssetNotFoundError,
  AssetProcessingPlugin,
  AssetProvider,
  AssetQueryResult,
  AssetRuntimeAdapter,
  AssetStorage,
  // Core types
  AssetType,
  AssetVariantInfo,

  AssetUpdateInfo,
  BundleFormat,
  BundleIndex,
  BundleInfo,
  BundleLoadError,
  BundleManifest,
  // Results and status
  BundleStatus,

  DecompressionPlugin,
  DecryptionPlugin,
  DynamicBundleRecord,
  IntegrityError,

  LoadDynamicBundleOptions,
  LoadAssetOptions,
  LoadBundleOptions,

  LoadingState,
  PatchOperation,
  // Configuration
  QuaAssetsConfig,
  // Errors
  QuaAssetsError,

  // Events
  QuaAssetsEvents,

  // Plugin interfaces
  QuaAssetsPlugin,
  RuntimePackageIntegrityManifest,
  RuntimeLocalePackManifest,
  RuntimeLocalePackTargetManifest,
  RuntimePackageManifest,
  RuntimePackagePluginKind,
  RuntimePackagePluginManifest,
  RuntimePackageSceneManifest,
  RuntimePackageScriptManifest,
  RuntimePackageScriptVariantManifest,
  RuntimePackageSignatureManifest,
  RuntimePackageStoreMigrationManifest,
  RuntimePackageStoryGraphDeltaManifest,
  VersionCompatibility,
  // Data structures
  StoredAsset,
  StoredBundle,
  WorkspaceBundleIndex,
} from './types'
export type {
  I18nCatalog,
  I18nCatalogOptions,
  I18nMessageValue,
  I18nMessageValues,
  I18nMessages,
  TranslateInput,
  TranslateOptions,
} from './i18n'
