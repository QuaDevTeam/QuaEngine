import type { AssetInfo, BundleManifest } from '../src/core/types'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { QPKBundler } from '../src/bundlers/qpk-bundler'
import { readQpkSummary } from '../src/qpk-reader'

describe('qPKBundler', () => {
  let qpkBundler: QPKBundler
  let tempDir: string

  beforeEach(async () => {
    qpkBundler = new QPKBundler()
    tempDir = join(tmpdir(), `qpk-bundler-test-${Date.now()}`)
    await mkdir(tempDir, { recursive: true })
  })

  afterEach(async () => {
    try {
      await rm(tempDir, { recursive: true, force: true })
    }
    catch {
      // Ignore cleanup errors
    }
  })

  describe('bundle Creation', () => {
    it('should create QPK bundle with correct header', async () => {
      const asset = await createTestAsset(tempDir, 'test.txt', 'test content')
      const manifest = createQpkManifest({ totalFiles: 1, totalSize: asset.size })
      const outputPath = join(tempDir, 'test.qpk')

      await qpkBundler.createBundle([asset], manifest, outputPath, { compress: false, encrypt: false })

      const bundle = await qpkBundler.readBundle(outputPath)
      expect(bundle.manifest.name).toBe('test-bundle')
      expect(bundle.assets.get('assets/scripts/test.txt')?.toString('utf8')).toBe('test content')
    })

    it('should handle LZMA compression option', async () => {
      const content = 'x'.repeat(1000)
      const asset = await createTestAsset(tempDir, 'large.txt', content)
      const manifest = createQpkManifest({
        name: 'large-bundle',
        compression: { algorithm: 'lzma', level: 1 },
        totalFiles: 1,
        totalSize: asset.size,
      })
      const outputPath = join(tempDir, 'large.qpk')

      await qpkBundler.createBundle([asset], manifest, outputPath, { compress: true, encrypt: false })

      const bundle = await qpkBundler.readBundle(outputPath)
      expect(bundle.manifest.compression.algorithm).toBe('lzma')
      expect(bundle.assets.get('assets/scripts/large.txt')?.toString('utf8')).toBe(content)
    })

    it('should reject DEFLATE compression for QPK bundles', async () => {
      const asset = await createTestAsset(tempDir, 'test.json', JSON.stringify({ test: true }))
      const manifest = createQpkManifest({
        name: 'test-json-bundle',
        compression: { algorithm: 'deflate', level: 1 },
        totalFiles: 1,
        totalSize: asset.size,
      })
      const outputPath = join(tempDir, 'test.qpk')

      await expect(
        qpkBundler.createBundle([asset], manifest, outputPath, { compress: true, encrypt: false }),
      ).rejects.toThrow('Invalid QPK compression algorithm: deflate')
    })

    it('should include file entries in correct format', async () => {
      const testContent = 'test file content'
      const asset = await createTestAsset(tempDir, 'entry.txt', testContent)
      const manifest = createQpkManifest({
        name: 'entry-bundle',
        totalFiles: 1,
        totalSize: asset.size,
      })
      const outputPath = join(tempDir, 'entry.qpk')

      await qpkBundler.createBundle([asset], manifest, outputPath, { compress: false, encrypt: false })

      const contents = await qpkBundler.listContents(outputPath)
      expect(contents).toContain('assets/scripts/entry.txt')
    })

    it('should read lightweight QPK summaries without asset bytes', async () => {
      const testContent = 'test file content'
      const asset = await createTestAsset(tempDir, 'summary.txt', testContent)
      const manifest = createQpkManifest({
        name: 'summary-bundle',
        totalFiles: 1,
        totalSize: asset.size,
      })
      const outputPath = join(tempDir, 'summary.qpk')

      await qpkBundler.createBundle([asset], manifest, outputPath, { compress: false, encrypt: false })
      const summary = await readQpkSummary(outputPath)

      expect(summary.locked).toBe(false)
      expect(summary.manifest?.name).toBe('summary-bundle')
      expect(summary.assets).toEqual([
        expect.objectContaining({ path: 'assets/scripts/summary.txt', size: Buffer.byteLength(testContent) }),
      ])
    })

    it('should report encrypted summaries as locked without a key', async () => {
      const asset = await createTestAsset(tempDir, 'locked.txt', 'locked content')
      const manifest = createQpkManifest({
        encryption: { enabled: true, algorithm: 'xor' },
        totalFiles: 1,
        totalSize: asset.size,
      })
      const outputPath = join(tempDir, 'locked.qpk')

      await new QPKBundler([], 'xor', 'secret-key').createBundle([asset], manifest, outputPath, { compress: false, encrypt: true })
      const summary = await readQpkSummary(outputPath)

      expect(summary.locked).toBe(true)
      expect(summary.manifest).toBeUndefined()
      expect(summary.assets[0]?.path).toBe('assets/scripts/locked.txt')
    })
  })

  describe('bundle Validation', () => {
    it('should validate asset paths exist', async () => {
      const assets: AssetInfo[] = [
        {
          name: 'missing.txt',
          path: join(tempDir, 'missing.txt'), // File doesn't exist
          relativePath: 'missing.txt',
          type: 'scripts',
          subType: 'logic',
          size: 0,
          hash: 'missing-hash',
          mtime: Date.now(),
          locales: ['default'],
        },
      ]

      const manifest = {
        name: 'missing-bundle',
        version: '1.0.0',
        bundler: 'quack',
        created: new Date().toISOString(),
        createdAt: Date.now(),
        format: 'qpk' as const,
        bundleVersion: 1,
        compression: {
          algorithm: 'none' as const,
          level: 0,
        },
        encryption: {
          enabled: false,
          algorithm: 'none' as const,
        },
        locales: ['default'],
        defaultLocale: 'default',
        assets: {} as any,
        totalSize: 0,
        totalFiles: 1,
      }

      const outputPath = join(tempDir, 'missing.qpk')
      await expect(
        qpkBundler.createBundle(assets, manifest, outputPath, { compress: false, encrypt: false }),
      ).rejects.toThrow('File not found')
    })

    it('should handle empty asset list', async () => {
      const manifest = createQpkManifest({
        name: 'empty-bundle',
        totalSize: 0,
        totalFiles: 0,
      })
      const outputPath = join(tempDir, 'empty.qpk')

      await qpkBundler.createBundle([], manifest, outputPath, { compress: false, encrypt: false })

      const bundle = await qpkBundler.readBundle(outputPath)
      expect(bundle.manifest.totalFiles).toBe(0)
      expect(bundle.assets.size).toBe(0)
    })
  })

  describe('error Handling', () => {
    it('should handle file read errors gracefully', async () => {
      const invalidAsset: AssetInfo[] = [
        {
          name: 'invalid.txt',
          path: '/invalid/path/file.txt',
          relativePath: 'invalid.txt',
          type: 'scripts',
          subType: 'logic',
          size: 100,
          hash: 'invalid-hash',
          mtime: Date.now(),
          locales: ['default'],
        },
      ]

      const manifest = {
        name: 'invalid-bundle',
        version: '1.0.0',
        bundler: 'quack',
        created: new Date().toISOString(),
        createdAt: Date.now(),
        format: 'qpk' as const,
        bundleVersion: 1,
        compression: {
          algorithm: 'none' as const,
          level: 0,
        },
        encryption: {
          enabled: false,
          algorithm: 'none' as const,
        },
        locales: ['default'],
        defaultLocale: 'default',
        assets: {} as any,
        totalSize: 100,
        totalFiles: 1,
      }

      const outputPath = join(tempDir, 'invalid.qpk')
      await expect(
        qpkBundler.createBundle(invalidAsset, manifest, outputPath, { compress: false, encrypt: false }),
      ).rejects.toThrow('File not found')
    })

    it('should validate compression options', async () => {
      const assets: AssetInfo[] = []

      const manifest = {
        name: 'invalid-compression-bundle',
        version: '1.0.0',
        bundler: 'quack',
        created: new Date().toISOString(),
        createdAt: Date.now(),
        format: 'qpk' as const,
        bundleVersion: 1,
        compression: {
          algorithm: 'invalid' as any,
          level: 0,
        },
        encryption: {
          enabled: false,
          algorithm: 'none' as const,
        },
        locales: ['default'],
        defaultLocale: 'default',
        assets: {} as any,
        totalSize: 0,
        totalFiles: 0,
      }

      const outputPath = join(tempDir, 'test.qpk')
      await expect(
        qpkBundler.createBundle(assets, manifest, outputPath, { compress: false, encrypt: false }),
      ).rejects.toThrow('compression')
    })

    it('should validate encryption options', async () => {
      const assets: AssetInfo[] = []

      const manifest = {
        name: 'invalid-encryption-bundle',
        version: '1.0.0',
        bundler: 'quack',
        created: new Date().toISOString(),
        createdAt: Date.now(),
        format: 'qpk' as const,
        bundleVersion: 1,
        compression: {
          algorithm: 'none' as const,
          level: 0,
        },
        encryption: {
          enabled: false,
          algorithm: 'invalid' as any,
        },
        locales: ['default'],
        defaultLocale: 'default',
        assets: {} as any,
        totalSize: 0,
        totalFiles: 0,
      }

      const outputPath = join(tempDir, 'test.qpk')
      await expect(
        qpkBundler.createBundle(assets, manifest, outputPath, { compress: false, encrypt: false }),
      ).rejects.toThrow('encryption')
    })
  })

  describe('performance', () => {
    it('should handle large numbers of assets efficiently', async () => {
      const assetCount = 50
      const assets: AssetInfo[] = []

      // Create many small test files
      for (let i = 0; i < assetCount; i++) {
        const fileName = `file-${i.toString().padStart(3, '0')}.txt`
        const filePath = join(tempDir, fileName)

        await writeFile(filePath, `content for file ${i}`)

        assets.push({
          name: fileName,
          path: filePath,
          relativePath: fileName,
          type: 'scripts',
          subType: 'logic',
          size: 20,
          hash: `hash-${i}`,
          mtime: Date.now(),
          locales: ['default'],
        })
      }

      const manifest = {
        name: 'many-files-bundle',
        version: '1.0.0',
        bundler: 'quack',
        created: new Date().toISOString(),
        createdAt: Date.now(),
        format: 'qpk' as const,
        bundleVersion: 1,
        compression: {
          algorithm: 'none' as const,
          level: 0,
        },
        encryption: {
          enabled: false,
          algorithm: 'none' as const,
        },
        locales: ['default'],
        defaultLocale: 'default',
        assets: {} as any,
        totalSize: assetCount * 20,
        totalFiles: assetCount,
      }

      const startTime = Date.now()

      const outputPath = join(tempDir, 'many-files.qpk')
      await qpkBundler.createBundle(assets, manifest, outputPath, { compress: false, encrypt: false })
      const endTime = Date.now()
      const bundle = await qpkBundler.readBundle(outputPath)

      expect(bundle.assets.size).toBe(assetCount)
      expect(endTime - startTime).toBeLessThan(5000)
    })
  })
})

async function createTestAsset(tempDir: string, fileName: string, content: string): Promise<AssetInfo> {
  const filePath = join(tempDir, fileName)
  await writeFile(filePath, content)

  return {
    name: fileName,
    path: filePath,
    relativePath: fileName,
    type: 'scripts',
    subType: 'logic',
    size: Buffer.byteLength(content),
    hash: `${fileName}-hash`,
    mtime: Date.now(),
    locales: ['default'],
  }
}

function createQpkManifest(overrides: Partial<BundleManifest> = {}): BundleManifest {
  return {
    name: 'test-bundle',
    version: '1.0.0',
    bundler: 'quack',
    created: new Date().toISOString(),
    createdAt: Date.now(),
    format: 'qpk',
    bundleVersion: 1,
    compression: {
      algorithm: 'none',
      level: 0,
    },
    encryption: {
      enabled: false,
      algorithm: 'none',
    },
    locales: ['default'],
    defaultLocale: 'default',
    assets: {
      images: {},
      characters: {},
      audio: {},
      video: {},
      fonts: {},
      scripts: {},
      data: {},
    },
    totalSize: 0,
    totalFiles: 0,
    ...overrides,
  }
}
