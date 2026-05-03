import type { AssetCrypto, BundleManifest } from '../src/types'
import { describe, expect, it, vi } from 'vitest'
import { BundleLoader, detectBundleFormat } from '../src/bundle-loader'

const crypto: AssetCrypto = {
  sha256: vi.fn(async () => ''),
}

describe('BundleLoader core', () => {
  it('detects qpk and zip formats from names and bytes', () => {
    expect(detectBundleFormat('story.qpk', new Uint8Array())).toBe('qpk')
    expect(detectBundleFormat('story.zip', new Uint8Array())).toBe('zip')
    expect(detectBundleFormat('story.bundle', new Uint8Array())).toBe('zip')
    expect(detectBundleFormat('story', createQpkBundle(createManifest(), new Map()))).toBe('qpk')
    expect(detectBundleFormat('story', new Uint8Array([0x50, 0x4B, 0x03, 0x04]))).toBe('zip')
  })

  it('parses current qpk header, asset data section, and manifest section', async () => {
    const manifest = createManifest({
      assets: {
        images: {
          'bg.png': {
            name: 'bg.png',
            path: '/fixtures/images/bg.png',
            relativePath: 'images/bg.png',
            size: 7,
            hash: '',
            type: 'images',
            locales: ['default'],
            mimeType: 'image/png',
          },
        },
      },
      totalFiles: 1,
      totalSize: 7,
    })
    const bytes = createQpkBundle(manifest, new Map([
      ['assets/images/bg.png', utf8('pngdata')],
    ]))
    const loader = new BundleLoader({ crypto })

    const result = await loader.loadBundle(bytes, 'main', { format: 'qpk' })

    expect(result.manifest.name).toBe('main')
    expect(result.assets).toHaveLength(1)
    expect(result.assets[0]).toMatchObject({
      id: 'main:default:images:bg.png',
      bundleName: 'main',
      type: 'images',
      name: 'bg.png',
      locale: 'default',
      mimeType: 'image/png',
      size: 7,
    })
    expect(result.assets[0].data).toEqual(utf8('pngdata'))
  })

  it('matches localized bundle paths without using browser APIs', async () => {
    const manifest = createManifest({
      defaultLocale: 'en-us',
      locales: ['en-us', 'zh-cn'],
      assets: {
        data: {
          'config.json': {
            name: 'config.json',
            path: '/fixtures/data/config.json',
            relativePath: 'data/config.json',
            size: 2,
            hash: '',
            type: 'data',
            locales: ['zh-cn'],
            mimeType: 'application/json',
          },
        },
      },
      totalFiles: 1,
      totalSize: 2,
    })
    const bytes = createQpkBundle(manifest, new Map([
      ['assets/data/zh-cn/config.json', utf8('{}')],
    ]))
    const loader = new BundleLoader({ crypto })

    const { assets } = await loader.loadBundle(bytes, 'locale', { format: 'qpk' })

    expect(assets).toHaveLength(1)
    expect(assets[0].id).toBe('locale:zh-cn:data:config.json')
    expect(assets[0].locale).toBe('zh-cn')
  })

  it('uses adapter codec for custom zip decompression', async () => {
    const manifest = createManifest({
      format: 'zip',
      assets: {
        data: {
          'config.json': {
            name: 'config.json',
            path: 'data/config.json',
            relativePath: 'data/config.json',
            size: 2,
            hash: '',
            type: 'data',
            locales: ['default'],
          },
        },
      },
      totalFiles: 1,
      totalSize: 2,
    })
    const loader = new BundleLoader({
      crypto,
      codec: {
        unzip: vi.fn(async () => new Map([
          ['manifest.json', utf8(JSON.stringify(manifest))],
          ['assets/data/config.json', utf8('{}')],
        ])),
      },
    })

    const { assets } = await loader.loadBundle(utf8('zip'), 'main.zip')

    expect(assets[0].data).toEqual(utf8('{}'))
  })

  it('verifies hashes through injected crypto', async () => {
    const hash = 'expected-hash'
    const manifest = createManifest({
      assets: {
        data: {
          'config.json': {
            name: 'config.json',
            path: 'data/config.json',
            relativePath: 'data/config.json',
            size: 2,
            hash,
            type: 'data',
            locales: ['default'],
          },
        },
      },
    })
    const sha256 = vi.fn(async () => hash)
    const loader = new BundleLoader({ crypto: { sha256 } })

    await loader.loadBundle(createQpkBundle(manifest, new Map([
      ['assets/data/config.json', utf8('{}')],
    ])), 'main.qpk')

    expect(sha256).toHaveBeenCalledWith(utf8('{}'))
  })

  it('rejects invalid qpk data as BundleLoadError', async () => {
    const loader = new BundleLoader({ crypto })

    await expect(loader.loadBundle(new Uint8Array([1, 2, 3]), 'broken.qpk'))
      .rejects.toMatchObject({ code: 'BUNDLE_LOAD_ERROR', bundleName: 'broken.qpk' })
  })
})

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
