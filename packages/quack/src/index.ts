// Core utilities
export { AssetDetector } from './assets/asset-detector'

export { MediaMetadataExtractor } from './assets/media-extractor'

export { MetadataGenerator } from './assets/metadata'

export { QPKBundler } from './bundlers/qpk-bundler'
// Bundler implementations
export { ZipBundler } from './bundlers/zip-bundler'

// Main bundler class
export { defineConfig, QuackBundler } from './core/bundler'
// Core types
export type {
  AssetContext,
  AssetDiff,
  AssetInfo,
  AssetSubType,
  AssetType,
  AudioMetadata,
  BuildLog,
  BundleDefinition,
  BundleFormat,
  BundleIndex,
  BundleInfo,
  BundleManifest,
  BundleOptions,
  BundleStats,
  CompressionAlgorithm,
  EncryptionAlgorithm,
  EncryptionContext,
  ImageMetadata,
  LocaleInfo,
  MediaMetadata,
  MerkleNode,
  MultiBundlePatchOptions,
  PatchManifest,
  PatchOptions,
  QuackConfig,
  VersionConfig,
  VideoMetadata,
  WorkspaceBundleIndex,
  WorkspaceConfig,
} from './core/types'
// Plugin base classes and types
export { QuackPlugin } from './core/types'
export type { EncryptionPlugin } from './core/types'
export { EncryptionManager } from './crypto/encryption'
export { PluginManager } from './managers/plugin-manager'
export { PatchGenerator } from './workspace/patch-generator'

export { VersionManager } from './workspace/versioning'
// Workspace management
export { WorkspaceManager } from './workspace/workspace'
