import type { BundleManifest, EncryptionAlgorithm, EncryptionPlugin } from './core/types'
import { open, stat } from 'node:fs/promises'
import { EncryptionManager } from './crypto/encryption'

const QPK_MAGIC = Buffer.from('QPK\0', 'ascii')
const QPK_VERSION = 1
const QPK_HEADER_SIZE = 32

export interface QpkReaderOptions {
  decompressLzma?: (data: Buffer) => Promise<Buffer | Uint8Array>
  encryptionAlgorithm?: EncryptionAlgorithm
  encryptionKey?: string
  encryptionPlugin?: EncryptionPlugin
}

export interface QpkHeaderInfo {
  encrypted: boolean
  compressed: boolean
  flags: number
  headerSize: number
  manifestOffset: number
  manifestSize: number
  reserved: number
  version: number
}

export interface QpkAssetSummary {
  dataOffset: number
  path: string
  size: number
}

export interface QpkReadSummary {
  assets: QpkAssetSummary[]
  errors: string[]
  header: QpkHeaderInfo
  locked: boolean
  manifest?: BundleManifest
}

export async function readQpkSummary(qpkPath: string, options: QpkReaderOptions = {}): Promise<QpkReadSummary> {
  const fileStats = await stat(qpkPath)
  const file = await open(qpkPath, 'r')
  try {
    const headerBuffer = Buffer.alloc(QPK_HEADER_SIZE)
    await file.read(headerBuffer, 0, QPK_HEADER_SIZE, 0)
    const header = parseQpkHeader(headerBuffer)
    validateQpkBounds(header, fileStats.size)
    const assets = await readQpkAssetSummary(file, header)
    const manifestResult = await readQpkManifest(file, header, options)

    return {
      assets,
      errors: manifestResult.errors,
      header,
      locked: manifestResult.locked,
      manifest: manifestResult.manifest,
    }
  }
  finally {
    await file.close()
  }
}

export async function readQpkBundle(qpkPath: string, options: QpkReaderOptions = {}): Promise<{ manifest: BundleManifest, assets: Map<string, Buffer> }> {
  const summary = await readQpkSummary(qpkPath, options)
  if (summary.errors.length > 0 && !summary.locked) {
    throw new Error(`Invalid QPK structure: ${summary.errors.join('; ')}`)
  }
  if (!summary.manifest) {
    throw new Error(summary.locked
      ? 'QPK manifest is encrypted and could not be decrypted'
      : `QPK manifest could not be read: ${summary.errors.join('; ') || 'unknown error'}`)
  }

  const assets = new Map<string, Buffer>()
  const file = await open(qpkPath, 'r')
  try {
    for (const asset of summary.assets) {
      const buffer = Buffer.alloc(asset.size)
      await file.read(buffer, 0, asset.size, asset.dataOffset)
      assets.set(asset.path, buffer)
    }
  }
  finally {
    await file.close()
  }

  return { manifest: summary.manifest, assets }
}

function parseQpkHeader(buffer: Buffer): QpkHeaderInfo {
  if (buffer.length < QPK_HEADER_SIZE) {
    throw new Error('Invalid QPK file: too small')
  }

  let offset = 0
  const magic = buffer.subarray(offset, offset + 4)
  offset += 4

  if (!magic.equals(QPK_MAGIC)) {
    throw new Error('Invalid QPK file: wrong magic number')
  }

  const version = buffer.readUInt32LE(offset)
  offset += 4
  if (version !== QPK_VERSION) {
    throw new Error(`Unsupported QPK version: ${version}`)
  }

  const flags = buffer.readUInt32LE(offset)
  offset += 4
  const headerSize = buffer.readUInt32LE(offset)
  offset += 4
  if (headerSize !== QPK_HEADER_SIZE) {
    throw new Error(`Invalid header size: ${headerSize}`)
  }

  const manifestOffset = Number(buffer.readBigUInt64LE(offset))
  offset += 8
  const manifestSize = Number(buffer.readBigUInt64LE(offset))
  offset += 8

  return {
    compressed: Boolean(flags & 1),
    encrypted: Boolean(flags & 2),
    flags,
    headerSize,
    manifestOffset,
    manifestSize,
    reserved: 0,
    version,
  }
}

