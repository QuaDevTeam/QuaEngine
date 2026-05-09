import type { AssetData, BundleManifest } from '@quajs/assets'
import { MemoryAssetStorage, QuaAssets } from '@quajs/assets'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  assetDataToBlob,
  createDevVfsProvider,
  createObjectURL,
  createObjectURLHandle,
  createViteDevAssetRuntime,
  createWebAssetRuntime,
  createWebAssetsAdapter,
  getBlob,
  getBlobURL,
  revokeObjectURL,
} from '../src'

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

  it('creates initialized web assets with progressive initial bundle loading', async () => {
    const mainManifest = createManifest({
      assets: {
        data: {
          'file.txt': {
            name: 'file.txt',
            path: 'data/file.txt',
            relativePath: 'data/file.txt',
            size: 5,
            hash: '',
            type: 'data',
            locales: ['default'],
            mimeType: 'text/plain',
          },
        },
      },
      totalFiles: 1,
      totalSize: 5,
    })
    const sharedManifest = createManifest({
      name: 'shared',
      assets: {
        data: {
          'shared.txt': {
            name: 'shared.txt',
            path: 'data/shared.txt',
            relativePath: 'data/shared.txt',
            size: 6,
            hash: '',
            type: 'data',
            locales: ['default'],
            mimeType: 'text/plain',
          },
        },
      },
      totalFiles: 1,
      totalSize: 6,
    })
    const mainBundleBytes = createQpkBundle(mainManifest, new Map([
      ['assets/data/file.txt', utf8('ready')],
    ]))
    const sharedBundleBytes = createQpkBundle(sharedManifest, new Map([
      ['assets/data/shared.txt', utf8('shared')],
    ]))
    const fetcher = vi.fn(async (url: string) => {
      if (url === 'https://cdn.example.com/main.qpk') {
        return binaryResponse(mainBundleBytes)
      }
      if (url === 'https://cdn.example.com/shared.qpk') {
        return binaryResponse(sharedBundleBytes)
      }
      throw new Error(`Unexpected fetch: ${url}`)
    })
    const initialBundleProgress = vi.fn()
    const runtimeProgress = vi.fn()

    const assets = await createWebAssetRuntime({
      endpoint: 'https://cdn.example.com',
      adapter: createWebAssetsAdapter({
        fetcher: fetcher as unknown as typeof fetch,
        storage: new MemoryAssetStorage(),
      }),
      initialBundles: ['main.qpk', 'shared.qpk'],
      initialBundleOptions: {
        onProgress: initialBundleProgress,
      },
      onProgress: runtimeProgress,
    })

    expect(await assets.getText('data', 'file.txt')).toBe('ready')
    expect(await assets.getText('data', 'shared.txt', { bundleName: 'shared' })).toBe('shared')
    expect(fetcher).toHaveBeenCalledWith('https://cdn.example.com/main.qpk', expect.objectContaining({
      cache: 'default',
    }))
    expect(fetcher).toHaveBeenCalledWith('https://cdn.example.com/shared.qpk', expect.objectContaining({
      cache: 'default',
    }))
    expect(initialBundleProgress).toHaveBeenCalled()
    expect(runtimeProgress).toHaveBeenCalledWith(expect.objectContaining({
      bundleName: 'main.qpk',
      bundleIndex: 0,
      bundleCount: 2,
    }))
    expect(runtimeProgress).toHaveBeenCalledWith(expect.objectContaining({
      bundleName: 'shared.qpk',
      bundleIndex: 1,
      bundleCount: 2,
    }))

    await assets.cleanup()
  })

  it('creates Vite dev assets with VFS provider and HMR wiring', async () => {
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
      return response('{"dev":true}', 'application/json')
    })
    const assets = await createViteDevAssetRuntime({
      fetcher: fetcher as unknown as typeof fetch,
      hmr: {
        on: (event, listener) => listeners.set(event, listener),
        off: event => listeners.delete(event),
      },
      web: {
        storage: new MemoryAssetStorage(),
      },
    })
    const received = vi.fn()
    assets.on('asset:changed', received)

    expect(await assets.getJSON('data', 'config.json')).toEqual({ dev: true })

    const change = {
      type: 'changed' as const,
      assetId: 'dev-vfs:default:data:config.json',
      record: {
        id: 'dev-vfs:default:data:config.json',
        bundleName: 'dev-vfs',
        name: 'config.json',
        type: 'data' as const,
        locale: 'default',
        path: 'data/config.json',
      },
      timestamp: Date.now(),
    }
    listeners.get('qua-assets:update')!(change)

    expect(received).toHaveBeenCalledWith(change)

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

function binaryResponse(body: Uint8Array, mimeType = 'application/octet-stream'): Response {
  return new Response(body, {
    status: 200,
    headers: {
      'content-type': mimeType,
      'content-length': String(body.byteLength),
    },
  })
}

function createManifest(overrides: Partial<BundleManifest> = {}): BundleManifest {
  return {
    name: 'main',
    version: '1.0.0',
    bundler: '@quajs/quack',
    created: new Date(0).toISOString(),
    createdAt: 0,
    format: 'qpk',
    bundleVersion: 1,
    buildNumber: 'test',
    compression: { algorithm: 'none' },
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
  const entries = Array.from(files.entries()).map(([path, data]) => {
    const pathBytes = utf8(path)
    const entry = new Uint8Array(4 + pathBytes.byteLength + 4 + data.byteLength)
    const view = new DataView(entry.buffer)
    view.setUint32(0, pathBytes.byteLength, true)
    entry.set(pathBytes, 4)
    view.setUint32(4 + pathBytes.byteLength, data.byteLength, true)
    entry.set(data, 4 + pathBytes.byteLength + 4)
    return entry
  })
  const dataSection = concatBytes(entries)
  const manifestBytes = utf8(JSON.stringify(manifest))
  const headerSize = 32
  const bytes = new Uint8Array(headerSize + dataSection.byteLength + manifestBytes.byteLength)
  const view = new DataView(bytes.buffer)
  view.setUint32(0, 0x51504B00, false)
  view.setUint32(4, 1, true)
  view.setUint32(8, 0, true)
  view.setUint32(12, headerSize, true)
  setUint64LE(view, 16, headerSize + dataSection.byteLength)
  setUint64LE(view, 24, manifestBytes.byteLength)
  bytes.set(dataSection, headerSize)
  bytes.set(manifestBytes, headerSize + dataSection.byteLength)
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
