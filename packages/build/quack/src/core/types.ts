import type { DecoratorMapping } from '@quajs/script-compiler'

export type AssetType = 'images' | 'characters' | 'audio' | 'video' | 'fonts' | 'scripts' | 'data'
export type AssetSubType
  = | 'backgrounds' | 'cg' | 'ui' // Images
    | 'sprites' // Characters
    | 'sfx' | 'voice' | 'bgm' // Audio
    | 'cutscenes' | 'effects' | 'intro' // Video
    | 'typefaces' | 'fontFamilies' // Fonts
    | 'logic' // Scripts
    | 'config' | 'save' // Data

export type BundleFormat = 'zip' | 'qpk'
export type CompressionAlgorithm = 'none' | 'deflate' | 'lzma'
export type EncryptionAlgorithm = 'none' | 'xor' | 'custom'
export type AssetPipelineDomain = 'images' | 'characters' | 'audio' | 'video' | 'fonts'
export type ImagePipelineFormat = 'source' | 'png' | 'jpeg' | 'webp' | 'avif' | 'jxl'
export type AudioPipelineFormat = 'source' | 'mp3' | 'ogg' | 'opus' | 'aac' | 'm4a' | 'flac' | 'wav'
export type VideoPipelineFormat = 'source' | 'mp4' | 'webm' | 'mov' | 'mkv'
export type FontPipelineFormat = 'source' | 'woff2' | 'woff' | 'ttf' | 'otf'

export type PatchOperation = 'added' | 'modified' | 'deleted'

export interface VersionCompatibility {
  minGameVersion?: string
}

export interface VersionedBundleRecord {
  filename: string
  hash: string
  version: number
  buildNumber: string
  created: string
  size: number
  compatibility?: VersionCompatibility
  assetTarget?: AssetBundleTargetManifest
}

export interface VersionedPatchRecord {
  filename: string
  hash: string
  fromVersion: number
  toVersion: number
  patchVersion: number
  created: string
  size: number
  changeCount: number
  compatibility?: VersionCompatibility
}

// Media metadata interfaces
export interface ImageMetadata {
  width: number
  height: number
  aspectRatio: number
  animated: boolean
  format: string // e.g., 'PNG', 'JPEG', 'GIF', 'WebP'
  colorDepth?: number
  hasAlpha?: boolean
}

export interface AudioMetadata {
  duration: number // Duration in seconds
  format: string // e.g., 'MP3', 'WAV', 'OGG', 'FLAC'
  bitrate?: number
  sampleRate?: number
  channels?: number
}

export interface VideoMetadata {
  width: number
  height: number
  aspectRatio: number
  duration: number // Duration in seconds
  format: string // e.g., 'MP4', 'WebM', 'AVI', 'MOV'
  frameRate?: number
  bitrate?: number
  hasAudio?: boolean
  codec?: string
}

export type MediaMetadata = ImageMetadata | AudioMetadata | VideoMetadata

export interface AssetInfo {
  name: string
  path: string
  relativePath: string
  size: number
  hash: string
  type: AssetType
  subType?: AssetSubType
  locales: string[]
  mimeType?: string
  mtime?: number
  version?: number // Asset version number
  mediaMetadata?: MediaMetadata // Extracted media information
  content?: Uint8Array
  variants?: Record<string, AssetVariantInfo>
  pipeline?: AssetPipelineResult
}

export interface AssetPipelineResult {
  kind: AssetPipelineDomain
  sourceFormat?: string
  sourceMimeType?: string
  targetFormat: string
  targetMimeType?: string
  tool?: string
  originalSize: number
  outputSize: number
  savedBytes: number
  warning?: string
}

export interface AssetVariantInfo {
  locale: string
  path: string
  relativePath: string
  size: number
  hash: string
  mimeType?: string
  mtime?: number
  version?: number
  mediaMetadata?: MediaMetadata
  pipeline?: AssetPipelineResult
}

export interface LocaleInfo {
  code: string
  name?: string
  isDefault: boolean
}

export interface AssetDiff {
  path: string
  operation: PatchOperation
  oldHash?: string
  newHash?: string
  oldVersion?: number
  newVersion?: number
  size?: number
}

