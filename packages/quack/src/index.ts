// Main bundler class
export { QuackBundler, defineConfig } from './bundler.js'

// Workspace management
export { WorkspaceManager } from './workspace.js'

// Core types
export type {
  QuackConfig,
  BundleOptions,
  BundleFormat,
  BundleManifest,
  PatchManifest,
  AssetInfo,
  AssetType,
  AssetSubType,
  AssetContext,
  BundleStats,
  LocaleInfo,
  CompressionAlgorithm,
  EncryptionAlgorithm,
  EncryptionContext,
  BuildLog,
  BundleIndex,
  WorkspaceBundleIndex,
  BundleInfo,
  WorkspaceConfig,
  BundleDefinition,
  VersionConfig,
  PatchOptions,
  MultiBundlePatchOptions,
  AssetDiff,
  MerkleNode
} from './types.js'

// Bundler implementations
export { ZipBundler } from './zip-bundler.js'
export { QPKBundler } from './qpk-bundler.js'

// Core utilities
export { AssetDetector } from './asset-detector.js'
export { MetadataGenerator } from './metadata.js'
export { PluginManager } from './plugin-manager.js'
export { EncryptionManager } from './encryption.js'
export { VersionManager } from './versioning.js'
export { PatchGenerator } from './patch-generator.js'

// Plugin base classes and types
export { QuackPlugin } from './types.js'
export type { EncryptionPlugin } from './types.js'