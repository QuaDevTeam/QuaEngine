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

  /**
   * Get the current number of stored snapshots (for testing/debugging)
   */
  getStorageSize(): number {
    return this.storage.size;
  }

  /**
   * Check if a snapshot exists (for testing/debugging)
   */
  hasSnapshot(id: string): boolean {
    return this.storage.has(id);
  }
}