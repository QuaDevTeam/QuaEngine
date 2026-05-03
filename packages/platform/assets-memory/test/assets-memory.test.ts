import type { BundleManifest } from '@quajs/assets'
import { describe, expect, it } from 'vitest'
import { createMemoryAssets, createMemoryAssetsAdapter } from '../src'

describe('assets-memory adapter', () => {
  it('fetches bytes and json from in-memory files', async () => {
    const adapter = createMemoryAssetsAdapter({
      files: {
        'index.json': '{"currentVersion":1}',
        'bytes.bin': new Uint8Array([1, 2, 3]),
      },
    })

    expect(await adapter.fetcher!.fetchJSON('index.json')).toEqual({ currentVersion: 1 })
    expect((await adapter.fetcher!.fetchBytes('memory://bytes.bin') as any).data).toEqual(new Uint8Array([1, 2, 3]))
  })

  it('runs QuaAssets core APIs with the memory adapter', async () => {
    const manifest = createManifest({
      assets: {
        data: {
          'config.json': {
            name: 'config.json',
            path: 'data/config.json',
            relativePath: 'data/config.json',
            size: 11,
            hash: '',
            type: 'data',
            locales: ['default'],
            mimeType: 'application/json',
          },
        },
      },
    })
    const assets = createMemoryAssets({
      files: {
        'main.qpk': createQpkBundle(manifest, new Map([
          ['assets/data/config.json', utf8('{"ok":true}')],
        ])),
      },
    })

    await assets.initialize()
    await assets.loadBundle('main.qpk')

    expect(await assets.getJSON('data', 'config.json')).toEqual({ ok: true })

    await assets.cleanup()
  })

  it('exposes mutable file controls for tests and lightweight runtimes', async () => {
    const adapter = createMemoryAssetsAdapter()

    adapter.setFile('dynamic.txt', 'first')
    expect(new TextDecoder().decode((await adapter.fetcher!.fetchBytes('dynamic.txt') as any).data)).toBe('first')

    adapter.deleteFile('dynamic.txt')
    await expect(adapter.fetcher!.fetchBytes('dynamic.txt')).rejects.toThrow('Memory asset not found')
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
  view.setUint32(16, headerSize + dataSection.byteLength, true)
  view.setUint32(20, 0, true)
  view.setUint32(24, manifestBytes.byteLength, true)
  view.setUint32(28, 0, true)
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

function utf8(value: string): Uint8Array {
  return new TextEncoder().encode(value)
}
