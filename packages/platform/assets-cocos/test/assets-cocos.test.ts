import type { BundleManifest, StoredAsset } from '@quajs/assets'
import { createFakeCocosHost } from '@quajs/cocos-host/testing'
import { describe, expect, it } from 'vitest'
import {
  CocosAssetMaterializer,
  CocosAssetStorage,
  createCocosAssets,
  createCocosAssetsAdapter,
  createCocosStaticAssets,
  getCocosHybridAssetManifest,
  shouldUseCocosNativeAsset,
} from '../src'

describe('assets-cocos', () => {
  it('fetches bytes through the host and hashes data', async () => {
    const host = createFakeCocosHost({ files: { 'bundle.qpk': new Uint8Array([1, 2, 3]) } })
    const adapter = createCocosAssetsAdapter({ host })
    const fetched = await adapter.fetcher!.fetchBytes('bundle.qpk')
    const bytes = fetched instanceof Uint8Array ? fetched : fetched.data
    expect(bytes).toEqual(new Uint8Array([1, 2, 3]))
    expect(await adapter.crypto.sha256(new Uint8Array([1, 2, 3]))).toHaveLength(64)
  })

  it('loads an uncompressed static QPK bundle through the Cocos adapter', async () => {
    const manifest = createManifest({
      assets: {
        data: {
          'story.json': {
            name: 'story.json',
            path: 'assets/data/story.json',
            relativePath: 'data/story.json',
            size: 11,
            hash: '',
            type: 'data',
            locales: ['default'],
            mimeType: 'application/json',
          },
        },
      },
      totalFiles: 1,
      totalSize: 11,
    })
    const bundle = createQpkBundle(manifest, new Map([
      ['assets/data/story.json', utf8('{"ok":true}')],
    ]))
    const host = createFakeCocosHost({ files: { 'bundle.qpk': bundle } })
    const assets = createCocosAssets({
      cocos: { host },
      enableCache: true,
    })

    await assets.initialize()
    await assets.loadBundle('bundle.qpk')

    expect(await assets.getJSON('data', 'story.json')).toEqual({ ok: true })
  })

  it('persists asset bytes outside the JSON index', async () => {
    const host = createFakeCocosHost()
    const storage = new CocosAssetStorage(host)
    await storage.open()
    const asset = createAsset()
    await storage.storeAsset(asset)
    const index = await host.storage.readText('qua-assets-cache/index.json')
    expect(index).not.toContain('"data":[1,2,3]')
    expect((await storage.getAsset(asset.id))?.data).toEqual(new Uint8Array([1, 2, 3]))
  })

  it('materializes and releases resources by reference count', async () => {
    const host = createFakeCocosHost()
    const materializer = new CocosAssetMaterializer({ host })
    const first = await materializer.materialize(createAssetData())
    const second = await materializer.materialize(createAssetData())
    expect(host.resourcesById.size).toBe(1)
    first.release()
    expect(host.resourcesById.size).toBe(1)
    second.release()
    expect(host.resourcesById.size).toBe(0)
  })

  it('clears materialized resources explicitly', async () => {
    const host = createFakeCocosHost()
    const materializer = new CocosAssetMaterializer({ host })
    await materializer.materialize(createAssetData())
    expect(host.resourcesById.size).toBe(1)
    materializer.clear()
    expect(host.resourcesById.size).toBe(0)
  })

  it('rejects dynamic runtime bundle loading through static Cocos assets', async () => {
    const assets = createCocosStaticAssets({
      loadDynamicBundle: async () => {
        throw new Error('should not load')
      },
    } as never)
    await expect(assets.loadDynamicBundle('runtime.qpk')).rejects.toThrow('Cocos static-only assets do not support dynamic Runtime Package bundle loading.')
  })

  it('resolves Cocos hybrid asset routing from bundle target metadata', () => {
    const manifest = createManifest({
      assetTarget: {
        name: 'cocos-mobile',
        platform: 'cocos',
        staticOnly: true,
        cocos: {
          staticOnly: true,
          hybrid: {
            enabled: true,
            resourceRoot: 'assets/resources',
            assetBundle: 'qua-hybrid',
            domains: {
              images: 'cocos-bundle',
              characters: 'cocos-bundle',
              audio: 'qpk',
              video: 'qpk',
              fonts: 'qpk',
            },
          },
        },
      },
    })

    expect(getCocosHybridAssetManifest(manifest)?.assetBundle).toBe('qua-hybrid')
    expect(shouldUseCocosNativeAsset(manifest, 'images')).toBe(true)
    expect(shouldUseCocosNativeAsset(manifest, 'characters')).toBe(true)
    expect(shouldUseCocosNativeAsset(manifest, 'audio')).toBe(false)
    expect(shouldUseCocosNativeAsset(manifest, 'data')).toBe(false)
  })
})

function createAsset(): StoredAsset {
  return {
    id: 'bundle:default:images:bg.png',
    bundleName: 'bundle',
    name: 'bg.png',
    type: 'images',
    locale: 'default',
    data: new Uint8Array([1, 2, 3]),
    hash: 'hash',
    size: 3,
    version: 1,
    mtime: 1,
    createdAt: 1,
    lastAccessed: 1,
  }
}

function createAssetData() {
  return {
    id: 'bundle:default:images:bg.png',
    bundleName: 'bundle',
    name: 'bg.png',
    type: 'images' as const,
    locale: 'default',
    data: new Uint8Array([1, 2, 3]),
    size: 3,
    version: 1,
    mtime: 1,
    fromCache: false,
  }
}

function createManifest(overrides: Partial<BundleManifest> = {}): BundleManifest {
  return {
    name: 'bundle',
    version: '1.0.0',
    bundler: '@quajs/quack',
    created: new Date(0).toISOString(),
    createdAt: 0,
    format: 'qpk',
    bundleVersion: 1,
    buildNumber: 'test',
    compression: { algorithm: 'none', level: 0 },
    encryption: { enabled: false, algorithm: 'none' },
    locales: ['default'],
    defaultLocale: 'default',
    assets: {},
    totalFiles: 0,
    totalSize: 0,
    ...overrides,
  }
}

function createQpkBundle(manifest: BundleManifest, files: Map<string, Uint8Array>): Uint8Array {
  const assetEntries = Array.from(files.entries()).map(([path, data]) => {
    const pathBytes = utf8(path)
    const entry = new Uint8Array(4 + pathBytes.byteLength + 4 + data.byteLength)
    const view = new DataView(entry.buffer)
    view.setUint32(0, pathBytes.byteLength, true)
    entry.set(pathBytes, 4)
    view.setUint32(4 + pathBytes.byteLength, data.byteLength, true)
    entry.set(data, 4 + pathBytes.byteLength + 4)
    return entry
  })
  const assetData = concatBytes(assetEntries)
  const manifestBytes = utf8(JSON.stringify(manifest))
  const headerSize = 32
  const bytes = new Uint8Array(headerSize + assetData.byteLength + manifestBytes.byteLength)
  const view = new DataView(bytes.buffer)
  view.setUint32(0, 0x51504B00, false)
  view.setUint32(4, 1, true)
  view.setUint32(8, 0, true)
  view.setUint32(12, headerSize, true)
  setUint64LE(view, 16, headerSize + assetData.byteLength)
  setUint64LE(view, 24, manifestBytes.byteLength)
  bytes.set(assetData, headerSize)
  bytes.set(manifestBytes, headerSize + assetData.byteLength)
  return bytes
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
