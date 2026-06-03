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
// Core components
export { MemoryAssetStorage, QuaAssetsDatabase } from './database'
export {
  DEFAULT_I18N_LOCALE,
  DEFAULT_I18N_NAMESPACE,
  formatI18nMessage,
  i18nCatalogAssetName,
  mergeI18nCatalogs,
  normalizeI18nCatalog,
  normalizeTranslateOptions,
} from './i18n'
export type {
  I18nCatalog,
  I18nCatalogOptions,
  I18nMessages,
  I18nMessageValue,
  I18nMessageValues,
  TranslateInput,
  TranslateOptions,
} from './i18n'
export { PatchManager } from './patch-manager'
// Built-in plugins
export {
  CacheWarmingPlugin,
  XORDecryptionPlugin,
} from './plugins/index'

export {
  createLocaleFallbackChain,
  findBestAssetRecord,
  findBestRankedAssetRecord,
  findBestTargetRankedAssetRecord,
  normalizeLocale,
} from './providers'

// Main QuaAssets class
export { QuaAssets } from './qua-assets'
// Types and interfaces
export type {
  AssetBundleTargetManifest,
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
  AssetInfo,
  AssetLocale,
  AssetManifest,
  AssetManifestRecord,
  AssetNotFoundError,
  AssetPipelineDomain,
  AssetPipelineResult,
  AssetProcessingPlugin,
  AssetProvider,
  AssetQueryResult,
  AssetRuntimeAdapter,
  AssetStorage,
  // Core types
  AssetType,
  AssetUpdateInfo,

  AssetVariantInfo,
  BundleFormat,
  BundleIndex,
  BundleIndexRecord,
  BundleInfo,
  BundleLoadError,
  BundleManifest,
  // Results and status
  BundleStatus,

  DecompressionPlugin,
  DecryptionPlugin,
  DynamicBundleRecord,
  IntegrityError,

  LoadAssetOptions,
  LoadBundleOptions,
  LoadDynamicBundleOptions,

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
  RuntimeLocalePackManifest,
  RuntimeLocalePackTargetManifest,
  RuntimePackageIntegrityManifest,
  RuntimePackageManifest,
  RuntimePackagePluginKind,
  RuntimePackagePluginManifest,
  RuntimePackageSceneManifest,
  RuntimePackageScriptManifest,
  RuntimePackageScriptVariantManifest,
  RuntimePackageSignatureManifest,
  RuntimePackageStoreMigrationManifest,
  RuntimePackageStoryGraphDeltaManifest,
  // Data structures
  StoredAsset,
  StoredBundle,
  VersionCompatibility,
  WorkspaceBundleIndex,
} from './types'
