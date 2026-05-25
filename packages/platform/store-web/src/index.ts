import type {
  QuaGameSavePreviewRecord,
  QuaGameSaveSlotIndex,
  QuaGameSaveSlotPayload,
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
  gameSlotIndexes!: Table<QuaGameSaveSlotIndex, string>
  gameSlotPayloads!: Table<QuaGameSaveSlotPayload, string>
  gameSlotPreviews!: Table<QuaGameSavePreviewRecord, string>

  constructor(dbName = 'QuaStore') {
    super(dbName)
    this.version(2).stores({
      snapshots: 'id, storeName, createdAt',
      gameSlotIndexes: 'slotId, timestamp, &slotId',
      gameSlotPayloads: 'slotId, &slotId',
      gameSlotPreviews: 'previewId, slotId, &previewId',
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

  async saveGameSlotIndex(slot: QuaGameSaveSlotIndex): Promise<void> {
    await this.db.gameSlotIndexes.put(slot)
  }

  async getGameSlotIndex(slotId: string): Promise<QuaGameSaveSlotIndex | undefined> {
    return await this.db.gameSlotIndexes.get(slotId)
  }

  async listGameSlotIndexes(): Promise<QuaGameSaveSlotIndex[]> {
    return await this.db.gameSlotIndexes.orderBy('timestamp').reverse().toArray()
  }

  async deleteGameSlotIndex(slotId: string): Promise<void> {
    await this.db.gameSlotIndexes.delete(slotId)
  }

  async saveGameSlotPayload(slot: QuaGameSaveSlotPayload): Promise<void> {
    await this.db.gameSlotPayloads.put(slot)
  }

  async getGameSlotPayload(slotId: string): Promise<QuaGameSaveSlotPayload | undefined> {
    return await this.db.gameSlotPayloads.get(slotId)
  }

  async deleteGameSlotPayload(slotId: string): Promise<void> {
    await this.db.gameSlotPayloads.delete(slotId)
  }

  async saveGameSlotPreview(preview: QuaGameSavePreviewRecord): Promise<void> {
    await this.db.gameSlotPreviews.put(preview)
  }

  async getGameSlotPreview(previewId: string): Promise<QuaGameSavePreviewRecord | undefined> {
    return await this.db.gameSlotPreviews.get(previewId)
  }

  async deleteGameSlotPreview(previewId: string): Promise<void> {
    await this.db.gameSlotPreviews.delete(previewId)
  }

  async saveGameSlot(slot: QuaGameSaveSlotPayload): Promise<void> {
    await this.saveGameSlotPayload(slot)
    await this.saveGameSlotIndex(slot.index)
  }

  async getGameSlot(slotId: string): Promise<QuaGameSaveSlotPayload | undefined> {
    return await this.getGameSlotPayload(slotId)
  }

  async listGameSlots(): Promise<QuaGameSaveSlotIndex[]> {
    return await this.listGameSlotIndexes()
  }

  async clearGameSlots(): Promise<void> {
    await this.db.transaction('rw', this.db.gameSlotIndexes, this.db.gameSlotPayloads, this.db.gameSlotPreviews, async () => {
      await this.db.gameSlotIndexes.clear()
      await this.db.gameSlotPayloads.clear()
      await this.db.gameSlotPreviews.clear()
    })
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
