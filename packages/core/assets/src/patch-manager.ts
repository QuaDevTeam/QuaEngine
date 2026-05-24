import type { BundleLoader } from './bundle-loader'
import type {
  AssetCrypto,
  AssetFetcher,
  AssetStorage,
  BundleManifest,
  LoadBundleOptions,
  StoredAsset,
  StoredBundle,
} from './types'
import { createLogger } from '@quajs/logger'
import { createBundleVersionKey, getBundleLogicalName } from './bundle-identity'
import { assertCompatibleGameVersion, assertValidAppVersion } from './compatibility'
import { bytesToUtf8, utf8ToBytes } from './encoding'
import { BundleLoadError } from './types'

const logger = createLogger('quaassets:patch')

export class PatchManager {
  private storage: AssetStorage
  private bundleLoader: BundleLoader
  private crypto: AssetCrypto
  private fetcher?: AssetFetcher

  constructor(storage: AssetStorage, bundleLoader: BundleLoader, crypto: AssetCrypto, fetcher?: AssetFetcher) {
    this.storage = storage
    this.bundleLoader = bundleLoader
    this.crypto = crypto
    this.fetcher = fetcher
  }

  async applyPatch(
    patchUrl: string,
    targetBundleName: string,
    options: LoadBundleOptions = {},
  ): Promise<{
    success: boolean
    changes: { added: number, modified: number, deleted: number }
    errors: string[]
  }> {
    const errors: string[] = []
    const changes = { added: 0, modified: 0, deleted: 0 }
    const appVersion = options.appVersion

    try {
      assertValidAppVersion(appVersion)
      const { manifest: patchManifest, assets: patchAssets } = await this.loadPatchBundle(patchUrl, targetBundleName, options)
      const validation = await this.validatePatch(patchManifest, targetBundleName, appVersion)
      if (!validation.valid) {
        return { success: false, changes, errors: validation.errors }
      }

      const targetBundle = await this.storage.getBundle(targetBundleName)
      if (!targetBundle) {
        return { success: false, changes, errors: [`Target bundle "${targetBundleName}" not found`] }
      }

      const staged = await this.stagePatchApplication(patchManifest, patchAssets, targetBundle, validation.toVersion, errors)
      if (errors.length > 0 || !staged) {
        return { success: false, changes, errors }
      }

      await this.storage.storeAssets(staged.assets)
      await this.storage.storeBundle(staged.bundle)
      changes.added = staged.added
      changes.modified = staged.modified
      changes.deleted = staged.deleted

      return { success: errors.length === 0, changes, errors }
    }
    catch (error) {
      const errorMessage = error instanceof BundleLoadError
        ? error.message
        : `Patch application failed: ${error instanceof Error ? error.message : String(error)}`
      logger.error('Patch application failed:', error)
      return { success: false, changes, errors: [errorMessage] }
    }
  }

  async validatePatch(
    patchManifest: BundleManifest,
    targetBundleName: string,
    appVersion?: string,
  ): Promise<{
    valid: boolean
    errors: string[]
    fromVersion: number
    toVersion: number
  }> {
    const errors: string[] = []
    if (!patchManifest.isPatch) {
      errors.push('Bundle is not a patch package')
    }
    if (patchManifest.isPatch && !patchManifest.compatibility?.minGameVersion) {
      errors.push('Patch manifest missing compatibility.minGameVersion')
    }
    if (appVersion !== undefined) {
      try {
        assertValidAppVersion(appVersion)
      }
      catch (error) {
        errors.push(error instanceof Error ? error.message : String(error))
      }
    }

    const targetBundle = await this.storage.getBundle(targetBundleName)
    if (!targetBundle) {
      return { valid: false, errors: [`Target bundle "${targetBundleName}" not found`], fromVersion: 0, toVersion: 0 }
    }

    const fromVersion = patchManifest.fromVersion || 0
    const toVersion = patchManifest.toVersion || 0
    if (fromVersion !== targetBundle.version) {
      errors.push(`Patch is for version ${fromVersion}, but target bundle is version ${targetBundle.version}`)
    }
    if (!patchManifest.changes) {
      errors.push('Patch manifest missing changes information')
    }
    if (patchManifest.compatibility) {
      try {
        assertCompatibleGameVersion(patchManifest.compatibility, appVersion, 'Patch')
      }
      catch (error) {
        errors.push(error instanceof Error ? error.message : String(error))
      }
    }

    return { valid: errors.length === 0, errors, fromVersion, toVersion }
  }

