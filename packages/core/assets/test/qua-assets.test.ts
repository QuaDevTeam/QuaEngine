import type { AssetProvider, AssetRuntimeAdapter, BundleManifest } from '../src/types'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryAssetStorage, QuaAssets } from '../src'

describe('quaAssets core runtime', () => {
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

  it('normalizes locale and emits asset changes when locale switches', () => {
    assets = new QuaAssets({ adapter, locale: 'zh-CN' })
    const changed = vi.fn()
    assets.on('asset:changed', changed)

    expect(assets.getLocale()).toBe('zh-cn')

    assets.setLocale('en_US')
    assets.setLocale('en-US')

    expect(assets.getLocale()).toBe('en-us')
    expect(changed).toHaveBeenCalledTimes(1)
    expect(changed).toHaveBeenCalledWith(expect.objectContaining({
      type: 'changed',
      assetId: 'locale:en-us',
      path: 'locale',
    }))
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

  it('loads and formats i18n catalogs with locale fallback', async () => {
    const manifest = createManifest({
      locales: ['default', 'zh'],
      assets: {
        data: {
          'i18n/messages.json': {
            name: 'messages.json',
            path: 'data/i18n/messages.json',
            relativePath: 'data/i18n/messages.json',
            size: 2,
            hash: '',
            type: 'data',
            locales: ['default', 'zh'],
            mimeType: 'application/json',
            variants: {
              default: {
                locale: 'default',
                path: 'data/i18n/messages.json',
                relativePath: 'data/i18n/messages.json',
                size: 48,
                hash: '',
              },
              zh: {
                locale: 'zh',
                path: 'data/i18n/messages.zh.json',
                relativePath: 'data/i18n/messages.zh.json',
                size: 38,
                hash: '',
              },
            },
          },
        },
      },
      totalFiles: 2,
      totalSize: 86,
    })
    const adapterWithBundle = createAdapter({
      files: {
        'https://cdn.example.com/i18n.qpk': createQpkBundle(manifest, new Map([
          ['assets/data/i18n/messages.json', utf8('{"hello":"Hello {name}","bye":"Bye"}')],
          ['assets/data/i18n/messages.zh.json', utf8('{"hello":"你好 {name}"}')],
        ])),
      },
    })
    assets = new QuaAssets({
      endpoint: 'https://cdn.example.com',
      adapter: adapterWithBundle,
      locale: 'zh-cn',
    })
    await assets.initialize()
    await assets.loadBundle('i18n.qpk')

    expect(await assets.translate('hello', { name: 'Yuki' })).toBe('你好 Yuki')
    expect(await assets.translate('hello', { values: { name: 'Yuki' } })).toBe('你好 Yuki')
    expect(await assets.translate('bye')).toBe('Bye')
    expect(await assets.translate('missing', { missing: 'key' })).toBe('missing')
  })

  it('mounts dynamic QPK bundles side by side and resolves by priority before locale fallback', async () => {
    const lowManifest = createDynamicManifest('low', 'runtime.low', 1, {
      locales: ['zh-cn'],
      version: 1,
    })
    const highManifest = createDynamicManifest('high', 'runtime.high', 10, {
      locales: ['default'],
      version: 1,
    })
    const adapterWithBundles = createAdapter({
      files: {
        'https://cdn.example.com/low.qpk': createQpkBundle(lowManifest, new Map([
          ['assets/data/shared.txt', utf8('low-localized')],
        ])),
        'https://cdn.example.com/high.qpk': createQpkBundle(highManifest, new Map([
          ['assets/data/shared.txt', utf8('high-default')],
        ])),
      },
    })
    assets = new QuaAssets({
      endpoint: 'https://cdn.example.com',
      adapter: adapterWithBundles,
      locale: 'zh-cn',
      enableCache: false,
    })
    const changed = vi.fn()
    const unloaded = vi.fn()

    await assets.initialize()
    assets.on('asset:changed', changed)
    assets.on('dynamic-bundle:unloaded', unloaded)

    const low = await assets.loadDynamicBundle('low.qpk', { enableCache: false })
    const high = await assets.loadDynamicBundle('high.qpk', { enableCache: false })

    expect(low).toEqual(expect.objectContaining({ packageId: 'runtime.low', bundleName: 'low', priority: 1 }))
    expect(high).toEqual(expect.objectContaining({ packageId: 'runtime.high', bundleName: 'high', priority: 10 }))
    expect(await assets.getBundleManifest('high')).toEqual(expect.objectContaining({
      runtimePackage: expect.objectContaining({ id: 'runtime.high' }),
    }))
    expect(await assets.getText('data', 'shared.txt')).toBe('high-default')
    expect(await assets.getText('data', 'shared.txt', { bundleName: 'low', locale: 'zh-cn' })).toBe('low-localized')

    await assets.unloadDynamicBundle('runtime.high')

    expect(await assets.getText('data', 'shared.txt')).toBe('low-localized')
    expect(changed).toHaveBeenCalledWith(expect.objectContaining({
      type: 'removed',
      assetId: 'high@1#test:default:data:data/shared.txt',
    }))
    expect(unloaded).toHaveBeenCalledWith({ packageId: 'runtime.high', bundleName: 'high' })
  })

  it('resolves target-aware locale packs without leaking into unrelated runtime packages', async () => {
    const baseManifest = createDynamicManifest('base', 'runtime.base', 1, {
      locales: ['default'],
      version: 1,
    })
    const baseLocaleManifest = createDynamicManifest('base-locale', 'runtime.base.locale.zh-cn', 1, {
      locales: ['zh-cn'],
      version: 1,
    })
    baseLocaleManifest.runtimePackage = {
      ...baseLocaleManifest.runtimePackage!,
      dependencies: ['runtime.base'],
      localePack: {
        locale: 'zh-cn',
        targets: [{ kind: 'runtimePackage', id: 'runtime.base' }],
        resourceTypes: ['data'],
      },
    }
    const otherLocaleManifest = createDynamicManifest('other-locale', 'runtime.other.locale.zh-cn', 50, {
      locales: ['zh-cn'],
      version: 1,
    })
    otherLocaleManifest.runtimePackage = {
      ...otherLocaleManifest.runtimePackage!,
      localePack: {
        locale: 'zh-cn',
        targets: [{ kind: 'runtimePackage', id: 'runtime.other' }],
        resourceTypes: ['data'],
      },
    }
    baseManifest.assets.data!['i18n/messages.json'] = createCatalogAsset(['default'])
    baseLocaleManifest.assets.data!['i18n/messages.json'] = createCatalogAsset(['zh-cn'])
    otherLocaleManifest.assets.data!['i18n/messages.json'] = createCatalogAsset(['zh-cn'])

    const adapterWithBundles = createAdapter({
      files: {
        'https://cdn.example.com/base.qpk': createQpkBundle(baseManifest, new Map([
          ['assets/data/shared.txt', utf8('base-default')],
          ['assets/data/i18n/messages.json', utf8('{"hello":"Base default"}')],
        ])),
        'https://cdn.example.com/base-locale.qpk': createQpkBundle(baseLocaleManifest, new Map([
          ['assets/data/shared.txt', utf8('base-localized')],
          ['assets/data/i18n/messages.json', utf8('{"hello":"Base localized"}')],
        ])),
        'https://cdn.example.com/other-locale.qpk': createQpkBundle(otherLocaleManifest, new Map([
          ['assets/data/shared.txt', utf8('other-localized')],
          ['assets/data/i18n/messages.json', utf8('{"hello":"Other localized"}')],
        ])),
      },
    })
    assets = new QuaAssets({
      endpoint: 'https://cdn.example.com',
      adapter: adapterWithBundles,
      locale: 'zh-CN',
      enableCache: false,
    })
    await assets.initialize()
    await assets.loadDynamicBundle('base.qpk', { enableCache: false })
    await assets.loadDynamicBundle('base-locale.qpk', { enableCache: false })
    await assets.loadDynamicBundle('other-locale.qpk', { enableCache: false })

    expect(await assets.getText('data', 'shared.txt', { targetPackageId: 'runtime.base' })).toBe('base-localized')
    expect(await assets.getText('data', 'shared.txt', { targetPackageId: 'runtime.other' })).toBe('other-localized')
    expect(await assets.getText('data', 'shared.txt', { bundleName: 'base', targetPackageId: 'runtime.base' })).toBe('base-localized')
    expect(await assets.translate('hello', { targetPackageId: 'runtime.base' })).toBe('Base localized')
    expect(await assets.translate('hello', { targetPackageId: 'runtime.other' })).toBe('Other localized')

    assets.setLocale('ja-JP')

    expect(await assets.getText('data', 'shared.txt', { targetPackageId: 'runtime.base' })).toBe('base-default')
    expect(await assets.translate('hello', { targetPackageId: 'runtime.base' })).toBe('Base default')
  })

  it('keeps all dynamic bundle versions side by side and allows downgrade by reloading an old version', async () => {
    const firstManifest = createDynamicManifest('runtime', 'runtime.story', 1, {
      locales: ['default'],
      version: 1,
    })
    firstManifest.assets.data!['old.txt'] = {
      name: 'old.txt',
      path: 'data/old.txt',
      relativePath: 'data/old.txt',
      size: 0,
      hash: '',
      type: 'data',
      locales: ['default'],
      mimeType: 'text/plain',
      version: 1,
    }
    firstManifest.totalFiles = 2
    const replacementManifest = createDynamicManifest('runtime', 'runtime.story', 2, {
      locales: ['default'],
      version: 2,
    })
    replacementManifest.bundleVersion = 2
    replacementManifest.buildNumber = 'test-v2'
    const adapterWithBundles = createAdapter({
      files: {
        'https://cdn.example.com/runtime-a.qpk': createQpkBundle(firstManifest, new Map([
          ['assets/data/shared.txt', utf8('first')],
          ['assets/data/old.txt', utf8('old')],
        ])),
        'https://cdn.example.com/runtime-b.qpk': createQpkBundle(replacementManifest, new Map([
          ['assets/data/shared.txt', utf8('replacement')],
        ])),
      },
    })
    assets = new QuaAssets({
      endpoint: 'https://cdn.example.com',
      adapter: adapterWithBundles,
    })
    const changed = vi.fn()
    await assets.initialize()
    assets.on('asset:changed', changed)

    const first = await assets.loadDynamicBundle('runtime-a.qpk')
    expect(await assets.getText('data', 'shared.txt', { bundleName: 'runtime' })).toBe('first')
    expect(await assets.getText('data', 'old.txt', { bundleName: 'runtime' })).toBe('old')

    const second = await assets.loadDynamicBundle('runtime-b.qpk')
    expect(await assets.getText('data', 'shared.txt', { bundleName: 'runtime' })).toBe('replacement')
    await expect(assets.getText('data', 'old.txt', { bundleName: 'runtime' })).rejects.toThrow('Asset not found')
    expect(changed).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'removed' }))

    await assets.loadDynamicBundle('runtime-a.qpk')
    expect(await assets.getText('data', 'shared.txt', { bundleName: 'runtime' })).toBe('first')
    expect(await assets.getText('data', 'old.txt', { bundleName: 'runtime' })).toBe('old')
    expect(await assets.getText('data', 'shared.txt', { bundleVersionKey: second.bundleVersionKey })).toBe('replacement')
    expect(await assets.getText('data', 'shared.txt', { targetPackageId: 'runtime.story' })).toBe('first')
    await expect(assets.getText('data', 'old.txt', { bundleVersionKey: second.bundleVersionKey })).rejects.toThrow('Asset not found')

    const storedBundles = await adapterWithBundles.storage.getAllBundles()
    expect(storedBundles.map(bundle => bundle.versionKey).sort()).toEqual([first.bundleVersionKey, second.bundleVersionKey].sort())
  })

  it('filters incompatible resource versions but permits compatible downgrade resolution', async () => {
    const compatibleManifest = createDynamicManifest('runtime', 'runtime.story', 1, {
      locales: ['default'],
      version: 1,
    })
    compatibleManifest.compatibility = { minGameVersion: '1.0.0' }
    compatibleManifest.runtimePackage = {
      ...compatibleManifest.runtimePackage!,
      compatibility: { minGameVersion: '1.0.0' },
    }
    const incompatibleManifest = createDynamicManifest('runtime', 'runtime.story', 1, {
      locales: ['default'],
      version: 2,
    })
    incompatibleManifest.bundleVersion = 2
    incompatibleManifest.buildNumber = 'test-v2'
    incompatibleManifest.compatibility = { minGameVersion: '2.0.0' }
    incompatibleManifest.runtimePackage = {
      ...incompatibleManifest.runtimePackage!,
      compatibility: { minGameVersion: '2.0.0' },
    }
    const adapterWithBundles = createAdapter({
      files: {
        'https://cdn.example.com/runtime-v1.qpk': createQpkBundle(compatibleManifest, new Map([
          ['assets/data/shared.txt', utf8('compatible')],
        ])),
        'https://cdn.example.com/runtime-v2.qpk': createQpkBundle(incompatibleManifest, new Map([
          ['assets/data/shared.txt', utf8('incompatible')],
        ])),
      },
    })
    assets = new QuaAssets({
      endpoint: 'https://cdn.example.com',
      adapter: adapterWithBundles,
      appVersion: '1.0.0',
    })
    await assets.initialize()

    await assets.loadDynamicBundle('runtime-v1.qpk')
    await expect(assets.loadDynamicBundle('runtime-v2.qpk')).rejects.toThrow('requires game version 2.0.0')

    expect(await assets.getText('data', 'shared.txt', { bundleName: 'runtime' })).toBe('compatible')
  })

  it('applies patches atomically with full relative paths and preserves previous bundle versions', async () => {
    const baseManifest = createManifest({
      name: 'main',
      bundleVersion: 1,
      buildNumber: 'base',
      compatibility: { minGameVersion: '1.0.0' },
      assets: {
        data: {
          'folder-a/same.txt': createDataAsset('folder-a/same.txt', 'hash-a'),
          'folder-b/same.txt': createDataAsset('folder-b/same.txt', 'hash-b'),
          'keep.txt': createDataAsset('keep.txt', 'hash-keep'),
        },
      },
      totalFiles: 3,
      totalSize: 3,
    })
    const patchManifest = createManifest({
      name: 'main-patch',
      isPatch: true,
      patchVersion: 1002,
      fromVersion: 1,
      toVersion: 2,
      compatibility: { minGameVersion: '1.0.0' },
      assets: {
        data: {
          'folder-b/same.txt': createDataAsset('folder-b/same.txt', 'hash-b2', 2),
          'new.txt': createDataAsset('new.txt', 'hash-new', 1),
        },
      },
      changes: {
        added: [{ path: 'data/new.txt', operation: 'added', newHash: 'hash-new', newVersion: 1 }],
        modified: [{ path: 'data/folder-b/same.txt', operation: 'modified', oldHash: 'hash-b', newHash: 'hash-b2', newVersion: 2 }],
        deleted: [{ path: 'data/folder-a/same.txt', operation: 'deleted', oldHash: 'hash-a' }],
      },
      totalChanges: 3,
      totalFiles: 2,
    })
    const adapterWithBundles = createAdapter({
      files: {
        'https://cdn.example.com/main.qpk': createQpkBundle(baseManifest, new Map([
          ['assets/data/folder-a/same.txt', utf8('a')],
          ['assets/data/folder-b/same.txt', utf8('b')],
          ['assets/data/keep.txt', utf8('keep')],
        ])),
        'https://cdn.example.com/main.patch.qpk': createQpkBundle(patchManifest, new Map([
          ['assets/data/folder-b/same.txt', utf8('b2')],
          ['assets/data/new.txt', utf8('new')],
        ])),
      },
    })
    assets = new QuaAssets({
      endpoint: 'https://cdn.example.com',
      adapter: adapterWithBundles,
      appVersion: '1.0.0',
    })
    await assets.initialize()
    await assets.loadBundle('main.qpk')

    const result = await assets.applyPatch('main.patch.qpk', 'main')

    expect(result).toEqual({
      success: true,
      changes: { added: 1, modified: 1, deleted: 1 },
      errors: [],
    })
    expect(await assets.getText('data', 'same.txt', { bundleName: 'main' })).toBe('b2')
    expect(await assets.getText('data', 'keep.txt', { bundleName: 'main' })).toBe('keep')
    expect(await assets.getText('data', 'new.txt', { bundleName: 'main' })).toBe('new')
    await expect(assets.getText('data', 'same.txt', { bundleName: 'main', bundleVersionKey: 'main@2#test' })).resolves.toBe('b2')
    await expect(assets.getText('data', 'same.txt', { bundleName: 'main', bundleVersionKey: 'main@1#base' })).resolves.toBe('a')
    await expect(assets.getText('data', 'same.txt', { bundleVersionKey: 'main@2#test' })).resolves.toBe('b2')

    const bundles = await adapterWithBundles.storage.getAllBundles()
    expect(bundles.map(bundle => bundle.versionKey).sort()).toEqual(['main@1#base', 'main@2#test'])
    expect((await assets.getBundleManifest('main'))?.assets.data?.['data/folder-a/same.txt']).toBeUndefined()
  })

  it('does not mutate active bundle assets when patch precheck fails', async () => {
    const baseManifest = createManifest({
      name: 'main',
      bundleVersion: 1,
      buildNumber: 'base',
      compatibility: { minGameVersion: '1.0.0' },
      assets: {
        data: {
          'keep.txt': createDataAsset('keep.txt', 'hash-keep'),
        },
      },
      totalFiles: 1,
      totalSize: 1,
    })
    const badPatchManifest = createManifest({
      name: 'main-patch',
      isPatch: true,
      patchVersion: 1002,
      fromVersion: 1,
      toVersion: 2,
      compatibility: { minGameVersion: '1.0.0' },
      assets: {
        data: {
          'keep.txt': createDataAsset('keep.txt', 'hash-new'),
        },
      },
      changes: {
        added: [],
        modified: [{ path: 'data/keep.txt', operation: 'modified', oldHash: 'wrong-old-hash', newHash: 'hash-new' }],
        deleted: [],
      },
      totalChanges: 1,
      totalFiles: 1,
    })
    const adapterWithBundles = createAdapter({
      files: {
        'https://cdn.example.com/main.qpk': createQpkBundle(baseManifest, new Map([
          ['assets/data/keep.txt', utf8('keep')],
        ])),
        'https://cdn.example.com/bad.patch.qpk': createQpkBundle(badPatchManifest, new Map([
          ['assets/data/keep.txt', utf8('new')],
        ])),
      },
    })
    assets = new QuaAssets({
      endpoint: 'https://cdn.example.com',
      adapter: adapterWithBundles,
      appVersion: '1.0.0',
    })
    await assets.initialize()
    await assets.loadBundle('main.qpk')

    const result = await assets.applyPatch('bad.patch.qpk', 'main')

    expect(result.success).toBe(false)
    expect(result.errors).toContain('Patch modification hash mismatch: data/keep.txt')
    expect(await assets.getText('data', 'keep.txt', { bundleName: 'main' })).toBe('keep')
    expect((await adapterWithBundles.storage.getAllBundles()).map(bundle => bundle.versionKey)).toEqual(['main@1#base'])
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

  it('clears storage-backed cache without Blob URL state', async () => {
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
      async sha256(data) {
        const text = new TextDecoder().decode(data)
        const hashes: Record<string, string> = {
          a: 'hash-a',
          b: 'hash-b',
          b2: 'hash-b2',
          new: 'hash-new',
          keep: 'hash-keep',
        }
        return hashes[text] || ''
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

function createDynamicManifest(
  bundleName: string,
  packageId: string,
  priority: number,
  asset: { locales: string[], version: number },
): BundleManifest {
  return createManifest({
    name: bundleName,
    locales: asset.locales,
    defaultLocale: asset.locales.includes('default') ? 'default' : asset.locales[0],
    assets: {
      data: {
        'shared.txt': {
          name: 'shared.txt',
          path: 'data/shared.txt',
          relativePath: 'data/shared.txt',
          size: 0,
          hash: '',
          type: 'data',
          locales: asset.locales,
          mimeType: 'text/plain',
          version: asset.version,
        },
      },
    },
    totalFiles: 1,
    runtimePackage: {
      id: packageId,
      version: '1.0.0',
      priority,
      scripts: [],
      plugins: [],
      storyGraphDeltas: [],
      storeMigrations: [],
      signature: { value: `${packageId}.signature` },
    },
  })
}

function createCatalogAsset(locales: string[]) {
  return {
    name: 'messages.json',
    path: 'data/i18n/messages.json',
    relativePath: 'data/i18n/messages.json',
    size: 0,
    hash: '',
    type: 'data' as const,
    locales,
    mimeType: 'application/json',
  }
}

function createDataAsset(path: string, hash = '', version = 1) {
  const normalizedPath = path.replace(/^data\//, '')
  return {
    name: normalizedPath.split('/').pop() || normalizedPath,
    path: `data/${normalizedPath}`,
    relativePath: `data/${normalizedPath}`,
    size: 0,
    hash,
    type: 'data' as const,
    locales: ['default'],
    mimeType: 'text/plain',
    version,
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
