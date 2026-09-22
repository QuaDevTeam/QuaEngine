import type { StoredAsset, StoredBundle } from '@quajs/assets'
import type { Table } from 'dexie'
import Dexie from 'dexie'
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import { describe, expect, it, vi } from 'vitest'
import { createWebAssetStorage } from '../src'

function records(version: number, count = 1, size = 3) {
  const key = `main@${version}#build`
  const assets: StoredAsset[] = Array.from({ length: count }, (_, index) => ({
    id: `${key}:default:data:${index}`,
    bundleName: 'main',
    logicalBundleName: 'main',
    bundleVersionKey: key,
    name: `${index}`,
    type: 'data',
    locale: 'default',
    data: new Uint8Array(size).fill(version),
    hash: '',
    size,
    version,
    mtime: 1,
    createdAt: 1,
    lastAccessed: 1,
  }))
  const bundle = {
    name: 'main',
    logicalName: 'main',
    versionKey: key,
    version,
    buildNumber: 'build',
    active: true,
    hash: `hash-${version}`,
    size: size * count,
    assetCount: count,
    assetIds: assets.map(a => a.id),
    format: 'qpk',
    locales: ['default'],
    createdAt: 1,
    lastUpdated: 1,
    manifest: {},
  } as StoredBundle
  return { bundle, assets }
}

describe('indexedDB bundle publication', () => {
  it('rolls back a failed multi-batch write, reopens complete versions, and only evicts inactive packs', async () => {
    const previous = { ...Dexie.dependencies }
    Dexie.dependencies.indexedDB = new IDBFactory()
    Dexie.dependencies.IDBKeyRange = IDBKeyRange
    const storage = createWebAssetStorage({ databaseName: 'bundle-atomicity' })
    const db = storage as unknown as Dexie & { assets: Table<StoredAsset> }
    try {
      const first = records(1)
      await storage.commitBundle!(first.bundle, first.assets)
      const second = records(2, 2, 9 * 1024 * 1024)
      const original = db.assets.bulkPut.bind(db.assets)
      let batches = 0
      const write = vi.spyOn(db.assets, 'bulkPut').mockImplementation((...args: any[]) => {
        if (++batches === 2)
          throw new Error('QuotaExceededError')
        return (original as any)(...args)
      })
      await expect(storage.commitBundle!(second.bundle, second.assets)).rejects.toThrow('QuotaExceededError')
      write.mockRestore()
      expect((await storage.getBundle('main'))?.version).toBe(1)
      expect(await storage.hasAssets!(second.bundle.assetIds!)).toBe(false)
      expect(await db.assets.count()).toBe(1)
      expect(await storage.cleanupAssets(1)).toBe(0)
      expect(await storage.hasAssets!(first.bundle.assetIds!)).toBe(true)
      await storage.close!()
      await storage.open!()
      let reads = 0
      db.assets.hook('reading', (value) => {
        reads++
        return value
      })
      expect(await storage.hasAssets!(first.bundle.assetIds!)).toBe(true)
      expect(reads).toBe(0)
      const replacement = records(2)
      await storage.commitBundle!(replacement.bundle, replacement.assets)
      expect(await storage.cleanupAssets(3)).toBe(1)
      expect(await storage.getBundle(first.bundle.versionKey!)).toBeUndefined()
      expect(await storage.hasAssets!(replacement.bundle.assetIds!)).toBe(true)
      expect(reads).toBe(0)
    }
    finally {
      await db.delete()
      Object.assign(Dexie.dependencies, previous)
    }
  })
})
