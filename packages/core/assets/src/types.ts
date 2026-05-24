export type AssetType = 'images' | 'characters' | 'audio' | 'video' | 'fonts' | 'scripts' | 'data'
export type AssetLocale = string
export type BundleFormat = 'zip' | 'qpk'
export type LoadingState = 'idle' | 'loading' | 'loaded' | 'error'
export type PatchOperation = 'added' | 'modified' | 'deleted'

export interface VersionCompatibility {
  minGameVersion?: string
}

export interface AssetData {
  id: string
  type: AssetType
  name: string
  bundleName: string
  logicalBundleName?: string
  bundleVersionKey?: string
  locale: AssetLocale
  data: Uint8Array
  hash?: string
  mimeType?: string
  mediaMetadata?: MediaMetadata
  size: number
  version: number
  bundleVersion?: number
  mtime: number
  fromCache: boolean
  path?: string
  compatibility?: VersionCompatibility
  runtimePackageId?: string
  bundlePriority?: number
  loadedAt?: number
}

export interface MediaMetadata {
  format: string
  [key: string]: unknown
}

export interface ImageMetadata extends MediaMetadata {
  width: number
  height: number
  aspectRatio: number
  hasAlpha?: boolean
  animated?: boolean
}

export interface AudioMetadata extends MediaMetadata {
  duration: number
  sampleRate?: number
  channels?: number
  bitrate?: number
  codec?: string
}

export interface VideoMetadata extends MediaMetadata {
  width: number
  height: number
  duration: number
  framerate?: number
  frameRate?: number
  codec?: string
}

export interface StoredAsset {
  id: string
  bundleName: string
  logicalBundleName?: string
  bundleVersionKey?: string
  name: string
  type: AssetType
  locale: AssetLocale
  data: Uint8Array
  hash: string
  mimeType?: string
  size: number
  version: number
  bundleVersion?: number
  mtime: number
  path?: string
  createdAt: number
  lastAccessed: number
  mediaMetadata?: MediaMetadata
  compatibility?: VersionCompatibility
  runtimePackageId?: string
  bundlePriority?: number
  loadedAt?: number
}

export interface StoredBundle {
  name: string
  logicalName?: string
  versionKey?: string
  active?: boolean
  version: number
  buildNumber: string
  format: BundleFormat
  hash: string
  size: number
  assetCount: number
  locales: AssetLocale[]
  createdAt: number
  lastUpdated: number
  manifest: BundleManifest
  compatibility?: VersionCompatibility
  runtimePackageId?: string
  priority?: number
  loadedAt?: number
}

export interface AssetManifest {
  version: string
  created?: string
  provider?: string
  compatibility?: VersionCompatibility
  assets: AssetManifestRecord[]
}

export interface AssetManifestRecord {
  id: string
  bundleName?: string
  logicalBundleName?: string
  bundleVersionKey?: string
  name: string
  type: AssetType
  locale?: AssetLocale
  path: string
  hash?: string
  size?: number
  version?: number
  bundleVersion?: number
  mtime?: number
  mimeType?: string
  mediaMetadata?: MediaMetadata
  compatibility?: VersionCompatibility
  runtimePackageId?: string
  bundlePriority?: number
  loadedAt?: number
}

export type AssetChangeType = 'added' | 'changed' | 'removed'

export interface AssetChange {
  type: AssetChangeType
  assetId: string
  record?: AssetManifestRecord
  path?: string
  hash?: string
  timestamp: number
}

export type AssetChangeListener = (change: AssetChange) => void

export interface AssetUpdateInfo {
  version?: string | number
  changes: AssetChange[]
  metadata?: Record<string, unknown>
}

export interface AssetProvider {
  mode: 'dev-vfs' | 'bundle' | 'patch' | 'memory' | 'node' | (string & {})
  init?: () => Promise<void>
  cleanup?: () => Promise<void>
  getManifest: () => Promise<AssetManifest>
  getAsset: (id: string, record?: AssetManifestRecord) => Promise<AssetData | Uint8Array>
  watch?: (listener: AssetChangeListener) => () => void
  checkUpdates?: () => Promise<AssetUpdateInfo | null>
  applyUpdate?: (update: AssetUpdateInfo) => Promise<void>
}