  async canApplyPatch(
    patchUrlOrManifest: string | BundleManifest,
    targetBundleName: string,
    appVersion?: string,
  ): Promise<boolean> {
    const manifest = typeof patchUrlOrManifest === 'string'
      ? (await this.loadPatchBundle(patchUrlOrManifest, targetBundleName, { enableCache: false })).manifest
      : patchUrlOrManifest
    return (await this.validatePatch(manifest, targetBundleName, appVersion)).valid
  }

  async previewPatch(patchUrl: string, targetBundleName: string, appVersion?: string): Promise<{
    valid: boolean
    changes: { willAdd: string[], willModify: string[], willDelete: string[] }
    errors: string[]
    fromVersion: number
    toVersion: number
  }> {
    try {
      const { manifest } = await this.loadPatchBundle(patchUrl, targetBundleName, { enableCache: false })
      const validation = await this.validatePatch(manifest, targetBundleName, appVersion)
      return {
        valid: validation.valid,
        errors: validation.errors,
        fromVersion: validation.fromVersion,
        toVersion: validation.toVersion,
        changes: {
          willAdd: manifest.changes?.added.map(change => change.path) || [],
          willModify: manifest.changes?.modified.map(change => change.path) || [],
          willDelete: manifest.changes?.deleted.map(change => change.path) || [],
        },
      }
    }
    catch (error) {
      return {
        valid: false,
        errors: [error instanceof Error ? error.message : String(error)],
        fromVersion: 0,
        toVersion: 0,
        changes: { willAdd: [], willModify: [], willDelete: [] },
      }
    }
  }

  async getAvailablePatches(endpoint: string, bundleName: string, currentVersion: number): Promise<Array<{
    filename: string
    fromVersion: number
    toVersion: number
    size: number
    changeCount: number
  }>> {
    if (!this.fetcher)
      return []

    for (const indexName of ['workspace-index.json', 'index.json']) {
      try {
        const index = await this.fetchJSON<Record<string, any>>(`${endpoint.replace(/\/$/, '')}/${indexName}`)
        const patches = indexName === 'workspace-index.json'
          ? index.bundles?.[bundleName]?.availablePatches
          : index.availablePatches
        if (Array.isArray(patches)) {
          return patches.filter((patch: any) => patch.fromVersion === currentVersion)
        }
      }
      catch {
        // Try the next index shape.
      }
    }

    return []
  }

  private async loadPatchBundle(
    patchUrl: string,
    targetBundleName: string,
    options: LoadBundleOptions,
  ): Promise<{ manifest: BundleManifest, assets: StoredAsset[] }> {
    if (!this.fetcher) {
      throw new Error('Patch loading requires an adapter fetcher')
    }
    const fetched = await this.fetcher.fetchBytes(patchUrl, {
      cache: options.enableCache !== false,
      signal: options.signal,
      onProgress: options.onProgress,
    })
    const bytes = fetched instanceof Uint8Array ? fetched : fetched.data
    return await this.bundleLoader.loadBundle(bytes, `${targetBundleName}_patch`, options)
  }

  private async fetchJSON<T>(url: string): Promise<T> {
    if (this.fetcher?.fetchJSON) {
      return await this.fetcher.fetchJSON<T>(url)
    }
    const fetched = await this.fetcher!.fetchBytes(url)
    const bytes = fetched instanceof Uint8Array ? fetched : fetched.data
    return JSON.parse(bytesToUtf8(bytes)) as T
  }

