import type { AssetProvider, AssetType, StoredAsset } from '../src/types'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AssetManager } from '../src/asset-manager'
import { MemoryAssetStorage } from '../src/database'

const now = 1_700_000_000_000

describe('AssetManager core', () => {
  let storage: MemoryAssetStorage
  let assetManager: AssetManager

  beforeEach(() => {
    storage = new MemoryAssetStorage()
    assetManager = new AssetManager(storage, 'default')
  })

  it('retrieves bytes, text, json, and AssetData from platform-neutral storage', async () => {
    await storage.storeAsset(createStoredAsset({
      id: 'core:default:data:config.json',
      bundleName: 'core',
      type: 'data',
      name: 'config.json',
      data: utf8('{"enabled":true}'),
      mimeType: 'application/json',
    }))

    const asset = await assetManager.getAsset('data', 'config.json')

    expect(asset.data).toBeInstanceOf(Uint8Array)
    expect(asset.fromCache).toBe(true)
    expect(asset.mimeType).toBe('application/json')
    expect(await assetManager.getText('data', 'config.json')).toBe('{"enabled":true}')
    expect(await assetManager.getJSON<{ enabled: boolean }>('data', 'config.json')).toEqual({ enabled: true })
    expect(await assetManager.getBytes('data', 'config.json')).toEqual(utf8('{"enabled":true}'))
  })

  it('prefers provider assets before storage fallback', async () => {
    const provider: AssetProvider = {
      mode: 'memory',
      getManifest: vi.fn().mockResolvedValue({
        version: '1',
        assets: [{
          id: 'provider:default:data:config.json',
          name: 'config.json',
          type: 'data',
          locale: 'default',
          path: 'data/config.json',
          mimeType: 'application/json',
        }],
      }),
      getAsset: vi.fn().mockResolvedValue({
        id: 'provider:default:data:config.json',
        type: 'data',
        name: 'config.json',
        bundleName: 'provider',
        locale: 'default',
        data: utf8('{"source":"provider"}'),
        mimeType: 'application/json',
        size: 21,
        version: 1,
        mtime: now,
        fromCache: false,
      }),
    }

    await storage.storeAsset(createStoredAsset({
      id: 'core:default:data:config.json',
      bundleName: 'core',
      type: 'data',
      name: 'config.json',
      data: utf8('{"source":"storage"}'),
    }))
    assetManager = new AssetManager(storage, 'default', provider)

    expect(await assetManager.getJSON('data', 'config.json')).toEqual({ source: 'provider' })
    expect(provider.getAsset).toHaveBeenCalledWith('provider:default:data:config.json', expect.objectContaining({
      name: 'config.json',
    }))
  })

  it('uses locale fallback and bundle-specific lookup from storage', async () => {
    await storage.storeAssets([
      createStoredAsset({
        id: 'story:default:scripts:scene.js',
        bundleName: 'story',
        type: 'scripts',
        name: 'scene.js',
        locale: 'default',
        data: utf8('default'),
      }),
      createStoredAsset({
        id: 'story:zh-cn:scripts:scene.js',
        bundleName: 'story',
        type: 'scripts',
        name: 'scene.js',
        locale: 'zh-cn',
        data: utf8('localized'),
      }),
    ])

    expect(await assetManager.getText('scripts', 'scene.js', {
      bundleName: 'story',
      locale: 'zh-cn',
    })).toBe('localized')
    expect(await assetManager.getText('scripts', 'scene.js', {
      bundleName: 'story',
      locale: 'ja-jp',
    })).toBe('default')
  })

  it('throws a core AssetNotFoundError for missing assets', async () => {
    await expect(assetManager.getBytes('images', 'missing.png')).rejects.toThrow('Asset not found: images/missing.png')
  })

  it('runs processing plugins without depending on browser objects', async () => {
    await storage.storeAsset(createStoredAsset({
      id: 'core:default:data:value.txt',
      bundleName: 'core',
      type: 'data',
      name: 'value.txt',
      data: utf8('raw'),
    }))
    assetManager.registerProcessingPlugin({
      name: 'uppercase',
      version: '1.0.0',
      supportedTypes: ['data'],
      async processAsset(asset) {
        return {
          ...asset,
          data: utf8(bytesToText(asset.data).toUpperCase()),
          size: asset.data.byteLength,
        }
      },
    })

    expect(await assetManager.getText('data', 'value.txt')).toBe('RAW')
  })

  it('does not execute script assets in the platform-neutral asset core', async () => {
    await storage.storeAsset(createStoredAsset({
      id: 'core:default:scripts:value.js',
      bundleName: 'core',
      type: 'scripts',
      name: 'value.js',
      data: utf8('module.exports = { value: 42 };'),
    }))

    expect(await assetManager.getText('scripts', 'value.js')).toBe('module.exports = { value: 42 };')
    expect((assetManager as any).executeJS).toBeUndefined()
    expect(assetManager.getCacheStats()).toEqual({})
  })
})

function createStoredAsset(overrides: Partial<StoredAsset> & {
  id: string
  bundleName: string
  type: AssetType
  name: string
  data: Uint8Array
}): StoredAsset {
  return {
    locale: 'default',
    hash: '',
    size: overrides.data.byteLength,
    version: 1,
    mtime: now,
    createdAt: now,
    lastAccessed: now,
    ...overrides,
  }
}

function utf8(value: string): Uint8Array {
  return new TextEncoder().encode(value)
}

function bytesToText(value: Uint8Array): string {
  return new TextDecoder().decode(value)
}
