import type { BundleIdentity, BundleManifest, WorkspaceBundleIndex } from '../src'
import { createHash } from 'node:crypto'
import { zipSync } from 'fflate'
import { describe, expect, it, vi } from 'vitest'
import { MemoryAssetStorage, QuaAssets } from '../src'

const encode = (text: string) => new TextEncoder().encode(text)
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')

function pack(name = 'main', version = 1, files: Record<string, string> = { 'value.txt': `v${version}` }, priority = 0, target?: string) {
  const manifest = {
    name,
    format: 'zip',
    bundleVersion: version,
    buildNumber: `build-${version}`,
    workspaceBundle: { name, priority },
    ...(target ? { assetTarget: { name: target, platform: 'web' } } : {}),
    defaultLocale: 'default',
    assets: { data: Object.fromEntries(Object.entries(files).map(([name, content]) => [name, {
      name,
      type: 'data',
      path: `data/${name}`,
      relativePath: `data/${name}`,
      size: encode(content).length,
      hash: hash(encode(content)),
    }])) },
  } as unknown as BundleManifest
  const bytes = zipSync({
    'manifest.json': encode(JSON.stringify(manifest)),
    ...Object.fromEntries(Object.entries(files).map(([name, content]) => [`assets/data/${name}`, encode(content)])),
  })
  const expected: BundleIdentity = { name, version, buildNumber: `build-${version}`, hash: hash(bytes), ...(target ? { target } : {}) }
  return { bytes, expected, manifest }
}

async function runtime(packs: Record<string, Uint8Array>, storage = new MemoryAssetStorage(), cacheSize = 1024) {
  const fetchBytes = vi.fn(async (url: string) => {
    if (!packs[url])
      throw new Error('offline')
    return packs[url]
  })
  const assets = new QuaAssets({ adapter: { name: 'test', storage, fetcher: { fetchBytes }, crypto: { sha256: async bytes => hash(bytes) } }, cacheSize })
  await assets.initialize()
  return { assets, storage, fetchBytes }
}

describe('versioned loading and cache recovery', () => {
  it('reopens the exact complete version without fetching or parsing an archive', async () => {
    const p = pack()
    const first = await runtime({ 'main.zip': p.bytes })
    await first.assets.loadBundle('main.zip', { expected: p.expected })
    const next = await runtime({}, first.storage)
    const states = vi.fn()
    await next.assets.loadBundle('main.zip', { expected: p.expected, onState: states })
    expect(next.fetchBytes).not.toHaveBeenCalled()
    expect(await next.assets.getText('data', 'value.txt')).toBe('v1')
    expect(states).toHaveBeenLastCalledWith(expect.objectContaining({ phase: 'ready', cacheHit: true, progress: 1 }))
  })

  it('repairs an incomplete cache rather than trusting its bundle row', async () => {
    const p = pack()
    const r = await runtime({ 'main.zip': p.bytes })
    await r.assets.loadBundle('main.zip', { expected: p.expected })
    const bundle = (await r.storage.getBundle('main'))!
    await r.storage.deleteAsset(bundle.assetIds![0])
    await r.assets.loadBundle('main.zip', { expected: p.expected })
    expect(r.fetchBytes).toHaveBeenCalledTimes(2)
    expect(await r.assets.getText('data', 'value.txt')).toBe('v1')
  })

  it('honors cancellation even when a complete cache entry exists', async () => {
    const p = pack()
    const r = await runtime({ 'main.zip': p.bytes })
    await r.assets.loadBundle('main.zip', { expected: p.expected })
    const state = vi.fn()
    await expect(r.assets.loadBundle('main.zip', {
      expected: p.expected,
      signal: { aborted: true },
      onState: state,
    })).rejects.toThrow('aborted')
    expect(r.fetchBytes).toHaveBeenCalledTimes(1)
    expect(state).not.toHaveBeenCalled()
  })

  it('activates a new version and prevents removed files falling back to old data', async () => {
    const a = pack('main', 1, { 'value.txt': 'old', 'removed.txt': 'gone' })
    const b = pack('main', 2)
    const r = await runtime({ 'a.zip': a.bytes, 'b.zip': b.bytes })
    await r.assets.loadBundle('a.zip', { expected: a.expected })
    await r.assets.loadBundle('b.zip', { expected: b.expected })
    expect(await r.assets.getText('data', 'value.txt')).toBe('v2')
    expect(await r.assets.hasAsset('data', 'removed.txt')).toBe(false)
    expect(await r.assets.getText('data', 'value.txt', { bundleVersionKey: 'main@1#build-1' })).toBe('old')
  })

  it('isolates alternative Web targets within the same version and build', async () => {
    const modern = pack('main', 1, { 'value.txt': 'modern' }, 0, 'web-modern')
    const fallback = pack('main', 1, { 'value.txt': 'fallback' }, 0, 'web-fallback')
    const r = await runtime({ 'modern.zip': modern.bytes, 'fallback.zip': fallback.bytes })
    await r.assets.loadBundle('modern.zip', { expected: modern.expected })
    await r.assets.loadBundle('fallback.zip', { expected: fallback.expected })
    expect(await r.assets.getText('data', 'value.txt')).toBe('fallback')
    await r.assets.loadBundle('modern.zip', { expected: modern.expected })
    expect(await r.assets.getText('data', 'value.txt')).toBe('modern')
    expect(r.fetchBytes).toHaveBeenCalledTimes(2)
  })

  it('preserves authored workspace priority when a lower-priority pack loads later', async () => {
    const preferred = pack('preferred', 1, { 'value.txt': 'preferred' }, 10)
    const fallback = pack('fallback', 1, { 'value.txt': 'fallback' }, 0)
    const r = await runtime({ 'preferred.zip': preferred.bytes, 'fallback.zip': fallback.bytes })
    await r.assets.loadBundle('preferred.zip', { expected: preferred.expected })
    await r.assets.loadBundle('fallback.zip', { expected: fallback.expected })
    expect(await r.assets.getText('data', 'value.txt')).toBe('preferred')
  })

  it('rejects a stale CDN archive before changing the active version', async () => {
    const a = pack()
    const b = pack('main', 2)
    const r = await runtime({ 'a.zip': a.bytes, 'b.zip': a.bytes })
    await r.assets.loadBundle('a.zip', { expected: a.expected })
    await expect(r.assets.loadBundle('b.zip', { expected: b.expected })).rejects.toThrow('hash')
    expect((await r.storage.getBundle('main'))?.version).toBe(1)
    expect(await r.assets.getText('data', 'value.txt')).toBe('v1')
  })

  it('does not permit new bytes under an already committed version identity', async () => {
    const a = pack()
    const b = pack('main', 1, { 'value.txt': 'replaced' })
    const r = await runtime({ 'a.zip': a.bytes, 'b.zip': b.bytes })
    await r.assets.loadBundle('a.zip')
    await expect(r.assets.loadBundle('b.zip', { expected: b.expected })).rejects.toThrow('immutable')
    expect(await r.assets.getText('data', 'value.txt')).toBe('v1')
  })

  it('keeps mounted assets usable above the soft budget and with reuse disabled', async () => {
    const p = pack()
    const r = await runtime({ 'main.zip': p.bytes }, new MemoryAssetStorage(), 1)
    await r.assets.loadBundle('main.zip', { expected: p.expected, enableCache: false })
    expect(await r.assets.getText('data', 'value.txt')).toBe('v1')
  })

  it('coalesces concurrent requests and reports completion to both callers', async () => {
    const p = pack()
    const r = await runtime({ 'main.zip': p.bytes })
    const a = vi.fn()
    const b = vi.fn()
    await Promise.all([
      r.assets.loadBundle('main.zip', { expected: p.expected, onState: a }),
      r.assets.loadBundle('main.zip', { expected: p.expected, onState: b }),
    ])
    expect(r.fetchBytes).toHaveBeenCalledTimes(1)
    for (const listener of [a, b]) expect(listener).toHaveBeenLastCalledWith(expect.objectContaining({ phase: 'ready' }))
  })

  it('rejects archives whose manifest references an absent member', async () => {
    const p = pack()
    const bytes = zipSync({ 'manifest.json': encode(JSON.stringify(p.manifest)) })
    const r = await runtime({ 'broken.zip': bytes })
    await expect(r.assets.loadBundle('broken.zip')).rejects.toThrow('Missing bundle member')
    expect(await r.storage.getAllBundles()).toEqual([])
  })
})

