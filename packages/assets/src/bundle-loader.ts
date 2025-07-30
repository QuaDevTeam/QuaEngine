import { unzip } from 'fflate'
import type { 
  BundleFormat, 
  BundleManifest, 
  StoredAsset, 
  AssetType,
  LoadBundleOptions,
  DecompressionPlugin,
  DecryptionPlugin,
  BundleLoadError,
  IntegrityError
} from './types.js'

/**
 * Bundle loader handles downloading and parsing bundle files
 * Supports both ZIP and QPK formats with plugin extensibility
 */
export class BundleLoader {
  private decompressionPlugins = new Map<BundleFormat, DecompressionPlugin>()
  private decryptionPlugins: DecryptionPlugin[] = []
  private retryAttempts: number
  private timeout: number

  constructor(retryAttempts: number = 3, timeout: number = 30000) {
    this.retryAttempts = retryAttempts
    this.timeout = timeout
  }

  /**
   * Register a decompression plugin
   */
  registerDecompressionPlugin(plugin: DecompressionPlugin): void {
    for (const format of plugin.supportedFormats) {
      this.decompressionPlugins.set(format, plugin)
    }
  }

  /**
   * Register a decryption plugin
   */
  registerDecryptionPlugin(plugin: DecryptionPlugin): void {
    this.decryptionPlugins.push(plugin)
  }

  /**
   * Download and parse a bundle from URL
   */
  async loadBundle(
    url: string,
    bundleName: string,
    options: LoadBundleOptions = {}
  ): Promise<{
    manifest: BundleManifest
    assets: StoredAsset[]
  }> {
    try {
      // Download bundle with retry logic
      const buffer = await this.downloadWithRetry(url, options)
      
      // Determine format from URL or content
      const format = this.detectBundleFormat(url, buffer)
      
      // Decrypt if necessary
      const decryptedBuffer = await this.decryptBundle(buffer)
      
      // Decompress and extract files
      const files = await this.decompressBundle(decryptedBuffer, format)
      
      // Parse manifest
      const manifest = await this.parseManifest(files)
      
      // Convert files to StoredAsset objects
      const assets = await this.createStoredAssets(files, manifest, bundleName)
      
      return { manifest, assets }
    } catch (error) {
      throw new BundleLoadError(
        `Failed to load bundle: ${error.message}`,
        bundleName
      )
    }
  }

  /**
   * Download bundle with retry logic and progress reporting
   */
  private async downloadWithRetry(
    url: string,
    options: LoadBundleOptions
  ): Promise<ArrayBuffer> {
    let lastError: Error | null = null
    
    for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
      try {
        return await this.downloadBundle(url, options)
      } catch (error) {
        lastError = error as Error
        
        if (attempt === this.retryAttempts) {
          break
        }
        
        // Exponential backoff
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000)
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }
    
