import type { AssetProvider, AssetRuntimeAdapter, BundleManifest } from '../src/types'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryAssetStorage, QuaAssets } from '../src'

describe('QuaAssets core runtime', () => {
  let adapter: AssetRuntimeAdapter
  let assets: QuaAssets | undefined

  beforeEach(() => {
    adapter = createAdapter()
  })

  afterEach(async () => {
    await assets?.cleanup()
    assets = undefined
  })

  it('requires adapter injection and validates current config shape', () => {
    expect(() => new QuaAssets({} as any)).toThrow('QuaAssets requires an asset runtime adapter')
    expect(() => new QuaAssets({ adapter, cacheSize: 0 })).toThrow('Cache size must be positive')
    expect(() => new QuaAssets({ adapter, retryAttempts: -1 })).toThrow('Retry attempts must be non-negative')
    expect(() => new QuaAssets({ adapter, timeout: 0 })).toThrow('Timeout must be positive')
    expect(() => new QuaAssets({ adapter, locale: 'zh-cn' })).not.toThrow()
  })

  it('initializes storage, providers, plugins, and event listeners', async () => {
    const plugin = {
      name: 'lifecycle',
      version: '1.0.0',
      initialize: vi.fn(),
      cleanup: vi.fn(),
    }
    const provider: AssetProvider = {
      mode: 'memory',
      init: vi.fn(),
      cleanup: vi.fn(),
      getManifest: vi.fn().mockResolvedValue({ version: '1', assets: [] }),
      getAsset: vi.fn(),
    }
    assets = new QuaAssets({ adapter, provider, plugins: [plugin] })

    await assets.initialize()
    await assets.cleanup()

    expect(provider.init).toHaveBeenCalled()
    expect(provider.cleanup).toHaveBeenCalled()
    expect(plugin.initialize).toHaveBeenCalled()
    expect(plugin.cleanup).toHaveBeenCalled()
  })

  it('loads bundles through adapter fetcher and returns AssetData/bytes/text/json', async () => {
    const manifest = createManifest({
      assets: {
        data: {
          'config.json': {
            name: 'config.json',
            path: 'data/config.json',
            relativePath: 'data/config.json',
            size: 15,
            hash: '',
            type: 'data',
            locales: ['default'],
            mimeType: 'application/json',
          },
        },
      },
      totalFiles: 1,
      totalSize: 15,
    })
    const adapterWithBundle = createAdapter({
      files: {
        'https://cdn.example.com/main.qpk': createQpkBundle(manifest, new Map([
          ['assets/data/config.json', utf8('{"ok":true}')],
        ])),
      },
    })
    assets = new QuaAssets({ endpoint: 'https://cdn.example.com', adapter: adapterWithBundle })
    await assets.initialize()

    const progress = vi.fn()
    await assets.loadBundle('main.qpk', { onProgress: progress })

    expect(assets.getBundleStatus('main')?.state).toBe('loaded')
    expect(progress).toHaveBeenCalledWith(expect.any(Number), expect.any(Number))
    expect(await assets.getText('data', 'config.json')).toBe('{"ok":true}')
    expect(await assets.getJSON<{ ok: boolean }>('data', 'config.json')).toEqual({ ok: true })
    expect((await assets.getAsset('data', 'config.json')).data).toBeInstanceOf(Uint8Array)
  })

  it('uses provider data and forwards provider changes', async () => {
    let watcher: ((change: any) => void) | undefined
    const provider: AssetProvider = {
      mode: 'memory',
      getManifest: vi.fn().mockResolvedValue({
        version: '1',
        assets: [{
          id: 'memory:default:data:config.json',
          name: 'config.json',
          type: 'data',
          locale: 'default',
          path: 'data/config.json',
          mimeType: 'application/json',
        }],
      }),
      getAsset: vi.fn().mockResolvedValue({
        id: 'memory:default:data:config.json',
        bundleName: 'memory',
        type: 'data',
        name: 'config.json',
        locale: 'default',
        data: utf8('{"from":"provider"}'),
        mimeType: 'application/json',
        size: 19,
        version: 1,
        mtime: 1,
        fromCache: false,
      }),
      watch(listener) {
        watcher = listener
        return () => {
          watcher = undefined
        }
      },
    }
    assets = new QuaAssets({ adapter, provider })
    const changed = vi.fn()

    await assets.initialize()
    assets.on('asset:changed', changed)

    expect(await assets.getJSON('data', 'config.json')).toEqual({ from: 'provider' })

    const change = {
      type: 'changed' as const,
      assetId: 'memory:default:data:config.json',
      timestamp: Date.now(),
    }
    watcher?.(change)
    expect(changed).toHaveBeenCalledWith(change)
  })

  it('checks bundle indexes through adapter fetcher', async () => {
    const runtimeAdapter = createAdapter({
      files: {
        'https://cdn.example.com/index.json': utf8(JSON.stringify({
          currentVersion: 1,
          currentBuild: 'build-1',
          latestBundle: {
            filename: 'main.qpk',
            hash: 'hash',
            version: 1,
            buildNumber: 'build-1',
            created: new Date(0).toISOString(),
            size: 10,
          },
          previousBuilds: [],
          availablePatches: [],
        })),
      },
    })
    assets = new QuaAssets({ endpoint: 'https://cdn.example.com', adapter: runtimeAdapter })
    await assets.initialize()

    expect(await assets.checkLatest()).toMatchObject({
      currentVersion: 1,
      latestBundle: { filename: 'main.qpk' },
    })
  })

  it('returns patch errors instead of throwing when adapter fetch fails', async () => {
    assets = new QuaAssets({ adapter })
    await assets.initialize()

    const result = await assets.applyPatch('missing.qpk', 'main')

    expect(result.success).toBe(false)
    expect(result.errors[0]).toContain('Memory file not found')
  })

  it('clears storage-backed cache without legacy Blob URL state', async () => {
    assets = new QuaAssets({ adapter })
    await assets.initialize()

    expect(await assets.getCacheStats()).toMatchObject({
      bundles: 0,
      totalSize: 0,
    })

    await assets.clearAllCache()
    expect(assets.getAllBundleStatuses().size).toBe(0)
  })
})

function createAdapter(options: { files?: Record<string, Uint8Array> } = {}): AssetRuntimeAdapter {
  const files = new Map(Object.entries(options.files || {}))
  return {
    name: 'test-memory',
    storage: new MemoryAssetStorage(),
    fetcher: {
      async fetchBytes(url, requestOptions = {}) {
        const data = files.get(url) || files.get(url.replace(/^\/+/, ''))
        if (!data) {
          throw new Error(`Memory file not found: ${url}`)
        }
        requestOptions.onProgress?.(data.byteLength, data.byteLength)
        return { data: new Uint8Array(data), size: data.byteLength }
      },
      async fetchJSON(url) {
        const data = files.get(url) || files.get(url.replace(/^\/+/, ''))
        if (!data) {
          throw new Error(`Memory JSON file not found: ${url}`)
        }
        return JSON.parse(new TextDecoder().decode(data))
      },
    },
    crypto: {
      async sha256() {
        return ''
      },
    },
    now: () => 1_700_000_000_000,
  }
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
