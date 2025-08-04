// Asset types that can be managed by QuaAssets
export type AssetType = 'images' | 'characters' | 'audio' | 'scripts' | 'data'

// Asset locales
export type AssetLocale = string // e.g., 'en-us', 'ja-jp', 'default'

// Bundle formats supported
export type BundleFormat = 'zip' | 'qpk'

// Loading states for assets and bundles
export type LoadingState = 'idle' | 'loading' | 'loaded' | 'error'

// Patch operation types
export type PatchOperation = 'added' | 'modified' | 'deleted'

// Media metadata interfaces (from Quack bundler)
export interface MediaMetadata {
  format: string
}

export interface ImageMetadata extends MediaMetadata {
  width: number
  height: number
  aspectRatio: number
  hasAlpha?: boolean
  animated?: boolean
}

export interface AudioMetadata extends MediaMetadata {
  duration: number        // Duration in seconds  
  sampleRate?: number     // Sample rate in Hz
  channels?: number       // Number of audio channels
  bitrate?: number        // Bitrate in kbps
  codec?: string          // Audio codec
}

export interface VideoMetadata extends MediaMetadata {
  width: number
  height: number
  duration: number        // Duration in seconds
  framerate?: number      // Framerate in fps
  codec?: string          // Video codec
}

// Asset information stored in IndexedDB
export interface StoredAsset {
  id: string                    // Unique asset ID: `${bundleName}:${locale}:${type}:${name}`
  bundleName: string           // Bundle this asset belongs to
  name: string                 // Asset filename
  type: AssetType              // Asset category
  locale: AssetLocale          // Asset locale
  blob: Blob                   // Asset data as blob
  hash: string                 // Asset content hash for integrity
  size: number                 // Asset size in bytes
  version: number              // Asset version number
  mtime: number                // Modified time
  createdAt: number            // When stored in IndexedDB
  lastAccessed: number         // Last access time for cache management
  mediaMetadata?: MediaMetadata // Media metadata for audio/video/image assets
}

// Bundle information stored in IndexedDB
export interface StoredBundle {
  name: string                 // Bundle name
  version: number              // Bundle version
  buildNumber: string          // Build identifier
  format: BundleFormat         // Bundle format (zip/qpk)
  hash: string                 // Bundle content hash
  size: number                 // Bundle size in bytes
  assetCount: number           // Number of assets in bundle
  locales: AssetLocale[]       // Available locales
  createdAt: number            // When bundle was stored
  lastUpdated: number          // Last update time
  manifest: BundleManifest     // Bundle manifest data
}

// Bundle manifest structure (from Quack)
export interface BundleManifest {
  version: string
  bundler: string
  created: string
  format: BundleFormat
  bundleVersion?: number
  buildNumber?: string
  merkleRoot?: string
  locales: string[]
  defaultLocale: string
  assets: {
    [type in AssetType]: {
      [subType: string]: {
        [filename: string]: {
          size: number
          hash: string
          locales: string[]
          version?: number
          mediaMetadata?: MediaMetadata // Media metadata for audio/video/image assets
        }
      }
    }
  }
  // Patch-specific fields
  isPatch?: boolean
  patchVersion?: number
  fromVersion?: number
  toVersion?: number
  changes?: {
    added: AssetDiff[]
    modified: AssetDiff[]
    deleted: AssetDiff[]
  }
  totalChanges?: number
  // Workspace bundle metadata
  workspaceBundle?: {
    name: string
    displayName?: string
    priority?: number
    dependencies?: string[]
    loadTrigger?: string
  }
}

// Asset diff for patches
export interface AssetDiff {
  path: string
  operation: PatchOperation
  oldHash?: string
  newHash?: string
  oldVersion?: number
  newVersion?: number
  size?: number
}

// Bundle index structure (from workspace or single bundle)
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

// Workspace bundle index (for multi-bundle workspaces)
export interface WorkspaceBundleIndex {
  workspace: {
    name: string
    version: string
    created: string
    updated: string
  }
  currentVersion: number
  currentBuild: string
  bundles: Record<string, BundleInfo>
  globalPatches: Array<{
    filename: string
    hash: string
    fromVersion: number
    toVersion: number
    patchVersion: number
    created: string
    size: number
    changeCount: number
    affectedBundles: string[]
  }>
}

// Individual bundle info in workspace
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

// Plugin interfaces for extending QuaAssets functionality
export interface QuaAssetsPlugin {
  name: string
  version: string
  