export interface AssetStorage {
  open?: () => Promise<void>
  close?: () => Promise<void>
  getAsset: (id: string) => Promise<StoredAsset | undefined>
  storeAsset: (asset: StoredAsset) => Promise<void>
  storeAssets: (assets: StoredAsset[]) => Promise<void>
  findAssets: (criteria: AssetFindCriteria) => Promise<StoredAsset[]>
  getAssetWithLocaleFallback: (
    bundleName: string,
    type: AssetType,
    name: string,
    preferredLocale?: AssetLocale,
    bundleVersionKey?: string,
  ) => Promise<StoredAsset | undefined>
  deleteAsset?: (id: string) => Promise<void>
  deleteAssetsByBundle: (bundleName: string) => Promise<number>
  storeBundle: (bundle: StoredBundle) => Promise<void>
  getBundle: (name: string) => Promise<StoredBundle | undefined>
  getAllBundles: () => Promise<StoredBundle[]>
  deleteBundle: (name: string) => Promise<void>
  clearAll: () => Promise<void>
  getDatabaseSize: () => Promise<number>
  cleanupAssets: (maxSize: number) => Promise<number>
  getCacheStats: () => Promise<AssetCacheStats>
  verifyAssetIntegrity?: (assetId: string) => Promise<boolean>
  verifyBundleIntegrity?: (bundleName: string) => Promise<{ total: number, valid: number, invalid: string[] }>
}

export interface AssetFindCriteria {
  bundleName?: string
  bundleVersionKey?: string
  type?: AssetType
  locale?: AssetLocale
  name?: string
}

export interface AssetCacheStats {
  totalAssets: number
  totalBundles: number
  totalSize: number
  oldestAsset: Date | null
  newestAsset: Date | null
  [key: string]: unknown
}

export interface AssetFetchResult {
  data: Uint8Array
  mimeType?: string
  size?: number
}

export interface AssetFetcher {
  fetchBytes: (
    url: string,
    options?: {
      cache?: boolean
      signal?: unknown
      onProgress?: (loaded: number, total: number) => void
    },
  ) => Promise<AssetFetchResult | Uint8Array>
  fetchJSON?: <T = unknown>(url: string, options?: { cache?: boolean, signal?: unknown }) => Promise<T>
}

export interface AssetCrypto {
  sha256: (data: Uint8Array) => Promise<string>
  decrypt?: (data: Uint8Array, metadata?: Record<string, unknown>) => Promise<Uint8Array>
}

export interface AssetCodec {
  unzip?: (data: Uint8Array) => Promise<Map<string, Uint8Array>>
  inflate?: (data: Uint8Array) => Promise<Uint8Array>
  lzmaDecompress?: (data: Uint8Array) => Promise<Uint8Array>
}

export interface AssetRuntimeAdapter {
  name: string
  storage: AssetStorage
  fetcher?: AssetFetcher
  crypto: AssetCrypto
  codec?: AssetCodec
  now?: () => number
}

export interface AssetInfo {
  name: string
  path: string
  relativePath: string
  size: number
  hash: string
  type: AssetType
  subType?: string
  locales: string[]
  mimeType?: string
  mtime?: number
  version?: number
  mediaMetadata?: MediaMetadata
  compatibility?: VersionCompatibility
  variants?: Record<string, AssetVariantInfo>
}

export interface AssetVariantInfo {
  locale: AssetLocale
  path: string
  relativePath: string
  size: number
  hash: string
  mimeType?: string
  mtime?: number
  version?: number
  mediaMetadata?: MediaMetadata
  compatibility?: VersionCompatibility
}

