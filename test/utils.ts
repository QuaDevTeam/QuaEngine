import { randomBytes } from 'node:crypto'
import { join } from 'node:path'
import { writeFile, mkdir } from 'node:fs/promises'
import type { AssetInfo, AssetType, BundleManifest } from '@quajs/assets'

export interface TestAsset {
  name: string
  type: AssetType
  subType: string
  locale: string
  content: string | Uint8Array
  size: number
}

export interface TestBundle {
  name: string
  version: number
  buildNumber: string
  assets: TestAsset[]
  manifest: BundleManifest
}

/**
 * Create mock test assets
 */
export function createMockAssets(): TestAsset[] {
  return [
    {
      name: 'character1.png',
      type: 'characters',
      subType: 'main',
      locale: 'default',
      content: new Uint8Array(Buffer.from('mock-png-data', 'utf-8')),
      size: 13
    },
    {
      name: 'background1.jpg',
      type: 'images',
      subType: 'backgrounds',
      locale: 'default',
      content: new Uint8Array(Buffer.from('mock-jpg-data', 'utf-8')),
      size: 13
    },
    {
      name: 'script1.js',
      type: 'scripts',
      subType: 'scenes',
      locale: 'default',
      content: 'console.log("Hello from script1");',
      size: 35
    },
    {
      name: 'script1.en.js',
      type: 'scripts',
      subType: 'scenes',
      locale: 'en-us',
      content: 'console.log("Hello from English script1");',
      size: 42
    },
    {
      name: 'music1.mp3',
      type: 'audio',
      subType: 'background',
      locale: 'default',
      content: new Uint8Array(Buffer.from('mock-mp3-data', 'utf-8')),
      size: 13
    },
    {
      name: 'data.json',
      type: 'data',
      subType: 'config',
      locale: 'default',
      content: '{"version": "1.0", "name": "test-game"}',
      size: 38
    }
  ]
}

/**
 * Create a mock bundle manifest
 */
export function createMockManifest(assets: TestAsset[], bundleName: string, version: number): BundleManifest {
  const locales = Array.from(new Set(assets.map(a => a.locale)))
  const assetsByType = assets.reduce((acc, asset) => {
    if (!acc[asset.type]) {
      acc[asset.type] = {}
    }

    const relativePath = `${asset.type}/${asset.subType}/${asset.name}`
    acc[asset.type]![relativePath] = {
      name: asset.name,
      path: relativePath,
      relativePath,
      size: asset.size,
      hash: '',
      type: asset.type,
      locales: [asset.locale],
      version: 1,
    }
    return acc
  }, {} as Partial<Record<AssetType, Record<string, AssetInfo>>>)

  return {
    name: bundleName,
    version: '1.0',
    bundler: 'quack-test',
    created: new Date().toISOString(),
    format: 'qpk',
    bundleVersion: version,
    buildNumber: `build-${Date.now()}`,
    merkleRoot: 'mock-merkle-root',
    locales,
    defaultLocale: 'default',
    assets: assetsByType,
    totalFiles: assets.length,
    totalSize: assets.reduce((sum, a) => sum + a.size, 0),
    compression: {
      algorithm: 'none',
    },
    encryption: {
      enabled: false,
      algorithm: 'none'
    }
  }
}

/**
 * Create a temporary test directory with assets
 */
export async function createTestAssetDirectory(tempDir: string, assets: TestAsset[]): Promise<string> {
  await mkdir(tempDir, { recursive: true })
  
  for (const asset of assets) {
    const assetDir = join(tempDir, asset.type, asset.subType)
    await mkdir(assetDir, { recursive: true })
    
    const content = typeof asset.content === 'string' 
      ? asset.content 
      : Buffer.from(asset.content)
    
    await writeFile(join(assetDir, asset.name), content)
  }
  
  return tempDir
}

/**
 * Create mock QPK bundle data
 */
export function createMockQPKBundle(
  assets: TestAsset[],
  manifestOverrides: Partial<BundleManifest> = {},
): Uint8Array {
  const manifest = {
    ...createMockManifest(assets, manifestOverrides.name || 'test-bundle', manifestOverrides.bundleVersion || 1),
    ...manifestOverrides,
  }
  const entries = assets.map((asset) => {
    const pathBytes = utf8(`assets/${asset.type}/${asset.subType}/${asset.name}`)
    const contentBytes = typeof asset.content === 'string'
      ? utf8(asset.content)
      : asset.content
    const entry = new Uint8Array(4 + pathBytes.byteLength + 4 + contentBytes.byteLength)
    const view = new DataView(entry.buffer)

    view.setUint32(0, pathBytes.byteLength, true)
    entry.set(pathBytes, 4)
    view.setUint32(4 + pathBytes.byteLength, contentBytes.byteLength, true)
    entry.set(contentBytes, 4 + pathBytes.byteLength + 4)

    return entry
  })
  const dataSection = concatBytes(entries)
  const manifestBytes = utf8(JSON.stringify(manifest))
  const headerSize = 32
  const bytes = new Uint8Array(headerSize + dataSection.byteLength + manifestBytes.byteLength)
  const view = new DataView(bytes.buffer)

  view.setUint32(0, 0x51504B00, false)
  view.setUint32(4, 1, true)
  view.setUint32(8, 0, true)
  view.setUint32(12, headerSize, true)
  setUint64LE(view, 16, headerSize + dataSection.byteLength)
  setUint64LE(view, 24, manifestBytes.byteLength)
  bytes.set(dataSection, headerSize)
  bytes.set(manifestBytes, headerSize + dataSection.byteLength)

  return bytes
}

/**
 * Create mock ZIP bundle data
 */
export function createMockZIPBundle(assets: TestAsset[]): ArrayBuffer {
  // This is a simplified ZIP structure for testing
  // In real implementation, you'd use a proper ZIP library
  const encoder = new TextEncoder()
  const chunks: Uint8Array[] = []
  
  // Simple ZIP header (PK signature)
  const zipHeader = new Uint8Array([0x50, 0x4B, 0x03, 0x04])
  chunks.push(zipHeader)
  
  for (const asset of assets) {
    const nameBytes = encoder.encode(asset.name)
    const contentBytes = typeof asset.content === 'string'
      ? encoder.encode(asset.content)
      : asset.content
    
    chunks.push(nameBytes)
    chunks.push(contentBytes)
  }
  
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
  const result = new Uint8Array(totalLength)
  let offset = 0
  
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.length
  }
  
  return result.buffer
}

/**
 * Generate random test data
 */
export function generateRandomData(size: number): Uint8Array {
  return new Uint8Array(randomBytes(size))
}

/**
 * Create a mock compressed data for LZMA testing
 */
export function createMockLZMAData(originalData: string): Uint8Array {
  // This creates mock LZMA-compressed data for testing
  // In real tests, you'd use actual LZMA compression
  const encoder = new TextEncoder()
  const original = encoder.encode(originalData)
  
  // Mock LZMA header + compressed data
  const mockCompressed = new Uint8Array(original.length + 8)
  mockCompressed.set([0x5D, 0x00, 0x00, 0x80, 0x00], 0) // Mock LZMA header
  mockCompressed.set(original, 8)
  
  return mockCompressed
}

function concatBytes(chunks: Uint8Array[]): Uint8Array {
  const result = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0))
  let offset = 0

  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.byteLength
  }

  return result
}

function setUint64LE(view: DataView, offset: number, value: number): void {
  view.setUint32(offset, value >>> 0, true)
  view.setUint32(offset + 4, Math.floor(value / 2 ** 32), true)
}

function utf8(value: string): Uint8Array {
  return new TextEncoder().encode(value)
}
