import Dexie, { type Table } from 'dexie';
import { QuaSnapshot, QuaSnapshotMeta, QuaGameSaveSlot, QuaGameSaveSlotMeta } from '../types/base';
import { StorageBackend } from '../types/storage';

class QuaStoreDB extends Dexie {
  snapshots!: Table<QuaSnapshot, string>;
  gameSlots!: Table<QuaGameSaveSlot, string>;

  constructor(dbName = 'QuaStore') {
    super(dbName);
    this.version(1).stores({
      snapshots: 'id, storeName, createdAt',
      gameSlots: 'slotId, timestamp, &slotId'
    });
  }
}

/**
 * IndexedDB storage backend implementation
 */
export class IndexedDBBackend implements StorageBackend {
  private db: QuaStoreDB;
  private dbName: string;

  constructor(options?: { dbName?: string }) {
    this.dbName = options?.dbName || 'QuaStore';
    this.db = new QuaStoreDB(this.dbName);
  }

  async init(): Promise<void> {
    // Ensure database is open
    await this.db.open();
  }

  // Snapshot methods (runtime game state)
  async saveSnapshot(snapshot: QuaSnapshot): Promise<void> {
    await this.db.snapshots.put(snapshot);
  }

  async getSnapshot(id: string): Promise<QuaSnapshot | undefined> {
    return await this.db.snapshots.get(id);
  }

  async deleteSnapshot(id: string): Promise<void> {
    await this.db.snapshots.delete(id);
  }

  async listSnapshots(storeName?: string): Promise<QuaSnapshotMeta[]> {
    let collection = this.db.snapshots.orderBy('createdAt').reverse();

    if (storeName) {
      collection = collection.filter((snapshot: QuaSnapshot) => snapshot.storeName === storeName);
    }

    const snapshots = await collection.toArray();
    return snapshots.map((snapshot: QuaSnapshot) => ({
      id: snapshot.id,
      storeName: snapshot.storeName,
      createdAt: snapshot.createdAt
    }));
  }

  async clearSnapshots(storeName?: string): Promise<void> {
    if (storeName) {
      await this.db.snapshots.where('storeName').equals(storeName).delete();
    } else {
      await this.db.snapshots.clear();
    }
  }

  // Game slot methods (persistent save files)
  async saveGameSlot(slot: QuaGameSaveSlot): Promise<void> {
    await this.db.gameSlots.put(slot);
  }

  async getGameSlot(slotId: string): Promise<QuaGameSaveSlot | undefined> {
    return await this.db.gameSlots.get(slotId);
  }

  async deleteGameSlot(slotId: string): Promise<void> {
    await this.db.gameSlots.delete(slotId);
  }

  async listGameSlots(): Promise<QuaGameSaveSlotMeta[]> {
    const slots = await this.db.gameSlots.orderBy('timestamp').reverse().toArray();
    return slots.map((slot: QuaGameSaveSlot) => ({
      slotId: slot.slotId,
      name: slot.name,
      timestamp: slot.timestamp,
      screenshot: slot.screenshot,
      metadata: slot.metadata
    }));
  }

  async clearGameSlots(): Promise<void> {
    await this.db.gameSlots.clear();
  }

  async close(): Promise<void> {
    await this.db.close();
  }
}