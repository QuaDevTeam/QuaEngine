import type { BundleLoader } from './bundle-loader'
import type { QuaAssetsDatabase } from './database'
import type {
  AssetDiff,
  BundleManifest,
  LoadBundleOptions,
  StoredAsset,
  StoredBundle,
} from './types'
import { createLogger } from '@quajs/logger'
import { BundleLoadError } from './types'

const logger = createLogger('quaassets:patch')

/**
 * Patch manager handles applying patch bundles to existing assets
 * Supports incremental updates with proper validation
 */
export class PatchManager {
  private database: QuaAssetsDatabase
  private bundleLoader: BundleLoader

  constructor(database: QuaAssetsDatabase, bundleLoader: BundleLoader) {
    this.database = database
    this.bundleLoader = bundleLoader
  }

  /**
   * Apply a patch bundle to existing assets
   */
  async applyPatch(
    patchUrl: string,
    targetBundleName: string,
    options: LoadBundleOptions = {},
  ): Promise<{
    success: boolean
    changes: {
      added: number
      modified: number
      deleted: number
    }
    errors: string[]
  }> {
    const errors: string[] = []
    const changes = { added: 0, modified: 0, deleted: 0 }

    try {
      // Load patch bundle
      const { manifest: patchManifest, assets: patchAssets } = await this.bundleLoader.loadBundle(
        patchUrl,
        `${targetBundleName}_patch`,
        options,
      )

      // Validate patch
      const validation = await this.validatePatch(patchManifest, targetBundleName)
      if (!validation.valid) {
        return {
          success: false,
          changes,
          errors: validation.errors,
        }
      }

      // Get target bundle
      const targetBundle = await this.database.getBundle(targetBundleName)
      if (!targetBundle) {
        errors.push(`Target bundle "${targetBundleName}" not found`)
        return { success: false, changes, errors }
      }

      logger.info(`Applying patch to bundle "${targetBundleName}" (v${validation.fromVersion} → v${validation.toVersion})`)

      // Apply changes in transaction
      await this.database.transaction('rw', [this.database.assets, this.database.bundles], async () => {
        // Process deletions first
        for (const deletion of patchManifest.changes?.deleted || []) {
          await this.applyDeletion(deletion, targetBundleName)
          changes.deleted++
        }

        // Process additions and modifications
        const patchAssetMap = new Map(patchAssets.map(asset => [asset.name, asset]))

        for (const addition of patchManifest.changes?.added || []) {
          const asset = patchAssetMap.get(addition.path)
          if (asset) {
            await this.applyAddition(addition, asset, targetBundleName)
            changes.added++
          }
          else {
            errors.push(`Patch asset not found: ${addition.path}`)
          }
        }

        for (const modification of patchManifest.changes?.modified || []) {
          const asset = patchAssetMap.get(modification.path)
          if (asset) {
            await this.applyModification(modification, asset, targetBundleName)
            changes.modified++
          }
          else {
            errors.push(`Patch asset not found: ${modification.path}`)
          }
        }

        // Update bundle version
        const updatedBundle: StoredBundle = {
          ...targetBundle,
          version: validation.toVersion,
          buildNumber: patchManifest.buildNumber || targetBundle.buildNumber,
          lastUpdated: Date.now(),
          assetCount: targetBundle.assetCount + changes.added - changes.deleted,
        }

        await this.database.storeBundle(updatedBundle)
      })

      const totalChanges = changes.added + changes.modified + changes.deleted
      logger.info(`Patch applied successfully: ${totalChanges} changes (${changes.added} added, ${changes.modified} modified, ${changes.deleted} deleted)`)

      return {
        success: errors.length === 0,
        changes,
        errors,
      }
    }
    catch (error) {
      const errorMessage = error instanceof BundleLoadError ? error.message : `Patch application failed: ${error instanceof Error ? error.message : String(error)}`
      errors.push(errorMessage)
      logger.error('Patch application failed:', error)

      return {
        success: false,
        changes,
        errors,
      }
    }
  }

