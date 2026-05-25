import type {
  QuaGameSavePreviewRecord,
  QuaGameSaveSlotIndex,
  QuaGameSaveSlotPayload,
  QuaSnapshot,
  QuaSnapshotMeta,
} from '../types/base'
import type { BackendConfig, StorageBackend, StorageBackendConstructor, StorageConfig, StorageMiddleware, StorageTransactionMode } from '../types/storage'
import { MemoryBackend } from '../backends/memory'
import { clonePreviewRecord, cloneSaveSlotIndex, cloneSaveSlotPayload } from '../preview'
import logger from '../utils'

/**
 * Storage manager that handles backend and middleware system
 */
export class StorageManager {
  private backend: StorageBackend
  private middlewares: StorageMiddleware[] = []

  constructor(config?: StorageConfig) {
    this.middlewares = config?.middlewares || []
    this.backend = this.createBackend(config?.backend)
  }

  /**
   * Create storage backend instance
   */
  private createBackend(backendConfig?: StorageBackendConstructor | BackendConfig): StorageBackend {
    if (!backendConfig) {
      return new MemoryBackend()
    }

    if (typeof backendConfig === 'function') {
      // It's a constructor function
      // eslint-disable-next-line new-cap
      return new backendConfig()
    }

    // It's a BackendConfig object
    const { driver, options } = backendConfig
    // eslint-disable-next-line new-cap
    return new driver(options)
  }

  /**
   * Initialize the storage manager
   */
  async init(): Promise<void> {
    if (this.backend.init) {
      await this.backend.init()
    }
    logger.module('storage').debug('Storage manager initialized')
  }

  /**
   * Apply middlewares to a value being written
   */
  private async applyBeforeWriteMiddlewares(key: string, value: any): Promise<any> {
    let processedValue = value

    for (const middleware of this.middlewares) {
      if (middleware.beforeWrite) {
        processedValue = await middleware.beforeWrite(key, processedValue)
      }
    }

    return processedValue
  }

  /**
   * Apply middlewares to a value being read
   */
  private async applyAfterReadMiddlewares(key: string, value: any): Promise<any> {
    let processedValue = value

    for (const middleware of this.middlewares) {
      if (middleware.afterRead) {
        processedValue = await middleware.afterRead(key, processedValue)
      }
    }

    return processedValue
  }

  /**
   * Save a snapshot to storage (with middleware processing)
   */
  async saveSnapshot(snapshot: QuaSnapshot): Promise<void> {
    const processedSnapshot = await this.applyBeforeWriteMiddlewares(snapshot.id, snapshot)
    await this.backend.saveSnapshot(processedSnapshot)
  }

  /**
   * Get a snapshot from storage (with middleware processing)
   */
  async getSnapshot(id: string): Promise<QuaSnapshot | undefined> {
    const snapshot = await this.backend.getSnapshot(id)
    if (!snapshot) {
      return undefined
    }

    return await this.applyAfterReadMiddlewares(id, snapshot)
  }

  /**
   * Delete a snapshot from storage
   */
  async deleteSnapshot(id: string): Promise<void> {
    await this.backend.deleteSnapshot(id)
  }

  /**
   * List snapshots, optionally filtered by store name
   */
  async listSnapshots(storeName?: string): Promise<QuaSnapshotMeta[]> {
    return await this.backend.listSnapshots(storeName)
  }

  /**
   * Clear snapshots, optionally filtered by store name
   */
  async clearSnapshots(storeName?: string): Promise<void> {
    await this.backend.clearSnapshots(storeName)
  }

  async transaction<T>(mode: StorageTransactionMode, action: () => Promise<T>): Promise<T> {
    if (this.backend.transaction) {
      return await this.backend.transaction(mode, action)
    }
    return await action()
  }

  async saveGameSlotIndex(index: QuaGameSaveSlotIndex): Promise<void> {
    const processedIndex = await this.applyBeforeWriteMiddlewares(index.slotId, cloneSaveSlotIndex(index))
    await this.backend.saveGameSlotIndex(processedIndex)
  }

  async getGameSlotIndex(slotId: string): Promise<QuaGameSaveSlotIndex | undefined> {
    const index = await this.backend.getGameSlotIndex(slotId)
    if (!index) {
      return undefined
    }

    const processed = await this.applyAfterReadMiddlewares(slotId, index)
    return cloneSaveSlotIndex(processed)
  }

  async listGameSlotIndexes(): Promise<QuaGameSaveSlotIndex[]> {
    const slots = await this.backend.listGameSlotIndexes()
    return slots.map(slot => cloneSaveSlotIndex(slot))
  }

  async deleteGameSlotIndex(slotId: string): Promise<void> {
    await this.backend.deleteGameSlotIndex(slotId)
  }

  async saveGameSlotPayload(slot: QuaGameSaveSlotPayload): Promise<void> {
    const processedSlot = await this.applyBeforeWriteMiddlewares(slot.slotId, cloneSaveSlotPayload(slot))
    await this.backend.saveGameSlotPayload(processedSlot)
  }

  async getGameSlotPayload(slotId: string): Promise<QuaGameSaveSlotPayload | undefined> {
    const slot = await this.backend.getGameSlotPayload(slotId)
    if (!slot) {
      return undefined
    }

    const processed = await this.applyAfterReadMiddlewares(slotId, slot)
    return cloneSaveSlotPayload(processed)
  }

  async deleteGameSlotPayload(slotId: string): Promise<void> {
    await this.backend.deleteGameSlotPayload(slotId)
  }

  async saveGameSlotPreview(preview: QuaGameSavePreviewRecord): Promise<void> {
    const processedPreview = await this.applyBeforeWriteMiddlewares(preview.previewId, clonePreviewRecord(preview))
    await this.backend.saveGameSlotPreview(processedPreview)
  }

  async getGameSlotPreview(previewId: string): Promise<QuaGameSavePreviewRecord | undefined> {
    const preview = await this.backend.getGameSlotPreview(previewId)
    if (!preview) {
      return undefined
    }

    const processed = await this.applyAfterReadMiddlewares(previewId, preview)
    return clonePreviewRecord(processed)
  }

  async deleteGameSlotPreview(previewId: string): Promise<void> {
    await this.backend.deleteGameSlotPreview(previewId)
  }

  /**
   * Close the storage manager
   */
  async close(): Promise<void> {
    if (this.backend.close) {
      await this.backend.close()
    }
  }

  /**
   * Add a middleware to the manager
   */
  addMiddleware(middleware: StorageMiddleware): void {
    this.middlewares.push(middleware)
  }

  /**
   * Remove a middleware from the manager
   */
  removeMiddleware(middleware: StorageMiddleware): void {
    const index = this.middlewares.indexOf(middleware)
    if (index > -1) {
      this.middlewares.splice(index, 1)
    }
  }

  /**
   * Get the current backend instance
   */
  getBackend(): StorageBackend {
    return this.backend
  }
}
