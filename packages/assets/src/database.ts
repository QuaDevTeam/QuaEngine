import Dexie, { Table } from 'dexie'
import type { StoredAsset, StoredBundle, AssetType, AssetLocale } from './types.js'

/**
 * QuaAssets Database schema and management
 * Uses Dexie for IndexedDB operations
 */
export class QuaAssetsDatabase extends Dexie {
  // Tables
  assets!: Table<StoredAsset, string>
  bundles!: Table<StoredBundle, string>

  constructor(databaseName: string = 'QuaAssetsDB', version: number = 1) {
    super(databaseName)

    // Define schema
    this.version(version).stores({
      assets: 'id, bundleName, name, type, locale, hash, version, lastAccessed, createdAt',
      bundles: 'name, version, buildNumber, hash, lastUpdated, createdAt'
    })
  }

  /**
   * Store an asset in the database
   */
  async storeAsset(asset: StoredAsset): Promise<void> {
    asset.lastAccessed = Date.now()
    await this.assets.put(asset)
  }

  /**
   * Store multiple assets in a transaction
   */
  async storeAssets(assets: StoredAsset[]): Promise<void> {
    const now = Date.now()
    assets.forEach(asset => {
      asset.lastAccessed = now
    })
    
    await this.transaction('rw', this.assets, async () => {
      await this.assets.bulkPut(assets)
    })
  }

  /**
   * Get an asset by ID
   */
  async getAsset(id: string): Promise<StoredAsset | undefined> {
    const asset = await this.assets.get(id)
    if (asset) {
      // Update last accessed time
      asset.lastAccessed = Date.now()
      await this.assets.put(asset)
    }
    return asset
  }

  /**
   * Find assets by criteria
   */
  async findAssets(criteria: {
    bundleName?: string
    type?: AssetType
    locale?: AssetLocale
    name?: string
  }): Promise<StoredAsset[]> {
    let query = this.assets.toCollection()

    if (criteria.bundleName) {
      query = query.filter(asset => asset.bundleName === criteria.bundleName)
    }
    if (criteria.type) {
      query = query.filter(asset => asset.type === criteria.type)
    }
    if (criteria.locale) {
      query = query.filter(asset => asset.locale === criteria.locale)
    }
    if (criteria.name) {
      query = query.filter(asset => asset.name === criteria.name)
    }

    return await query.toArray()
  }

  /**
   * Get asset with locale fallback
   * Tries requested locale first, then 'default', then any locale
   */
  async getAssetWithLocaleFallback(
    bundleName: string,
    type: AssetType,
    name: string,
    preferredLocale: AssetLocale = 'default'
  ): Promise<StoredAsset | undefined> {
    // Try preferred locale first
    let asset = await this.getAsset(`${bundleName}:${preferredLocale}:${type}:${name}`)
    if (asset) return asset

    // Try default locale
    if (preferredLocale !== 'default') {
      asset = await this.getAsset(`${bundleName}:default:${type}:${name}`)
      if (asset) return asset
    }

    // Try any locale for this asset
    const assets = await this.findAssets({
      bundleName,
      type,
      name
    })

    return assets.length > 0 ? assets[0] : undefined
  }

  /**
   * Delete assets by bundle name
   */
  async deleteAssetsByBundle(bundleName: string): Promise<number> {
    return await this.assets.where('bundleName').equals(bundleName).delete()
  }

  /**
   * Store a bundle
   */
  async storeBundle(bundle: StoredBundle): Promise<void> {
    bundle.lastUpdated = Date.now()
    await this.bundles.put(bundle)
  }

  /**
   * Get a bundle by name
   */
  async getBundle(name: string): Promise<StoredBundle | undefined> {
    return await this.bundles.get(name)
  }

  /**
   * Get all bundles
   */
  async getAllBundles(): Promise<StoredBundle[]> {
    return await this.bundles.toArray()
  }

