import type { QuaNativeHostApi } from '@quajs/native-contracts'
import type { BundleManifest, StoredAsset, StoredBundle } from '@quajs/assets'
import { describe, expect, it, vi } from 'vitest'
import { NativeHostAssetStorage, createNativeAssetsAdapter } from '../src'

function createHost(initialStorage: Record<string, Uint8Array> = {}): QuaNativeHostApi & {
  storage: Map<string, Uint8Array>
  assets: Map<string, Uint8Array>
} {
  const storage = new Map(Object.entries(initialStorage))
  const assets = new Map<string, Uint8Array>()
  return {
    storage,
    assets,
    getHostInfo: vi.fn(),
    readAssetBytes: vi.fn(async ({ url }) => {
      const data = assets.get(url)
      if (!data)
        throw new Error(`Missing asset ${url}`)
      return data
    }),
    readStorage: vi.fn(async key => storage.get(key)),
    writeStorage: vi.fn(async (key, value) => {
      storage.set(key, new Uint8Array(value))
    }),
    deleteStorage: vi.fn(async key => {
      storage.delete(key)
    }),
    listStorageKeys: vi.fn(async prefix => [...storage.keys()].filter(key => key.startsWith(prefix))),
    hashBytes: vi.fn(async bytes => `sha256:${Array.from(bytes).join(',')}`),
  }
}

function createAsset(overrides: Partial<StoredAsset> = {}): StoredAsset {
  return {
    id: 'main:default:data:chapter.json',
    bundleName: 'main',
    logicalBundleName: 'main',
    bundleVersionKey: 'main@1#100',
    name: 'chapter.json',
    type: 'data',
    locale: 'default',
    data: new TextEncoder().encode('chapter'),
    hash: 'hash',
    size: 7,
    version: 1,
    bundleVersion: 1,
    mtime: 1,
    createdAt: 10,
    lastAccessed: 10,
    ...overrides,
  }
}

function createBundle(overrides: Partial<StoredBundle> = {}): StoredBundle {
  return {
    name: 'main@1#100',
    logicalName: 'main',
    versionKey: 'main@1#100',
    active: true,
    version: 1,
    buildNumber: '100',
    format: 'qpk',
    hash: 'bundle-hash',
    size: 7,
    assetCount: 1,
    locales: ['default'],
    createdAt: 10,
    lastUpdated: 10,
    manifest: createManifest(),
    ...overrides,
  }
}

function createManifest(): BundleManifest {
  return {
    name: 'main',
    version: 1,
    buildNumber: '100',
    created: '2026-06-24T00:00:00.000Z',
    assets: [],
  }
}

