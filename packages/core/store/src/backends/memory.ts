import type {
  QuaGameSavePreviewRecord,
  QuaGameSaveSlotIndex,
  QuaGameSaveSlotPayload,
  QuaSnapshot,
  QuaSnapshotMeta,
} from '../types/base'
import { clonePreviewRecord, cloneSaveSlotIndex, cloneSaveSlotPayload } from '../preview'
import type { StorageBackend, StorageTransactionMode } from '../types/storage'

/**
 * In-memory storage backend for testing and development
 * WARNING: Data will be lost when the application is closed!
 */
export class MemoryBackend implements StorageBackend {
  private snapshots: Map<string, QuaSnapshot> = new Map()
  private gameSlotIndexes: Map<string, QuaGameSaveSlotIndex> = new Map()
  private gameSlotPayloads: Map<string, QuaGameSaveSlotPayload> = new Map()
  private gameSlotPreviews: Map<string, QuaGameSavePreviewRecord> = new Map()

  async init(): Promise<void> {
    // No initialization needed for memory storage
  }

  // Snapshot methods (runtime game state)
  async saveSnapshot(snapshot: QuaSnapshot): Promise<void> {
    this.snapshots.set(snapshot.id, { ...snapshot })
  }

  async getSnapshot(id: string): Promise<QuaSnapshot | undefined> {
    const snapshot = this.snapshots.get(id)
    return snapshot ? { ...snapshot } : undefined
  }

  async deleteSnapshot(id: string): Promise<void> {
    this.snapshots.delete(id)
  }

  async listSnapshots(storeName?: string): Promise<QuaSnapshotMeta[]> {
    const snapshots = Array.from(this.snapshots.values())
    const filtered = storeName
      ? snapshots.filter(s => s.storeName === storeName)
      : snapshots

    return filtered
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map(snapshot => ({
        id: snapshot.id,
        storeName: snapshot.storeName,
        createdAt: snapshot.createdAt,
        scope: snapshot.scope,
      }))
  }

  async clearSnapshots(storeName?: string): Promise<void> {
    if (storeName) {
      const entries = Array.from(this.snapshots.entries())
      for (const [id, snapshot] of entries) {
        if (snapshot.storeName === storeName) {
          this.snapshots.delete(id)
        }
      }
    }
    else {
      this.snapshots.clear()
    }
  }

  async transaction<T>(_mode: StorageTransactionMode, action: () => Promise<T>): Promise<T> {
    const snapshot = {
      snapshots: new Map(this.snapshots),
      gameSlotIndexes: new Map(this.gameSlotIndexes),
      gameSlotPayloads: new Map(this.gameSlotPayloads),
      gameSlotPreviews: new Map(this.gameSlotPreviews),
    }

    try {
      return await action()
    }
    catch (error) {
      this.snapshots = snapshot.snapshots
      this.gameSlotIndexes = snapshot.gameSlotIndexes
      this.gameSlotPayloads = snapshot.gameSlotPayloads
      this.gameSlotPreviews = snapshot.gameSlotPreviews
      throw error
    }
  }

  // Game slot methods (persistent save files)
  async saveGameSlotIndex(slot: QuaGameSaveSlotIndex): Promise<void> {
    this.gameSlotIndexes.set(slot.slotId, cloneSaveSlotIndex(slot))
  }

  async getGameSlotIndex(slotId: string): Promise<QuaGameSaveSlotIndex | undefined> {
    const slot = this.gameSlotIndexes.get(slotId)
    return slot ? cloneSaveSlotIndex(slot) : undefined
  }

  async listGameSlotIndexes(): Promise<QuaGameSaveSlotIndex[]> {
    return Array.from(this.gameSlotIndexes.values())
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .map(slot => cloneSaveSlotIndex(slot))
  }

  async deleteGameSlotIndex(slotId: string): Promise<void> {
    this.gameSlotIndexes.delete(slotId)
  }

  async saveGameSlotPayload(slot: QuaGameSaveSlotPayload): Promise<void> {
    this.gameSlotPayloads.set(slot.slotId, cloneSaveSlotPayload(slot))
  }

  async getGameSlotPayload(slotId: string): Promise<QuaGameSaveSlotPayload | undefined> {
    const slot = this.gameSlotPayloads.get(slotId)
    return slot ? cloneSaveSlotPayload(slot) : undefined
  }

  async deleteGameSlotPayload(slotId: string): Promise<void> {
    this.gameSlotPayloads.delete(slotId)
  }

  async saveGameSlotPreview(preview: QuaGameSavePreviewRecord): Promise<void> {
    this.gameSlotPreviews.set(preview.previewId, clonePreviewRecord(preview))
  }

  async getGameSlotPreview(previewId: string): Promise<QuaGameSavePreviewRecord | undefined> {
    const preview = this.gameSlotPreviews.get(previewId)
    return preview ? clonePreviewRecord(preview) : undefined
  }

  async deleteGameSlotPreview(previewId: string): Promise<void> {
    this.gameSlotPreviews.delete(previewId)
  }

  async clearGameSlots(): Promise<void> {
    this.gameSlotIndexes.clear()
    this.gameSlotPayloads.clear()
    this.gameSlotPreviews.clear()
  }

  async close(): Promise<void> {
    this.snapshots.clear()
    this.gameSlotIndexes.clear()
    this.gameSlotPayloads.clear()
    this.gameSlotPreviews.clear()
  }

  /**
   * Get the current number of stored snapshots (for testing/debugging)
   */
  getSnapshotStorageSize(): number {
    return this.snapshots.size
  }

  /**
   * Get the current number of stored game slots (for testing/debugging)
   */
  getGameSlotStorageSize(): number {
    return this.gameSlotIndexes.size
  }

  /**
   * Check if a snapshot exists (for testing/debugging)
   */
  hasSnapshot(id: string): boolean {
    return this.snapshots.has(id)
  }

  /**
   * Check if a game slot exists (for testing/debugging)
   */
  hasGameSlot(slotId: string): boolean {
    return this.gameSlotIndexes.has(slotId)
  }
}
