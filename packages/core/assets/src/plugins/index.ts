import type {
  AssetProcessingPlugin,
  AssetType,
  BundleFormat,
  DecompressionPlugin,
  DecryptionPlugin,
  StoredAsset,
} from '../types'
import { utf8ToBytes } from '../encoding'

export class XORDecryptionPlugin implements DecryptionPlugin {
  name = 'xor-decryption'
  version = '1.0.0'

  constructor(private key: string) {}

  async decrypt(buffer: Uint8Array): Promise<Uint8Array> {
    if (!this.key)
      return buffer

    const keyBytes = utf8ToBytes(this.key)
    const decrypted = new Uint8Array(buffer.length)
    for (let i = 0; i < buffer.length; i++) {
      decrypted[i] = buffer[i] ^ keyBytes[i % keyBytes.length]
    }
    return decrypted
  }
}

export class CacheWarmingPlugin implements AssetProcessingPlugin {
  name = 'cache-warming'
  version = '1.0.0'
  supportedTypes: AssetType[] = ['images', 'characters', 'audio', 'video', 'scripts', 'data']

  private warmCache = new Map<string, Uint8Array>()
  private currentCacheSize = 0

  constructor(private maxCacheSize: number = 50 * 1024 * 1024) {}

  async processAsset(asset: StoredAsset): Promise<StoredAsset> {
    if (this.currentCacheSize + asset.size <= this.maxCacheSize) {
      this.warmCache.set(asset.id, new Uint8Array(asset.data))
      this.currentCacheSize += asset.size
    }
    return asset
  }

  getCachedAsset(assetId: string): Uint8Array | undefined {
    const cached = this.warmCache.get(assetId)
    return cached ? new Uint8Array(cached) : undefined
  }

  clearCache(): void {
    this.warmCache.clear()
    this.currentCacheSize = 0
  }

  getCacheStats(): { entries: number, size: number, maxSize: number } {
    return {
      entries: this.warmCache.size,
      size: this.currentCacheSize,
      maxSize: this.maxCacheSize,
    }
  }
}

export class NoopDecompressionPlugin implements DecompressionPlugin {
  name = 'noop-decompression'
  version = '1.0.0'
  supportedFormats: BundleFormat[] = []

  async decompress(): Promise<Map<string, Uint8Array>> {
    throw new Error('NoopDecompressionPlugin does not implement decompression')
  }
}

export class CompressionDetectionPlugin extends NoopDecompressionPlugin {
  name = 'compression-detection'
}
