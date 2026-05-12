import type { AssetContext, QuackConfig } from '../core/types'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { extname, join } from 'node:path'
import { deflateSync, inflateSync } from 'node:zlib'
import { createLogger } from '@quajs/logger'
import { QuackPlugin } from '../core/types'

const logger = createLogger('quack:plugins:image-optimization')

export type ImageOptimizationFormat = 'png' | 'jpeg' | 'webp' | 'avif'

export interface PngquantOptions {
  enabled?: boolean
  binary?: string
  quality?: [number, number]
  speed?: number
  strip?: boolean
  timeoutMs?: number
}

export interface ImageOptimizationPluginOptions {
  quality?: number
  progressive?: boolean
  enabled?: boolean
  stripMetadata?: boolean
  sharp?: boolean
  pngquant?: boolean | PngquantOptions
  formats?: Partial<Record<ImageOptimizationFormat, boolean>>
  effort?: number
  pngPalette?: boolean
  skipAnimated?: boolean
  minSavedBytes?: number
  minSavedRatio?: number
}

interface NormalizedPngquantOptions {
  enabled: boolean
  binary: string
  quality: [number, number]
  speed: number
  strip: boolean
  timeoutMs: number
}

interface OptimizationCandidate {
  optimizer: string
  buffer: Buffer
  lossy: boolean
}

interface PngChunk {
  type: string
  data: Buffer
  raw: Buffer
}

type SharpFactory = typeof import('sharp')

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])
const STRIPPABLE_PNG_CHUNKS = new Set(['tEXt', 'zTXt', 'iTXt', 'tIME', 'eXIf'])

export class ImageOptimizationPlugin extends QuackPlugin {
  name = 'image-optimization'
  version = '1.0.0'

  private quality: number
  private progressive: boolean
  private enabled: boolean
  private stripMetadata: boolean
  private useSharp: boolean
  private pngquant: NormalizedPngquantOptions
  private formats: Record<ImageOptimizationFormat, boolean>
  private effort: number
  private pngPalette: boolean
  private skipAnimated: boolean
  private minSavedBytes: number
  private minSavedRatio: number
  private warnedSharpUnavailable = false
  private warnedPngquantUnavailable = false
  private sharpModule?: SharpFactory | null

  constructor(options: ImageOptimizationPluginOptions = {}) {
    super()
    this.quality = clampInteger(options.quality ?? 85, 1, 100)
    this.progressive = options.progressive ?? true
    this.enabled = options.enabled ?? true
    this.stripMetadata = options.stripMetadata ?? true
    this.useSharp = options.sharp ?? true
    this.pngquant = normalizePngquantOptions(options.pngquant)
    this.formats = {
      png: true,
      jpeg: true,
      webp: true,
      avif: true,
      ...options.formats,
    }
    this.effort = clampInteger(options.effort ?? 6, 1, 9)
    this.pngPalette = options.pngPalette ?? true
    this.skipAnimated = options.skipAnimated ?? true
    this.minSavedBytes = Math.max(1, Math.floor(options.minSavedBytes ?? 1))
    this.minSavedRatio = Math.max(0, options.minSavedRatio ?? 0)
  }

  async initialize(_config: QuackConfig): Promise<void> {
    if (!this.enabled) {
      logger.info('Image optimization plugin disabled')
      return
    }

    const enabledFormats = Object.entries(this.formats)
      .filter(([, enabled]) => enabled)
      .map(([format]) => format)
      .join(', ')

    logger.info(
      `Image optimization plugin initialized (quality: ${this.quality}, formats: ${enabledFormats}, sharp: ${this.useSharp}, pngquant: ${this.pngquant.enabled})`,
    )
  }

