// Main QuaAssets class
import { QuaAssets } from './qua-assets'
export { QuaAssets } from './qua-assets'

// Core components
export { QuaAssetsDatabase } from './database'
export { BundleLoader } from './bundle-loader'
export { AssetManager } from './asset-manager'
export { PatchManager } from './patch-manager'

// Built-in plugins
export {
  XORDecryptionPlugin,
  AESDecryptionPlugin,
  LZMADecompressionPlugin,
  ImageProcessingPlugin,
  CacheWarmingPlugin,
  CompressionDetectionPlugin
} from './plugins/index'

// Types and interfaces
export type {
  // Core types
  AssetType,
  AssetLocale,
  BundleFormat,
  LoadingState,
  PatchOperation,
  
  // Data structures
  StoredAsset,
  StoredBundle,
  BundleManifest,
  AssetDiff,
  BundleIndex,
  WorkspaceBundleIndex,
  BundleInfo,
  
  // Configuration
  QuaAssetsConfig,
  LoadAssetOptions,
  LoadBundleOptions,
  
  // Results and status
  BundleStatus,
  AssetQueryResult,
  JSExecutionResult,
  
  // Plugin interfaces
  QuaAssetsPlugin,
  DecompressionPlugin,
  DecryptionPlugin,
  AssetProcessingPlugin,
  
  // Events
  QuaAssetsEvents,
  
  // Errors
  QuaAssetsError,
  BundleLoadError,
  AssetNotFoundError,
  IntegrityError
} from './types'

// Default export
export default QuaAssets
