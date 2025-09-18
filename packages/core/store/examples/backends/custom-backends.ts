import type { QuaGameSaveSlot, QuaGameSaveSlotMeta, QuaSnapshot, QuaSnapshotMeta } from '../../src/types/base'
import type { StorageBackend } from '../../src/types/storage'

/**
 * In-memory storage backend for testing and development
 * WARNING: Data will be lost when the application is closed!
 */
export class MemoryBackend implements StorageBackend {
  private storage: Map<string, QuaSnapshot> = new Map()
  private gameSlots: Map<string, QuaGameSaveSlot> = new Map()

  async init(): Promise<void> {
    // No initialization needed for memory storage
  }

  async saveSnapshot(snapshot: QuaSnapshot): Promise<void> {
    this.storage.set(snapshot.id, { ...snapshot })
  }

  async getSnapshot(id: string): Promise<QuaSnapshot | undefined> {
    const snapshot = this.storage.get(id)
    return snapshot ? { ...snapshot } : undefined
  }

  async deleteSnapshot(id: string): Promise<void> {
    this.storage.delete(id)
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
    this.gameSlots.set(slot.slotId, { ...slot })
  }

  async getGameSlot(slotId: string): Promise<QuaGameSaveSlot | undefined> {
    const slot = this.gameSlots.get(slotId)
    return slot ? { ...slot } : undefined
  }

  async deleteGameSlot(slotId: string): Promise<void> {
    this.gameSlots.delete(slotId)
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
}

/**
 * LocalStorage backend for browser environments
 * Note: Limited by LocalStorage size constraints
 */
export class LocalStorageBackend implements StorageBackend {
  private prefix: string

  constructor(options?: { prefix?: string }) {
    this.prefix = options?.prefix || 'quastore_'
  }

  async init(): Promise<void> {
    if (typeof localStorage === 'undefined') {
      throw new TypeError('LocalStorage is not available in this environment')
    }
  }

  private getKey(id: string): string {
    return `${this.prefix}snapshot_${id}`
  }

  private getGameSlotKey(slotId: string): string {
    return `${this.prefix}gameslot_${slotId}`
  }

  private getMetaKey(): string {
    return `${this.prefix}meta`
  }

  private getGameSlotMetaKey(): string {
    return `${this.prefix}gameslot_meta`
  }

  private getMeta(): QuaSnapshotMeta[] {
    const metaJson = localStorage.getItem(this.getMetaKey())
    if (!metaJson)
      return []

    try {
      const meta = JSON.parse(metaJson)
      return meta.map((m: any) => ({
        ...m,
        createdAt: new Date(m.createdAt),
      }))
    }
    catch {
      return []
    }
  }

  private saveMeta(meta: QuaSnapshotMeta[]): void {
    localStorage.setItem(this.getMetaKey(), JSON.stringify(meta))
  }

  private getGameSlotMeta(): QuaGameSaveSlotMeta[] {
    const metaJson = localStorage.getItem(this.getGameSlotMetaKey())
    if (!metaJson)
      return []

    try {
      const meta = JSON.parse(metaJson)
      return meta.map((m: any) => ({
        ...m,
        timestamp: new Date(m.timestamp),
      }))
    }
    catch {
      return []
    }
  }

  private saveGameSlotMeta(meta: QuaGameSaveSlotMeta[]): void {
    localStorage.setItem(this.getGameSlotMetaKey(), JSON.stringify(meta))
  }

  async saveSnapshot(snapshot: QuaSnapshot): Promise<void> {
    const key = this.getKey(snapshot.id)
    localStorage.setItem(key, JSON.stringify(snapshot))

    // Update metadata
    const meta = this.getMeta()
    const existingIndex = meta.findIndex(m => m.id === snapshot.id)
    const snapshotMeta: QuaSnapshotMeta = {
      id: snapshot.id,
      storeName: snapshot.storeName,
      createdAt: snapshot.createdAt,
    }

    if (existingIndex >= 0) {
      meta[existingIndex] = snapshotMeta
    }
    else {
      meta.push(snapshotMeta)
    }

    this.saveMeta(meta)
  }

