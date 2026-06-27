import type { NativeHostApiRequest, QuaNativeHostApi } from '@quajs/native-contracts'
import type { BundleManifest, StoredAsset, StoredBundle } from '@quajs/assets'
import { createNativeHostApiFromBridge } from '@quajs/native-contracts'
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

  it('uses the host bridge dispatcher for asset fetches, hashing, and cache storage', async () => {
    const requests: NativeHostApiRequest[] = []
    const storage = new Map<string, number[]>()
    const host = createNativeHostApiFromBridge(async (request) => {
      requests.push(request)
      switch (request.method) {
        case 'readAssetBytes':
          return { ok: true, payload: { type: 'assetBytes', value: Array.from(new TextEncoder().encode('{"ok":true}')) } }
        case 'hashBytes':
          return { ok: true, payload: { type: 'hash', value: `sha256:${request.params.bytes.join(',')}` } }
        case 'readStorage':
          return { ok: true, payload: { type: 'storageBytes', value: storage.get(request.params.key) } }
        case 'writeStorage':
          storage.set(request.params.key, request.params.value)
          return { ok: true }
        case 'deleteStorage':
          storage.delete(request.params.key)
          return { ok: true }
        default:
          return {
            ok: false,
            error: {
              code: 'unsupportedOperation',
              message: `Unexpected bridge request "${request.method}".`,
            },
          }
      }
    })
    const adapter = createNativeAssetsAdapter({ host })
    const nativeStorage = new NativeHostAssetStorage(host, { root: 'bridge-cache', now: () => 100 })

    await expect(adapter.fetcher!.fetchJSON<{ ok: boolean }>('assets/chapter.json')).resolves.toEqual({ ok: true })
    await expect(adapter.crypto.sha256(new Uint8Array([1, 2, 3]))).resolves.toBe('sha256:1,2,3')
    await nativeStorage.open()
    await nativeStorage.storeAsset(createAsset())
    await expect(nativeStorage.getAsset('main:default:data:chapter.json')).resolves.toEqual(expect.objectContaining({
      data: new TextEncoder().encode('chapter'),
    }))

    expect(requests).toEqual(expect.arrayContaining([
      { method: 'readAssetBytes', params: { url: 'assets/chapter.json' } },
      { method: 'hashBytes', params: { bytes: [1, 2, 3], algorithm: 'sha256' } },
      { method: 'readStorage', params: { key: 'bridge-cache/index.json' } },
      {
        method: 'writeStorage',
        params: {
          key: 'bridge-cache/assets/main%3Adefault%3Adata%3Achapter.json.bin',
          value: Array.from(new TextEncoder().encode('chapter')),
        },
      },
    ]))
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

  it('reloads the host index when the same storage instance is reopened', async () => {
    const host = createHost()
    const first = new NativeHostAssetStorage(host, { root: 'native-cache', now: () => 100 })
    await first.open()
    await first.storeAsset(createAsset({
      id: 'chapter:a',
      name: 'a.json',
      data: new TextEncoder().encode('a'),
      size: 1,
    }))
    await first.close()

    const second = new NativeHostAssetStorage(host, { root: 'native-cache', now: () => 200 })
    await second.open()
    await second.storeAsset(createAsset({
      id: 'chapter:b',
      name: 'b.json',
      data: new TextEncoder().encode('b'),
      size: 1,
    }))
    await second.close()

    await first.open()

    expect(new TextDecoder().decode((await first.getAsset('chapter:a'))!.data)).toBe('a')
    expect(new TextDecoder().decode((await first.getAsset('chapter:b'))!.data)).toBe('b')
  })

  it('clears in-memory metadata when reopened after the host index is removed', async () => {
    const host = createHost()
    const first = new NativeHostAssetStorage(host, { root: 'native-cache', now: () => 100 })
    await first.open()
    await first.storeAsset(createAsset())
    await first.close()

    const second = new NativeHostAssetStorage(host, { root: 'native-cache', now: () => 200 })
    await second.open()
    await second.clearAll()

    await first.open()

    expect(await first.getAsset('main:default:data:chapter.json')).toBeUndefined()
    expect(await first.getCacheStats()).toEqual({
      totalAssets: 0,
      totalBundles: 0,
      totalSize: 0,
      oldestAsset: null,
      newestAsset: null,
    })
  })

  it('clears orphaned native cache keys when host key listing is available', async () => {
    const host = createHost()
    host.storage.set('native-cache/assets/orphan.bin', new Uint8Array([9]))
    host.storage.set('native-cache/tmp/partial.bin', new Uint8Array([8]))
    host.storage.set('other-cache/assets/keep.bin', new Uint8Array([7]))
    const storage = new NativeHostAssetStorage(host, { root: 'native-cache', now: () => 100 })
    await storage.open()
    await storage.storeAsset(createAsset())

    await storage.clearAll()

    expect([...host.storage.keys()].sort()).toEqual(['other-cache/assets/keep.bin'])
    expect(host.listStorageKeys).toHaveBeenCalledWith('native-cache/')
  })

  it('falls back to indexed asset cleanup when host key listing is unavailable', async () => {
    const host = createHost()
    host.listStorageKeys = undefined
    host.storage.set('native-cache/assets/orphan.bin', new Uint8Array([9]))
    const storage = new NativeHostAssetStorage(host, { root: 'native-cache', now: () => 100 })
    await storage.open()
    await storage.storeAsset(createAsset())

    await storage.clearAll()

    expect(host.storage.has('native-cache/index.json')).toBe(false)
    expect(host.storage.has('native-cache/assets/main%3Adefault%3Adata%3Achapter.json.bin')).toBe(false)
    expect(host.storage.has('native-cache/assets/orphan.bin')).toBe(true)
  })

  it('uses safe package-relative cache roots as native storage prefixes', async () => {
    const host = createHost()
    const storage = new NativeHostAssetStorage(host, { root: '/profiles/player-a/cache/', now: () => 100 })
    await storage.open()
    await storage.storeAsset(createAsset())

    expect(host.storage.has('profiles/player-a/cache/index.json')).toBe(true)
    expect(host.storage.has('profiles/player-a/cache/assets/main%3Adefault%3Adata%3Achapter.json.bin')).toBe(true)
  })

  it('rejects unsafe native asset cache roots before host storage access', () => {
    for (const root of [
      '../native-cache',
      'native-cache/../other',
      'native-cache//assets',
      'native-cache\\assets',
      'file:///tmp/native-cache',
      'https://cache.example.invalid/native-cache',
    ]) {
      expect(() => new NativeHostAssetStorage(createHost(), { root })).toThrow(/safe package-relative storage prefix/)
    }
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
