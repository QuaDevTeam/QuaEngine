import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { createReadStream, createWriteStream } from 'node:fs'
import { pipeline } from 'node:stream/promises'
import * as lzma from 'lzma-native'
import { createLogger } from '@quajs/logger'
import { EncryptionManager } from '../crypto/encryption'
import type { AssetInfo, BundleManifest, AssetContext, QuackPlugin, EncryptionPlugin, EncryptionAlgorithm } from '../core/types'

const logger = createLogger('quack:qpk-bundler')

// QPK file format:
// Header (32 bytes):
// - Magic: 'QPK\0' (4 bytes)
// - Version: uint32 (4 bytes)
// - Flags: uint32 (4 bytes) - bit 0: compressed, bit 1: encrypted
// - Header size: uint32 (4 bytes)
// - Manifest offset: uint64 (8 bytes)
// - Manifest size: uint64 (8 bytes)
// - Reserved: (4 bytes)
//
// Data section:
// - Asset entries (variable size)
//
// Manifest section:
// - JSON manifest (compressed/encrypted if flags set)

const QPK_MAGIC = Buffer.from('QPK\0', 'ascii')
const QPK_VERSION = 1
const QPK_HEADER_SIZE = 32

interface QPKHeader {
  magic: Buffer
  version: number
  flags: number
  headerSize: number
  manifestOffset: bigint
  manifestSize: bigint
  reserved: number
}

interface QPKFlags {
  compressed: boolean
  encrypted: boolean
}

export class QPKBundler {
  private plugins: QuackPlugin[]
  private encryptionManager: EncryptionManager

  constructor(
    plugins: QuackPlugin[] = [], 
    encryptionAlgorithm: EncryptionAlgorithm = 'none',
    encryptionKey?: string,
    encryptionPlugin?: EncryptionPlugin
  ) {
    this.plugins = plugins
    this.encryptionManager = new EncryptionManager(encryptionAlgorithm, encryptionKey, encryptionPlugin)
  }

  /**
   * Create QPK bundle from assets
   */
  async createBundle(
    assets: AssetInfo[],
    manifest: BundleManifest,
    outputPath: string,
    options: {
      compress: boolean
      encrypt: boolean
      compressionLevel?: number
    } = { compress: true, encrypt: true }
  ): Promise<void> {
    logger.info(`Creating QPK bundle: ${outputPath}`)
    
    // Validate encryption configuration
    this.encryptionManager.logConfigurationWarnings()
    const validation = this.encryptionManager.validateConfiguration()
    if (!validation.valid) {
      if (options.encrypt) {
        logger.warn('Encryption requested but configuration is invalid - disabling encryption')
        options.encrypt = false
      }
    }
    
    // Ensure output directory exists
    await mkdir(dirname(outputPath), { recursive: true })
    
    // Create temporary data for assets and manifest
    const assetData = await this.processAssets(assets)
    const manifestData = await this.processManifest(manifest, options)
    
    // Calculate offsets
    const manifestOffset = BigInt(QPK_HEADER_SIZE + assetData.length)
    const manifestSize = BigInt(manifestData.length)
    
    // Create header
    const flags = this.createFlags(options)
    const header = this.createHeader(flags, manifestOffset, manifestSize)
    
    // Write QPK file
    const outputStream = createWriteStream(outputPath)
    
    try {
      // Write header
      await this.writeBuffer(outputStream, header)
      
      // Write asset data
      await this.writeBuffer(outputStream, assetData)
      
      // Write manifest
      await this.writeBuffer(outputStream, manifestData)
      
      outputStream.end()
      
      logger.info(`QPK bundle created successfully: ${outputPath}`)
    } catch (error) {
      outputStream.destroy()
      throw error
    }
  }

