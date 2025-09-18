import type { QuaGameSaveSlot, QuaGameSaveSlotMeta, QuaSnapshot, QuaSnapshotMeta } from '../types/base'
import type { BackendConfig, StorageBackend, StorageBackendConstructor, StorageConfig, StorageMiddleware } from '../types/storage'
import { IndexedDBBackend } from '../backends/indexeddb'
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
      // Default to IndexedDB backend
      return new IndexedDBBackend()
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

  /**
   * Save a game slot to storage (with middleware processing)
   */
  async saveGameSlot(gameSlot: QuaGameSaveSlot): Promise<void> {
    const processedGameSlot = await this.applyBeforeWriteMiddlewares(gameSlot.slotId, gameSlot)
    await this.backend.saveGameSlot(processedGameSlot)
  }

  /**
   * Get a game slot from storage (with middleware processing)
   */
  async getGameSlot(slotId: string): Promise<QuaGameSaveSlot | undefined> {
    const gameSlot = await this.backend.getGameSlot(slotId)
    if (!gameSlot) {
      return undefined
    }

    return await this.applyAfterReadMiddlewares(slotId, gameSlot)
  }

  /**
   * Delete a game slot from storage
   */
  async deleteGameSlot(slotId: string): Promise<void> {
    await this.backend.deleteGameSlot(slotId)
  }

  /**
   * List all game slots
   */
  async listGameSlots(): Promise<QuaGameSaveSlotMeta[]> {
    return await this.backend.listGameSlots()
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
