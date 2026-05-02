export { AssetManager } from './asset-manager'

export { BundleLoader } from './bundle-loader'
// Core components
export { QuaAssetsDatabase } from './database'
export { PatchManager } from './patch-manager'
export { createDevVfsProvider, DevVfsAssetProvider } from './providers'
// Built-in plugins
export {
  AESDecryptionPlugin,
  CacheWarmingPlugin,
  CompressionDetectionPlugin,
  ImageProcessingPlugin,
  LZMADecompressionPlugin,
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
  AssetLocale,
  AssetManifest,
  AssetManifestRecord,
  AssetNotFoundError,
  AssetProcessingPlugin,
  AssetProvider,
  AssetQueryResult,
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

  JSExecutionResult,
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