  /**
   * Delete a bundle and all its assets
   */
  async deleteBundle(name: string): Promise<void> {
    await this.transaction('rw', [this.bundles, this.assets], async () => {
      await this.bundles.delete(name)
      await this.deleteAssetsByBundle(name)
    })
  }

  /**
   * Get database size estimate
   */
  async getDatabaseSize(): Promise<number> {
    let totalSize = 0
    
    await this.assets.each(asset => {
      totalSize += asset.size
    })
    
    return totalSize
  }

  /**
   * Clean up old/unused assets to free space
   * Removes least recently used assets until under the size limit
   */
  async cleanupAssets(maxSize: number): Promise<number> {
    const currentSize = await this.getDatabaseSize()
    
    if (currentSize <= maxSize) {
      return 0 // No cleanup needed
    }

    const sizeToRemove = currentSize - maxSize
    let removedSize = 0

    // Get assets sorted by last accessed (oldest first)
    const assets = await this.assets
      .orderBy('lastAccessed')
      .toArray()

    const assetsToDelete: string[] = []

    for (const asset of assets) {
      assetsToDelete.push(asset.id)
      removedSize += asset.size
      
      if (removedSize >= sizeToRemove) {
        break
      }
    }

    // Delete the selected assets
    if (assetsToDelete.length > 0) {
      await this.assets.bulkDelete(assetsToDelete)
    }

    return assetsToDelete.length
  }

  /**
   * Get cache statistics
   */
  async getCacheStats(): Promise<{
    totalAssets: number
    totalBundles: number
    totalSize: number
    oldestAsset: Date | null
    newestAsset: Date | null
  }> {
    const [totalAssets, totalBundles, totalSize] = await Promise.all([
      this.assets.count(),
      this.bundles.count(),
      this.getDatabaseSize()
    ])

    const oldestAsset = await this.assets.orderBy('lastAccessed').first()
    const newestAsset = await this.assets.orderBy('lastAccessed').last()

    return {
      totalAssets,
      totalBundles,
      totalSize,
      oldestAsset: oldestAsset ? new Date(oldestAsset.lastAccessed) : null,
      newestAsset: newestAsset ? new Date(newestAsset.lastAccessed) : null
    }
  }

  /**
   * Export database for debugging
   */
  async exportDatabase(): Promise<{
    assets: StoredAsset[]
    bundles: StoredBundle[]
    stats: any
  }> {
    const [assets, bundles, stats] = await Promise.all([
      this.assets.toArray(),
      this.bundles.toArray(),
      this.getCacheStats()
    ])

    return { assets, bundles, stats }
  }

  /**
   * Clear all data
   */
  async clearAll(): Promise<void> {
    await this.transaction('rw', [this.assets, this.bundles], async () => {
      await this.assets.clear()
      await this.bundles.clear()
    })
  }

  /**
   * Verify asset integrity by comparing stored hash with blob hash
   */
  async verifyAssetIntegrity(assetId: string): Promise<boolean> {
    const asset = await this.assets.get(assetId)
    if (!asset) return false

    try {
      const buffer = await asset.blob.arrayBuffer()
      const hash = await this.computeHash(buffer)
      return hash === asset.hash
    } catch (error) {
      return false
    }
  }

  /**
   * Compute SHA-256 hash of a buffer
   */
  private async computeHash(buffer: ArrayBuffer): Promise<string> {
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    return hashArray.map(byte => byte.toString(16).padStart(2, '0')).join('')
  }

  /**
   * Batch verification of assets integrity
   */
  async verifyBundleIntegrity(bundleName: string): Promise<{
    total: number
    valid: number
    invalid: string[]
  }> {
    const assets = await this.findAssets({ bundleName })
    const invalid: string[] = []
    let valid = 0

    for (const asset of assets) {
      if (await this.verifyAssetIntegrity(asset.id)) {
        valid++
      } else {
        invalid.push(asset.id)
      }
    }

    return {
      total: assets.length,
      valid,
      invalid
    }
  }
}