import { StorageBackend } from '../types/storage';
import { QuaSnapshot, QuaSnapshotMeta, QuaGameSaveSlot, QuaGameSaveSlotMeta } from '../types/base';

/**
 * In-memory storage backend for testing and development
 * WARNING: Data will be lost when the application is closed!
 */
export class MemoryBackend implements StorageBackend {
  private snapshots: Map<string, QuaSnapshot> = new Map();
  private gameSlots: Map<string, QuaGameSaveSlot> = new Map();

  async init(): Promise<void> {
    // No initialization needed for memory storage
  }

  // Snapshot methods (runtime game state)
  async saveSnapshot(snapshot: QuaSnapshot): Promise<void> {
    this.snapshots.set(snapshot.id, { ...snapshot });
  }

  async getSnapshot(id: string): Promise<QuaSnapshot | undefined> {
    const snapshot = this.snapshots.get(id);
    return snapshot ? { ...snapshot } : undefined;
  }

  async deleteSnapshot(id: string): Promise<void> {
    this.snapshots.delete(id);
  }

  async listSnapshots(storeName?: string): Promise<QuaSnapshotMeta[]> {
    const snapshots = Array.from(this.snapshots.values());
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
      for (const [id, snapshot] of this.snapshots.entries()) {
        if (snapshot.storeName === storeName) {
          this.snapshots.delete(id);
        }
      }
    } else {
      this.snapshots.clear();
    }
  }

  // Game slot methods (persistent save files)
  async saveGameSlot(slot: QuaGameSaveSlot): Promise<void> {
    this.gameSlots.set(slot.slotId, { ...slot });
  }

  async getGameSlot(slotId: string): Promise<QuaGameSaveSlot | undefined> {
    const slot = this.gameSlots.get(slotId);
    return slot ? { ...slot } : undefined;
  }

  async deleteGameSlot(slotId: string): Promise<void> {
    this.gameSlots.delete(slotId);
  }

  async listGameSlots(): Promise<QuaGameSaveSlotMeta[]> {
    const slots = Array.from(this.gameSlots.values());
    return slots
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .map(slot => ({
        slotId: slot.slotId,
        name: slot.name,
        timestamp: slot.timestamp,
        screenshot: slot.screenshot,
        metadata: slot.metadata
      }));
  }

  async clearGameSlots(): Promise<void> {
    this.gameSlots.clear();
  }

  async close(): Promise<void> {
    this.snapshots.clear();
    this.gameSlots.clear();
  }

  /**
   * Get the current number of stored snapshots (for testing/debugging)
   */
  getSnapshotStorageSize(): number {
    return this.snapshots.size;
  }

  /**
   * Get the current total storage size (snapshots only, for backward compatibility)
   */
  getStorageSize(): number {
    return this.snapshots.size;
  }

  /**
   * Get the current number of stored game slots (for testing/debugging)
   */
  getGameSlotStorageSize(): number {
    return this.gameSlots.size;
  }

  /**
   * Check if a snapshot exists (for testing/debugging)
   */
  hasSnapshot(id: string): boolean {
    return this.snapshots.has(id);
  }

  /**
   * Check if a game slot exists (for testing/debugging)
   */
  hasGameSlot(slotId: string): boolean {
    return this.gameSlots.has(slotId);
  }
}