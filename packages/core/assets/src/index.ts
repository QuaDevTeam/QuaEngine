export { AssetManager } from './asset-manager'

export { BundleLoader } from './bundle-loader'
// Core components
export { MemoryAssetStorage, QuaAssetsDatabase } from './database'
export { PatchManager } from './patch-manager'
export { findBestAssetRecord } from './providers'
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
  AssetDiff,
  AssetChange,
  AssetChangeListener,
  AssetChangeType,
  AssetCacheStats,
  AssetCodec,
  AssetCrypto,
  AssetData,
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
  AssetUpdateInfo,

  // Core types
  AssetType,
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