  // Lifecycle hooks
  initialize?(): Promise<void>
  cleanup?(): Promise<void>
}

// Decompression plugin interface
export interface DecompressionPlugin extends QuaAssetsPlugin {
  supportedFormats: BundleFormat[]
  decompress(buffer: ArrayBuffer, format: BundleFormat): Promise<Map<string, Uint8Array>>
}

// Decryption plugin interface  
export interface DecryptionPlugin extends QuaAssetsPlugin {
  decrypt(buffer: ArrayBuffer, metadata?: Record<string, any>): Promise<ArrayBuffer>
}

// Asset processing plugin interface
export interface AssetProcessingPlugin extends QuaAssetsPlugin {
  supportedTypes: AssetType[]
  processAsset(asset: StoredAsset): Promise<StoredAsset>
}

// Configuration for QuaAssets
export interface QuaAssetsConfig {
  endpoint: string              // Base URL for assets
  locale?: AssetLocale          // Default locale
  enableCache?: boolean         // Enable IndexedDB caching (default: true)
  cacheSize?: number           // Max cache size in bytes (default: 100MB)
  retryAttempts?: number       // Download retry attempts (default: 3)
  timeout?: number             // Request timeout in ms (default: 30000)
  plugins?: QuaAssetsPlugin[]  // Plugins to register
  
  // Advanced options
  enableServiceWorker?: boolean // Use service worker for caching (default: false)
  indexedDBName?: string       // Custom IndexedDB database name
  indexedDBVersion?: number    // IndexedDB schema version
  enableIntegrityCheck?: boolean // Verify asset hashes (default: true)
  enableCompression?: boolean  // Enable response compression (default: true)
}

// Asset loading options
export interface LoadAssetOptions {
  locale?: AssetLocale         // Override default locale
  bundleName?: string          // Specific bundle to load from
  enableCache?: boolean        // Use cached version if available
  priority?: 'high' | 'normal' | 'low' // Loading priority
}

// Bundle loading options
export interface LoadBundleOptions {
  force?: boolean              // Force reload even if already loaded
  enableCache?: boolean        // Cache bundle in IndexedDB
  onProgress?: (loaded: number, total: number) => void // Progress callback
  signal?: AbortSignal         // Abort signal for cancellation
}

// Asset query result
export interface AssetQueryResult {
  asset: StoredAsset
  blob: Blob
  blobUrl?: string
  fromCache: boolean
}

// JavaScript execution result
export interface JSExecutionResult {
  exports: any
  error?: Error
  executionTime: number
}

// Bundle status information
export interface BundleStatus {
  name: string
  version: number
  state: LoadingState
  progress: number             // 0-1 for loading progress
  assetCount: number
  loadedAssets: number
  error?: Error
  lastUpdated: number
}

// Events emitted by QuaAssets
export interface QuaAssetsEvents {
  'bundle:loading': { bundleName: string }
  'bundle:loaded': { bundleName: string, status: BundleStatus }
  'bundle:error': { bundleName: string, error: Error }
  'bundle:progress': { bundleName: string, progress: number }
  'asset:cached': { assetId: string }
  'asset:evicted': { assetId: string }
  'cache:full': { size: number, limit: number }
  'patch:applied': { bundleName: string, fromVersion: number, toVersion: number }
}

// Error types
export class QuaAssetsError extends Error {
  code: string
  constructor(message: string, code: string) {
    super(message)
    this.name = 'QuaAssetsError'
    this.code = code
  }
}

export class BundleLoadError extends QuaAssetsError {
  bundleName: string
  constructor(message: string, bundleName: string) {
    super(message, 'BUNDLE_LOAD_ERROR')
    this.bundleName = bundleName
  }
}

export class AssetNotFoundError extends QuaAssetsError {
  assetType: AssetType
  assetName: string
  constructor(assetType: AssetType, assetName: string) {
    super(`Asset not found: ${assetType}/${assetName}`, 'ASSET_NOT_FOUND')
    this.assetType = assetType
    this.assetName = assetName
  }
}

export class IntegrityError extends QuaAssetsError {
  expectedHash: string
  actualHash: string
  constructor(expectedHash: string, actualHash: string) {
    super(`Integrity check failed: expected ${expectedHash}, got ${actualHash}`, 'INTEGRITY_ERROR')
    this.expectedHash = expectedHash
    this.actualHash = actualHash
  }
}