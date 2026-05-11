import type { BundleLoader } from './bundle-loader'
import type {
  AssetDiff,
  AssetFetcher,
  AssetStorage,
  BundleManifest,
  LoadBundleOptions,
  StoredAsset,
  StoredBundle,
} from './types'
import { createLogger } from '@quajs/logger'
import { bytesToUtf8 } from './encoding'
import { BundleLoadError } from './types'

const logger = createLogger('quaassets:patch')

export class PatchManager {
  private storage: AssetStorage
  private bundleLoader: BundleLoader
  private fetcher?: AssetFetcher

  constructor(storage: AssetStorage, bundleLoader: BundleLoader, fetcher?: AssetFetcher) {
    this.storage = storage
    this.bundleLoader = bundleLoader
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

    try {
      const { manifest: patchManifest, assets: patchAssets } = await this.loadPatchBundle(patchUrl, targetBundleName, options)
      const validation = await this.validatePatch(patchManifest, targetBundleName)
      if (!validation.valid) {
        return { success: false, changes, errors: validation.errors }
      }

      const targetBundle = await this.storage.getBundle(targetBundleName)
      if (!targetBundle) {
        return { success: false, changes, errors: [`Target bundle "${targetBundleName}" not found`] }
      }

      for (const deletion of patchManifest.changes?.deleted || []) {
        await this.applyDeletion(deletion, targetBundleName)
        changes.deleted++
      }

      const patchAssetMap = new Map<string, StoredAsset>()
      for (const asset of patchAssets) {
        patchAssetMap.set(asset.name, asset)
        patchAssetMap.set(asset.id, asset)
      }

      for (const addition of patchManifest.changes?.added || []) {
        const asset = findPatchAsset(patchAssetMap, addition.path)
        if (asset) {
          await this.applyAddition(addition, asset, targetBundleName)
          changes.added++
        }
        else {
          errors.push(`Patch asset not found: ${addition.path}`)
        }
      }

      for (const modification of patchManifest.changes?.modified || []) {
        const asset = findPatchAsset(patchAssetMap, modification.path)
        if (asset) {
          await this.applyModification(modification, asset, targetBundleName)
          changes.modified++
        }
        else {
          errors.push(`Patch asset not found: ${modification.path}`)
        }
      }

      const updatedBundle: StoredBundle = {
        ...targetBundle,
        version: validation.toVersion,
        buildNumber: patchManifest.buildNumber || targetBundle.buildNumber,
        lastUpdated: Date.now(),
        assetCount: targetBundle.assetCount + changes.added - changes.deleted,
      }
      await this.storage.storeBundle(updatedBundle)

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

  async validatePatch(patchManifest: BundleManifest, targetBundleName: string): Promise<{
    valid: boolean
    errors: string[]
    fromVersion: number
    toVersion: number
  }> {
    const errors: string[] = []
    if (!patchManifest.isPatch) {
      errors.push('Bundle is not a patch package')
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

    return { valid: errors.length === 0, errors, fromVersion, toVersion }
  }

  async canApplyPatch(patchUrlOrManifest: string | BundleManifest, targetBundleName: string): Promise<boolean> {
    const manifest = typeof patchUrlOrManifest === 'string'
      ? (await this.loadPatchBundle(patchUrlOrManifest, targetBundleName, { enableCache: false })).manifest
      : patchUrlOrManifest
    return (await this.validatePatch(manifest, targetBundleName)).valid
  }

  async previewPatch(patchUrl: string, targetBundleName: string): Promise<{
    valid: boolean
    changes: { willAdd: string[], willModify: string[], willDelete: string[] }
    errors: string[]
    fromVersion: number
    toVersion: number
  }> {
    try {
      const { manifest } = await this.loadPatchBundle(patchUrl, targetBundleName, { enableCache: false })
      const validation = await this.validatePatch(manifest, targetBundleName)
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

  private async applyDeletion(deletion: AssetDiff, bundleName: string): Promise<void> {
    const existing = await this.findExistingByPath(bundleName, deletion.path)
    if (existing && deletion.oldHash && existing.hash !== deletion.oldHash) {
      logger.warn(`Asset hash mismatch for deletion: ${deletion.path}`)
    }
    if (existing) {
      await this.storage.deleteAsset?.(existing.id)
    }
  }

  private async applyAddition(addition: AssetDiff, asset: StoredAsset, bundleName: string): Promise<void> {
    await this.storage.storeAsset({
      ...asset,
      id: this.constructAssetId(bundleName, asset.locale, asset.type, asset.name),
      bundleName,
      version: addition.newVersion || asset.version,
      lastAccessed: Date.now(),
    })
  }

  private async applyModification(modification: AssetDiff, asset: StoredAsset, bundleName: string): Promise<void> {
    const existing = await this.findExistingByPath(bundleName, modification.path)
    if (existing && modification.oldHash && existing.hash !== modification.oldHash) {
      logger.warn(`Asset hash mismatch for modification: ${modification.path}`)
    }
    await this.storage.storeAsset({
      ...asset,
      id: existing?.id || this.constructAssetId(bundleName, asset.locale, asset.type, asset.name),
      bundleName,
      version: modification.newVersion || asset.version,
      lastAccessed: Date.now(),
    })
  }

  private async findExistingByPath(bundleName: string, path: string): Promise<StoredAsset | undefined> {
    const normalized = path.replace(/\\/g, '/')
    const name = normalized.split('/').pop() || normalized
    const assets = await this.storage.findAssets({ bundleName, name })
    return assets[0]
  }

  private constructAssetId(bundleName: string, locale: string, type: string, name: string): string {
    return `${bundleName}:${locale}:${type}:${name}`
  }
}

function findPatchAsset(patchAssetMap: Map<string, StoredAsset>, path: string): StoredAsset | undefined {
  return patchAssetMap.get(path)
    || patchAssetMap.get(path.replace(/\\/g, '/').split('/').pop() || path)
}