    throw lastError || new Error('Download failed after retries')
  }

  /**
   * Download bundle from URL
   */
  private async downloadBundle(
    url: string,
    options: LoadBundleOptions
  ): Promise<ArrayBuffer> {
    const controller = new AbortController()
    
    // Set up timeout
    const timeoutId = setTimeout(() => {
      controller.abort()
    }, this.timeout)
    
    // Use provided abort signal if available
    if (options.signal) {
      options.signal.addEventListener('abort', () => {
        controller.abort()
      })
    }
    
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'Cache-Control': options.enableCache !== false ? 'max-age=3600' : 'no-cache'
        }
      })
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
      
      const contentLength = response.headers.get('content-length')
      const total = contentLength ? parseInt(contentLength, 10) : 0
      
      if (!response.body) {
        throw new Error('Response body is null')
      }
      
      const reader = response.body.getReader()
      const chunks: Uint8Array[] = []
      let loaded = 0
      
      while (true) {
        const { done, value } = await reader.read()
        
        if (done) break
        
        chunks.push(value)
        loaded += value.length
        
        // Report progress
        if (options.onProgress && total > 0) {
          options.onProgress(loaded, total)
        }
      }
      
      // Combine chunks into single ArrayBuffer
      const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
      const result = new Uint8Array(totalLength)
      let offset = 0
      
      for (const chunk of chunks) {
        result.set(chunk, offset)
        offset += chunk.length
      }
      
      return result.buffer
    } finally {
      clearTimeout(timeoutId)
    }
  }

  /**
   * Detect bundle format from URL or content
   */
  private detectBundleFormat(url: string, buffer: ArrayBuffer): BundleFormat {
    // Check file extension first
    if (url.endsWith('.qpk')) {
      return 'qpk'
    }
    if (url.endsWith('.zip')) {
      return 'zip'
    }
    
    // Check magic bytes
    const view = new DataView(buffer)
    
    // ZIP magic: PK (0x504B)
    if (view.getUint16(0, false) === 0x504B) {
      return 'zip'
    }
    
    // QPK magic: 'QPK\0' (0x51504B00)
    if (view.getUint32(0, false) === 0x51504B00) {
      return 'qpk'
    }
    
    // Default to ZIP for unknown formats
    return 'zip'
  }

  /**
   * Decrypt bundle if decryption plugins are available
   */
  private async decryptBundle(buffer: ArrayBuffer): Promise<ArrayBuffer> {
    let result = buffer
    
    for (const plugin of this.decryptionPlugins) {
      try {
        result = await plugin.decrypt(result)
      } catch (error) {
        console.warn(`Decryption plugin ${plugin.name} failed:`, error)
      }
    }
    
    return result
  }

  /**
   * Decompress bundle based on format
   */
  private async decompressBundle(
    buffer: ArrayBuffer,
    format: BundleFormat
  ): Promise<Map<string, Uint8Array>> {
    // Try registered plugins first
    const plugin = this.decompressionPlugins.get(format)
    if (plugin) {
      return await plugin.decompress(buffer, format)
    }
    
    // Fall back to built-in decompression
    switch (format) {
      case 'zip':
        return await this.decompressZip(buffer)
      case 'qpk':
        return await this.decompressQPK(buffer)
      default:
        throw new Error(`Unsupported bundle format: ${format}`)
    }
  }

  /**
   * Decompress ZIP bundle using fflate
   * Note: This method should be tree-shaken in production builds
   */
  private async decompressZip(buffer: ArrayBuffer): Promise<Map<string, Uint8Array>> {
    return new Promise((resolve, reject) => {
      const uint8Array = new Uint8Array(buffer)
      
      unzip(uint8Array, (error, files) => {
        if (error) {
          reject(new Error(`ZIP decompression failed: ${error.message}`))
          return
        }
        
        const result = new Map<string, Uint8Array>()
        
        for (const [filename, fileData] of Object.entries(files)) {
          result.set(filename, fileData)
        }
        
        resolve(result)
      })
    })
  }

  /**
   * Decompress QPK bundle (custom format)
   */
  private async decompressQPK(buffer: ArrayBuffer): Promise<Map<string, Uint8Array>> {
    const view = new DataView(buffer)
    let offset = 0
    
    // Verify QPK magic
    const magic = view.getUint32(offset, false)
    if (magic !== 0x51504B00) { // 'QPK\0'
      throw new Error('Invalid QPK file: magic number mismatch')
    }
    offset += 4
    
    // Read version
    const version = view.getUint32(offset, true)
    offset += 4
    
    if (version !== 1) {
      throw new Error(`Unsupported QPK version: ${version}`)
    }
    
    // Read compression algorithm
    const compressionType = view.getUint32(offset, true)
    offset += 4
    
    // Read encryption flags
    const encryptionFlags = view.getUint32(offset, true)
    offset += 4
    
    // Read file count
    const fileCount = view.getUint32(offset, true)
    offset += 4
    
    const files = new Map<string, Uint8Array>()
    
    // Read file entries
    for (let i = 0; i < fileCount; i++) {
      // Read filename length
      const nameLength = view.getUint32(offset, true)
      offset += 4
      
      // Read filename
      const nameBytes = new Uint8Array(buffer, offset, nameLength)
      const filename = new TextDecoder().decode(nameBytes)
      offset += nameLength
      
      // Read compressed size
      const compressedSize = view.getUint32(offset, true)
      offset += 4
      
      // Read uncompressed size
      const uncompressedSize = view.getUint32(offset, true)
      offset += 4
      
      // Read file data
      const fileData = new Uint8Array(buffer, offset, compressedSize)
      offset += compressedSize
      
      // Decompress file data based on compression type
      let decompressedData: Uint8Array
      
      switch (compressionType) {
        case 0: // No compression
          decompressedData = fileData
          break
        case 1: // LZMA compression
          decompressedData = await this.decompressLZMA(fileData, uncompressedSize)
          break
        default:
          throw new Error(`Unsupported compression type: ${compressionType}`)
      }
      
      files.set(filename, decompressedData)
    }
    
    return files
  }

  /**
   * Decompress LZMA data (placeholder - would need actual LZMA implementation)
   */
  private async decompressLZMA(data: Uint8Array, uncompressedSize: number): Promise<Uint8Array> {
    // This is a placeholder implementation
    // In a real implementation, you would use an LZMA library like lzma-js
    // For now, assume the data is not compressed
    return data
  }

  /**
   * Parse manifest from bundle files
   */
  private async parseManifest(files: Map<string, Uint8Array>): Promise<BundleManifest> {
    const manifestData = files.get('manifest.json')
    if (!manifestData) {
      throw new Error('Bundle manifest not found')
    }
    
    try {
      const manifestText = new TextDecoder().decode(manifestData)
      return JSON.parse(manifestText) as BundleManifest
    } catch (error) {
      throw new Error(`Failed to parse manifest: ${error.message}`)
    }
  }

  /**
   * Create StoredAsset objects from bundle files and manifest
   */
  private async createStoredAssets(
    files: Map<string, Uint8Array>,
    manifest: BundleManifest,
    bundleName: string
  ): Promise<StoredAsset[]> {
    const assets: StoredAsset[] = []
    const now = Date.now()
    
    // Iterate through all asset types in manifest
    for (const [assetType, typeData] of Object.entries(manifest.assets)) {
      for (const [subType, subTypeData] of Object.entries(typeData)) {
        for (const [filename, assetInfo] of Object.entries(subTypeData)) {
          // Find file data for this asset in all locales
          for (const locale of assetInfo.locales) {
            const filePath = this.constructAssetPath(assetType as AssetType, subType, filename, locale)
            const fileData = files.get(filePath)
            
            if (fileData) {
              // Verify hash if available
              if (assetInfo.hash) {
                const actualHash = await this.computeHash(fileData.buffer)
                if (actualHash !== assetInfo.hash) {
                  throw new IntegrityError(assetInfo.hash, actualHash)
                }
              }
              
              const asset: StoredAsset = {
                id: `${bundleName}:${locale}:${assetType}:${filename}`,
                bundleName,
                name: filename,
                type: assetType as AssetType,
                locale,
                blob: new Blob([fileData]),
                hash: assetInfo.hash,
                size: assetInfo.size,
                version: assetInfo.version || 1,
                mtime: now,
                createdAt: now,
                lastAccessed: now
              }
              
              assets.push(asset)
            }
          }
        }
      }
    }
    
    return assets
  }

  /**
   * Construct asset file path based on type, subtype, filename, and locale
   */
  private constructAssetPath(
    type: AssetType,
    subType: string,
    filename: string,
    locale: string
  ): string {
    if (locale === 'default') {
      return `${type}/${subType}/${filename}`
    }
    
    // Check for locale in filename (file-based locales)
    const nameWithoutExt = filename.substring(0, filename.lastIndexOf('.'))
    const ext = filename.substring(filename.lastIndexOf('.'))
    
    if (filename.includes(`.${locale}.`)) {
      return `${type}/${subType}/${filename}`
    }
    
    // Check for locale folder (folder-based locales)
    return `${type}/${subType}/${locale}/${filename}`
  }

  /**
   * Compute SHA-256 hash of data
   */
  private async computeHash(buffer: ArrayBuffer): Promise<string> {
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    return hashArray.map(byte => byte.toString(16).padStart(2, '0')).join('')
  }
}