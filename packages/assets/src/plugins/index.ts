import type {
  DecryptionPlugin,
  DecompressionPlugin,
  AssetProcessingPlugin,
  BundleFormat,
  AssetType,
  StoredAsset
} from '../types.js'

/**
 * XOR Decryption Plugin
 * Provides XOR decryption compatible with Quack's XOR encryption
 */
export class XORDecryptionPlugin implements DecryptionPlugin {
  name = 'xor-decryption'
  version = '1.0.0'
  
  private key: string

  constructor(key: string) {
    this.key = key
  }

  async decrypt(buffer: ArrayBuffer): Promise<ArrayBuffer> {
    if (!this.key) {
      return buffer // No decryption if no key
    }

    const data = new Uint8Array(buffer)
    const keyBytes = new TextEncoder().encode(this.key)
    const decrypted = new Uint8Array(data.length)

    // Simple XOR decryption
    for (let i = 0; i < data.length; i++) {
      decrypted[i] = data[i] ^ keyBytes[i % keyBytes.length]
    }

    return decrypted.buffer
  }
}

/**
 * AES Decryption Plugin
 * Provides AES decryption for stronger security
 */
export class AESDecryptionPlugin implements DecryptionPlugin {
  name = 'aes-decryption'
  version = '1.0.0'
  
  private key: string

  constructor(key: string) {
    this.key = key
  }

  async decrypt(buffer: ArrayBuffer): Promise<ArrayBuffer> {
    if (!this.key) {
      return buffer
    }

    try {
      // Import key
      const keyBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(this.key))
      const cryptoKey = await crypto.subtle.importKey(
        'raw',
        keyBuffer,
        { name: 'AES-GCM' },
        false,
        ['decrypt']
      )

      // Extract IV (first 12 bytes) and encrypted data
      const iv = buffer.slice(0, 12)
      const encryptedData = buffer.slice(12)

      // Decrypt
      const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        cryptoKey,
        encryptedData
      )

      return decrypted
    } catch (error) {
      console.error('AES decryption failed:', error)
      throw new Error('AES decryption failed')
    }
  }
}

/**
 * LZMA Decompression Plugin
 * Provides LZMA decompression for QPK bundles
 */
export class LZMADecompressionPlugin implements DecompressionPlugin {
  name = 'lzma-decompression'
  version = '1.0.0'
  supportedFormats: BundleFormat[] = ['qpk']

  async decompress(buffer: ArrayBuffer, format: BundleFormat): Promise<Map<string, Uint8Array>> {
    if (format !== 'qpk') {
      throw new Error('LZMA decompression only supports QPK format')
    }

    // This is a placeholder implementation
    // In a real implementation, you would use an LZMA library like lzma-js
    // For now, we'll assume the data is not compressed
    
    const files = new Map<string, Uint8Array>()
    const view = new DataView(buffer)
    let offset = 0

    // Skip QPK header (magic, version, compression, encryption, file count)
    offset += 20

    // Read file entries (simplified)
    while (offset < buffer.byteLength) {
      const nameLength = view.getUint32(offset, true)
      offset += 4

      if (nameLength === 0 || offset + nameLength > buffer.byteLength) break

      const nameBytes = new Uint8Array(buffer, offset, nameLength)
      const filename = new TextDecoder().decode(nameBytes)
      offset += nameLength

      const dataLength = view.getUint32(offset, true)
      offset += 4

      const fileData = new Uint8Array(buffer, offset, dataLength)
      offset += dataLength

      files.set(filename, fileData)
    }

    return files
  }
}

/**
 * Image Processing Plugin
 * Processes image assets for optimization or format conversion
 */
export class ImageProcessingPlugin implements AssetProcessingPlugin {
  name = 'image-processing'
  version = '1.0.0'
  supportedTypes: AssetType[] = ['images', 'characters']

  private options: {
    enableWebP?: boolean
    quality?: number
    enableThumbnails?: boolean
  }

  constructor(options: {
    enableWebP?: boolean
    quality?: number
    enableThumbnails?: boolean
  } = {}) {
    this.options = {
      enableWebP: false,
      quality: 0.8,
      enableThumbnails: false,
      ...options
    }
  }

