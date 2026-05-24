import type { QuaGameSaveSlot, QuaGameSaveSlotMeta, QuaSnapshot, QuaSnapshotMeta } from '../../src/types/base'
import type { StorageBackend } from '../../src/types/storage'

/**
 * In-memory storage backend for testing and development
 * WARNING: Data will be lost when the application is closed!
 */
export class MemoryBackend implements StorageBackend {
  private storage: Map<string, QuaSnapshot> = new Map()
  private gameSlots: Map<string, QuaGameSaveSlot> = new Map()
  private namespace: string

  constructor(options?: { namespace?: string }) {
    this.namespace = options?.namespace || 'default'
  }

  async init(): Promise<void> {
    // No initialization needed for memory storage
  }

  private getSnapshotKey(id: string): string {
    return `${this.namespace}:snapshot:${id}`
  }

  private getGameSlotKey(slotId: string): string {
    return `${this.namespace}:slot:${slotId}`
  }

  async saveSnapshot(snapshot: QuaSnapshot): Promise<void> {
    this.storage.set(this.getSnapshotKey(snapshot.id), { ...snapshot })
  }

  async getSnapshot(id: string): Promise<QuaSnapshot | undefined> {
    const snapshot = this.storage.get(this.getSnapshotKey(id))
    return snapshot ? { ...snapshot } : undefined
  }

  async deleteSnapshot(id: string): Promise<void> {
    this.storage.delete(this.getSnapshotKey(id))
  }

  async listSnapshots(storeName?: string): Promise<QuaSnapshotMeta[]> {
    const snapshots = Array.from(this.storage.values())
    const filtered = storeName
      ? snapshots.filter(s => s.storeName === storeName)
      : snapshots

    return filtered
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map(snapshot => ({
        id: snapshot.id,
        storeName: snapshot.storeName,
        createdAt: snapshot.createdAt,
      }))
  }

  async clearSnapshots(storeName?: string): Promise<void> {
    if (storeName) {
      const entries = Array.from(this.storage.entries())
      for (const [id, snapshot] of entries) {
        if (snapshot.storeName === storeName) {
          this.storage.delete(id)
        }
      }
    }
    else {
      this.storage.clear()
    }
  }

  // Game slot methods
  async saveGameSlot(slot: QuaGameSaveSlot): Promise<void> {
    this.gameSlots.set(this.getGameSlotKey(slot.slotId), { ...slot })
  }

  async getGameSlot(slotId: string): Promise<QuaGameSaveSlot | undefined> {
    const slot = this.gameSlots.get(this.getGameSlotKey(slotId))
    return slot ? { ...slot } : undefined
  }

  async deleteGameSlot(slotId: string): Promise<void> {
    this.gameSlots.delete(this.getGameSlotKey(slotId))
  }

  async listGameSlots(): Promise<QuaGameSaveSlotMeta[]> {
    const slots = Array.from(this.gameSlots.values())
    return slots
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .map(slot => ({
        slotId: slot.slotId,
        name: slot.name,
        timestamp: slot.timestamp,
        screenshot: slot.screenshot,
        metadata: slot.metadata,
      }))
  }

  async clearGameSlots(): Promise<void> {
    this.gameSlots.clear()
  }

  async close(): Promise<void> {
    this.storage.clear()
    this.gameSlots.clear()
  }

  getNamespace(): string {
    return this.namespace
  }
}
