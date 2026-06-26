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
  AssetBundleTarget,
  AssetBundleTargetManifest,
  AssetCollectionContext,
  AssetContext,
  AssetDiff,
  AssetInfo,
  AssetPipelineDomain,
  AssetPipelineExternalTool,
  AssetPipelineOptions,
  AssetPipelineResult,
  AssetSubType,
  AssetType,
  AssetVariantInfo,
  AudioMetadata,
  AudioPipelineFormat,
  AudioPipelineOptions,
  BuildLog,
  BundleDefinition,
  BundleFormat,
  BundleIndex,
  BundleInfo,
  BundleManifest,
  BundleOptions,
  BundleStats,
  CocosAssetTargetManifestMetadata,
  CocosBuildPlatform,
  CocosHybridAssetConfig,
  CocosHybridAssetManifest,
  CocosHybridAssetPlacement,
  CompressionAlgorithm,
  EncryptionAlgorithm,
  EncryptionContext,
  FontPipelineFormat,
  FontPipelineOptions,
  ImageMetadata,
  ImagePipelineFormat,
  ImagePipelineOptions,
  LocaleInfo,
  MediaMetadata,
  MerkleNode,
  MultiBundlePatchOptions,
  PatchManifest,
  PatchOptions,
  QuackConfig,
  QuackSigningConfig,
  RuntimeLocalePackManifest,
  RuntimeLocalePackTargetManifest,
  RuntimePackageIntegrityManifest,
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
  VideoPipelineFormat,
  VideoPipelineOptions,
  WorkspaceBundleIndex,
  WorkspaceConfig,
} from './core/types'
// Plugin base classes and types
export { QuackPlugin } from './core/types'
export type { EncryptionPlugin } from './core/types'
export { EncryptionManager } from './crypto/encryption'
export { buildLocalePack } from './i18n/locale-pack'
export type { LocalePackBuildOptions, LocalePackBuildResult } from './i18n/locale-pack'
export { PluginManager } from './managers/plugin-manager'
export {
  AssetPipelinePlugin,
  type AssetPipelinePluginOptions,
  BundleAnalyzerPlugin,
  type ImageOptimizationFormat,
  ImageOptimizationPlugin,
  type ImageOptimizationPluginOptions,
  type PngquantOptions,
} from './plugins'
export {
  createQuaProjectAssetTargets,
  createQuaProjectNativeArtifactPlans,
  createQuaProjectNativeTargetBundleManifest,
  createQuaProjectWebAssets,
  createQuaProjectWebManifest,
  createQuaProjectWebRuntimeConfig,
  emitQuaProjectNativeTargetBundleManifest,
  emitQuaTargetBundleManifest,
  findQuaProjectConfigFile,
  loadQuaProjectConfig,
  mergeQuaProjectAssetTargets,
  normalizeQuaProjectConfig,
  QUA_NATIVE_TARGET_BUNDLE_MANIFEST_FILE,
  QUA_PROJECT_CONFIG_CANDIDATES,
  QUA_TARGET_BUNDLE_MANIFEST_FILE,
  syncQuaProjectCocos,
  tryLoadQuaProjectConfig,
  validateQuaProjectConfig,
} from './project'
export {
  assertLoadedQuackPluginTargetIsolation,
  assertQuackPluginReferencesTargetIsolation,
  assertQuackPluginSpecifiersTargetIsolation,
  assertQuackTargetPluginManifestIsolation,
  targetFromAssetPlatform,
} from './target-plugin-isolation'
export type {
  AssertQuackPluginTargetIsolationOptions,
  AssertQuackTargetPluginManifestIsolationOptions,
  QuackPluginReference,
} from './target-plugin-isolation'
export type {
  EmitQuaProjectNativeTargetBundleManifestOptions,
  EmitQuaTargetBundleManifestOptions,
  EmittedQuaProjectNativeTargetBundleManifest,
  EmittedQuaTargetBundleManifest,
  LoadQuaProjectConfigOptions,
  NormalizedQuaProjectCocosTarget,
  NormalizedQuaProjectConfig,
  NormalizedQuaProjectNativeTarget,
  NormalizedQuaProjectWebTarget,
  QuaProjectConfigFileName,
  QuaProjectConfigV1,
  QuaProjectDeviceClass,
  QuaProjectHomeConfig,
  QuaProjectIconConfig,
  QuaProjectLayoutInput,
  QuaProjectManifestIconInput,
  QuaProjectNativeArtifactPlan,
  QuaProjectNativePlatform,
  QuaProjectNativeProfile,
  QuaProjectNativeTargetBundleManifestOptions,
  QuaProjectNativeTargetConfig,
  QuaProjectTargetsConfig,
  QuaProjectWebAsset,
  QuaProjectWebRuntimeConfig,
  QuaProjectWebServiceWorkerMode,
  SyncedQuaProjectCocosBuildConfig,
  SyncQuaProjectCocosOptions,
  SyncQuaProjectCocosResult,
} from './project'
export { readQpkBundle, readQpkSummary } from './qpk-reader'
export type {
  QpkAssetSummary,
  QpkHeaderInfo,
  QpkReaderOptions,
  QpkReadSummary,
} from './qpk-reader'
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
export { PatchGenerator } from './workspace/patch-generator'

export { VersionManager } from './workspace/versioning'
// Workspace management
export { WorkspaceManager } from './workspace/workspace'