function validateQpkBounds(header: QpkHeaderInfo, fileSize: number): void {
  if (!Number.isSafeInteger(header.manifestOffset) || !Number.isSafeInteger(header.manifestSize)) {
    throw new TypeError('Invalid QPK manifest bounds: offset or size exceeds safe integer range')
  }
  if (header.manifestOffset < header.headerSize || header.manifestSize < 0) {
    throw new Error('Invalid QPK manifest bounds')
  }
  if (header.manifestOffset > fileSize || header.manifestOffset + header.manifestSize > fileSize) {
    throw new Error('Invalid QPK manifest bounds')
  }
}

async function readQpkAssetSummary(file: Awaited<ReturnType<typeof open>>, header: QpkHeaderInfo): Promise<QpkAssetSummary[]> {
  const assets: QpkAssetSummary[] = []
  const seen = new Set<string>()
  let offset = header.headerSize

  while (offset < header.manifestOffset) {
    if (offset + 4 > header.manifestOffset) {
      throw new Error('Invalid QPK asset entry: missing path length')
    }
    const pathLengthBuffer = Buffer.alloc(4)
    await file.read(pathLengthBuffer, 0, 4, offset)
    const pathLength = pathLengthBuffer.readUInt32LE(0)
    offset += 4

    if (pathLength === 0 || offset + pathLength + 4 > header.manifestOffset) {
      throw new Error('Invalid QPK asset entry: path out of bounds')
    }
    const pathBuffer = Buffer.alloc(pathLength)
    await file.read(pathBuffer, 0, pathLength, offset)
    const path = pathBuffer.toString('utf8')
    if (!isSafeQpkPath(path)) {
      throw new Error(`Unsafe QPK asset path: ${path}`)
    }
    if (seen.has(path)) {
      throw new Error(`Duplicate QPK asset path: ${path}`)
    }
    seen.add(path)
    offset += pathLength

    const dataLengthBuffer = Buffer.alloc(4)
    await file.read(dataLengthBuffer, 0, 4, offset)
    const size = dataLengthBuffer.readUInt32LE(0)
    offset += 4
    if (offset + size > header.manifestOffset) {
      throw new Error(`Invalid QPK asset entry: ${path} data out of bounds`)
    }

    assets.push({
      dataOffset: offset,
      path,
      size,
    })
    offset += size
  }

  return assets
}

function isSafeQpkPath(path: string): boolean {
  if (!path || path.startsWith('/') || path.startsWith('\\') || /^[a-z]:/i.test(path)) {
    return false
  }
  const normalized = path.replace(/\\/g, '/')
  return normalized.split('/').every(segment => segment !== '' && segment !== '..')
}

async function readQpkManifest(
  file: Awaited<ReturnType<typeof open>>,
  header: QpkHeaderInfo,
  options: QpkReaderOptions,
): Promise<{ errors: string[], locked: boolean, manifest?: BundleManifest }> {
  let manifestBuffer: Buffer = Buffer.alloc(header.manifestSize)
  await file.read(manifestBuffer, 0, header.manifestSize, header.manifestOffset)

  if (header.encrypted) {
    const algorithm = options.encryptionAlgorithm || 'none'
    const encryptionManager = new EncryptionManager(algorithm, options.encryptionKey, options.encryptionPlugin)
    if (!encryptionManager.isEncryptionAvailable()) {
      return {
        errors: ['QPK manifest is encrypted and no decryption key or plugin was provided.'],
        locked: true,
      }
    }
    manifestBuffer = Buffer.from(await encryptionManager.decrypt(manifestBuffer, { type: 'manifest' }))
  }

  if (header.compressed) {
    try {
      manifestBuffer = Buffer.from(await decompressLzma(manifestBuffer, options))
    }
    catch (error) {
      return {
        errors: [error instanceof Error ? error.message : String(error)],
        locked: false,
      }
    }
  }

  try {
    return {
      errors: [],
      locked: false,
      manifest: JSON.parse(manifestBuffer.toString('utf8')) as BundleManifest,
    }
  }
  catch (error) {
    return {
      errors: [error instanceof Error ? error.message : String(error)],
      locked: false,
    }
  }
}

async function decompressLzma(buffer: Buffer, options: QpkReaderOptions): Promise<Buffer | Uint8Array> {
  if (options.decompressLzma) {
    return options.decompressLzma(buffer)
  }

  const lzma = await import('lzma-native')
  return lzma.decompress(buffer)
}