  async processAsset(context: AssetContext): Promise<void> {
    if (!this.enabled || !isImageAssetContext(context)) {
      return
    }

    const { asset, buffer } = context
    const format = this.detectFormat(asset.mimeType, asset.name)

    if (!format || !this.formats[format]) {
      return
    }

    if (this.skipAnimated && asset.mediaMetadata && 'animated' in asset.mediaMetadata && asset.mediaMetadata.animated) {
      return
    }

    try {
      const originalSize = buffer.length
      const best = await this.optimizeImage(buffer, format, asset.relativePath)

      if (!best || !this.isWorthKeeping(originalSize, best.buffer.length)) {
        return
      }

      const savedBytes = originalSize - best.buffer.length
      context.buffer = best.buffer
      context.asset.size = best.buffer.length
      context.asset.hash = calculateHash(best.buffer)
      context.asset.content = best.buffer
      context.metadata.optimized = true
      context.metadata.optimizer = best.optimizer
      context.metadata.originalSize = originalSize
      context.metadata.optimizedSize = best.buffer.length
      context.metadata.savedBytes = savedBytes
      context.metadata.savedRatio = savedBytes / originalSize
      context.metadata.lossy = best.lossy
      context.metadata.imageFormat = format

      logger.debug(
        `Optimized image: ${asset.relativePath} via ${best.optimizer} (saved ${savedBytes} bytes)`,
      )
    }
    catch (error) {
      logger.warn(`Failed to optimize image: ${asset.relativePath}`, error)
    }
  }

  private async optimizeImage(
    buffer: Buffer,
    format: ImageOptimizationFormat,
    relativePath: string,
  ): Promise<OptimizationCandidate | undefined> {
    const candidates: OptimizationCandidate[] = []

    if (format === 'png' && this.pngquant.enabled) {
      const pngquantResult = await this.optimizeWithPngquant(buffer, relativePath)
      if (pngquantResult) {
        candidates.push(pngquantResult)
      }
    }

    const sharpResult = await this.optimizeWithSharp(buffer, format)
    if (sharpResult) {
      candidates.push(sharpResult)
    }

    if (format === 'png') {
      const losslessResult = this.optimizePngLosslessly(buffer)
      if (losslessResult) {
        candidates.push(losslessResult)
      }
    }

    return candidates
      .filter(candidate => this.isWorthKeeping(buffer.length, candidate.buffer.length))
      .sort((left, right) => left.buffer.length - right.buffer.length)[0]
  }

  private async optimizeWithSharp(
    buffer: Buffer,
    format: ImageOptimizationFormat,
  ): Promise<OptimizationCandidate | undefined> {
    if (!this.useSharp) {
      return undefined
    }

    const sharp = await this.loadSharp()
    if (!sharp) {
      return undefined
    }

    try {
      let pipeline = sharp(buffer, {
        animated: false,
        failOn: 'none',
      })

      if (!this.stripMetadata) {
        pipeline = pipeline.withMetadata()
      }

      if (format === 'png') {
        return {
          optimizer: 'sharp-png',
          buffer: await pipeline.png({
            adaptiveFiltering: true,
            compressionLevel: 9,
            effort: clampInteger(this.effort, 1, 10),
            palette: this.pngPalette,
            quality: this.quality,
          }).toBuffer(),
          lossy: this.pngPalette,
        }
      }

      if (format === 'jpeg') {
        return {
          optimizer: 'sharp-jpeg',
          buffer: await pipeline.jpeg({
            quality: this.quality,
            progressive: this.progressive,
            mozjpeg: true,
          }).toBuffer(),
          lossy: true,
        }
      }

      if (format === 'webp') {
        return {
          optimizer: 'sharp-webp',
          buffer: await pipeline.webp({
            effort: clampInteger(this.effort, 0, 6),
            quality: this.quality,
          }).toBuffer(),
          lossy: true,
        }
      }

      return {
        optimizer: 'sharp-avif',
        buffer: await pipeline.avif({
          effort: clampInteger(this.effort, 0, 9),
          quality: this.quality,
        }).toBuffer(),
        lossy: true,
      }
    }
    catch (error) {
      logger.debug(`sharp skipped ${format} image: ${getErrorMessage(error)}`)
      return undefined
    }
  }

