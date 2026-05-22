import type { AssetContext, AssetInfo, BundleManifest, CompressionAlgorithm, EncryptionAlgorithm, EncryptionPlugin, QuackPlugin } from '../core/types'
import { createWriteStream } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { createLogger } from '@quajs/logger'
import * as lzma from 'lzma-native'
import { EncryptionManager } from '../crypto/encryption'
import { readQpkBundle } from '../qpk-reader'
import { getErrorMessage } from '../utils/error'

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

interface QPKFlags {
  compressed: boolean
  encrypted: boolean
}

export class QPKBundler {
  private encryptionAlgorithm: EncryptionAlgorithm
  private encryptionKey?: string
  private encryptionPlugin?: EncryptionPlugin
  private plugins: QuackPlugin[]
  private encryptionManager: EncryptionManager

  constructor(
    plugins: QuackPlugin[] = [],
    encryptionAlgorithm: EncryptionAlgorithm = 'none',
    encryptionKey?: string,
    encryptionPlugin?: EncryptionPlugin,
  ) {
    this.encryptionAlgorithm = encryptionAlgorithm
    this.encryptionKey = encryptionKey
    this.encryptionPlugin = encryptionPlugin
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
    } = {
      compress: manifest.compression.algorithm !== 'none',
      encrypt: manifest.encryption.enabled,
    },
  ): Promise<void> {
    logger.info(`Creating QPK bundle: ${outputPath}`)

    this.validateManifestOptions(manifest)

    // Validate encryption configuration
    this.encryptionManager.logConfigurationWarnings()
    const validation = this.encryptionManager.validateConfiguration()
    if (options.encrypt && !validation.valid) {
      throw new Error(`Invalid QPK encryption configuration: ${validation.errors.join('; ')}`)
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
      await this.endStream(outputStream)

      logger.info(`QPK bundle created successfully: ${outputPath}`)
    }
    catch (error) {
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
      }
      catch (error) {
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
    const buffer = await readAssetBuffer(asset)

    // Create asset context for plugins
    const context: AssetContext = {
      asset,
      buffer,
      metadata: {},
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
    options: { compress: boolean, encrypt: boolean },
  ): Promise<Buffer> {
    let manifestBuffer: Buffer<ArrayBufferLike> = Buffer.from(JSON.stringify(manifest, null, 2), 'utf8')

    // Compress if requested
    if (options.compress) {
      const algorithm = manifest.compression?.algorithm ?? 'lzma'
      if (algorithm !== 'lzma') {
        throw new Error(`QPK compression only supports lzma, received ${algorithm}`)
      }

      manifestBuffer = await this.compressBuffer(manifestBuffer)
      logger.debug(`Manifest compressed: ${manifestBuffer.length} bytes`)
    }

    // Encrypt if requested and properly configured
    if (options.encrypt && this.encryptionManager.isEncryptionAvailable()) {
      manifestBuffer = await this.encryptionManager.encrypt(manifestBuffer, { type: 'manifest' })
      logger.debug(`Manifest encrypted: ${manifestBuffer.length} bytes`)
    }
    else if (options.encrypt) {
      throw new Error('QPK encryption requested but encryption is not available')
    }

    return manifestBuffer
  }

  private validateManifestOptions(manifest: BundleManifest): void {
    const compressionAlgorithm = manifest.compression?.algorithm
    const validCompressionAlgorithms: CompressionAlgorithm[] = ['none', 'lzma']
    if (!validCompressionAlgorithms.includes(compressionAlgorithm)) {
      throw new Error(`Invalid QPK compression algorithm: ${compressionAlgorithm}`)
    }

    const encryptionAlgorithm = manifest.encryption?.algorithm
    const validEncryptionAlgorithms: EncryptionAlgorithm[] = ['none', 'xor', 'custom']
    if (!validEncryptionAlgorithms.includes(encryptionAlgorithm)) {
      throw new Error(`Invalid QPK encryption algorithm: ${encryptionAlgorithm}`)
    }
  }

  /**
   * Create QPK header
   */
  private createHeader(
    flags: QPKFlags,
    manifestOffset: bigint,
    manifestSize: bigint,
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
    if (flags.compressed)
      flagsValue |= 1
    if (flags.encrypted)
      flagsValue |= 2
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
  private createFlags(options: { compress: boolean, encrypt: boolean }): QPKFlags {
    return {
      compressed: options.compress,
      encrypted: options.encrypt,
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
    const result = await lzma.compress(buffer, { preset: 6 })
    return Buffer.from(result)
  }

  /**
   * Write buffer to stream
   */
  private async writeBuffer(stream: NodeJS.WritableStream, buffer: Buffer): Promise<void> {
    return new Promise((resolve, reject) => {
      stream.write(buffer, (error) => {
        if (error) {
          reject(error)
        }
        else {
          resolve()
        }
      })
    })
  }

  private async endStream(stream: NodeJS.WritableStream): Promise<void> {
    return new Promise((resolve, reject) => {
      stream.once('finish', resolve)
      stream.once('error', reject)
      stream.end()
    })
  }

  /**
   * Read QPK bundle
   */
  async readBundle(qpkPath: string): Promise<{ manifest: BundleManifest, assets: Map<string, Buffer> }> {
    logger.info(`Reading QPK bundle: ${qpkPath}`)
    const { assets, manifest } = await readQpkBundle(qpkPath, {
      encryptionAlgorithm: this.encryptionAlgorithm,
      encryptionKey: this.encryptionKey,
      encryptionPlugin: this.encryptionPlugin,
    })
    logger.info(`Read QPK bundle with ${assets.size} assets`)
    return { manifest, assets }
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
      'utf8',
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
   * Verify QPK bundle integrity
   */
  async verifyBundle(qpkPath: string): Promise<{ valid: boolean, errors: string[] }> {
    try {
      const { manifest, assets: _assets } = await this.readBundle(qpkPath)
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
        errors,
      }
    }
    catch (error) {
      return {
        valid: false,
        errors: [`Failed to verify bundle: ${getErrorMessage(error)}`],
      }
    }
  }
}

async function readAssetBuffer(asset: AssetInfo): Promise<Buffer> {
  if (asset.content) {
    return Buffer.isBuffer(asset.content) ? asset.content : Buffer.from(asset.content)
  }

  try {
    return await readFile(asset.path)
  }
  catch (error: any) {
    if (error?.code === 'ENOENT') {
      throw new Error(`File not found: ${asset.path}`)
    }
    throw error
  }
}