describe('@quajs/assets-native', () => {
  it('fetches asset bytes and hashes through the native host', async () => {
    const host = createHost()
    host.assets.set('assets/chapter.json', new TextEncoder().encode('{"ok":true}'))
    const adapter = createNativeAssetsAdapter({ host })

    const fetched = await adapter.fetcher!.fetchBytes('assets/chapter.json')
    const parsed = await adapter.fetcher!.fetchJSON<{ ok: boolean }>('assets/chapter.json')
    const hash = await adapter.crypto.sha256(new Uint8Array([1, 2, 3]))

    expect(new TextDecoder().decode((fetched as any).data)).toBe('{"ok":true}')
    expect(parsed).toEqual({ ok: true })
    expect(hash).toBe('sha256:1,2,3')
    expect(host.readAssetBytes).toHaveBeenCalledWith({ url: 'assets/chapter.json' })
  })

  it('persists assets and metadata through native host storage', async () => {
    const host = createHost()
    const storage = new NativeHostAssetStorage(host, { root: 'native-cache', now: () => 100 })
    await storage.open()
    await storage.storeAsset(createAsset())

    const reopened = new NativeHostAssetStorage(host, { root: 'native-cache', now: () => 200 })
    await reopened.open()
    const loaded = await reopened.getAsset('main:default:data:chapter.json')

    expect(new TextDecoder().decode(loaded!.data)).toBe('chapter')
    expect(loaded!.lastAccessed).toBe(200)
    expect(host.storage.has('native-cache/index.json')).toBe(true)
    expect(host.storage.has('native-cache/assets/main%3Adefault%3Adata%3Achapter.json.bin')).toBe(true)
  })

  it('resolves active bundles by priority, version, and loaded time', async () => {
    const storage = new NativeHostAssetStorage(createHost(), { now: () => 100 })
    await storage.open()

    await storage.storeBundle(createBundle({
      name: 'main@1#100',
      versionKey: 'main@1#100',
      version: 1,
      priority: 0,
      loadedAt: 100,
    }))
    await storage.storeBundle(createBundle({
      name: 'main@2#100',
      versionKey: 'main@2#100',
      version: 2,
      priority: 5,
      loadedAt: 200,
    }))

    expect((await storage.getBundle('main'))!.versionKey).toBe('main@2#100')
    expect((await storage.getAllBundles()).map(bundle => [bundle.versionKey, bundle.active])).toEqual([
      ['main@1#100', false],
      ['main@2#100', true],
    ])
  })

  it('uses active bundle and locale fallback when resolving assets', async () => {
    const storage = new NativeHostAssetStorage(createHost(), { now: () => 100 })
    await storage.open()
    await storage.storeBundle(createBundle({
      name: 'main@1#100',
      versionKey: 'main@1#100',
      active: false,
    }))
    await storage.storeBundle(createBundle({
      name: 'main@2#100',
      versionKey: 'main@2#100',
      version: 2,
      active: true,
    }))
    await storage.storeAssets([
      createAsset({
        id: 'main:default:data:chapter.json',
        bundleVersionKey: 'main@2#100',
        locale: 'default',
        data: new TextEncoder().encode('default'),
      }),
      createAsset({
        id: 'main:ja:data:chapter.json',
        bundleVersionKey: 'main@2#100',
        locale: 'ja-JP',
        data: new TextEncoder().encode('ja'),
      }),
      createAsset({
        id: 'main:old:data:chapter.json',
        bundleVersionKey: 'main@1#100',
        locale: 'ja-JP',
        data: new TextEncoder().encode('old'),
      }),
    ])

    const preferred = await storage.getAssetWithLocaleFallback('main', 'data', 'chapter.json', 'ja-JP')
    const fallback = await storage.getAssetWithLocaleFallback('main', 'data', 'chapter.json', 'fr-FR')

    expect(new TextDecoder().decode(preferred!.data)).toBe('ja')
    expect(new TextDecoder().decode(fallback!.data)).toBe('default')
  })

  it('cleans least recently accessed asset bytes while keeping cache stats accurate', async () => {
    let now = 10
    const host = createHost()
    const storage = new NativeHostAssetStorage(host, { now: () => now })
    await storage.open()
    await storage.storeAssets([
      createAsset({
        id: 'a',
        name: 'a.txt',
        data: new Uint8Array([1, 2, 3]),
        size: 3,
        lastAccessed: 1,
      }),
      createAsset({
        id: 'b',
        name: 'b.txt',
        data: new Uint8Array([4, 5, 6]),
        size: 3,
        lastAccessed: 2,
      }),
    ])
    now = 20
    await storage.getAsset('b')

    const removed = await storage.cleanupAssets(3)

    expect(removed).toBe(1)
    expect(await storage.getAsset('a')).toBeUndefined()
    expect(new TextDecoder().decode((await storage.getAsset('b'))!.data)).toBe('\u0004\u0005\u0006')
    expect(await storage.getCacheStats()).toEqual({
      totalAssets: 1,
      totalBundles: 0,
      totalSize: 3,
      oldestAsset: new Date(20),
      newestAsset: new Date(20),
    })
  })
})
