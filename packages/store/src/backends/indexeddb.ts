import Dexie, { type Table } from 'dexie';
import { QSSnapshot, QSSnapshotMeta } from '../types/base';
import { StorageBackend } from '../types/storage';

class QuaStoreDB extends Dexie {
  snapshots!: Table<QSSnapshot, string>;

  constructor(dbName = 'QuaStore') {
    super(dbName);
    this.version(1).stores({
      snapshots: 'id, storeName, createdAt',
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

  async saveSnapshot(snapshot: QSSnapshot): Promise<void> {
    await this.db.snapshots.put(snapshot);
  }

  async getSnapshot(id: string): Promise<QSSnapshot | undefined> {
    return await this.db.snapshots.get(id);
  }

  async deleteSnapshot(id: string): Promise<void> {
    await this.db.snapshots.delete(id);
  }

  async listSnapshots(storeName?: string): Promise<QSSnapshotMeta[]> {
    let collection = this.db.snapshots.orderBy('createdAt').reverse();
    
    if (storeName) {
      collection = collection.filter((snapshot: QSSnapshot) => snapshot.storeName === storeName);
    }

    const snapshots = await collection.toArray();
    return snapshots.map((snapshot: QSSnapshot) => ({
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

  async close(): Promise<void> {
    await this.db.close();
  }
}