  private async stagePatchApplication(
    patchManifest: BundleManifest,
    patchAssets: StoredAsset[],
    targetBundle: StoredBundle,
    toVersion: number,
    errors: string[],
  ): Promise<{
    assets: StoredAsset[]
    bundle: StoredBundle
    added: number
    modified: number
    deleted: number
  } | undefined> {
    const logicalName = getBundleLogicalName(targetBundle)
    const targetVersionKey = targetBundle.versionKey || createBundleVersionKey(logicalName, targetBundle.version, targetBundle.buildNumber)
    const compatibility = patchManifest.compatibility || targetBundle.compatibility || targetBundle.manifest.compatibility
    let existingAssets = await this.storage.findAssets({
      bundleName: logicalName,
      bundleVersionKey: targetVersionKey,
    })
    if (existingAssets.length === 0) {
      existingAssets = await this.storage.findAssets({ bundleName: logicalName })
    }
    const existingByPath = new Map<string, StoredAsset>()
    for (const asset of existingAssets) {
      existingByPath.set(normalizePatchPath(asset.path || asset.name), asset)
    }

    const patchAssetByPath = new Map<string, StoredAsset>()
    for (const asset of patchAssets) {
      patchAssetByPath.set(normalizePatchPath(asset.path || asset.name), asset)
    }

    const deletedPaths = new Set<string>()
    const modifiedPaths = new Set<string>()
    let added = 0
    let modified = 0
    let deleted = 0

    for (const deletion of patchManifest.changes?.deleted || []) {
      const path = normalizePatchPath(deletion.path)
      const existing = existingByPath.get(path)
      if (!existing) {
        errors.push(`Patch deletion target not found: ${deletion.path}`)
        continue
      }
      if (deletion.oldHash && existing.hash && existing.hash !== deletion.oldHash) {
        errors.push(`Patch deletion hash mismatch: ${deletion.path}`)
        continue
      }
      deletedPaths.add(path)
      deleted++
    }

    for (const modification of patchManifest.changes?.modified || []) {
      const path = normalizePatchPath(modification.path)
      const existing = existingByPath.get(path)
      if (!existing) {
        errors.push(`Patch modification target not found: ${modification.path}`)
        continue
      }
      if (modification.oldHash && existing.hash && existing.hash !== modification.oldHash) {
        errors.push(`Patch modification hash mismatch: ${modification.path}`)
        continue
      }
      const asset = patchAssetByPath.get(path)
      if (!asset) {
        errors.push(`Patch asset not found: ${modification.path}`)
        continue
      }
      const assetHash = asset.hash || await this.crypto.sha256(asset.data)
      if (modification.newHash && assetHash !== modification.newHash) {
        errors.push(`Patch asset hash mismatch: ${modification.path}`)
        continue
      }
      modifiedPaths.add(path)
      modified++
    }

    for (const addition of patchManifest.changes?.added || []) {
      const path = normalizePatchPath(addition.path)
      if (existingByPath.has(path)) {
        errors.push(`Patch addition target already exists: ${addition.path}`)
        continue
      }
      const asset = patchAssetByPath.get(path)
      if (!asset) {
        errors.push(`Patch asset not found: ${addition.path}`)
        continue
      }
      const assetHash = asset.hash || await this.crypto.sha256(asset.data)
      if (addition.newHash && assetHash !== addition.newHash) {
        errors.push(`Patch asset hash mismatch: ${addition.path}`)
        continue
      }
      added++
    }

    if (errors.length > 0) {
      return undefined
    }

    const bundleVersionKey = createBundleVersionKey(logicalName, toVersion, patchManifest.buildNumber || targetBundle.buildNumber)
    const stagedAssets: StoredAsset[] = []

    for (const asset of existingAssets) {
      const path = normalizePatchPath(asset.path || asset.name)
      if (deletedPaths.has(path) || modifiedPaths.has(path)) {
        continue
      }
      stagedAssets.push(cloneAssetForPatch(asset, {
        bundleName: logicalName,
        logicalBundleName: logicalName,
        bundleVersionKey,
        bundleVersion: toVersion,
        compatibility,
        runtimePackageId: targetBundle.runtimePackageId,
        bundlePriority: targetBundle.priority,
        loadedAt: Date.now(),
      }))
    }

    for (const addition of patchManifest.changes?.added || []) {
      const path = normalizePatchPath(addition.path)
      const asset = patchAssetByPath.get(path)!
      stagedAssets.push(cloneAssetForPatch(asset, {
        bundleName: logicalName,
        logicalBundleName: logicalName,
        bundleVersionKey,
        bundleVersion: toVersion,
        path,
        compatibility,
        runtimePackageId: targetBundle.runtimePackageId,
        bundlePriority: targetBundle.priority,
        loadedAt: Date.now(),
        version: addition.newVersion || asset.version,
      }))
    }

    for (const modification of patchManifest.changes?.modified || []) {
      const path = normalizePatchPath(modification.path)
      const asset = patchAssetByPath.get(path)!
      stagedAssets.push(cloneAssetForPatch(asset, {
        bundleName: logicalName,
        logicalBundleName: logicalName,
        bundleVersionKey,
        bundleVersion: toVersion,
        path,
        compatibility,
        runtimePackageId: targetBundle.runtimePackageId,
        bundlePriority: targetBundle.priority,
        loadedAt: Date.now(),
        version: modification.newVersion || asset.version,
      }))
    }

    const buildNumber = patchManifest.buildNumber || targetBundle.buildNumber || `patch-${patchManifest.patchVersion || toVersion}`
    const bundleHash = await this.crypto.sha256(utf8ToBytes(
      stagedAssets
        .slice()
        .sort((left, right) => (left.path || left.name).localeCompare(right.path || right.name))
        .map(asset => `${asset.path || asset.name}:${asset.hash}:${asset.bundleVersionKey}`)
        .join('|'),
    ))

    const stagedBundle: StoredBundle = {
      ...targetBundle,
      name: logicalName,
      logicalName,
      versionKey: bundleVersionKey,
      active: true,
      version: toVersion,
      buildNumber,
      hash: bundleHash,
      size: stagedAssets.reduce((sum, asset) => sum + asset.size, 0),
      assetCount: stagedAssets.length,
      locales: Array.from(new Set(stagedAssets.map(asset => asset.locale))),
      lastUpdated: Date.now(),
      manifest: {
        ...targetBundle.manifest,
        version: patchManifest.version || targetBundle.manifest.version,
        bundleVersion: toVersion,
        buildNumber,
        compatibility,
        isPatch: false,
        changes: undefined,
        patchVersion: undefined,
        fromVersion: undefined,
        toVersion: undefined,
        assets: createManifestAssets(stagedAssets),
        totalFiles: stagedAssets.length,
        totalSize: stagedAssets.reduce((sum, asset) => sum + asset.size, 0),
      },
      compatibility,
      loadedAt: Date.now(),
    }

    return {
      assets: stagedAssets,
      bundle: stagedBundle,
      added,
      modified,
      deleted,
    }
  }
}

