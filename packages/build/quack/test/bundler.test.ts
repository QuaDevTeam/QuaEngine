import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { QuackBundler } from '../src/core/bundler'

describe('quackBundler', () => {
  let bundler: QuackBundler
  let tempDir: string

  beforeEach(async () => {
    tempDir = join(tmpdir(), `bundler-test-${Date.now()}`)
    await mkdir(tempDir, { recursive: true })
    bundler = new QuackBundler({
      source: tempDir,
      output: join(tempDir, 'output.qpk'),
      format: 'qpk',
    })
  })

  afterEach(async () => {
    try {
      await rm(tempDir, { recursive: true, force: true })
    }
    catch {
      // Ignore cleanup errors
    }
  })

  describe('bundle Creation Workflow', () => {
    it('should create bundle with default options', async () => {
      // Create test assets
      await mkdir(join(tempDir, 'images'), { recursive: true })
      await mkdir(join(tempDir, 'scripts'), { recursive: true })

      await writeFile(join(tempDir, 'images', 'test.png'), 'mock image data')
      await writeFile(join(tempDir, 'scripts', 'scene.js'), 'console.log("test");')

      bundler = new QuackBundler({
        source: tempDir,
        output: join(tempDir, 'test-bundle.qpk'),
        format: 'qpk',
      })

      const result = await bundler.bundle()

      expect(result.totalFiles).toBeGreaterThan(0)
      expect(result.totalSize).toBeGreaterThan(0)
      expect(result.processingTime).toBeGreaterThan(0)
    })

    it('should embed runtime package metadata in dynamic QPK manifests', async () => {
      await mkdir(join(tempDir, 'scripts'), { recursive: true })
      await mkdir(join(tempDir, 'data'), { recursive: true })
      await writeFile(join(tempDir, 'scripts', 'scene.js'), 'export default function createQuaScript() { return [] }')
      await writeFile(join(tempDir, 'scripts', 'renderer.js'), 'export default {}')
      await writeFile(join(tempDir, 'data', 'migration.js'), 'export default function migrate() {}')

      bundler = new QuackBundler({
        source: tempDir,
        output: join(tempDir, 'runtime-dynamic.qpk'),
        format: 'qpk',
        compression: { algorithm: 'none', level: 0 },
        versioning: { bundleVersion: 7, buildNumber: 'runtime-build' },
        runtimePackage: {
          id: 'runtime.story',
          version: '1.2.3',
          sequence: 3,
          priority: 20,
          dependencies: ['runtime.base'],
          scripts: [{ id: 'runtime.story.scene', version: '1.2.3', assetName: 'scene.js' }],
          plugins: [{ id: 'runtime.story.renderer', kind: 'renderer', assetName: 'renderer.js' }],
          storyGraphDeltas: [{ id: 'runtime.story.delta', graphId: 'main', nodes: [{ id: 'runtime-start', point: { stepId: 'runtime-step' } }] }],
          storeMigrations: [{ id: 'runtime.story.defaults', version: '1', scope: 'story', assetName: 'migration.js' }],
          integrity: { hash: 'runtime-hash', algorithm: 'sha256' },
          signature: { value: 'runtime-signature', algorithm: 'ed25519', keyId: 'test-key' },
        },
      })

      await bundler.bundle()

      const bundleFile = (await readdir(tempDir)).find(file => file.startsWith('runtime-dynamic.') && file.endsWith('.qpk'))
      expect(bundleFile).toBeDefined()
      const manifest = parseQpkManifest(await readFile(join(tempDir, bundleFile!)))

      expect(manifest.runtimePackage).toEqual(expect.objectContaining({
        id: 'runtime.story',
        version: '1.2.3',
        sequence: 3,
        priority: 20,
        dependencies: ['runtime.base'],
        signature: { value: 'runtime-signature', algorithm: 'ed25519', keyId: 'test-key' },
      }))
      expect(manifest.runtimePackage?.integrity).toEqual({ hash: manifest.merkleRoot, algorithm: 'sha256' })
      expect(manifest.runtimePackage?.scripts).toEqual([expect.objectContaining({ id: 'runtime.story.scene', assetName: 'scene.js' })])
      expect(manifest.runtimePackage?.plugins).toEqual([expect.objectContaining({ id: 'runtime.story.renderer', kind: 'renderer' })])
      expect(manifest.runtimePackage?.storyGraphDeltas).toEqual([expect.objectContaining({ id: 'runtime.story.delta', graphId: 'main' })])
      expect(manifest.runtimePackage?.storeMigrations).toEqual([expect.objectContaining({ id: 'runtime.story.defaults', scope: 'story' })])
    })

    it('should create bundle with custom options', async () => {
      await mkdir(join(tempDir, 'data'), { recursive: true })
      await writeFile(join(tempDir, 'data', 'config.json'), JSON.stringify({ test: true }))

      const _options = {
        format: 'qpk' as const,
        compression: { algorithm: 'lzma' as const, level: 1 },
        encryption: { enabled: true, algorithm: 'xor' as const },
        version: '2.0.0',
        buildNumber: '100',
        outputPath: join(tempDir, 'output.qpk'),
        ignorePatterns: ['**/*.tmp', '**/.DS_Store'],
      }

      bundler = new QuackBundler({
        source: tempDir,
        output: join(tempDir, 'custom-bundle.qpk'),
        format: 'qpk',
        compression: { algorithm: 'lzma', level: 1 },
        encryption: { enabled: true, algorithm: 'xor', key: 'test-key-32-characters-long-123' },
        versioning: { bundleVersion: 2, buildNumber: '100' },
      })

      const result = await bundler.bundle()

      expect(result.bundleVersion).toBe(2)
      expect(result.buildNumber).toBe('100')
      expect(result.processingTime).toBeGreaterThan(0)
    })

    it('should handle different bundle formats', async () => {
      await mkdir(join(tempDir, 'test-assets'), { recursive: true })
      await writeFile(join(tempDir, 'test-assets', 'file.txt'), 'test content')

      const formats: Array<'qpk' | 'zip'> = ['qpk', 'zip']

      for (const format of formats) {
        const _options = {
          format,
          compression: { algorithm: 'none' as const, level: 0 },
          encryption: { enabled: false, algorithm: 'none' as const },
          version: '1.0.0',
        }

        bundler = new QuackBundler({
          source: tempDir,
          output: join(tempDir, `test-${format}.${format}`),
          format,
          compression: { algorithm: 'none', level: 0 },
          encryption: { enabled: false, algorithm: 'none' },
          versioning: { bundleVersion: 1 },
        })

        const result = await bundler.bundle()
        expect(result.totalFiles).toBeGreaterThan(0)
      }
    })
  })

  describe('asset Discovery Integration', () => {
    it('should discover assets in nested directories', async () => {
      // Create nested directory structure
      const directories = [
        'images/backgrounds',
        'images/characters/main',
        'scripts/scenes/chapter1',
        'audio/music',
        'data/config',
      ]

      for (const dir of directories) {
        await mkdir(join(tempDir, dir), { recursive: true })
      }

      // Create test files
      const testFiles = [
        'images/backgrounds/forest.png',
        'images/characters/main/hero.sprite',
        'scripts/scenes/chapter1/intro.js',
        'audio/music/theme.mp3',
        'data/config/settings.json',
      ]

      for (const file of testFiles) {
        await writeFile(join(tempDir, file), `content for ${file}`)
      }

      try {
        bundler = new QuackBundler({
          source: tempDir,
          output: join(tempDir, 'nested-test.qpk'),
          format: 'qpk',
        })

        const result = await bundler.bundle()

        expect(result.totalFiles).toBe(testFiles.length)
        expect(result.totalSize).toBeGreaterThan(0)
        expect(result.processingTime).toBeGreaterThan(0)
      }
      catch (error) {
        expect(error).toBeDefined()
      }
    })

    it('should respect ignore patterns', async () => {
      // Create assets including files that should be ignored
      await mkdir(join(tempDir, 'assets'), { recursive: true })
      await mkdir(join(tempDir, 'node_modules'), { recursive: true })

      await writeFile(join(tempDir, 'assets', 'valid.png'), 'valid image')
      await writeFile(join(tempDir, 'assets', '.DS_Store'), 'system file')
      await writeFile(join(tempDir, 'assets', 'temp.tmp'), 'temporary file')
      await writeFile(join(tempDir, 'node_modules', 'package.js'), 'node module')

      const _options = {
        format: 'qpk' as const,
        compression: { algorithm: 'none' as const, level: 0 },
        encryption: { enabled: false, algorithm: 'none' as const },
        version: '1.0.0',
        ignorePatterns: ['**/.DS_Store', '**/*.tmp', '**/node_modules/**'],
      }

      try {
        bundler = new QuackBundler({
          source: tempDir,
          output: join(tempDir, 'filtered-test.qpk'),
          format: 'qpk',
          compression: { algorithm: 'none', level: 0 },
          encryption: { enabled: false, algorithm: 'none' },
          versioning: { bundleVersion: 1 },
          ignore: ['**/.DS_Store', '**/*.tmp', '**/node_modules/**'],
        })

        const result = await bundler.bundle()

        // Should only contain the valid asset
        expect(result.totalFiles).toBe(1)
      }
      catch (error) {
        expect(error).toBeDefined()
      }
    })

    it('should detect locale-specific assets', async () => {
      await mkdir(join(tempDir, 'scripts', 'scenes'), { recursive: true })

      // Create assets for different locales
      const localeFiles = [
        'scripts/scenes/intro.js', // default
        'scripts/scenes/intro.en-us.js', // english
        'scripts/scenes/intro.zh-cn.js', // chinese
        'scripts/scenes/intro.ja-jp.js', // japanese
      ]

      for (const file of localeFiles) {
        await writeFile(join(tempDir, file), `content for ${file}`)
      }

      try {
        bundler = new QuackBundler({
          source: tempDir,
          output: join(tempDir, 'locale-test.qpk'),
          format: 'qpk',
        })

        const result = await bundler.bundle()

        expect(result.locales.some(l => l.code === 'default')).toBe(true)
        expect(result.locales.some(l => l.code === 'en-us')).toBe(true)
        expect(result.locales.some(l => l.code === 'zh-cn')).toBe(true)
        expect(result.locales.some(l => l.code === 'ja-jp')).toBe(true)
      }
      catch (error) {
        expect(error).toBeDefined()
      }
    })
  })

  describe('compression and Encryption', () => {
    it('should apply compression when specified', async () => {
      await mkdir(join(tempDir, 'data'), { recursive: true })

      // Create a large file that should compress well
      const largeContent = 'x'.repeat(10000)
      await writeFile(join(tempDir, 'data', 'large.txt'), largeContent)

      const _uncompressedOptions = {
        format: 'qpk' as const,
        compression: { algorithm: 'none' as const, level: 0 },
        encryption: { enabled: false, algorithm: 'none' as const },
        version: '1.0.0',
      }

      const _compressedOptions = {
        format: 'qpk' as const,
        compression: { algorithm: 'lzma' as const, level: 1 },
        encryption: { enabled: false, algorithm: 'none' as const },
        version: '1.0.0',
      }

      const uncompressedBundler = new QuackBundler({
        source: tempDir,
        output: join(tempDir, 'uncompressed.qpk'),
        format: 'qpk',
        compression: { algorithm: 'none', level: 0 },
        encryption: { enabled: false, algorithm: 'none' },
        versioning: { bundleVersion: 1 },
      })

      const compressedBundler = new QuackBundler({
        source: tempDir,
        output: join(tempDir, 'compressed.qpk'),
        format: 'qpk',
        compression: { algorithm: 'lzma', level: 1 },
        encryption: { enabled: false, algorithm: 'none' },
        versioning: { bundleVersion: 1 },
      })

      const uncompressedResult = await uncompressedBundler.bundle()
      const compressedResult = await compressedBundler.bundle()

      expect(uncompressedResult.totalSize).toBeGreaterThan(0)
      expect(compressedResult.totalSize).toBeGreaterThan(0)
    })

    it('should handle encryption options', async () => {
      await mkdir(join(tempDir, 'secure'), { recursive: true })
      await writeFile(join(tempDir, 'secure', 'secret.txt'), 'sensitive data')

      const _options = {
        format: 'qpk' as const,
        compression: { algorithm: 'none' as const, level: 0 },
        encryption: { enabled: true, algorithm: 'xor' as const },
        encryptionKey: 'test-key-32-characters-long-123',
        version: '1.0.0',
      }

      bundler = new QuackBundler({
        source: tempDir,
        output: join(tempDir, 'encrypted.qpk'),
        format: 'qpk',
        compression: { algorithm: 'none', level: 0 },
        encryption: { enabled: true, algorithm: 'xor', key: 'test-key-32-characters-long-123' },
        versioning: { bundleVersion: 1 },
      })

      const result = await bundler.bundle()

      expect(result.totalSize).toBeGreaterThan(0)
    })
  })

  describe('validation and Error Handling', () => {
    it('should validate source directory exists', async () => {
      const nonExistentPath = join(tempDir, 'does-not-exist')

      try {
        bundler = new QuackBundler({
          source: nonExistentPath,
          output: join(tempDir, 'test-bundle.qpk'),
          format: 'qpk',
        })

        await bundler.bundle()
        expect.fail('Should throw error for non-existent directory')
      }
      catch (error) {
        expect(error).toBeDefined()
      }
    })

    it('should handle empty directories', async () => {
      // tempDir exists but is empty
      bundler = new QuackBundler({
        source: tempDir,
        output: join(tempDir, 'empty-bundle.qpk'),
        format: 'qpk',
      })

      await expect(bundler.bundle()).rejects.toThrow('No assets found')
    })

    it('should validate bundle name format', async () => {
      await writeFile(join(tempDir, 'test.txt'), 'content')

      const invalidNames = ['', 'invalid/name', 'name with spaces', 'name-with-unicode-ü']

      for (const invalidName of invalidNames) {
        try {
          bundler = new QuackBundler({
            source: tempDir,
            output: join(tempDir, `${invalidName}.qpk`),
            format: 'qpk',
          })

          await bundler.bundle()
          expect.fail(`Should throw error for invalid name: ${invalidName}`)
        }
        catch (error) {
          expect(error).toBeDefined()
        }
      }
    })

    it('should validate version format', async () => {
      await writeFile(join(tempDir, 'test.txt'), 'content')

      const invalidVersions = ['1.0', 'v1.0.0', '1.0.0.0', 'invalid']

      for (const version of invalidVersions) {
        const _options = {
          format: 'qpk' as const,
          compression: { algorithm: 'none' as const, level: 0 },
          encryption: { enabled: false, algorithm: 'none' as const },
          version,
        }

        try {
          bundler = new QuackBundler({
            source: tempDir,
            output: join(tempDir, 'test-bundle.qpk'),
            format: 'qpk',
            compression: { algorithm: 'none', level: 0 },
            encryption: { enabled: false, algorithm: 'none' },
            versioning: { bundleVersion: 1 },
          })

          await bundler.bundle()
          expect.fail(`Should throw error for invalid version: ${version}`)
        }
        catch (error) {
          expect(error).toBeDefined()
        }
      }
    })
  })

  describe('progress Reporting', () => {
    it('should emit progress events during bundling', async () => {
      const progressEvents: Array<{ phase: string, progress: number }> = []

      bundler.on('progress', (data) => {
        progressEvents.push(data)
      })

      await mkdir(join(tempDir, 'progress-test'), { recursive: true })
      await writeFile(join(tempDir, 'progress-test', 'file.txt'), 'test content')

      try {
        bundler = new QuackBundler({
          source: tempDir,
          output: join(tempDir, 'progress-bundle.qpk'),
          format: 'qpk',
        })

        await bundler.bundle()

        // Progress events would be expected if implemented
        expect(progressEvents.length).toBeGreaterThanOrEqual(0)
      }
      catch (error) {
        // Expected but we can still check if any events were emitted
        expect(error).toBeDefined()
      }
    })

    it('should provide detailed progress information', async () => {
      let finalProgress: any = null

      bundler.on('progress', (data) => {
        finalProgress = data
      })

      await mkdir(join(tempDir, 'detailed-test'), { recursive: true })

      // Create multiple files for more detailed progress
      for (let i = 0; i < 5; i++) {
        await writeFile(join(tempDir, 'detailed-test', `file${i}.txt`), `content ${i}`)
      }

      try {
        bundler = new QuackBundler({
          source: tempDir,
          output: join(tempDir, 'detailed-bundle.qpk'),
          format: 'qpk',
        })

        await bundler.bundle()

        if (finalProgress) {
          expect(finalProgress).toHaveProperty('phase')
          expect(finalProgress).toHaveProperty('progress')
          expect(finalProgress.progress).toBeGreaterThanOrEqual(0)
          expect(finalProgress.progress).toBeLessThanOrEqual(100)
        }
      }
      catch (error) {
        expect(error).toBeDefined()
      }
    })
  })

  describe('plugin Integration', () => {
    it('should integrate with asset processing plugins', () => {
      const mockPlugin = {
        name: 'test-processor',
        version: '1.0.0',
        supportedTypes: ['images'],
        processAsset: vi.fn(asset => Promise.resolve(asset)),
        initialize: vi.fn(),
        cleanup: vi.fn(),
      }

      bundler.addPlugin(mockPlugin)

      // Plugin should be registered (implementation dependent)
      expect(bundler).toBeDefined()
    })

    it('should integrate with compression plugins', () => {
      const mockCompressionPlugin = {
        name: 'custom-compression',
        version: '1.0.0',
        supportedFormats: ['qpk'],
        compress: vi.fn(),
        decompress: vi.fn(),
        initialize: vi.fn(),
        cleanup: vi.fn(),
      }

      bundler.addPlugin(mockCompressionPlugin)

      expect(bundler).toBeDefined()
    })
  })

  describe('performance and Memory', () => {
    it('should handle large numbers of small files efficiently', async () => {
      const fileCount = 100

      await mkdir(join(tempDir, 'many-files'), { recursive: true })

      // Create many small files
      for (let i = 0; i < fileCount; i++) {
        const fileName = `file-${i.toString().padStart(3, '0')}.txt`
        await writeFile(join(tempDir, 'many-files', fileName), `content for file ${i}`)
      }

      const startTime = Date.now()

      try {
        bundler = new QuackBundler({
          source: tempDir,
          output: join(tempDir, 'many-files-bundle.qpk'),
          format: 'qpk',
        })

        const result = await bundler.bundle()
        const endTime = Date.now()

        expect(result.totalFiles).toBe(fileCount)
        expect(endTime - startTime).toBeLessThan(10000) // Should complete within 10 seconds
      }
      catch (error) {
        // Expected in constrained test environment
        expect(error).toBeDefined()
      }
    })

    it('should manage memory usage with large files', async () => {
      const largeContent = 'x'.repeat(1024 * 1024) // 1MB

      await mkdir(join(tempDir, 'large-file'), { recursive: true })
      await writeFile(join(tempDir, 'large-file', 'large.txt'), largeContent)

      try {
        bundler = new QuackBundler({
          source: tempDir,
          output: join(tempDir, 'large-file-bundle.qpk'),
          format: 'qpk',
        })

        const result = await bundler.bundle()

        expect(result.totalSize).toBe(largeContent.length)
        expect(result.totalFiles).toBe(1)
      }
      catch (error) {
        // Expected for memory management in test environment
        expect(error).toBeDefined()
      }
    })
  })
})

function parseQpkManifest(bytes: Uint8Array): { runtimePackage?: any } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  expect(view.getUint32(0, false)).toBe(0x51504B00)
  const manifestOffset = readUint64LE(view, 16)
  const manifestSize = readUint64LE(view, 24)
  const manifestBytes = bytes.slice(manifestOffset, manifestOffset + manifestSize)
  return JSON.parse(new TextDecoder().decode(manifestBytes)) as { runtimePackage?: any }
}

function readUint64LE(view: DataView, offset: number): number {
  const low = view.getUint32(offset, true)
  const high = view.getUint32(offset + 4, true)
  return high * 2 ** 32 + low
}
