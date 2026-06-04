import type { StoredAsset } from '@quajs/assets'
import { describe, expect, it } from 'vitest'
import { createFakeCocosHost } from '@quajs/cocos-host/testing'
import { CocosAssetMaterializer, CocosAssetStorage, createCocosAssetsAdapter, createCocosStaticAssets } from '../src'

describe('assets-cocos', () => {
  it('fetches bytes through the host and hashes data', async () => {
    const host = createFakeCocosHost({ files: { 'bundle.qpk': new Uint8Array([1, 2, 3]) } })
    const adapter = createCocosAssetsAdapter({ host })
    const fetched = await adapter.fetcher!.fetchBytes('bundle.qpk')
    const bytes = fetched instanceof Uint8Array ? fetched : fetched.data
    expect(bytes).toEqual(new Uint8Array([1, 2, 3]))
    expect(await adapter.crypto.sha256(new Uint8Array([1, 2, 3]))).toHaveLength(64)
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
