import type {
  AssetRuntimeAdapter,
  AssetType,
  BundleFormat,
  BundleManifest,
  StoredAsset,
} from '@quajs/assets'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AssetManager, BundleLoader, MemoryAssetStorage, QuaAssets } from '@quajs/assets'
import { createMemoryAssetsAdapter } from '@quajs/assets-memory'
import { createMockAssets, createMockManifest, createMockQPKBundle } from './utils'

describe('QuaAssets root integration coverage', () => {
  let assets: QuaAssets | undefined

  afterEach(async () => {
    await assets?.cleanup()
    assets = undefined
  })

  it('initializes with an explicit runtime adapter and plugin lifecycle hooks', async () => {
    const plugin = {
      name: 'test-plugin',
      version: '1.0.0',
      initialize: vi.fn(),
      cleanup: vi.fn(),
    }

    assets = new QuaAssets({
      adapter: createMemoryAssetsAdapter(),
      locale: 'default',
      enableCache: true,
      cacheSize: 50 * 1024 * 1024,
      plugins: [plugin],
    })

    await assets.initialize()

    expect(assets.getLocale()).toBe('default')
    expect(await assets.getCacheStats()).toMatchObject({
      bundles: 0,
      totalSize: 0,
    })
    expect(plugin.initialize).toHaveBeenCalledTimes(1)

    await assets.cleanup()
    expect(plugin.cleanup).toHaveBeenCalledTimes(1)
    assets = undefined
  })

  it('loads a QPK bundle through the memory adapter and retrieves typed assets', async () => {
    const adapter = createMemoryAssetsAdapter({
      files: {
        'https://test-cdn.example.com/test-bundle.qpk': createMockQPKBundle(createMockAssets()),
      },
    })
    const loaded = vi.fn()

    assets = new QuaAssets({
      endpoint: 'https://test-cdn.example.com',
      adapter,
      locale: 'default',
      enableCache: true,
    })
    await assets.initialize()
    assets.on('bundle:loaded', loaded)

    await assets.loadBundle('test-bundle.qpk')

    expect(assets.getBundleStatus('test-bundle')).toMatchObject({
      state: 'loaded',
      assetCount: 6,
      loadedAssets: 6,
    })
    expect(loaded).toHaveBeenCalledWith(expect.objectContaining({ bundleName: 'test-bundle' }))
    expect(await assets.getText('data', 'data.json')).toBe('{"version": "1.0", "name": "test-game"}')
    expect(new TextDecoder().decode((await assets.getAsset('images', 'background1.jpg')).data))
      .toBe('mock-jpg-data')
  })

  it('records bundle errors without relying on browser fetch globals', async () => {
    assets = new QuaAssets({
      endpoint: 'memory://bundles',
      adapter: createMemoryAssetsAdapter(),
    })
    await assets.initialize()

    await expect(assets.loadBundle('missing.qpk'))
      .rejects
      .toMatchObject({ code: 'BUNDLE_LOAD_ERROR', bundleName: 'missing' })

    expect(assets.getBundleStatus('missing')).toMatchObject({
      state: 'error',
      progress: 0,
    })
  })
})

describe('BundleLoader root coverage', () => {
  let adapter: AssetRuntimeAdapter
  let loader: BundleLoader

  beforeEach(() => {
    adapter = createMemoryAssetsAdapter()
    loader = new BundleLoader({ crypto: adapter.crypto })
  })

  it('parses current QPK bundles and creates stored assets', async () => {
    const result = await loader.loadBundle(createMockQPKBundle(createMockAssets()), 'test-bundle.qpk')

    expect(result.manifest).toMatchObject({
      name: 'test-bundle',
      format: 'qpk',
      bundleVersion: 1,
    })
    expect(result.assets.map(asset => asset.name).sort()).toEqual([
      'background1.jpg',
      'character1.png',
      'data.json',
      'music1.mp3',
      'script1.en.js',
      'script1.js',
    ])
  })

  it('uses decompression plugins for custom bundle formats', async () => {
    const manifest = createMockManifest([{
      name: 'config.json',
      type: 'data',
      subType: 'config',
      locale: 'default',
      content: '{"ok":true}',
      size: 11,
    }], 'custom', 1)
    const plugin = {
      name: 'custom-zip',
      version: '1.0.0',
      supportedFormats: ['zip'] as BundleFormat[],
      decompress: vi.fn(async () => new Map([
        ['manifest.json', utf8(JSON.stringify({ ...manifest, format: 'zip' as BundleManifest['format'] }))],
        ['assets/data/config/config.json', utf8('{"ok":true}')],
      ])),
    }

    loader.registerDecompressionPlugin(plugin)

    const result = await loader.loadBundle(new Uint8Array([1, 2, 3]), 'custom.zip')

    expect(plugin.decompress).toHaveBeenCalledWith(new Uint8Array([1, 2, 3]), 'zip')
    expect(result.assets).toHaveLength(1)
    expect(new TextDecoder().decode(result.assets[0].data)).toBe('{"ok":true}')
  })
})

describe('AssetManager root coverage', () => {
  let storage: MemoryAssetStorage
  let manager: AssetManager

  beforeEach(async () => {
    storage = new MemoryAssetStorage()
    manager = new AssetManager(storage)
    await storage.storeAsset(createStoredAsset({
      type: 'data',
      name: 'config.json',
      data: utf8('{"from":"storage"}'),
      mimeType: 'application/json',
    }))
  })

  it('reads bytes, text, and JSON from storage-backed assets', async () => {
    expect(await manager.getText('data', 'config.json')).toBe('{"from":"storage"}')
    expect(await manager.getJSON('data', 'config.json')).toEqual({ from: 'storage' })
    expect(await manager.hasAsset('data', 'config.json')).toBe(true)
    expect(await manager.hasAsset('data', 'missing.json')).toBe(false)
  })

  it('keeps browser-only helpers out of core asset management', () => {
    expect((manager as unknown as { executeJS?: unknown }).executeJS).toBeUndefined()
    expect((manager as unknown as { getBlobUrl?: unknown }).getBlobUrl).toBeUndefined()
  })

  it('applies processing plugins through core asset contracts', async () => {
    const plugin = {
      name: 'json-processor',
      version: '1.0.0',
      supportedTypes: ['data'] as AssetType[],
      processAsset: vi.fn(async (asset: StoredAsset): Promise<StoredAsset> => ({
        ...asset,
        data: utf8('{"processed":true}'),
        size: 18,
      })),
    }

    manager.registerProcessingPlugin(plugin)

    expect(await manager.getJSON('data', 'config.json')).toEqual({ processed: true })
    expect(plugin.processAsset).toHaveBeenCalledTimes(1)
  })
})

function createStoredAsset(overrides: {
  type: AssetType
  name: string
  data: Uint8Array
  mimeType?: string
}): StoredAsset {
  const now = 1_700_000_000_000
  return {
    id: `test-bundle:default:${overrides.type}:${overrides.name}`,
    bundleName: 'test-bundle',
    name: overrides.name,
    type: overrides.type,
    locale: 'default',
    data: overrides.data,
    hash: '',
    mimeType: overrides.mimeType,
    size: overrides.data.byteLength,
    version: 1,
    mtime: now,
    createdAt: now,
    lastAccessed: now,
  }
}

function utf8(value: string): Uint8Array {
  return new TextEncoder().encode(value)
}