function createManifestAssets(stagedAssets: StoredAsset[]): BundleManifest['assets'] {
  const grouped: BundleManifest['assets'] = {}
  for (const asset of stagedAssets) {
    const typeGroup = grouped[asset.type] || {}
    const path = normalizePatchPath(asset.path || asset.name)
    typeGroup[path] = {
      name: asset.name,
      path,
      relativePath: path,
      size: asset.size,
      hash: asset.hash,
      type: asset.type,
      locales: [asset.locale],
      mimeType: asset.mimeType,
      mtime: asset.mtime,
      version: asset.version,
      mediaMetadata: asset.mediaMetadata,
      compatibility: asset.compatibility,
    }
    grouped[asset.type] = typeGroup
  }
  return grouped
}

function normalizePatchPath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\/+/, '')
}

function cloneAssetForPatch(
  asset: StoredAsset,
  overrides: Partial<StoredAsset> & { bundleVersionKey: string, bundleVersion: number },
): StoredAsset {
  const path = overrides.path || asset.path || asset.name
  return {
    ...asset,
    ...overrides,
    id: `${overrides.bundleVersionKey}:${asset.locale}:${asset.type}:${path}`,
    bundleName: overrides.bundleName || asset.bundleName,
    logicalBundleName: overrides.logicalBundleName || asset.logicalBundleName || asset.bundleName,
    bundleVersionKey: overrides.bundleVersionKey,
    bundleVersion: overrides.bundleVersion,
    path,
    lastAccessed: Date.now(),
    createdAt: asset.createdAt,
  }
}
