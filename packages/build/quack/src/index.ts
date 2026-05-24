// Core utilities
export { AssetDetector } from './assets/asset-detector'

export { MediaMetadataExtractor } from './assets/media-extractor'

export { MetadataGenerator } from './assets/metadata'

export { QPKBundler } from './bundlers/qpk-bundler'
export { readQpkBundle, readQpkSummary } from './qpk-reader'
// Bundler implementations
export { ZipBundler } from './bundlers/zip-bundler'

// Main bundler class
export { defineConfig, QuackBundler } from './core/bundler'
export { buildLocalePack } from './i18n/locale-pack'
export type { LocalePackBuildOptions, LocalePackBuildResult } from './i18n/locale-pack'
export {
  base64UrlDecode,
  base64UrlEncode,
  canonicalJson,
  createRuntimePackageSignaturePayload,
  QUA_RUNTIME_SIGNATURE_ALGORITHM,
  QUA_RUNTIME_SIGNATURE_SCHEMA,
  readKeyFile,
  signQpkFile,
  signRuntimePackageManifest,
  stripRuntimePackageSignature,
  verifyQpkFile,
  verifyRuntimePackageSignature,
} from './security/signature'
export type { QpkKeyInput, QpkSignatureOptions, QpkVerifyOptions, QpkVerifyResult, RuntimePackageSignaturePayload } from './security/signature'
// Core types
export type {
  AssetCollectionContext,
  AssetContext,
  AssetDiff,
  AssetInfo,
  AssetSubType,
  AssetType,
  AssetVariantInfo,
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
  QuackSigningConfig,
  RuntimePackageIntegrityManifest,
  RuntimeLocalePackManifest,
  RuntimeLocalePackTargetManifest,
  RuntimePackageManifest,
  RuntimePackagePluginKind,
  RuntimePackagePluginManifest,
  RuntimePackageSceneManifest,
  RuntimePackageScriptManifest,
  RuntimePackageScriptVariantManifest,
  RuntimePackageSignatureManifest,
  RuntimePackageStoreMigrationManifest,
  RuntimePackageStoryGraphDeltaManifest,
  VersionConfig,
  VideoMetadata,
  WorkspaceBundleIndex,
  WorkspaceConfig,
} from './core/types'
export type {
  QpkAssetSummary,
  QpkHeaderInfo,
  QpkReaderOptions,
  QpkReadSummary,
} from './qpk-reader'
// Plugin base classes and types
export { QuackPlugin } from './core/types'
export type { EncryptionPlugin } from './core/types'
export { EncryptionManager } from './crypto/encryption'
export { PluginManager } from './managers/plugin-manager'
export {
  BundleAnalyzerPlugin,
  type ImageOptimizationFormat,
  ImageOptimizationPlugin,
  type ImageOptimizationPluginOptions,
  type PngquantOptions,
} from './plugins'
export { PatchGenerator } from './workspace/patch-generator'

export { VersionManager } from './workspace/versioning'
// Workspace management
export { WorkspaceManager } from './workspace/workspace'
