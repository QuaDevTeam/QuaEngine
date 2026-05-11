export { AssetManager } from './asset-manager'

export { BundleLoader } from './bundle-loader'
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
export { findBestAssetRecord } from './providers'

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
  IntegrityError,

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
  // Data structures
  StoredAsset,
  StoredBundle,
  WorkspaceBundleIndex,
} from './types'