describe('workspace pack planning', () => {
  function workspace() {
    const packs = [pack('base'), pack('chapter'), pack('later')]
    const index = { bundles: Object.fromEntries(packs.map((p, i) => [p.expected.name, {
      name: p.expected.name,
      priority: i,
      dependencies: i ? ['base'] : [],
      loadTrigger: i ? 'lazy' : 'immediate',
      latestBundle: { ...p.expected, filename: `${p.expected.name}.zip` },
    }])) } as unknown as WorkspaceBundleIndex
    return { packs, index }
  }

  it('loads immediate packs, then only the requested lazy pack and its dependencies', async () => {
    const { packs, index } = workspace()
    const r = await runtime(Object.fromEntries(packs.map(p => [`${p.expected.name}.zip`, p.bytes])))
    await r.assets.loadWorkspaceBundles(index)
    expect(r.fetchBytes.mock.calls.map(([url]) => url)).toEqual(['base.zip'])
    const state = vi.fn()
    await r.assets.loadWorkspaceBundles(index, ['chapter'], { onBundleState: state })
    expect(r.fetchBytes.mock.calls.map(([url]) => url)).toEqual(['base.zip', 'chapter.zip'])
    expect(state).toHaveBeenLastCalledWith(expect.objectContaining({ bundleIndex: 1, bundleCount: 2, phase: 'ready' }))
  })

  it('rejects missing dependencies, cycles and unavailable targets before any download', async () => {
    const { index } = workspace()
    const r = await runtime({})
    index.bundles.base.dependencies = ['missing']
    await expect(r.assets.loadWorkspaceBundles(index)).rejects.toThrow('Unknown')
    index.bundles.base.dependencies = ['chapter']
    await expect(r.assets.loadWorkspaceBundles(index)).rejects.toThrow('Circular')
    await expect(r.assets.loadWorkspaceBundles(index, ['chapter'], { target: 'web' })).rejects.toThrow('artifact')
    expect(r.fetchBytes).not.toHaveBeenCalled()
  })
})
