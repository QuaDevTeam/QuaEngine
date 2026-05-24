import type {
  QuaGameSaveSlot,
  QuaGameSaveSlotMeta,
  QuaSnapshot,
  QuaSnapshotMeta,
  StorageBackend,
  StorageConfig,
  StorageMiddleware,
} from '@quajs/store'
import type { Table } from 'dexie'
import Dexie from 'dexie'

export interface IndexedDBBackendOptions {
  dbName?: string
}

export interface WebStoreStorageOptions extends IndexedDBBackendOptions {
  middlewares?: StorageMiddleware[]
}

class QuaStoreIndexedDB extends Dexie {
  snapshots!: Table<QuaSnapshot, string>
  gameSlots!: Table<QuaGameSaveSlot, string>

  constructor(dbName = 'QuaStore') {
    super(dbName)
    this.version(1).stores({
      snapshots: 'id, storeName, createdAt',
      gameSlots: 'slotId, timestamp, &slotId',
    })
  }
}

export class IndexedDBBackend implements StorageBackend {
  private db: QuaStoreIndexedDB

  constructor(options?: IndexedDBBackendOptions) {
    this.db = new QuaStoreIndexedDB(options?.dbName)
  }

  async init(): Promise<void> {
    await this.db.open()
  }

  async saveSnapshot(snapshot: QuaSnapshot): Promise<void> {
    await this.db.snapshots.put(snapshot)
  }

  async getSnapshot(id: string): Promise<QuaSnapshot | undefined> {
    return await this.db.snapshots.get(id)
  }

  async deleteSnapshot(id: string): Promise<void> {
    await this.db.snapshots.delete(id)
  }

  async listSnapshots(storeName?: string): Promise<QuaSnapshotMeta[]> {
    let collection = this.db.snapshots.orderBy('createdAt').reverse()

    if (storeName) {
      collection = collection.filter((snapshot: QuaSnapshot) => snapshot.storeName === storeName)
    }

    const snapshots = await collection.toArray()
    return snapshots.map(snapshot => ({
      id: snapshot.id,
      storeName: snapshot.storeName,
      createdAt: snapshot.createdAt,
      scope: snapshot.scope,
    }))
  }

  async clearSnapshots(storeName?: string): Promise<void> {
    if (storeName) {
      await this.db.snapshots.where('storeName').equals(storeName).delete()
      return
    }

    await this.db.snapshots.clear()
  }

  async saveGameSlot(slot: QuaGameSaveSlot): Promise<void> {
    await this.db.gameSlots.put(slot)
  }

  async getGameSlot(slotId: string): Promise<QuaGameSaveSlot | undefined> {
    return await this.db.gameSlots.get(slotId)
  }

  async deleteGameSlot(slotId: string): Promise<void> {
    await this.db.gameSlots.delete(slotId)
  }

  async listGameSlots(): Promise<QuaGameSaveSlotMeta[]> {
    const slots = await this.db.gameSlots.orderBy('timestamp').reverse().toArray()
    return slots.map(slot => ({
      slotId: slot.slotId,
      name: slot.name,
      timestamp: slot.timestamp,
      screenshot: slot.screenshot,
      metadata: slot.metadata,
    }))
  }

  async clearGameSlots(): Promise<void> {
    await this.db.gameSlots.clear()
  }

  async close(): Promise<void> {
    this.db.close()
  }
}

export function createWebStoreStorage(options: WebStoreStorageOptions = {}): StorageConfig {
  const { middlewares, ...backendOptions } = options
  return {
    backend: {
      driver: IndexedDBBackend,
      options: backendOptions,
    },
    middlewares,
  }
}
