// Main QuaAssets class
import { QuaAssets } from './qua-assets.js'
export { QuaAssets } from './qua-assets.js'

// Core components
export { QuaAssetsDatabase } from './database.js'
export { BundleLoader } from './bundle-loader.js'
export { AssetManager } from './asset-manager.js'
export { PatchManager } from './patch-manager.js'

// Built-in plugins
export {
  XORDecryptionPlugin,
  AESDecryptionPlugin,
  LZMADecompressionPlugin,
  ImageProcessingPlugin,
  CacheWarmingPlugin,
  CompressionDetectionPlugin
} from './plugins/index.js'

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
} from './types.js'

// Default export
export default QuaAssets