  /**
   * Process all assets and create data section
   */
  private async processAssets(assets: AssetInfo[]): Promise<Buffer> {
    logger.info(`Processing ${assets.length} assets for QPK bundle`)
    
    const chunks: Buffer[] = []
    
    for (let i = 0; i < assets.length; i++) {
      const asset = assets[i]
      
      try {
        const assetBuffer = await this.processAsset(asset)
        chunks.push(assetBuffer)
        
        if ((i + 1) % 50 === 0) {
          const progress = Math.round(((i + 1) / assets.length) * 100)
          logger.info(`Processing assets: ${progress}% (${i + 1}/${assets.length})`)
        }
      } catch (error) {
        logger.error(`Failed to process asset: ${asset.relativePath}`, error)
        throw error
      }
    }
    
    return Buffer.concat(chunks)
  }

  /**
   * Process a single asset
   */
  private async processAsset(asset: AssetInfo): Promise<Buffer> {
    // Read asset file
    let buffer: Buffer
    try {
      buffer = await readFile(asset.path)
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        throw new Error(`File not found: ${asset.path}`)
      }
      throw error
    }
    
    // Create asset context for plugins
    const context: AssetContext = {
      asset,
      buffer,
      metadata: {}
    }

    // Apply plugins
    for (const plugin of this.plugins) {
      if (plugin.processAsset) {
        await plugin.processAsset(context)
      }
    }

    // Create asset entry:
    // Path length: uint32 (4 bytes)
    // Path: string (variable)
    // Data length: uint32 (4 bytes)
    // Data: bytes (variable)
    
    const pathBuffer = Buffer.from(this.getAssetPath(asset), 'utf8')
    const pathLength = Buffer.alloc(4)
    pathLength.writeUInt32LE(pathBuffer.length, 0)
    
    const dataLength = Buffer.alloc(4)
    dataLength.writeUInt32LE(context.buffer.length, 0)
    