  /**
   * Validate patch compatibility with target bundle
   */
  async validatePatch(patchManifest: BundleManifest, targetBundleName: string): Promise<{
    valid: boolean
    errors: string[]
    fromVersion: number
    toVersion: number
  }> {
    const errors: string[] = []

    // Check if it's a patch bundle
    if (!patchManifest.isPatch) {
      errors.push('Bundle is not a patch package')
    }

    // Get target bundle info
    const targetBundle = await this.database.getBundle(targetBundleName)
    if (!targetBundle) {
      errors.push(`Target bundle "${targetBundleName}" not found`)
      return { valid: false, errors, fromVersion: 0, toVersion: 0 }
    }

    const fromVersion = patchManifest.fromVersion || 0
    const toVersion = patchManifest.toVersion || 0

    // Check version compatibility
    if (fromVersion !== targetBundle.version) {
      errors.push(`Patch is for version ${fromVersion}, but target bundle is version ${targetBundle.version}`)
    }

    // Check if patch changes are valid
    if (!patchManifest.changes) {
      errors.push('Patch manifest missing changes information')
    }
    else {
      // Validate individual changes
      const validationResults = await Promise.all([
        this.validateDeletions(patchManifest.changes.deleted, targetBundleName),
        this.validateModifications(patchManifest.changes.modified, targetBundleName),
      ])

      for (const result of validationResults) {
        errors.push(...result)
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      fromVersion,
      toVersion,
    }
  }

  /**
   * Check if patch can be applied to current bundle state
   */
  async canApplyPatch(patchManifest: BundleManifest, targetBundleName: string): Promise<boolean> {
    const validation = await this.validatePatch(patchManifest, targetBundleName)
    return validation.valid
  }

  /**
   * Get available patches for a bundle from remote endpoint
   */
  async getAvailablePatches(endpoint: string, bundleName: string, currentVersion: number): Promise<Array<{
    filename: string
    fromVersion: number
    toVersion: number
    size: number
    changeCount: number
  }>> {
    try {
      // Try workspace index first
      const workspaceIndexUrl = `${endpoint}/workspace-index.json`
      try {
        const workspaceResponse = await fetch(workspaceIndexUrl)
        if (workspaceResponse.ok) {
          const workspaceIndex = await workspaceResponse.json()
          const bundleInfo = workspaceIndex.bundles[bundleName]

          if (bundleInfo) {
            return bundleInfo.availablePatches.filter((patch: any) =>
              patch.fromVersion === currentVersion,
            )
          }
        }
      }
      catch (error) {
        // Fall back to regular index
      }

      // Try regular bundle index
      const indexUrl = `${endpoint}/index.json`
      const response = await fetch(indexUrl)

      if (!response.ok) {
        return []
      }

      const index = await response.json()
      return index.availablePatches?.filter((patch: any) =>
        patch.fromVersion === currentVersion,
      ) || []
    }
    catch (error) {
      logger.warn('Failed to get available patches:', error)
      return []
    }
  }

  /**
   * Apply deletion operation
   */
  private async applyDeletion(deletion: AssetDiff, bundleName: string): Promise<void> {
    const assetId = this.constructAssetId(bundleName, deletion.path)

    // Verify asset exists and matches expected hash
    const existingAsset = await this.database.getAsset(assetId)
    if (existingAsset && deletion.oldHash && existingAsset.hash !== deletion.oldHash) {
      logger.warn(`Asset hash mismatch for deletion: ${assetId}`)
    }

    await this.database.assets.delete(assetId)
    logger.debug(`Deleted asset: ${assetId}`)
  }

  /**
   * Apply addition operation
   */
  private async applyAddition(addition: AssetDiff, asset: StoredAsset, bundleName: string): Promise<void> {
    // Verify asset doesn't already exist
    const assetId = this.constructAssetId(bundleName, addition.path)
    const existingAsset = await this.database.getAsset(assetId)

    if (existingAsset) {
      logger.warn(`Asset already exists for addition: ${assetId}`)
    }

    // Update asset metadata
    const updatedAsset: StoredAsset = {
      ...asset,
      id: assetId,
      bundleName,
      version: addition.newVersion || asset.version,
      lastAccessed: Date.now(),
    }

    await this.database.storeAsset(updatedAsset)
    logger.debug(`Added asset: ${assetId}`)
  }

  /**
   * Apply modification operation
   */
  private async applyModification(modification: AssetDiff, asset: StoredAsset, bundleName: string): Promise<void> {
    const assetId = this.constructAssetId(bundleName, modification.path)

    // Verify existing asset matches expected hash
    const existingAsset = await this.database.getAsset(assetId)
    if (existingAsset && modification.oldHash && existingAsset.hash !== modification.oldHash) {
      logger.warn(`Asset hash mismatch for modification: ${assetId}`)
    }

    // Update asset with new data
    const updatedAsset: StoredAsset = {
      ...asset,
      id: assetId,
      bundleName,
      version: modification.newVersion || asset.version,
      lastAccessed: Date.now(),
    }

    await this.database.storeAsset(updatedAsset)
    logger.debug(`Modified asset: ${assetId}`)
  }

  /**
   * Validate deletion operations
   */
  private async validateDeletions(deletions: AssetDiff[], bundleName: string): Promise<string[]> {
    const errors: string[] = []

    for (const deletion of deletions) {
      const assetId = this.constructAssetId(bundleName, deletion.path)
      const asset = await this.database.getAsset(assetId)

      if (!asset) {
        errors.push(`Asset to delete not found: ${deletion.path}`)
      }
      else if (deletion.oldHash && asset.hash !== deletion.oldHash) {
        errors.push(`Asset hash mismatch for deletion: ${deletion.path}`)
      }
    }

    return errors
  }

  /**
   * Validate modification operations
   */
  private async validateModifications(modifications: AssetDiff[], bundleName: string): Promise<string[]> {
    const errors: string[] = []

    for (const modification of modifications) {
      const assetId = this.constructAssetId(bundleName, modification.path)
      const asset = await this.database.getAsset(assetId)

      if (!asset) {
        errors.push(`Asset to modify not found: ${modification.path}`)
      }
      else if (modification.oldHash && asset.hash !== modification.oldHash) {
        errors.push(`Asset hash mismatch for modification: ${modification.path}`)
      }
    }

    return errors
  }

  /**
   * Construct asset ID from bundle name and path
   */
  private constructAssetId(bundleName: string, path: string): string {
    // Extract type, locale, and name from path
    // This is a simplified implementation - might need adjustment based on actual path structure
    const parts = path.split('/')

    let locale = 'default'
    const type = parts[0] || 'data'
    let name = parts[parts.length - 1] || path

    // Check for locale in path
    if (parts.length > 2) {
      const possibleLocale = parts[1]
      if (possibleLocale.includes('-') || possibleLocale === 'default') {
        locale = possibleLocale
        name = parts.slice(2).join('/')
      }
    }

    return `${bundleName}:${locale}:${type}:${name}`
  }

  /**
   * Create a patch preview without applying changes
   */
  async previewPatch(patchUrl: string, targetBundleName: string): Promise<{
    valid: boolean
    changes: {
      willAdd: string[]
      willModify: string[]
      willDelete: string[]
    }
    errors: string[]
    fromVersion: number
    toVersion: number
  }> {
    try {
      const { manifest } = await this.bundleLoader.loadBundle(
        patchUrl,
        `${targetBundleName}_patch_preview`,
        { enableCache: false },
      )

      const validation = await this.validatePatch(manifest, targetBundleName)

      const changes = {
        willAdd: manifest.changes?.added.map(a => a.path) || [],
        willModify: manifest.changes?.modified.map(m => m.path) || [],
        willDelete: manifest.changes?.deleted.map(d => d.path) || [],
      }

      return {
        valid: validation.valid,
        changes,
        errors: validation.errors,
        fromVersion: validation.fromVersion,
        toVersion: validation.toVersion,
      }
    }
    catch (error) {
      return {
        valid: false,
        changes: { willAdd: [], willModify: [], willDelete: [] },
        errors: [`Failed to load patch: ${error instanceof Error ? error.message : String(error)}`],
        fromVersion: 0,
        toVersion: 0,
      }
    }
  }
}