  private async optimizeWithPngquant(
    buffer: Buffer,
    relativePath: string,
  ): Promise<OptimizationCandidate | undefined> {
    const directory = await mkdtemp(join(tmpdir(), 'quack-pngquant-'))
    const inputPath = join(directory, 'input.png')
    const outputPath = join(directory, 'output.png')

    try {
      await writeFile(inputPath, buffer)
      const args = [
        '--force',
        '--output',
        outputPath,
        `--quality=${this.pngquant.quality[0]}-${this.pngquant.quality[1]}`,
        `--speed=${this.pngquant.speed}`,
      ]

      if (this.pngquant.strip) {
        args.push('--strip')
      }

      args.push('--', inputPath)

      await runCommand(this.pngquant.binary, args, this.pngquant.timeoutMs)
      const optimized = await readFile(outputPath)

      return {
        optimizer: 'pngquant',
        buffer: optimized,
        lossy: true,
      }
    }
    catch (error) {
      if (isCommandMissing(error)) {
        this.warnPngquantUnavailable()
        return undefined
      }

      logger.debug(`pngquant skipped ${relativePath}: ${getErrorMessage(error)}`)
      return undefined
    }
    finally {
      await rm(directory, { recursive: true, force: true })
    }
  }

  private optimizePngLosslessly(buffer: Buffer): OptimizationCandidate | undefined {
    const chunks = parsePngChunks(buffer)
    if (!chunks || chunks.some(chunk => chunk.type === 'acTL')) {
      return undefined
    }

    const idatChunks = chunks.filter(chunk => chunk.type === 'IDAT')
    if (idatChunks.length === 0) {
      return undefined
    }

    const idatData = Buffer.concat(idatChunks.map(chunk => chunk.data))
    const inflated = inflateSync(idatData)
    const recompressedIdat = deflateSync(inflated, { level: 9 })
    const outputChunks: Buffer[] = []
    let wroteIdat = false

    for (const chunk of chunks) {
      if (chunk.type === 'IDAT') {
        if (!wroteIdat) {
          outputChunks.push(createPngChunk('IDAT', recompressedIdat))
          wroteIdat = true
        }
        continue
      }

      if (this.stripMetadata && STRIPPABLE_PNG_CHUNKS.has(chunk.type)) {
        continue
      }

      outputChunks.push(chunk.raw)
    }

    return {
      optimizer: 'png-lossless',
      buffer: Buffer.concat([PNG_SIGNATURE, ...outputChunks]),
      lossy: false,
    }
  }

  private async loadSharp(): Promise<SharpFactory | null> {
    if (this.sharpModule !== undefined) {
      return this.sharpModule
    }

    try {
      const module = await import('sharp')
      this.sharpModule = (module as unknown as { default: SharpFactory }).default
    }
    catch {
      this.warnSharpUnavailable()
      this.sharpModule = null
    }

    return this.sharpModule
  }

  private detectFormat(mimeType: string | undefined, assetName: string): ImageOptimizationFormat | null {
    if (mimeType === 'image/png') {
      return 'png'
    }
    if (mimeType === 'image/jpeg') {
      return 'jpeg'
    }
    if (mimeType === 'image/webp') {
      return 'webp'
    }
    if (mimeType === 'image/avif') {
      return 'avif'
    }

    const extension = extname(assetName).toLowerCase()
    if (extension === '.png') {
      return 'png'
    }
    if (extension === '.jpg' || extension === '.jpeg') {
      return 'jpeg'
    }
    if (extension === '.webp') {
      return 'webp'
    }
    if (extension === '.avif') {
      return 'avif'
    }

    return null
  }

  private isWorthKeeping(originalSize: number, optimizedSize: number): boolean {
    if (optimizedSize >= originalSize) {
      return false
    }

    const savedBytes = originalSize - optimizedSize
    return savedBytes >= this.minSavedBytes && savedBytes / originalSize >= this.minSavedRatio
  }

  private warnSharpUnavailable(): void {
    if (this.warnedSharpUnavailable) {
      return
    }

    this.warnedSharpUnavailable = true
    logger.warn('sharp is unavailable; only built-in PNG lossless optimization can run')
  }

  private warnPngquantUnavailable(): void {
    if (this.warnedPngquantUnavailable) {
      return
    }

    this.warnedPngquantUnavailable = true
    logger.warn(`pngquant binary not found: ${this.pngquant.binary}`)
  }
}

