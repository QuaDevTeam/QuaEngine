// Main bundler class
export { QuackBundler, defineConfig } from './core/bundler'

// Workspace management
export { WorkspaceManager } from './workspace/workspace'

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
  MerkleNode,
  ImageMetadata,
  AudioMetadata,
  VideoMetadata,
  MediaMetadata
} from './core/types'

// Bundler implementations
export { ZipBundler } from './bundlers/zip-bundler'
export { QPKBundler } from './bundlers/qpk-bundler'

// Core utilities
export { AssetDetector } from './assets/asset-detector'
export { MetadataGenerator } from './assets/metadata'
export { MediaMetadataExtractor } from './assets/media-extractor'
export { PluginManager } from './managers/plugin-manager'
export { EncryptionManager } from './crypto/encryption'
export { VersionManager } from './workspace/versioning'
export { PatchGenerator } from './workspace/patch-generator'

// Plugin base classes and types
export { QuackPlugin } from './core/types'
export type { EncryptionPlugin } from './core/types'