export interface PatchManifest {
  version: string
  bundler: string
  created: string
  format: BundleFormat
  isPatch: true
  buildNumber?: string
  patchVersion: number
  fromVersion: number
  toVersion: number
  compatibility?: VersionCompatibility
  compression: {
    algorithm: CompressionAlgorithm
    level?: number
  }
  encryption: {
    enabled: boolean
    algorithm: EncryptionAlgorithm
  }
  locales: string[]
  defaultLocale: string
  changes: {
    added: AssetDiff[]
    modified: AssetDiff[]
    deleted: AssetDiff[]
  }
  totalChanges: number
  totalSize: number
  workspaceBundle?: {
    name: string
    fromBuild: string
    toBuild: string
  }
}

export type RuntimePackagePluginKind = 'engine' | 'renderer' | 'compiler'

export interface RuntimePackageScriptManifest {
  id: string
  version?: string
  assetName: string
  exportName?: string
  dependsOnBundles?: string[]
  variants?: Record<string, RuntimePackageScriptVariantManifest>
  metadata?: Record<string, unknown>
}

export interface RuntimePackageScriptVariantManifest {
  assetName: string
  version?: string
  exportName?: string
  runtimePackageId?: string
  bundleName?: string
  metadata?: Record<string, unknown>
}

export interface RuntimePackageSceneManifest {
  id: string
  version?: string
  assetName: string
  exportName?: string
  module?: string
  metadata?: Record<string, unknown>
}

export interface RuntimePackagePluginManifest {
  id: string
  kind: RuntimePackagePluginKind
  version?: string
  assetName?: string
  module?: string
  exportName?: string
  renderer?: string
  dependencies?: string[]
  metadata?: Record<string, unknown>
}

export interface RuntimePackageStoreMigrationManifest {
  id: string
  version?: string
  scope?: string
  assetName: string
  exportName?: string
  dependsOn?: string[]
  metadata?: Record<string, unknown>
}

export interface RuntimePackageStoryGraphDeltaManifest {
  id: string
  graphId?: string
  operation?: 'upsert' | 'remove'
  nodes?: readonly Record<string, unknown>[]
  edges?: readonly Record<string, unknown>[]
  lanes?: readonly Record<string, unknown>[]
  timelines?: readonly Record<string, unknown>[]
  metadata?: Record<string, unknown>
}

export interface RuntimePackageIntegrityManifest {
  hash: string
  algorithm?: 'sha256' | string
}

export interface RuntimePackageSignatureManifest {
  value: string
  algorithm?: string
  keyId?: string
}

export interface RuntimeLocalePackTargetManifest {
  kind: 'bundle' | 'runtimePackage'
  id: string
}

export interface RuntimeLocalePackManifest {
  locale: string
  targets: RuntimeLocalePackTargetManifest[]
  resourceTypes: AssetType[]
  fallbackLocales?: string[]
}

export interface RuntimePackageManifest {
  id: string
  version: string
  sequence?: number
  priority?: number
  compatibility?: VersionCompatibility
  dependencies?: string[]
  localePack?: RuntimeLocalePackManifest
  scripts?: RuntimePackageScriptManifest[]
  scenes?: RuntimePackageSceneManifest[]
  plugins?: RuntimePackagePluginManifest[]
  storyGraphDeltas?: RuntimePackageStoryGraphDeltaManifest[]
  storeMigrations?: RuntimePackageStoreMigrationManifest[]
  integrity?: RuntimePackageIntegrityManifest
  signature?: RuntimePackageSignatureManifest
  metadata?: Record<string, unknown>
}

export interface BundleManifest {
  name: string
  version: string
  bundler: string
  created: string
  createdAt: number
  format: BundleFormat
  isPatch?: boolean
  bundleVersion: number // Overall bundle version
  buildNumber?: string // Build identifier
  compatibility?: VersionCompatibility
  buildMetadata?: {
    branch?: string
    commit?: string
    buildTime?: string
    builder?: string
  }
  compression: {
    algorithm: CompressionAlgorithm
    level?: number
  }
  encryption: {
    enabled: boolean
    algorithm: EncryptionAlgorithm
  }
  locales: string[]
  defaultLocale: string
  assets: Record<AssetType, Record<string, AssetInfo>>
  totalSize: number
  totalFiles: number
  merkleRoot?: string // Merkle tree root hash
  performanceMetrics?: {
    estimatedLoadTime: number
    estimatedDecompressionTime: number
    memoryUsageEstimate: number
  }
  runtimePackage?: RuntimePackageManifest
  assetTarget?: AssetBundleTargetManifest
}

