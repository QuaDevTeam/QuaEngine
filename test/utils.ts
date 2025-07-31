import { randomBytes } from 'node:crypto'
import { join } from 'node:path'
import { writeFile, mkdir } from 'node:fs/promises'
import type { BundleManifest, AssetType } from '@quajs/assets'

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
    if (!acc[asset.type][asset.subType]) {
      acc[asset.type][asset.subType] = {}
    }
    
    acc[asset.type][asset.subType][asset.name] = {
      size: asset.size,
      hash: `hash-${asset.name}`,
      locales: [asset.locale],
      version: 1
    }
    return acc
  }, {} as any)

  return {
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
      algorithm: 'lzma',
      level: 6
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
export function createMockQPKBundle(assets: TestAsset[]): ArrayBuffer {
  // Create a simple QPK bundle structure for testing
  const encoder = new TextEncoder()
  const chunks: Uint8Array[] = []
  
  // QPK Header
  // Magic number: 'QPK\0' (0x51504B00)
  const header = new ArrayBuffer(20)
  const headerView = new DataView(header)
  headerView.setUint32(0, 0x51504B00, true) // Magic
  headerView.setUint32(4, 1, true) // Version
  headerView.setUint32(8, 1, true) // Compression type (LZMA)
  headerView.setUint32(12, 0, true) // Encryption flags
  headerView.setUint32(16, assets.length, true) // File count
  
  chunks.push(new Uint8Array(header))
  
  // File entries
  for (const asset of assets) {
    const nameBytes = encoder.encode(asset.name)
    const contentBytes = typeof asset.content === 'string'
      ? encoder.encode(asset.content)
      : asset.content
    
    // File entry header
    const entryHeader = new ArrayBuffer(12)
    const entryView = new DataView(entryHeader)
    entryView.setUint32(0, nameBytes.length, true) // Name length
    entryView.setUint32(4, contentBytes.length, true) // Compressed size
    entryView.setUint32(8, contentBytes.length, true) // Uncompressed size
    
    chunks.push(new Uint8Array(entryHeader))
    chunks.push(nameBytes)
    chunks.push(contentBytes)
  }
  
  // Combine all chunks
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