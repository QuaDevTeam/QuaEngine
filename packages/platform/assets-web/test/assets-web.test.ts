import type { AssetData } from '@quajs/assets'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  assetDataToBlob,
  createDevVfsProvider,
  createObjectURL,
  createObjectURLHandle,
  createWebAssetsAdapter,
  getBlob,
  getBlobURL,
  revokeObjectURL,
} from '../src'
import { MemoryAssetStorage, QuaAssets } from '@quajs/assets'

describe('assets-web adapter', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('fetches bytes and json through Fetch API adapter boundaries', async () => {
    const fetcher = vi.fn(async (url: string) => {
      if (url.endsWith('index.json')) {
        return response(JSON.stringify({ currentVersion: 1 }), 'application/json')
      }
      return response('hello', 'text/plain')
    })
    const adapter = createWebAssetsAdapter({
      fetcher: fetcher as unknown as typeof fetch,
      storage: new MemoryAssetStorage(),
    })

    expect(await adapter.fetcher!.fetchJSON('https://cdn.example.com/index.json')).toEqual({ currentVersion: 1 })
    const fetched = await adapter.fetcher!.fetchBytes('https://cdn.example.com/file.txt')
    expect((fetched as any).data).toEqual(new TextEncoder().encode('hello'))
    expect(fetcher).toHaveBeenCalledWith('https://cdn.example.com/file.txt', expect.objectContaining({
      cache: 'default',
    }))
  })

  it('creates and revokes Blob object URLs outside core', async () => {
    const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:qua')
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    const asset = createAsset('hello', 'text/plain')

    expect(await assetDataToBlob(asset).text()).toBe('hello')
    expect(createObjectURL(asset)).toBe('blob:qua')
    const handle = createObjectURLHandle(asset)
    expect(handle.url).toBe('blob:qua')
    handle.revoke()
    revokeObjectURL('blob:qua')

    expect(create).toHaveBeenCalledTimes(2)
    expect(revoke).toHaveBeenCalledWith('blob:qua')
  })

  it('provides web getBlob/getBlobURL helpers without adding them to QuaAssets core', async () => {
    const assets = new QuaAssets({
      adapter: {
        name: 'web-test',
        storage: new MemoryAssetStorage(),
        crypto: { sha256: async () => '' },
      },
      provider: {
        mode: 'memory',
        getManifest: async () => ({
          version: '1',
          assets: [{
            id: 'memory:default:data:file.txt',
            name: 'file.txt',
            type: 'data',
            locale: 'default',
            path: 'data/file.txt',
            mimeType: 'text/plain',
          }],
        }),
        getAsset: async () => createAsset('hello', 'text/plain'),
      },
    })
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:file')

    await assets.initialize()

    expect(await (await getBlob(assets, 'data', 'file.txt')).text()).toBe('hello')
    expect(await getBlobURL(assets, 'data', 'file.txt')).toBe('blob:file')
    expect('getBlob' in assets).toBe(false)
    expect('getBlobURL' in assets).toBe(false)

    await assets.cleanup()
  })

  it('loads dev VFS manifest/assets and updates records from HMR changes', async () => {
    const listeners = new Map<string, (change: any) => void>()
    const fetcher = vi.fn(async (url: string) => {
      if (url === '/@qua-assets/manifest.json') {
        return response(JSON.stringify({
          version: '1',
          assets: [{
            id: 'dev-vfs:default:data:config.json',
            bundleName: 'dev-vfs',
            name: 'config.json',
            type: 'data',
            locale: 'default',
            path: 'data/config.json',
            mimeType: 'application/json',
          }],
        }), 'application/json')
      }
      return response('{"ok":true}', 'application/json')
    })
    const provider = createDevVfsProvider({
      fetcher: fetcher as unknown as typeof fetch,
      hmr: {
        on: (event, listener) => listeners.set(event, listener),
        off: event => listeners.delete(event),
      },
    })

    await provider.init()
    const received = vi.fn()
    provider.watch(received)

    const asset = await provider.getAsset('dev-vfs:default:data:config.json')
    expect(new TextDecoder().decode(asset.data)).toBe('{"ok":true}')
    expect(fetcher).toHaveBeenCalledWith('/@qua-assets/data/config.json', { cache: 'no-cache' })

    const change = {
      type: 'added' as const,
      assetId: 'dev-vfs:default:images:bg.png',
      record: {
        id: 'dev-vfs:default:images:bg.png',
        bundleName: 'dev-vfs',
        name: 'bg.png',
        type: 'images' as const,
        locale: 'default',
        path: 'images/bg.png',
      },
      timestamp: Date.now(),
    }
    listeners.get('qua-assets:update')!(change)

    expect(received).toHaveBeenCalledWith(change)
    expect((await provider.getManifest()).assets.some(record => record.id === change.assetId)).toBe(true)
  })
})

function response(body: string, mimeType: string): Response {
  return new Response(body, {
    status: 200,
    headers: {
      'content-type': mimeType,
      'content-length': String(new TextEncoder().encode(body).byteLength),
    },
  })
}

function createAsset(body: string, mimeType: string): AssetData {
  const data = new TextEncoder().encode(body)
  return {
    id: 'memory:default:data:file.txt',
    bundleName: 'memory',
    type: 'data',
    name: 'file.txt',
    locale: 'default',
    data,
    mimeType,
    size: data.byteLength,
    version: 1,
    mtime: 1,
    fromCache: false,
  }
}