  async processAsset(asset: StoredAsset): Promise<StoredAsset> {
    if (!this.isImageAsset(asset)) {
      return asset
    }

    try {
      let processedBlob = asset.blob

      // Convert to WebP if enabled and supported
      if (this.options.enableWebP && this.supportsWebP()) {
        processedBlob = await this.convertToWebP(processedBlob, this.options.quality!)
      }

      // Generate thumbnail if enabled
      if (this.options.enableThumbnails) {
        // This would be implemented to generate thumbnails
        // For brevity, we'll skip the actual implementation
      }

      return {
        ...asset,
        blob: processedBlob,
        size: processedBlob.size
      }
    } catch (error) {
      console.warn(`Image processing failed for ${asset.name}:`, error)
      return asset // Return original asset on failure
    }
  }

  private isImageAsset(asset: StoredAsset): boolean {
    return asset.type === 'images' || asset.type === 'characters'
  }

  private supportsWebP(): boolean {
    // Check WebP support
    const canvas = document.createElement('canvas')
    canvas.width = 1
    canvas.height = 1
    return canvas.toDataURL('image/webp').startsWith('data:image/webp')
  }

  private async convertToWebP(blob: Blob, quality: number): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')!
      const img = new Image()

      img.onload = () => {
        canvas.width = img.width
        canvas.height = img.height
        ctx.drawImage(img, 0, 0)

        canvas.toBlob(
          (webpBlob) => {
            if (webpBlob) {
              resolve(webpBlob)
            } else {
              reject(new Error('WebP conversion failed'))
            }
          },
          'image/webp',
          quality
        )
      }

      img.onerror = () => reject(new Error('Failed to load image'))
      img.src = URL.createObjectURL(blob)
    })
  }
}

/**
 * Cache Warming Plugin
 * Pre-loads frequently used assets into memory
 */
export class CacheWarmingPlugin implements AssetProcessingPlugin {
  name = 'cache-warming'
  version = '1.0.0'
  supportedTypes: AssetType[] = ['images', 'characters', 'audio', 'scripts', 'data']

  private warmCache = new Map<string, Blob>()
  private maxCacheSize: number
  private currentCacheSize = 0

  constructor(maxCacheSize: number = 50 * 1024 * 1024) { // 50MB default
    this.maxCacheSize = maxCacheSize
  }

  async processAsset(asset: StoredAsset): Promise<StoredAsset> {
    // Add to warm cache if there's space
    if (this.currentCacheSize + asset.size <= this.maxCacheSize) {
      this.warmCache.set(asset.id, asset.blob)
      this.currentCacheSize += asset.size
    }

    return asset
  }

  /**
   * Get asset from warm cache
   */
  getCachedAsset(assetId: string): Blob | undefined {
    return this.warmCache.get(assetId)
  }

  /**
   * Clear warm cache
   */
  clearCache(): void {
    this.warmCache.clear()
    this.currentCacheSize = 0
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): {
    entries: number
    size: number
    maxSize: number
  } {
    return {
      entries: this.warmCache.size,
      size: this.currentCacheSize,
      maxSize: this.maxCacheSize
    }
  }
}

/**
 * Compression Detection Plugin
 * Automatically detects and handles different compression formats
 */
export class CompressionDetectionPlugin implements DecompressionPlugin {
  name = 'compression-detection'
  version = '1.0.0'
  supportedFormats: BundleFormat[] = ['zip', 'qpk']

  async decompress(buffer: ArrayBuffer, format: BundleFormat): Promise<Map<string, Uint8Array>> {
    const view = new DataView(buffer)
    
    // Detect actual compression format from magic bytes
    const magic = view.getUint32(0, false)
    
    switch (magic) {
      case 0x504B0304: // ZIP magic
      case 0x504B0506: // ZIP central directory
      case 0x504B0708: // ZIP data descriptor
        return this.decompressPKZip(buffer)
      
      case 0x51504B00: // QPK magic
        return this.decompressQPK(buffer)
      
      default:
        throw new Error(`Unsupported compression format: 0x${magic.toString(16)}`)
    }
  }

  private async decompressPKZip(buffer: ArrayBuffer): Promise<Map<string, Uint8Array>> {
    // Delegate to existing ZIP decompression
    // This would use fflate or similar library
    throw new Error('ZIP decompression not implemented in plugin')
  }

  private async decompressQPK(buffer: ArrayBuffer): Promise<Map<string, Uint8Array>> {
    // Delegate to existing QPK decompression
    // This would implement QPK format parsing
    throw new Error('QPK decompression not implemented in plugin')
  }
}