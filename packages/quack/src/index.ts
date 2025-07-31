// Main bundler class
export { QuackBundler, defineConfig } from './bundler'

// Workspace management
export { WorkspaceManager } from './workspace'

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
} from './types'

// Bundler implementations
export { ZipBundler } from './zip-bundler'
export { QPKBundler } from './qpk-bundler'

// Core utilities
export { AssetDetector } from './asset-detector'
export { MetadataGenerator } from './metadata'
export { PluginManager } from './plugin-manager'
export { EncryptionManager } from './encryption'
export { VersionManager } from './versioning'
export { PatchGenerator } from './patch-generator'

// Plugin base classes and types
export { QuackPlugin } from './types'
export type { EncryptionPlugin } from './types'