export interface AssetPipelineExternalTool {
  binary?: string
  args?: string[]
  timeoutMs?: number
}

export interface ImagePipelineOptions {
  format?: ImagePipelineFormat
  quality?: number
  effort?: number
  progressive?: boolean
  stripMetadata?: boolean
  optimize?: boolean
  pngquant?: boolean | {
    enabled?: boolean
    binary?: string
    quality?: [number, number]
    speed?: number
    strip?: boolean
    timeoutMs?: number
  }
  skipAnimated?: boolean
  rewriteExtension?: boolean
  externalTool?: AssetPipelineExternalTool
}

export interface AudioPipelineOptions {
  format?: AudioPipelineFormat
  codec?: string
  bitrate?: string
  sampleRate?: number
  channels?: number
  loudnessNormalization?: boolean | 'ebu-r128'
  extraArgs?: string[]
  rewriteExtension?: boolean
  externalTool?: AssetPipelineExternalTool
}

export interface VideoPipelineOptions {
  format?: VideoPipelineFormat
  codec?: string
  audioCodec?: string
  crf?: number
  videoBitrate?: string
  audioBitrate?: string
  preset?: string
  width?: number
  height?: number
  fps?: number
  pixelFormat?: string
  fastStart?: boolean
  extraArgs?: string[]
  rewriteExtension?: boolean
  externalTool?: AssetPipelineExternalTool
}

export interface FontPipelineOptions {
  format?: FontPipelineFormat
  text?: string
  unicodes?: string[]
  glyphs?: string[]
  rewriteExtension?: boolean
  externalTool?: AssetPipelineExternalTool
}

export interface AssetPipelineOptions {
  images?: ImagePipelineOptions
  characters?: ImagePipelineOptions
  audio?: AudioPipelineOptions
  video?: VideoPipelineOptions
  fonts?: FontPipelineOptions
}

export interface AssetBundleTargetManifest {
  name: string
  platform?: 'web' | 'cocos' | (string & {})
  displayName?: string
  suffix?: string
  description?: string
  browserCondition?: string
  formats?: Partial<Record<AssetPipelineDomain, string>>
  staticOnly?: boolean
  cocos?: CocosAssetTargetManifestMetadata
}

export type CocosBuildPlatform
  = | 'android'
    | 'ios'
    | 'harmonyos'
    | 'wechat-minigame'
    | 'bytedance-minigame'
    | 'alipay-minigame'
    | 'taobao-minigame'
    | 'oppo-minigame'
    | 'vivo-minigame'
    | 'huawei-quick-game'
    | 'web-mobile'
    | 'web-desktop'
    | 'windows'
    | 'mac'
    | (string & {})

export type CocosHybridAssetPlacement = 'qpk' | 'cocos-bundle'

export interface CocosHybridAssetConfig {
  enabled?: boolean
  resourceRoot?: string
  assetBundle?: string
  domains?: Partial<Record<AssetPipelineDomain, CocosHybridAssetPlacement>>
}

export interface CocosHybridAssetManifest {
  enabled: boolean
  resourceRoot: string
  assetBundle: string
  domains: Record<AssetPipelineDomain, CocosHybridAssetPlacement>
}

export interface CocosAssetTargetManifestMetadata {
  creatorVersion?: string
  resourceRoot?: string
  cacheRoot?: string
  mobile?: boolean
  buildPlatforms?: CocosBuildPlatform[]
  materialization?: Partial<Record<AssetPipelineDomain, string>>
  hybrid?: CocosHybridAssetManifest
  staticOnly?: boolean
}

export interface CocosAssetTargetMetadata extends Omit<CocosAssetTargetManifestMetadata, 'hybrid'> {
  hybrid?: CocosHybridAssetConfig | CocosHybridAssetManifest
}

