export type AssetType = 'images' | 'characters' | 'audio' | 'scripts' | 'data'
export type AssetSubType = 
  | 'backgrounds' | 'cg' | 'ui' // Images
  | 'sprites' // Characters  
  | 'sfx' | 'voice' | 'bgm' // Audio
  | 'logic' // Scripts
  | 'config' | 'save' // Data

export type BundleFormat = 'zip' | 'qpk'
export type CompressionAlgorithm = 'none' | 'deflate' | 'lzma'
export type EncryptionAlgorithm = 'none' | 'xor' | 'custom'

export type PatchOperation = 'added' | 'modified' | 'deleted'

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
  patchVersion: number
  fromVersion: number
  toVersion: number
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
  totalFiles: number
  totalSize: number
  assets: Record<string, {
    hash: string
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
  globalSettings?: {
    compression?: {
      level?: number
      algorithm?: CompressionAlgorithm
    }
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
  globalPatches: Array<{
    filename: string
    hash: string
    fromVersion: number
    toVersion: number
    patchVersion: number
    created: string
    size: number
    changeCount: number
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
  latestBundle: {
    filename: string
    hash: string
    version: number
    buildNumber: string
    created: string
    size: number
  }
  previousBuilds: Array<{
    filename: string
    hash: string
    version: number
    buildNumber: string
    created: string
    size: number
  }>
  availablePatches: Array<{
    filename: string
    hash: string
    fromVersion: number
    toVersion: number
    patchVersion: number
    created: string
    size: number
    changeCount: number
  }>
}

// Legacy single-bundle index (for backward compatibility)
export interface BundleIndex {
  currentVersion: number
  currentBuild: string
  latestBundle: {
    filename: string
    hash: string
    version: number
    buildNumber: string
    created: string
    size: number
  }
  previousBuilds: Array<{
    filename: string
    hash: string
    version: number
    buildNumber: string
    created: string
    size: number
  }>
  availablePatches: Array<{
    filename: string
    hash: string
    fromVersion: number
    toVersion: number
    patchVersion: number
    created: string
    size: number
    changeCount: number
  }>
}

export interface VersionConfig {
  bundleVersion?: number
  buildNumber?: string
  incrementVersion?: boolean
  versionFile?: string
}

export interface EncryptionContext {
  buffer: Buffer
  key: string
  metadata: Record<string, any>
}

export interface EncryptionPlugin {
  name: string
  algorithm: string
  encrypt(context: EncryptionContext): Promise<Buffer> | Buffer
  decrypt(context: EncryptionContext): Promise<Buffer> | Buffer
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
  
  // Workspace mode (multi-bundle)
  workspace?: WorkspaceConfig
  // OR specify workspace config file path
  workspaceConfig?: string
  
  // Bundle selection for workspace operations
  bundle?: string // Specific bundle name to operate on
  bundles?: string[] // Multiple bundle names to operate on
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
}

export interface AssetContext {
  asset: AssetInfo
  buffer: Buffer
  metadata: Record<string, any>
}

export abstract class QuackPlugin {
  abstract name: string
  abstract version: string
  
  async initialize?(config: QuackConfig): Promise<void> {}
  async processAsset?(context: AssetContext): Promise<void> {}
  async postBundle?(bundlePath: string, manifest: BundleManifest): Promise<void> {}
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
}

export interface PatchOptions {
  fromVersion: number
  toVersion: number
  fromBuildLog: BuildLog
  toBuildLog: BuildLog
  output: string
  format: BundleFormat
}