  async getSnapshot(id: string): Promise<QuaSnapshot | undefined> {
    const key = this.getKey(id)
    const snapshotJson = localStorage.getItem(key)

    if (!snapshotJson)
      return undefined

    try {
      const snapshot = JSON.parse(snapshotJson)
      return {
        ...snapshot,
        createdAt: new Date(snapshot.createdAt),
      }
    }
    catch {
      return undefined
    }
  }

  async deleteSnapshot(id: string): Promise<void> {
    const key = this.getKey(id)
    localStorage.removeItem(key)

    // Update metadata
    const meta = this.getMeta()
    const filteredMeta = meta.filter(m => m.id !== id)
    this.saveMeta(filteredMeta)
  }

  async listSnapshots(storeName?: string): Promise<QuaSnapshotMeta[]> {
    const meta = this.getMeta()
    const filtered = storeName
      ? meta.filter(m => m.storeName === storeName)
      : meta

    return filtered.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
  }

  async clearSnapshots(storeName?: string): Promise<void> {
    const meta = this.getMeta()

    if (storeName) {
      const toDelete = meta.filter(m => m.storeName === storeName)
      for (const snapshot of toDelete) {
        localStorage.removeItem(this.getKey(snapshot.id))
      }
      const remaining = meta.filter(m => m.storeName !== storeName)
      this.saveMeta(remaining)
    }
    else {
      // Clear all snapshots
      for (const snapshot of meta) {
        localStorage.removeItem(this.getKey(snapshot.id))
      }
      localStorage.removeItem(this.getMetaKey())
    }
  }

  // Game slot methods
  async saveGameSlot(slot: QuaGameSaveSlot): Promise<void> {
    const key = this.getGameSlotKey(slot.slotId)
    localStorage.setItem(key, JSON.stringify(slot))

    // Update metadata
    const meta = this.getGameSlotMeta()
    const existingIndex = meta.findIndex(m => m.slotId === slot.slotId)
    const slotMeta: QuaGameSaveSlotMeta = {
      slotId: slot.slotId,
      name: slot.name,
      timestamp: slot.timestamp,
      screenshot: slot.screenshot,
      metadata: slot.metadata,
    }

    if (existingIndex >= 0) {
      meta[existingIndex] = slotMeta
    }
    else {
      meta.push(slotMeta)
    }

    this.saveGameSlotMeta(meta)
  }

  async getGameSlot(slotId: string): Promise<QuaGameSaveSlot | undefined> {
    const key = this.getGameSlotKey(slotId)
    const slotJson = localStorage.getItem(key)

    if (!slotJson)
      return undefined

    try {
      const slot = JSON.parse(slotJson)
      return {
        ...slot,
        timestamp: new Date(slot.timestamp),
      }
    }
    catch {
      return undefined
    }
  }

  async deleteGameSlot(slotId: string): Promise<void> {
    const key = this.getGameSlotKey(slotId)
    localStorage.removeItem(key)

    // Update metadata
    const meta = this.getGameSlotMeta()
    const filteredMeta = meta.filter(m => m.slotId !== slotId)
    this.saveGameSlotMeta(filteredMeta)
  }

  async listGameSlots(): Promise<QuaGameSaveSlotMeta[]> {
    const meta = this.getGameSlotMeta()
    return meta.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
  }

  async clearGameSlots(): Promise<void> {
    const meta = this.getGameSlotMeta()
    for (const slot of meta) {
      localStorage.removeItem(this.getGameSlotKey(slot.slotId))
    }
    localStorage.removeItem(this.getGameSlotMetaKey())
  }

  async close(): Promise<void> {
    // No cleanup needed for LocalStorage
  }
}