function normalizePngquantOptions(options: boolean | PngquantOptions | undefined): NormalizedPngquantOptions {
  const enabled = typeof options === 'boolean' ? options : options?.enabled ?? false
  const config = typeof options === 'object' ? options : {}

  return {
    enabled,
    binary: config.binary ?? 'pngquant',
    quality: normalizePngquantQuality(config.quality),
    speed: clampInteger(config.speed ?? 3, 1, 11),
    strip: config.strip ?? true,
    timeoutMs: Math.max(1000, config.timeoutMs ?? 30000),
  }
}

function normalizePngquantQuality(quality: [number, number] | undefined): [number, number] {
  const minimum = clampInteger(quality?.[0] ?? 65, 0, 100)
  const maximum = clampInteger(quality?.[1] ?? 90, 0, 100)
  return minimum <= maximum ? [minimum, maximum] : [maximum, minimum]
}

function isImageAssetContext(context: AssetContext): boolean {
  if (context.asset.type !== 'images' && context.asset.type !== 'characters') {
    return false
  }

  if (context.asset.mimeType === 'image/svg+xml') {
    return false
  }

  if (context.asset.mimeType?.startsWith('image/') === true) {
    return true
  }

  const extension = extname(context.asset.name).toLowerCase()
  return extension === '.png'
    || extension === '.jpg'
    || extension === '.jpeg'
    || extension === '.webp'
    || extension === '.avif'
}

function calculateHash(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex')
}

function parsePngChunks(buffer: Buffer): PngChunk[] | null {
  if (buffer.length < PNG_SIGNATURE.length || !buffer.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
    return null
  }

  const chunks: PngChunk[] = []
  let offset = PNG_SIGNATURE.length

  while (offset + 12 <= buffer.length) {
    const chunkStart = offset
    const length = buffer.readUInt32BE(offset)
    offset += 4

    if (offset + 4 + length + 4 > buffer.length) {
      return null
    }

    const type = buffer.subarray(offset, offset + 4).toString('ascii')
    offset += 4
    const data = buffer.subarray(offset, offset + length)
    offset += length
    offset += 4

    chunks.push({
      type,
      data,
      raw: buffer.subarray(chunkStart, offset),
    })

    if (type === 'IEND') {
      return chunks
    }
  }

  return null
}

function createPngChunk(type: string, data: Buffer): Buffer {
  const typeBuffer = Buffer.from(type, 'ascii')
  const lengthBuffer = Buffer.alloc(4)
  lengthBuffer.writeUInt32BE(data.length, 0)

  const crcBuffer = Buffer.alloc(4)
  crcBuffer.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0)

  return Buffer.concat([lengthBuffer, typeBuffer, data, crcBuffer])
}

let crcTable: number[] | undefined

function crc32(buffer: Buffer): number {
  const table = getCrcTable()
  let crc = 0xFFFFFFFF

  for (const byte of buffer) {
    crc = table[(crc ^ byte) & 0xFF] ^ (crc >>> 8)
  }

  return (crc ^ 0xFFFFFFFF) >>> 0
}

function getCrcTable(): number[] {
  if (crcTable) {
    return crcTable
  }

  crcTable = Array.from({ length: 256 }, (_, index) => {
    let value = index
    for (let bit = 0; bit < 8; bit++) {
      value = value & 1 ? 0xEDB88320 ^ (value >>> 1) : value >>> 1
    }
    return value >>> 0
  })

  return crcTable
}

function runCommand(command: string, args: string[], timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ['ignore', 'ignore', 'pipe'],
    })

    let stderr = ''
    let timedOut = false
    const timeout = setTimeout(() => {
      timedOut = true
      child.kill('SIGKILL')
    }, timeoutMs)

    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8')
    })

    child.once('error', (error) => {
      clearTimeout(timeout)
      reject(error)
    })

    child.once('close', (code) => {
      clearTimeout(timeout)

      if (timedOut) {
        reject(new Error(`${command} timed out after ${timeoutMs}ms`))
        return
      }

      if (code === 0) {
        resolve()
        return
      }

      reject(new Error(`${command} exited with code ${code}${stderr ? `: ${stderr.trim()}` : ''}`))
    })
  })
}

function isCommandMissing(error: unknown): boolean {
  return typeof error === 'object'
    && error !== null
    && 'code' in error
    && (error as NodeJS.ErrnoException).code === 'ENOENT'
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  return String(error)
}

function clampInteger(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)))
}
