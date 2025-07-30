import { createLogger } from '@quajs/logger'
import type { 
  AssetInfo, 
  BundleManifest, 
  BundleFormat, 
  CompressionAlgorithm, 
  EncryptionAlgorithm,
  LocaleInfo,
  AssetType 
} from './types.js'

const logger = createLogger('quack:metadata')

export class MetadataGenerator {
  private bundlerVersion: string

  constructor() {
    // This would typically come from package.json
    this.bundlerVersion = '@quajs/quack@0.1.0'
  }

  /**
   * Generate bundle manifest from assets
   */
  generateManifest(
    assets: AssetInfo[],
    locales: LocaleInfo[],
    options: {
      format: BundleFormat
      compression: {
        algorithm: CompressionAlgorithm
        level?: number
      }
      encryption: {
        enabled: boolean
        algorithm: EncryptionAlgorithm
      }
    }
  ): BundleManifest {
    logger.info('Generating bundle manifest')

    const now = new Date().toISOString()
    const totalSize = assets.reduce((sum, asset) => sum + asset.size, 0)
    const totalFiles = assets.length

    // Group assets by type for the manifest
    const assetsByType = this.groupAssetsByType(assets)

    // Find default locale
    const defaultLocale = locales.find(l => l.isDefault)?.code || 'default'

    const manifest: BundleManifest = {
      version: '1.0.0',
      bundler: this.bundlerVersion,
      created: now,
      format: options.format,
      compression: {
        algorithm: options.compression.algorithm,
        level: options.compression.level
      },
      encryption: {
        enabled: options.encryption.enabled,
        algorithm: options.encryption.algorithm
      },
      locales: locales.map(l => l.code),
      defaultLocale,
      assets: assetsByType,
      totalSize,
      totalFiles
    }

    logger.info(`Generated manifest for ${totalFiles} assets (${this.formatBytes(totalSize)})`)
    return manifest
  }

  /**
   * Group assets by type and create manifest structure
   */
  private groupAssetsByType(assets: AssetInfo[]): Record<AssetType, Record<string, AssetInfo>> {
    const grouped: Record<AssetType, Record<string, AssetInfo>> = {
      images: {},
      characters: {},
      audio: {},
      scripts: {}
    }

    for (const asset of assets) {
      const type = asset.type
      const key = this.getAssetKey(asset)
      
      grouped[type][key] = {
        size: asset.size,
        hash: asset.hash,
        locales: asset.locales,
        mimeType: asset.mimeType
      } as AssetInfo
    }

    return grouped
  }

  /**
   * Generate a unique key for an asset in the manifest
   */
  private getAssetKey(asset: AssetInfo): string {
    const parts = asset.relativePath.split('/')
    
    // For character assets, include character name
    if (asset.type === 'characters') {
      // characters/alice/normal.png -> alice/normal.png
      return parts.slice(1).join('/')
    }
    
    // For other assets, remove the type folder
    if (parts[0]?.toLowerCase() === asset.type) {
      return parts.slice(1).join('/')
    }
    
    return asset.relativePath
  }

  /**
   * Validate manifest integrity
   */
  validateManifest(manifest: BundleManifest): boolean {
    try {
      // Check required fields
      const required = ['version', 'bundler', 'created', 'format', 'assets']
      for (const field of required) {
        if (!(field in manifest)) {
          logger.error(`Missing required field: ${field}`)
          return false
        }
      }

      // Validate format
      if (!['zip', 'qpk'].includes(manifest.format)) {
        logger.error(`Invalid format: ${manifest.format}`)
        return false
      }

      // Validate compression
      if (!['none', 'deflate', 'lzma'].includes(manifest.compression.algorithm)) {
        logger.error(`Invalid compression algorithm: ${manifest.compression.algorithm}`)
        return false
      }

      // Validate encryption
      if (!['none', 'xor'].includes(manifest.encryption.algorithm)) {
        logger.error(`Invalid encryption algorithm: ${manifest.encryption.algorithm}`)
        return false
      }

      // Validate locales
      if (!Array.isArray(manifest.locales) || manifest.locales.length === 0) {
        logger.error('Invalid or empty locales array')
        return false
      }

      if (!manifest.locales.includes(manifest.defaultLocale)) {
        logger.error(`Default locale not in locales array: ${manifest.defaultLocale}`)
        return false
      }

      // Validate assets structure
      for (const [type, assets] of Object.entries(manifest.assets)) {
        if (!['images', 'characters', 'audio', 'scripts'].includes(type)) {
          logger.error(`Invalid asset type: ${type}`)
          return false
        }

        for (const [key, asset] of Object.entries(assets)) {
          if (!this.validateAssetInfo(asset as AssetInfo, key)) {
            return false
          }
        }
      }

      logger.info('Manifest validation passed')
      return true
    } catch (error) {
      logger.error('Manifest validation failed:', error)
      return false
    }
  }

