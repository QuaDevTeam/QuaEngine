import { describe, expect, it } from 'vitest'
import { createWebStoreStorage, IndexedDBBackend } from '../src'

describe('store web IndexedDB backend', () => {
  it('persists snapshots and save slots in IndexedDB', async () => {
    const backend = new IndexedDBBackend({ dbName: `QuaStoreWebTest-${crypto.randomUUID()}` })
    await backend.init()

    await backend.saveSnapshot({
      id: 'checkpoint-1',
      storeName: 'engine',
      data: { stepId: 'intro' },
      createdAt: new Date(),
    })

    await backend.saveGameSlot({
      slotId: 'slot-1',
      index: {
        slotId: 'slot-1',
        name: 'Intro',
        timestamp: new Date(),
        revision: 1,
        previewStatus: 'none',
        metadata: { sceneName: 'opening' },
      },
      storeData: {
        state: { stepId: 'intro' },
        snapshots: [],
      },
    })

    const snapshot = await backend.getSnapshot('checkpoint-1')
    const slot = await backend.getGameSlot('slot-1')

    expect(snapshot?.data).toEqual({ stepId: 'intro' })
    expect(slot?.storeData.state).toEqual({ stepId: 'intro' })
    expect(await backend.listSnapshots('engine')).toHaveLength(1)
    expect(await backend.listGameSlots()).toHaveLength(1)

    await backend.close()
  })

  it('creates a StorageConfig for QuaStore injection', () => {
    const storage = createWebStoreStorage({ dbName: 'CustomQuaStore' })

    expect(storage.backend).toEqual({
      driver: IndexedDBBackend,
      options: { dbName: 'CustomQuaStore' },
    })
  })
})
