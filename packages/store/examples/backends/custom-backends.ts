import { StorageBackend } from '../types/storage';
import { QSSnapshot, QSSnapshotMeta } from '../types/base';

/**
 * In-memory storage backend for testing and development
 * WARNING: Data will be lost when the application is closed!
 */
export class MemoryBackend implements StorageBackend {
  private storage: Map<string, QSSnapshot> = new Map();

  async init(): Promise<void> {
    // No initialization needed for memory storage
  }

  async saveSnapshot(snapshot: QSSnapshot): Promise<void> {
    this.storage.set(snapshot.id, { ...snapshot });
  }

  async getSnapshot(id: string): Promise<QSSnapshot | undefined> {
    const snapshot = this.storage.get(id);
    return snapshot ? { ...snapshot } : undefined;
  }

  async deleteSnapshot(id: string): Promise<void> {
    this.storage.delete(id);
  }

  async listSnapshots(storeName?: string): Promise<QSSnapshotMeta[]> {
    const snapshots = Array.from(this.storage.values());
    const filtered = storeName 
      ? snapshots.filter(s => s.storeName === storeName)
      : snapshots;

    return filtered
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map(snapshot => ({
        id: snapshot.id,
        storeName: snapshot.storeName,
        createdAt: snapshot.createdAt
      }));
  }

  async clearSnapshots(storeName?: string): Promise<void> {
    if (storeName) {
      for (const [id, snapshot] of this.storage.entries()) {
        if (snapshot.storeName === storeName) {
          this.storage.delete(id);
        }
      }
    } else {
      this.storage.clear();
    }
  }

  async close(): Promise<void> {
    this.storage.clear();
  }
}

/**
 * LocalStorage backend for browser environments
 * Note: Limited by LocalStorage size constraints
 */
export class LocalStorageBackend implements StorageBackend {
  private prefix: string;

  constructor(options?: { prefix?: string }) {
    this.prefix = options?.prefix || 'quastore_';
  }

  async init(): Promise<void> {
    if (typeof localStorage === 'undefined') {
      throw new Error('LocalStorage is not available in this environment');
    }
  }

  private getKey(id: string): string {
    return `${this.prefix}snapshot_${id}`;
  }

  private getMetaKey(): string {
    return `${this.prefix}meta`;
  }

  private getMeta(): QSSnapshotMeta[] {
    const metaJson = localStorage.getItem(this.getMetaKey());
    if (!metaJson) return [];
    
    try {
      const meta = JSON.parse(metaJson);
      return meta.map((m: any) => ({
        ...m,
        createdAt: new Date(m.createdAt)
      }));
    } catch {
      return [];
    }
  }

  private saveMeta(meta: QSSnapshotMeta[]): void {
    localStorage.setItem(this.getMetaKey(), JSON.stringify(meta));
  }

  async saveSnapshot(snapshot: QSSnapshot): Promise<void> {
    const key = this.getKey(snapshot.id);
    localStorage.setItem(key, JSON.stringify(snapshot));

    // Update metadata
    const meta = this.getMeta();
    const existingIndex = meta.findIndex(m => m.id === snapshot.id);
    const snapshotMeta: QSSnapshotMeta = {
      id: snapshot.id,
      storeName: snapshot.storeName,
      createdAt: snapshot.createdAt
    };

    if (existingIndex >= 0) {
      meta[existingIndex] = snapshotMeta;
    } else {
      meta.push(snapshotMeta);
    }

    this.saveMeta(meta);
  }

  async getSnapshot(id: string): Promise<QSSnapshot | undefined> {
    const key = this.getKey(id);
    const snapshotJson = localStorage.getItem(key);
    
    if (!snapshotJson) return undefined;

    try {
      const snapshot = JSON.parse(snapshotJson);
      return {
        ...snapshot,
        createdAt: new Date(snapshot.createdAt)
      };
    } catch {
      return undefined;
    }
  }

  async deleteSnapshot(id: string): Promise<void> {
    const key = this.getKey(id);
    localStorage.removeItem(key);

    // Update metadata
    const meta = this.getMeta();
    const filteredMeta = meta.filter(m => m.id !== id);
    this.saveMeta(filteredMeta);
  }

  async listSnapshots(storeName?: string): Promise<QSSnapshotMeta[]> {
    const meta = this.getMeta();
    const filtered = storeName 
      ? meta.filter(m => m.storeName === storeName)
      : meta;

    return filtered.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async clearSnapshots(storeName?: string): Promise<void> {
    const meta = this.getMeta();
    
    if (storeName) {
      const toDelete = meta.filter(m => m.storeName === storeName);
      for (const snapshot of toDelete) {
        localStorage.removeItem(this.getKey(snapshot.id));
      }
      const remaining = meta.filter(m => m.storeName !== storeName);
      this.saveMeta(remaining);
    } else {
      // Clear all snapshots
      for (const snapshot of meta) {
        localStorage.removeItem(this.getKey(snapshot.id));
      }
      localStorage.removeItem(this.getMetaKey());
    }
  }

  async close(): Promise<void> {
    // No cleanup needed for LocalStorage
  }
}