export interface BundleManifest {
  name?: string
  version: string
  bundler: string
  created: string
  createdAt?: number
  format: BundleFormat
  bundleVersion?: number
  buildNumber?: string
  buildMetadata?: Record<string, unknown>
  compression?: {
    algorithm: 'none' | 'deflate' | 'lzma'
    level?: number
  }
  encryption?: {
    enabled: boolean
    algorithm: 'none' | 'xor' | 'custom'
  }
  locales: string[]
  defaultLocale: string
  assets: Partial<Record<AssetType, Record<string, AssetInfo>>>
  totalSize?: number
  totalFiles?: number
  merkleRoot?: string
  compatibility?: VersionCompatibility
  performanceMetrics?: Record<string, unknown>
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
  workspaceBundle?: {
    name: string
    displayName?: string
    priority?: number
    dependencies?: string[]
    loadTrigger?: string
  }
  runtimePackage?: RuntimePackageManifest
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
  locale: AssetLocale
  targets: RuntimeLocalePackTargetManifest[]
  resourceTypes: AssetType[]
  fallbackLocales?: AssetLocale[]
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

export interface DynamicBundleRecord {
  packageId: string
  bundleName: string
  logicalBundleName?: string
  bundleVersionKey?: string
  version: string
  bundleVersion: number
  hash: string
  priority: number
  loadedAt: number
  assetCount: number
  compatibility?: VersionCompatibility
  manifest: BundleManifest
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
    compatibility?: VersionCompatibility
  }
  previousBuilds: Array<{
    filename: string
    hash: string
    version: number
    buildNumber: string
    created: string
    size: number
    compatibility?: VersionCompatibility
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
    compatibility?: VersionCompatibility
  }>
}

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
    compatibility?: VersionCompatibility
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
  latestBundle: BundleIndex['latestBundle']
  previousBuilds: BundleIndex['previousBuilds']
  availablePatches: BundleIndex['availablePatches']
}

export interface QuaAssetsPlugin {
  name: string
  version: string
  initialize?: () => Promise<void>
  cleanup?: () => Promise<void>
}

export interface DecompressionPlugin extends QuaAssetsPlugin {
  supportedFormats: BundleFormat[]
  decompress: (buffer: Uint8Array, format: BundleFormat) => Promise<Map<string, Uint8Array>>
}

export interface DecryptionPlugin extends QuaAssetsPlugin {
  decrypt: (buffer: Uint8Array, metadata?: Record<string, unknown>) => Promise<Uint8Array>
}

export interface AssetProcessingPlugin extends QuaAssetsPlugin {
  supportedTypes: AssetType[]
  processAsset: (asset: StoredAsset) => Promise<StoredAsset>
}

export interface QuaAssetsConfig {
  endpoint?: string
  adapter: AssetRuntimeAdapter
  provider?: AssetProvider
  locale?: AssetLocale
  appVersion?: string
  enableCache?: boolean
  cacheSize?: number
  retryAttempts?: number
  timeout?: number
  plugins?: QuaAssetsPlugin[]
}

export interface LoadAssetOptions {
  locale?: AssetLocale
  bundleName?: string
  bundleVersionKey?: string
  targetPackageId?: string
  appVersion?: string
  enableCache?: boolean
  priority?: 'high' | 'normal' | 'low'
}

export interface LoadBundleOptions {
  force?: boolean
  appVersion?: string
  enableCache?: boolean
  onProgress?: (loaded: number, total: number) => void
  signal?: unknown
  format?: BundleFormat
}

export interface LoadDynamicBundleOptions extends LoadBundleOptions {
  bundleName?: string
  priority?: number
}

export interface AssetQueryResult {
  asset: StoredAsset
  data: Uint8Array
  fromCache: boolean
}

export interface BundleStatus {
  name: string
  version: number
  state: LoadingState
  progress: number
  assetCount: number
  loadedAssets: number
  error?: Error
  lastUpdated: number
}

export interface QuaAssetsEvents {
  'bundle:loading': { bundleName: string }
  'bundle:loaded': { bundleName: string, status: BundleStatus }
  'bundle:error': { bundleName: string, error: Error }
  'bundle:progress': { bundleName: string, progress: number }
  'asset:changed': AssetChange
  'asset:cached': { assetId: string }
  'asset:evicted': { assetId: string }
  'cache:full': { size: number, limit: number }
  'patch:applied': { bundleName: string, fromVersion: number, toVersion: number }
  'dynamic-bundle:loaded': DynamicBundleRecord
  'dynamic-bundle:unloaded': { packageId: string, bundleName: string }
  'update:available': AssetUpdateInfo
  'update:applied': AssetUpdateInfo
}

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
