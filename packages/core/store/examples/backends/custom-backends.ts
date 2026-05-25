import type {
  QuaGameSavePreviewRecord,
  QuaGameSaveSlotIndex,
  QuaGameSaveSlotPayload,
  QuaSnapshot,
  QuaSnapshotMeta,
} from '../../src/types/base'
import type { StorageBackend } from '../../src/types/storage'

/**
 * In-memory storage backend for testing and development.
 * WARNING: Data will be lost when the application is closed.
 */
export class MemoryBackend implements StorageBackend {
  private readonly snapshots = new Map<string, QuaSnapshot>()
  private readonly slotIndexes = new Map<string, QuaGameSaveSlotIndex>()
  private readonly slotPayloads = new Map<string, QuaGameSaveSlotPayload>()
  private readonly slotPreviews = new Map<string, QuaGameSavePreviewRecord>()
  private readonly namespace: string

  constructor(options?: { namespace?: string }) {
    this.namespace = options?.namespace || 'default'
  }

  async init(): Promise<void> {}

  private getSnapshotKey(id: string): string {
    return `${this.namespace}:snapshot:${id}`
  }

  private getSlotIndexKey(slotId: string): string {
    return `${this.namespace}:slot-index:${slotId}`
  }

  private getSlotPayloadKey(slotId: string): string {
    return `${this.namespace}:slot-payload:${slotId}`
  }

  private getSlotPreviewKey(previewId: string): string {
    return `${this.namespace}:slot-preview:${previewId}`
  }

  async saveSnapshot(snapshot: QuaSnapshot): Promise<void> {
    this.snapshots.set(this.getSnapshotKey(snapshot.id), { ...snapshot })
  }

  async getSnapshot(id: string): Promise<QuaSnapshot | undefined> {
    const snapshot = this.snapshots.get(this.getSnapshotKey(id))
    return snapshot ? { ...snapshot } : undefined
  }

  async deleteSnapshot(id: string): Promise<void> {
    this.snapshots.delete(this.getSnapshotKey(id))
  }

  async listSnapshots(storeName?: string): Promise<QuaSnapshotMeta[]> {
    const snapshots = Array.from(this.snapshots.values())
    const filtered = storeName
      ? snapshots.filter(snapshot => snapshot.storeName === storeName)
      : snapshots

    return filtered
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
      .map(snapshot => ({
        id: snapshot.id,
        storeName: snapshot.storeName,
        createdAt: snapshot.createdAt,
        scope: snapshot.scope,
      }))
  }

  async clearSnapshots(storeName?: string): Promise<void> {
    if (!storeName) {
      this.snapshots.clear()
      return
    }

    for (const [id, snapshot] of this.snapshots.entries()) {
      if (snapshot.storeName === storeName) {
        this.snapshots.delete(id)
      }
    }
  }

  async saveGameSlotIndex(slot: QuaGameSaveSlotIndex): Promise<void> {
    this.slotIndexes.set(this.getSlotIndexKey(slot.slotId), { ...slot })
  }

  async getGameSlotIndex(slotId: string): Promise<QuaGameSaveSlotIndex | undefined> {
    const slot = this.slotIndexes.get(this.getSlotIndexKey(slotId))
    return slot ? { ...slot } : undefined
  }

  async listGameSlotIndexes(): Promise<QuaGameSaveSlotIndex[]> {
    return Array.from(this.slotIndexes.values())
      .sort((left, right) => right.timestamp.getTime() - left.timestamp.getTime())
      .map(slot => ({ ...slot }))
  }

  async deleteGameSlotIndex(slotId: string): Promise<void> {
    this.slotIndexes.delete(this.getSlotIndexKey(slotId))
  }

  async saveGameSlotPayload(slot: QuaGameSaveSlotPayload): Promise<void> {
    this.slotPayloads.set(this.getSlotPayloadKey(slot.slotId), { ...slot })
  }

  async getGameSlotPayload(slotId: string): Promise<QuaGameSaveSlotPayload | undefined> {
    const slot = this.slotPayloads.get(this.getSlotPayloadKey(slotId))
    return slot ? { ...slot } : undefined
  }

  async deleteGameSlotPayload(slotId: string): Promise<void> {
    this.slotPayloads.delete(this.getSlotPayloadKey(slotId))
  }

  async saveGameSlotPreview(preview: QuaGameSavePreviewRecord): Promise<void> {
    this.slotPreviews.set(this.getSlotPreviewKey(preview.previewId), { ...preview })
  }

  async getGameSlotPreview(previewId: string): Promise<QuaGameSavePreviewRecord | undefined> {
    const preview = this.slotPreviews.get(this.getSlotPreviewKey(previewId))
    return preview ? { ...preview } : undefined
  }

  async deleteGameSlotPreview(previewId: string): Promise<void> {
    this.slotPreviews.delete(this.getSlotPreviewKey(previewId))
  }

  async clearGameSlots(): Promise<void> {
    this.slotIndexes.clear()
    this.slotPayloads.clear()
    this.slotPreviews.clear()
  }

  async close(): Promise<void> {
    this.snapshots.clear()
    await this.clearGameSlots()
  }

  getNamespace(): string {
    return this.namespace
  }
}
