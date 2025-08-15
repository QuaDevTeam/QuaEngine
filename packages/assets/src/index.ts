export { AssetManager } from './asset-manager'

export { BundleLoader } from './bundle-loader'
// Core components
export { QuaAssetsDatabase } from './database'
export { PatchManager } from './patch-manager'
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
  AssetLocale,
  AssetNotFoundError,
  AssetProcessingPlugin,
  AssetQueryResult,

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