    return Buffer.concat([pathLength, pathBuffer, dataLength, context.buffer])
  }

  /**
   * Process manifest
   */
  private async processManifest(
    manifest: BundleManifest,
    options: { compress: boolean; encrypt: boolean }
  ): Promise<Buffer> {
    let manifestBuffer = Buffer.from(JSON.stringify(manifest, null, 2), 'utf8')
    
    // Compress if requested
    if (options.compress) {
      manifestBuffer = await this.compressBuffer(manifestBuffer)
      logger.debug(`Manifest compressed: ${manifestBuffer.length} bytes`)
    }
    
    // Encrypt if requested and properly configured
    if (options.encrypt && this.encryptionManager.isEncryptionAvailable()) {
      manifestBuffer = await this.encryptionManager.encrypt(manifestBuffer, { type: 'manifest' })
      logger.debug(`Manifest encrypted: ${manifestBuffer.length} bytes`)
    } else if (options.encrypt) {
      logger.warn('Manifest encryption skipped - encryption not properly configured')
    }
    
    return manifestBuffer
  }

  /**
   * Create QPK header
   */
  private createHeader(
    flags: QPKFlags,
    manifestOffset: bigint,
    manifestSize: bigint
  ): Buffer {
    const header = Buffer.alloc(QPK_HEADER_SIZE)
    let offset = 0
    
    // Magic
    QPK_MAGIC.copy(header, offset)
    offset += 4
    
    // Version
    header.writeUInt32LE(QPK_VERSION, offset)
    offset += 4
    
    // Flags
    let flagsValue = 0
    if (flags.compressed) flagsValue |= 1
    if (flags.encrypted) flagsValue |= 2
    header.writeUInt32LE(flagsValue, offset)
    offset += 4
    
    // Header size
    header.writeUInt32LE(QPK_HEADER_SIZE, offset)
    offset += 4
    
    // Manifest offset (8 bytes)
    header.writeBigUInt64LE(manifestOffset, offset)
    offset += 8
    
    // Manifest size (8 bytes)
    header.writeBigUInt64LE(manifestSize, offset)
    offset += 8
    
    // Reserved (4 bytes) - already zeroed
    
    return header
  }

  /**
   * Create flags object
   */
  private createFlags(options: { compress: boolean; encrypt: boolean }): QPKFlags {
    return {
      compressed: options.compress,
      encrypted: options.encrypt
    }
  }

  /**
   * Get asset path in QPK
   */
  private getAssetPath(asset: AssetInfo): string {
    // Similar to ZIP bundler but with forward slashes
    const basePath = `assets/${asset.type}`
    
    if (asset.type === 'characters') {
      return `${basePath}/${asset.relativePath.replace(/^characters\//, '')}`
    }
    
    let relativePath = asset.relativePath
    if (relativePath.startsWith(`${asset.type}/`)) {
      relativePath = relativePath.substring(asset.type.length + 1)
    }
    
    return `${basePath}/${relativePath}`
  }

  /**
   * Compress buffer using LZMA
   */
  private async compressBuffer(buffer: Buffer): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      lzma.compress(buffer, 6, (result, error) => {
        if (error) {
          reject(error)
        } else {
          resolve(Buffer.from(result))
        }
      })
    })
  }

  /**
   * Decompress buffer using LZMA
   */
  private async decompressBuffer(buffer: Buffer): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      lzma.decompress(buffer, (result, error) => {
        if (error) {
          reject(error)
        } else {
          resolve(Buffer.from(result))
        }
      })
    })
  }

  /**
   * Write buffer to stream
   */
  private async writeBuffer(stream: NodeJS.WritableStream, buffer: Buffer): Promise<void> {
    return new Promise((resolve, reject) => {
      stream.write(buffer, (error) => {
        if (error) {
          reject(error)
        } else {
          resolve()
        }
      })
    })
  }

  /**
   * Read QPK bundle
   */
  async readBundle(qpkPath: string): Promise<{ manifest: BundleManifest; assets: Map<string, Buffer> }> {
    logger.info(`Reading QPK bundle: ${qpkPath}`)
    
    const fileBuffer = await readFile(qpkPath)
    
    // Parse header
    const header = this.parseHeader(fileBuffer)
    this.validateHeader(header)
    
    // Extract manifest
    const manifestStart = Number(header.manifestOffset)
    const manifestEnd = manifestStart + Number(header.manifestSize)
    let manifestBuffer = fileBuffer.subarray(manifestStart, manifestEnd)
    
    // Decrypt if needed
    if (header.flags & 2) {
      manifestBuffer = await this.encryptionManager.decrypt(manifestBuffer, { type: 'manifest' })
    }
    
    // Decompress if needed
    if (header.flags & 1) {
      manifestBuffer = await this.decompressBuffer(manifestBuffer)
    }
    
    const manifest: BundleManifest = JSON.parse(manifestBuffer.toString('utf8'))
    
    // Extract assets
    const assets = new Map<string, Buffer>()
    let offset = header.headerSize
    
    while (offset < manifestStart) {
      // Read path length
      const pathLength = fileBuffer.readUInt32LE(offset)
      offset += 4
      
      // Read path
      const path = fileBuffer.subarray(offset, offset + pathLength).toString('utf8')
      offset += pathLength
      
      // Read data length
      const dataLength = fileBuffer.readUInt32LE(offset)
      offset += 4
      
      // Read data
      const data = fileBuffer.subarray(offset, offset + dataLength)
      offset += dataLength
      
      assets.set(path, data)
    }
    
    logger.info(`Read QPK bundle with ${assets.size} assets`)
    return { manifest, assets }
  }

  /**
   * Parse QPK header
   */
  private parseHeader(buffer: Buffer): QPKHeader & { flags: number } {
    if (buffer.length < QPK_HEADER_SIZE) {
      throw new Error('Invalid QPK file: too small')
    }
    
    let offset = 0
    
    // Magic
    const magic = buffer.subarray(offset, offset + 4)
    offset += 4
    
    // Version
    const version = buffer.readUInt32LE(offset)
    offset += 4
    
    // Flags
    const flags = buffer.readUInt32LE(offset)
    offset += 4
    
    // Header size
    const headerSize = buffer.readUInt32LE(offset)
    offset += 4
    
    // Manifest offset
    const manifestOffset = buffer.readBigUInt64LE(offset)
    offset += 8
    
    // Manifest size
    const manifestSize = buffer.readBigUInt64LE(offset)
    offset += 8
    
    // Reserved
    const reserved = buffer.readUInt32LE(offset)
    
    return {
      magic,
      version,
      flags,
      headerSize,
      manifestOffset,
      manifestSize,
      reserved
    }
  }

  /**
   * Validate QPK header
   */
  private validateHeader(header: QPKHeader & { flags: number }): void {
    if (!header.magic.equals(QPK_MAGIC)) {
      throw new Error('Invalid QPK file: wrong magic number')
    }
    
    if (header.version !== QPK_VERSION) {
      throw new Error(`Unsupported QPK version: ${header.version}`)
    }
    
    if (header.headerSize !== QPK_HEADER_SIZE) {
      throw new Error(`Invalid header size: ${header.headerSize}`)
    }
  }

  /**
   * Extract QPK bundle to directory
   */
  async extractBundle(qpkPath: string, outputDir: string): Promise<BundleManifest> {
    const { manifest, assets } = await this.readBundle(qpkPath)
    
    // Create output directory
    await mkdir(outputDir, { recursive: true })
    
    // Write manifest
    await writeFile(
      join(outputDir, 'manifest.json'),
      JSON.stringify(manifest, null, 2),
      'utf8'
    )
    
    // Write assets
    for (const [path, data] of assets) {
      const outputPath = join(outputDir, path)
      await mkdir(dirname(outputPath), { recursive: true })
      await writeFile(outputPath, data)
    }
    
    logger.info(`Extracted QPK bundle to: ${outputDir}`)
    return manifest
  }

  /**
   * List contents of QPK bundle
   */
  async listContents(qpkPath: string): Promise<string[]> {
    const { assets } = await this.readBundle(qpkPath)
    return ['manifest.json', ...Array.from(assets.keys())]
  }

  /**
   * Compress data using LZMA
   */
  async compressLZMA(data: Uint8Array): Promise<Uint8Array> {
    throw new Error('LZMA compression not implemented')
  }

  /**
   * Compress data using DEFLATE
   */
  async compressDeflate(data: Uint8Array): Promise<Uint8Array> {
    throw new Error('DEFLATE compression not implemented')
  }

  /**
   * Compress data with specified algorithm
   */
  async compressData(data: Uint8Array, algorithm: string): Promise<Uint8Array> {
    if (algorithm === 'none') {
      return data
    }
    if (algorithm === 'lzma') {
      return this.compressLZMA(data)
    }
    if (algorithm === 'deflate') {
      return this.compressDeflate(data)
    }
    throw new Error(`Unsupported compression algorithm: ${algorithm}`)
  }

  /**
   * Serialize file entry for QPK format
   */
  serializeFileEntry(entry: any): Uint8Array {
    const nameBuffer = Buffer.from(entry.name, 'utf8')
    const entryData = Buffer.alloc(4 + nameBuffer.length + 24) // Basic size
    
    let offset = 0
    entryData.writeUInt32LE(nameBuffer.length, offset)
    offset += 4
    nameBuffer.copy(entryData, offset)
    offset += nameBuffer.length
    entryData.writeUInt32LE(entry.size, offset)
    offset += 4
    entryData.writeUInt32LE(entry.compressedSize, offset)
    offset += 4
    entryData.writeUInt32LE(entry.offset, offset)
    
    return new Uint8Array(entryData)
  }

  /**
   * Verify QPK bundle integrity
   */
  async verifyBundle(qpkPath: string): Promise<{ valid: boolean; errors: string[] }> {
    try {
      const { manifest, assets } = await this.readBundle(qpkPath)
      const errors: string[] = []
      
      // Check manifest validity
      if (!manifest || typeof manifest !== 'object') {
        errors.push('Invalid or missing manifest')
      }
      
      // Check for required manifest fields
      const requiredFields = ['version', 'bundler', 'created', 'format', 'assets']
      for (const field of requiredFields) {
        if (!(field in manifest)) {
          errors.push(`Missing manifest field: ${field}`)
        }
      }
      
      // Check format
      if (manifest.format !== 'qpk') {
        errors.push(`Wrong format in manifest: ${manifest.format}`)
      }
      
      return {
        valid: errors.length === 0,
        errors
      }
    } catch (error) {
      return {
        valid: false,
        errors: [`Failed to verify bundle: ${error.message}`]
      }
    }
  }
}