import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  createNodeStoreStorage,
  QUASTORE_FILE_EXTENSION,
  QuastoreFileBackend,
} from '../src'

const roots: string[] = []

describe('node .quastore file backend', () => {
  afterEach(async () => {
    await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
    delete process.env.QUASTORE_KEY
  })

  it('persists encrypted binary snapshots and save slots using .quastore files', async () => {
    const root = await createTempRoot()
    const backend = new QuastoreFileBackend({
      rootDir: root,
      encryption: { key: 'player-secret' },
    })
    await backend.init()

    await backend.saveSnapshot({
      id: 'checkpoint-1',
      storeName: 'engine',
      data: { playerName: 'Alice', stepId: 'intro' },
      createdAt: new Date('2026-05-24T00:00:00.000Z'),
    })
    const slotPayload = {
      slotId: 'slot-1',
      index: {
        slotId: 'slot-1',
        name: 'Opening',
        timestamp: new Date('2026-05-24T00:01:00.000Z'),
        revision: 1,
        previewStatus: 'none',
        metadata: { sceneName: 'opening' },
      },
      storeData: {
        state: { playerName: 'Alice' },
        snapshots: [],
      },
    }
    await backend.transaction('readwrite', async () => {
      await backend.saveGameSlotPayload(slotPayload)
      await backend.saveGameSlotIndex(slotPayload.index)
    })

    const snapshotFiles = await readdir(join(root, 'snapshots'))
    const slotFiles = await readdir(join(root, 'slot-payloads'))
    const slotIndexFiles = await readdir(join(root, 'slot-indexes'))
    expect(snapshotFiles).toHaveLength(1)
    expect(snapshotFiles[0].endsWith(QUASTORE_FILE_EXTENSION)).toBe(true)
    expect(slotFiles[0].endsWith(QUASTORE_FILE_EXTENSION)).toBe(true)
    expect(slotIndexFiles[0].endsWith(QUASTORE_FILE_EXTENSION)).toBe(true)

    const bytes = await readFile(join(root, 'snapshots', snapshotFiles[0]))
    expect(bytes.subarray(0, 8).toString('ascii')).toBe('QUASTORE')
    expect(bytes.includes(Buffer.from('Alice'))).toBe(false)

    const snapshot = await backend.getSnapshot('checkpoint-1')
    const slot = await backend.getGameSlotPayload('slot-1')
    expect(snapshot?.data).toEqual({ playerName: 'Alice', stepId: 'intro' })
    expect(snapshot?.createdAt).toBeInstanceOf(Date)
    expect(slot?.storeData.state).toEqual({ playerName: 'Alice' })
    expect(await backend.listSnapshots('engine')).toHaveLength(1)
    expect(await backend.listGameSlotIndexes()).toHaveLength(1)
  })

  it('rolls back partial writes when a transaction fails', async () => {
    const root = await createTempRoot()
    const backend = new QuastoreFileBackend({
      rootDir: root,
      encryption: false,
    })
    await backend.init()

    await expect(backend.transaction('readwrite', async () => {
      await backend.saveGameSlotPayload({
        slotId: 'slot-rollback',
        index: {
          slotId: 'slot-rollback',
          name: 'Rollback',
          timestamp: new Date('2026-05-24T00:02:00.000Z'),
          revision: 1,
          previewStatus: 'none',
          metadata: { sceneName: 'rollback' },
        },
        storeData: {
          state: { playerName: 'Alice' },
          snapshots: [],
        },
      })
      await backend.saveGameSlotIndex({
        slotId: 'slot-rollback',
        name: 'Rollback',
        timestamp: new Date('2026-05-24T00:02:00.000Z'),
        revision: 1,
        previewStatus: 'none',
        metadata: { sceneName: 'rollback' },
      })
      throw new Error('transaction failed')
    })).rejects.toThrow('transaction failed')

    expect(await backend.getGameSlotIndex('slot-rollback')).toBeUndefined()
    expect(await backend.getGameSlotPayload('slot-rollback')).toBeUndefined()
    expect(await readdir(join(root, 'slot-indexes'))).toHaveLength(0)
    expect(await readdir(join(root, 'slot-payloads'))).toHaveLength(0)
    expect(await readdir(join(root, 'slot-previews'))).toHaveLength(0)
  })

  it('rolls back and resets transaction state when the action throws synchronously', async () => {
    const root = await createTempRoot()
    const backend = new QuastoreFileBackend({
      rootDir: root,
      encryption: false,
    })
    await backend.init()

    const syncFailureAction = (() => {
      throw new Error('sync failure')
    }) as unknown as () => Promise<never>

    await expect(backend.transaction('readwrite', syncFailureAction)).rejects.toThrow('sync failure')

    await backend.saveGameSlotIndex({
      slotId: 'slot-after-sync-failure',
      name: 'After Sync Failure',
      timestamp: new Date('2026-05-24T00:03:00.000Z'),
      revision: 1,
      previewStatus: 'none',
      metadata: { sceneName: 'after-sync-failure' },
    })

    expect(await backend.getGameSlotIndex('slot-after-sync-failure')).toEqual(expect.objectContaining({
      slotId: 'slot-after-sync-failure',
      name: 'After Sync Failure',
    }))
    expect(await readdir(join(root, 'slot-indexes'))).toHaveLength(1)
  })

  it('uses QUASTORE_KEY when no explicit key is provided', async () => {
    process.env.QUASTORE_KEY = 'environment-secret'
    const root = await createTempRoot()
    const backend = new QuastoreFileBackend({ rootDir: root })
    await backend.init()

    await backend.saveSnapshot({
      id: 'checkpoint-env',
      storeName: 'engine',
      data: { value: 42 },
      createdAt: new Date(),
    })

    expect((await backend.getSnapshot('checkpoint-env'))?.data).toEqual({ value: 42 })
  })

  it('requires a key by default instead of using a fixed built-in secret', async () => {
    const root = await createTempRoot()
    const backend = new QuastoreFileBackend({ rootDir: root })

    await expect(backend.init()).rejects.toThrow(/encryption is enabled by default/)
  })

  it('rejects an empty encryption key', async () => {
    const root = await createTempRoot()
    const backend = new QuastoreFileBackend({
      rootDir: root,
      encryption: { key: '' },
    })

    await expect(backend.init()).rejects.toThrow(/must not be empty/)
  })

  it('can explicitly write development-only plaintext .quastore files', async () => {
    const root = await createTempRoot()
    const backend = new QuastoreFileBackend({
      rootDir: root,
      encryption: false,
    })
    await backend.init()

    await backend.saveSnapshot({
      id: 'plain',
      storeName: 'engine',
      data: { playerName: 'Alice' },
      createdAt: new Date(),
    })

    expect((await backend.getSnapshot('plain'))?.data).toEqual({ playerName: 'Alice' })
  })

  it('refuses plaintext .quastore files when encryption is enabled', async () => {
    const root = await createTempRoot()
    const plaintextBackend = new QuastoreFileBackend({
      rootDir: root,
      encryption: false,
    })
    await plaintextBackend.init()
    await plaintextBackend.saveSnapshot({
      id: 'downgrade',
      storeName: 'engine',
      data: { playerName: 'Alice' },
      createdAt: new Date(),
    })

    const encryptedBackend = new QuastoreFileBackend({
      rootDir: root,
      encryption: { key: 'player-secret' },
    })
    await encryptedBackend.init()

    await expect(encryptedBackend.getSnapshot('downgrade')).rejects.toThrow(/Refusing to read plaintext/)
  })

  it('rejects encrypted .quastore files when the key is wrong', async () => {
    const root = await createTempRoot()
    const writer = new QuastoreFileBackend({
      rootDir: root,
      encryption: { key: 'correct-secret' },
    })
    await writer.init()
    await writer.saveSnapshot({
      id: 'wrong-key',
      storeName: 'engine',
      data: { playerName: 'Alice' },
      createdAt: new Date(),
    })

    const reader = new QuastoreFileBackend({
      rootDir: root,
      encryption: { key: 'wrong-secret' },
    })
    await reader.init()

    await expect(reader.getSnapshot('wrong-key')).rejects.toThrow()
  })

  it('creates a StorageConfig for QuaStore injection', async () => {
    const root = await createTempRoot()
    const storage = createNodeStoreStorage({
      rootDir: root,
      encryption: { key: 'configured-secret' },
    })

    expect(storage.backend).toEqual({
      driver: QuastoreFileBackend,
      options: {
        rootDir: root,
        encryption: { key: 'configured-secret' },
      },
    })
  })
})

async function createTempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'quastore-node-'))
  roots.push(root)
  return root
}