export interface AssetBundleTarget {
  name: string
  platform?: 'web' | 'cocos' | 'native' | (string & {})
  displayName?: string
  suffix?: string
  description?: string
  browserCondition?: string
  staticOnly?: boolean
  cocos?: CocosAssetTargetMetadata
  optional?: boolean
  pipeline?: AssetPipelineOptions
  compression?: {
    level?: number
    algorithm?: CompressionAlgorithm
  }
  compatibility?: VersionCompatibility
  encryption?: {
    enabled?: boolean
    algorithm?: EncryptionAlgorithm
    key?: string
  }
}

export interface MerkleNode {
  hash: string
  path?: string
  left?: MerkleNode
  right?: MerkleNode
  isLeaf: boolean
}

export interface BuildLog {
  buildNumber: string
  bundleVersion: number
  timestamp: string
  bundlePath: string
  bundleHash: string
  compatibility?: VersionCompatibility
  assetTarget?: AssetBundleTargetManifest
  totalFiles: number
  totalSize: number
  assets: Record<string, {
    hash: string
    path?: string
    size: number
    version: number
    mtime: number
  }>
  merkleTree: MerkleNode
  merkleRoot: string
  buildStats: {
    processingTime: number
    compressionRatio: number
    locales: string[]
  }
}

// Multi-bundle workspace configuration
export interface WorkspaceConfig {
  name: string
  version?: string
  bundles: BundleDefinition[]
  projectConfig?: string | false
  globalSettings?: {
    compression?: {
      level?: number
      algorithm?: CompressionAlgorithm
    }
    compatibility?: VersionCompatibility
    encryption?: {
      enabled?: boolean
      algorithm?: EncryptionAlgorithm
      key?: string
    }
    versioning?: VersionConfig
  }
  output?: string // Base output directory
}

export interface BundleDefinition {
  name: string // Bundle identifier (e.g., "core", "levels", "audio")
  displayName?: string // Human-readable name
  source: string // Source directory relative to workspace root
  priority?: number // Loading priority (lower numbers load first)
  compatibility?: VersionCompatibility
  dependencies?: string[] // Other bundles this depends on
  loadTrigger?: 'immediate' | 'lazy' | 'manual' // When to load this bundle
  description?: string
  // Bundle-specific overrides
  format?: BundleFormat
  compression?: {
    level?: number
    algorithm?: CompressionAlgorithm
  }
  encryption?: {
    enabled?: boolean
    algorithm?: EncryptionAlgorithm
    key?: string
  }
  assetTargets?: AssetBundleTarget[]
  assetTarget?: AssetBundleTarget
}

// Multi-bundle index for workspace
export interface WorkspaceBundleIndex {
  workspace: {
    name: string
    version: string
    created: string
    updated: string
  }
  currentVersion: number
  currentBuild: string
  bundles: Record<string, BundleInfo> // Bundle name -> BundleInfo
  globalPatches: Array<VersionedPatchRecord & {
    affectedBundles: string[] // Which bundles this patch affects
  }>
}

export interface BundleInfo {
  name: string
  displayName: string
  currentVersion: number
  currentBuild: string
  priority: number
  dependencies: string[]
  loadTrigger: string
  latestBundle?: VersionedBundleRecord
  previousBuilds: VersionedBundleRecord[]
  availablePatches: VersionedPatchRecord[]
  targets?: Record<string, VersionedBundleRecord>
}

export interface BundleIndex {
  currentVersion: number
  currentBuild: string
  latestBundle?: VersionedBundleRecord
  previousBuilds: VersionedBundleRecord[]
  availablePatches: VersionedPatchRecord[]
  targets?: Record<string, VersionedBundleRecord>
}

export interface VersionConfig {
  bundleVersion?: number
  buildNumber?: string
  incrementVersion?: boolean
  versionFile?: string
}

export interface QuackSigningConfig {
  key?: string
  keyId?: string
}

export interface EncryptionContext {
  buffer: Buffer
  key: string
  metadata: Record<string, any>
}

export interface EncryptionPlugin {
  name: string
  algorithm: string
  encrypt: (context: EncryptionContext) => Promise<Buffer> | Buffer
  decrypt: (context: EncryptionContext) => Promise<Buffer> | Buffer
}