  /**
   * Validate individual asset info
   */
  private validateAssetInfo(asset: AssetInfo, key: string): boolean {
    if (typeof asset.size !== 'number' || asset.size < 0) {
      logger.error(`Invalid size for asset ${key}: ${asset.size}`)
      return false
    }

    if (typeof asset.hash !== 'string' || asset.hash.length !== 64) {
      logger.error(`Invalid hash for asset ${key}: ${asset.hash}`)
      return false
    }

    if (!Array.isArray(asset.locales) || asset.locales.length === 0) {
      logger.error(`Invalid locales for asset ${key}`)
      return false
    }

    return true
  }

  /**
   * Calculate bundle statistics
   */
  calculateStats(
    manifest: BundleManifest,
    compressedSize: number,
    processingTime: number
  ) {
    const stats = {
      totalFiles: manifest.totalFiles,
      totalSize: manifest.totalSize,
      compressedSize,
      compressionRatio: manifest.totalSize > 0 ? compressedSize / manifest.totalSize : 0,
      processingTime,
      locales: manifest.locales.map(code => ({
        code,
        name: this.getLocaleName(code),
        isDefault: code === manifest.defaultLocale
      })),
      assetsByType: {} as Record<AssetType, number>
    }

    // Count assets by type
    for (const [type, assets] of Object.entries(manifest.assets)) {
      stats.assetsByType[type as AssetType] = Object.keys(assets).length
    }

    return stats
  }

  /**
   * Format bytes to human readable string
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B'
    
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`
  }

  /**
   * Get human-readable name for locale
   */
  private getLocaleName(code: string): string {
    const names: Record<string, string> = {
      'default': 'Default',
      'en': 'English',
      'en-us': 'English (US)',
      'en-gb': 'English (UK)',
      'zh': 'Chinese',
      'zh-cn': 'Chinese (Simplified)',
      'zh-tw': 'Chinese (Traditional)',
      'ja': 'Japanese',
      'ja-jp': 'Japanese (Japan)',
      'ko': 'Korean',
      'ko-kr': 'Korean (Korea)',
      'fr': 'French',
      'de': 'German',
      'es': 'Spanish',
      'it': 'Italian',
      'pt': 'Portuguese',
      'ru': 'Russian'
    }

    return names[code.toLowerCase()] || code.toUpperCase()
  }

  /**
   * Generate integrity report
   */
  generateIntegrityReport(assets: AssetInfo[]): Record<string, string> {
    const report: Record<string, string> = {}
    
    for (const asset of assets) {
      report[asset.relativePath] = asset.hash
    }
    
    return report
  }

  /**
   * Verify asset integrity against manifest
   */
  async verifyIntegrity(
    assets: AssetInfo[],
    manifest: BundleManifest
  ): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = []
    
    // Create lookup map for manifest assets
    const manifestAssets = new Map<string, AssetInfo>()
    for (const [type, typeAssets] of Object.entries(manifest.assets)) {
      for (const [key, asset] of Object.entries(typeAssets)) {
        manifestAssets.set(key, asset as AssetInfo)
      }
    }
    
    // Check each asset
    for (const asset of assets) {
      const key = this.getAssetKey(asset)
      const manifestAsset = manifestAssets.get(key)
      
      if (!manifestAsset) {
        errors.push(`Asset not found in manifest: ${key}`)
        continue
      }
      
      if (asset.hash !== manifestAsset.hash) {
        errors.push(`Hash mismatch for ${key}: expected ${manifestAsset.hash}, got ${asset.hash}`)
      }
      
      if (asset.size !== manifestAsset.size) {
        errors.push(`Size mismatch for ${key}: expected ${manifestAsset.size}, got ${asset.size}`)
      }
    }
    
    // Check for missing assets
    for (const [key] of manifestAssets) {
      const found = assets.some(asset => this.getAssetKey(asset) === key)
      if (!found) {
        errors.push(`Manifest asset not found in bundle: ${key}`)
      }
    }
    
    const valid = errors.length === 0
    if (valid) {
      logger.info('Asset integrity verification passed')
    } else {
      logger.error(`Asset integrity verification failed with ${errors.length} errors`)
    }
    
    return { valid, errors }
  }
}