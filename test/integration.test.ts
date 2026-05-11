import type { BundleIndex } from '@quajs/assets'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { QuaAssets } from '@quajs/assets'
import { createMemoryAssetsAdapter } from '@quajs/assets-memory'
import { defineConfig, QuackBundler } from '@quajs/quack'
import { createMockAssets, createMockQPKBundle, createTestAssetDirectory } from './utils'

describe('Integration: Quack to QuaAssets workflow', () => {
  let tempDir: string
  let assetsDir: string
  let outputDir: string

  beforeEach(async () => {
    tempDir = join(tmpdir(), `integration-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    assetsDir = join(tempDir, 'assets')
    outputDir = join(tempDir, 'output')

    await mkdir(outputDir, { recursive: true })
  })

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true })
  })

  it('creates a QPK bundle with Quack and loads it through a platform adapter', async () => {
    const { filename, bytes, stats } = await buildQuackBundle()
    const adapter = createMemoryAssetsAdapter({
      files: {
        [`bundles/${filename}`]: bytes,
      },
    })
    const quaAssets = new QuaAssets({
      endpoint: 'memory://bundles',
      adapter,
      locale: 'default',
      enableCache: true,
    })

    await quaAssets.initialize()
    await quaAssets.loadBundle(filename)

    expect(stats.totalFiles).toBe(6)
    expect(quaAssets.getBundleStatus(filename.replace(/\.qpk$/, ''))).toMatchObject({
      state: 'loaded',
      assetCount: 6,
    })
    expect(await quaAssets.getJSON('data', 'data.json')).toEqual({
      version: '1.0',
      name: 'test-game',
    })

    await quaAssets.cleanup()
  })

  it('keeps locale fallback in engine-owned asset storage', async () => {
    const adapter = createMemoryAssetsAdapter({
      files: {
        'bundles/localized.qpk': createMockQPKBundle(createMockAssets()),
      },
    })
    const quaAssets = new QuaAssets({
      endpoint: 'memory://bundles',
      adapter,
      locale: 'en-us',
      enableCache: true,
    })

    await quaAssets.initialize()
    await quaAssets.loadBundle('localized.qpk')

    expect(await quaAssets.getText('scripts', 'script1.en.js', { locale: 'en-us' }))
      .toContain('English script1')
    expect(await quaAssets.getText('scripts', 'script1.js', { locale: 'en-us' }))
      .toContain('Hello from script1')

    await quaAssets.cleanup()
  })

  it('reports corrupted bundle failures through bundle status', async () => {
    const quaAssets = new QuaAssets({
      endpoint: 'memory://bundles',
      adapter: createMemoryAssetsAdapter({
        files: {
          'bundles/corrupted.qpk': new Uint8Array([0xFF, 0xFF, 0xFF, 0xFF]),
        },
      }),
    })

    await quaAssets.initialize()

    await expect(quaAssets.loadBundle('corrupted.qpk'))
      .rejects
      .toMatchObject({ code: 'BUNDLE_LOAD_ERROR', bundleName: 'corrupted' })
    expect(quaAssets.getBundleStatus('corrupted')).toMatchObject({
      state: 'error',
      progress: 0,
    })

    await quaAssets.cleanup()
  })

  it('clears loaded bundle cache through the storage adapter', async () => {
    const adapter = createMemoryAssetsAdapter({
      files: {
        'bundles/main.qpk': createMockQPKBundle(createMockAssets(), { name: 'main' }),
      },
    })
    const quaAssets = new QuaAssets({
      endpoint: 'memory://bundles',
      adapter,
      enableCache: true,
    })

    await quaAssets.initialize()
    await quaAssets.loadBundle('main.qpk')

    expect(await quaAssets.getCacheStats()).toMatchObject({
      bundles: 1,
      totalSize: 154,
    })

    await quaAssets.clearAllCache()

    expect(await quaAssets.getCacheStats()).toMatchObject({
      bundles: 0,
      totalSize: 0,
    })

    await quaAssets.cleanup()
  })

  async function buildQuackBundle(): Promise<{
    filename: string
    bytes: Uint8Array
    stats: Awaited<ReturnType<QuackBundler['bundle']>>
  }> {
    await createTestAssetDirectory(assetsDir, createMockAssets())

    const bundler = new QuackBundler(defineConfig({
      source: assetsDir,
      output: join(outputDir, 'test-bundle.qpk'),
      format: 'qpk',
      compression: {
        algorithm: 'none',
      },
      versioning: {
        bundleVersion: 1,
        buildNumber: 'integration-test-001',
      },
    }))
    const stats = await bundler.bundle()
    const index = JSON.parse(await readFile(join(outputDir, 'index.json'), 'utf8')) as BundleIndex
    const filename = index.latestBundle.filename

    return {
      filename,
      bytes: new Uint8Array(await readFile(join(outputDir, filename))),
      stats,
    }
  }
})
