import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { FileSystemAssetStorage, createNodeAssetsAdapter } from '../src'

describe('assets-node adapter', () => {
  let root: string

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'qua-assets-node-'))
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  it('fetches local filesystem bytes and computes Node crypto hashes', async () => {
    await writeFile(join(root, 'file.txt'), 'hello')
    const adapter = createNodeAssetsAdapter({ rootDir: root, cacheDir: join(root, 'cache') })

    const fetched = await adapter.fetcher!.fetchBytes('file.txt')
    const hash = await adapter.crypto.sha256((fetched as any).data)

    expect(new TextDecoder().decode((fetched as any).data)).toBe('hello')
    expect(hash).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824')
  })

  it('fetches HTTP bytes through global fetch for Node runtimes', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('remote', {
      status: 200,
      headers: { 'content-type': 'text/plain' },
    }))
    const adapter = createNodeAssetsAdapter({ rootDir: root, cacheDir: join(root, 'cache') })

    const fetched = await adapter.fetcher!.fetchBytes('https://cdn.example.com/file.txt')

    expect(new TextDecoder().decode((fetched as any).data)).toBe('remote')
    expect(fetchMock).toHaveBeenCalledWith('https://cdn.example.com/file.txt', { signal: undefined })
  })

  it('persists cached assets in filesystem storage', async () => {
    const storage = new FileSystemAssetStorage(join(root, 'cache'))
    await storage.open()
    await storage.storeAsset({
      id: 'main:default:data:file.txt',
      bundleName: 'main',
      type: 'data',
      name: 'file.txt',
      locale: 'default',
      data: new TextEncoder().encode('cached'),
      hash: '',
      size: 6,
      version: 1,
      mtime: 1,
      createdAt: 1,
      lastAccessed: 1,
    })
    await storage.close()

    const reopened = new FileSystemAssetStorage(join(root, 'cache'))
    await reopened.open()

    expect(new TextDecoder().decode((await reopened.getAsset('main:default:data:file.txt'))!.data)).toBe('cached')
    expect(JSON.parse(await readFile(join(root, 'cache', 'index.json'), 'utf8')).assets).toHaveLength(1)
  })
})