// Configuration for both single bundle and workspace modes
export interface QuackConfig {
  // Single bundle mode
  source?: string
  output?: string
  format?: BundleFormat | 'auto'
  compression?: {
    level?: number
    algorithm?: CompressionAlgorithm
  }
  compatibility?: VersionCompatibility
  encryption?: {
    enabled?: boolean
    algorithm?: EncryptionAlgorithm
    key?: string | (() => string)
    keyGenerator?: () => string
    plugin?: EncryptionPlugin
  }
  versioning?: VersionConfig
  plugins?: QuackPlugin[]
  ignore?: string[]
  verbose?: boolean
  runtimePackage?: RuntimePackageManifest
  signing?: QuackSigningConfig
  quascript?: QuackQuaScriptConfig
  assetTargets?: AssetBundleTarget[]
  assetTarget?: AssetBundleTarget
  projectConfig?: string | false

  // Workspace mode (multi-bundle)
  workspace?: WorkspaceConfig
  // OR specify workspace config file path
  workspaceConfig?: string

  // Bundle selection for workspace operations
  bundle?: string // Specific bundle name to operate on
  bundles?: string[] // Multiple bundle names to operate on
}

export interface QuackQuaScriptConfig {
  projectRoot?: string
  autoCollectDecorators?: boolean
  decoratorMappings?: DecoratorMapping
}

// Multi-bundle patch options
export interface MultiBundlePatchOptions {
  bundleName: string
  fromVersion: number
  toVersion: number
  fromBuildLog: BuildLog
  toBuildLog: BuildLog
  output: string
  format: BundleFormat
  workspaceIndex: WorkspaceBundleIndex
  compatibility?: VersionCompatibility
}

export interface AssetContext {
  asset: AssetInfo
  buffer: Buffer
  metadata: Record<string, any>
}

export interface AssetCollectionContext {
  source: string
  assets: AssetInfo[]
}

export abstract class QuackPlugin {
  abstract name: string
  abstract version: string

  async initialize?(_config: QuackConfig): Promise<void> {}
  async collectAssets?(_context: AssetCollectionContext): Promise<AssetInfo[]> { return [] }
  async processAsset?(_context: AssetContext): Promise<void> {}
  async postBundle?(_bundlePath: string, _manifest: BundleManifest): Promise<void> {}
  async cleanup?(): Promise<void> {}
}

export interface BundleResult {
  success: boolean
  bundle: ArrayBuffer
  manifest: BundleManifest
  assets: AssetInfo[]
  stats?: BundleStats
  errors?: string[]
}

export interface BundleOptions {
  source: string
  output: string
  format: BundleFormat
  compression: {
    level: number
    algorithm: CompressionAlgorithm
  }
  compatibility?: VersionCompatibility
  encryption: {
    enabled: boolean
    algorithm: EncryptionAlgorithm
    key?: string
    plugin?: EncryptionPlugin
  }
  versioning: VersionConfig & {
    bundleVersion: number
    buildNumber: string
  }
  plugins: QuackPlugin[]
  ignore: string[]
  verbose: boolean
  runtimePackage?: RuntimePackageManifest
  signing?: QuackSigningConfig
  quascript: QuackQuaScriptBundleOptions
  assetTargets: AssetBundleTarget[]
  assetTarget?: AssetBundleTarget
}

export interface QuackQuaScriptBundleOptions {
  projectRoot: string
  autoCollectDecorators?: boolean
  decoratorMappings?: DecoratorMapping
}

export interface AssetFilter {
  type?: AssetType[]
  subType?: AssetSubType[]
  locale?: string[]
  pattern?: RegExp
}

export interface BundleStats {
  totalFiles: number
  totalSize: number
  compressedSize: number
  compressionRatio: number
  processingTime: number
  locales: LocaleInfo[]
  assetsByType: Record<AssetType, number>
  bundleVersion: number
  buildNumber: string
  assetTarget?: AssetBundleTargetManifest
  targets?: Record<string, BundleStats>
}

export interface PatchOptions {
  fromVersion: number
  toVersion: number
  fromBuildLog: BuildLog
  toBuildLog: BuildLog
  output: string
  format: BundleFormat
  compatibility?: VersionCompatibility
}
