import { QSSnapshot, QSSnapshotMeta } from '../types/base';
import { StorageBackend, StorageMiddleware, StorageConfig, BackendConfig, StorageBackendConstructor } from '../types/storage';
import { IndexedDBBackend } from '../backends/indexeddb';
import logger from '../utils';

/**
 * Storage manager that handles backend and middleware system
 */
export class StorageManager {
  private backend: StorageBackend;
  private middlewares: StorageMiddleware[] = [];

  constructor(config?: StorageConfig) {
    this.middlewares = config?.middlewares || [];
    this.backend = this.createBackend(config?.backend);
  }

  /**
   * Create storage backend instance
   */
  private createBackend(backendConfig?: StorageBackendConstructor | BackendConfig): StorageBackend {
    if (!backendConfig) {
      // Default to IndexedDB backend
      return new IndexedDBBackend();
    }

    if (typeof backendConfig === 'function') {
      // It's a constructor function
      return new backendConfig();
    }

    // It's a BackendConfig object
    const { driver, options } = backendConfig;
    return new driver(options);
  }

  /**
   * Initialize the storage manager
   */
  async init(): Promise<void> {
    if (this.backend.init) {
      await this.backend.init();
    }
    logger.module('storage').debug('Storage manager initialized');
  }

  /**
   * Apply middlewares to a value being written
   */
  private async applyBeforeWriteMiddlewares(key: string, value: any): Promise<any> {
    let processedValue = value;
    
    for (const middleware of this.middlewares) {
      if (middleware.beforeWrite) {
        processedValue = await middleware.beforeWrite(key, processedValue);
      }
    }
    
    return processedValue;
  }

  /**
   * Apply middlewares to a value being read
   */
  private async applyAfterReadMiddlewares(key: string, value: any): Promise<any> {
    let processedValue = value;
    
    for (const middleware of this.middlewares) {
      if (middleware.afterRead) {
        processedValue = await middleware.afterRead(key, processedValue);
      }
    }
    
    return processedValue;
  }

  /**
   * Save a snapshot to storage (with middleware processing)
   */
  async saveSnapshot(snapshot: QSSnapshot): Promise<void> {
    const processedSnapshot = await this.applyBeforeWriteMiddlewares(snapshot.id, snapshot);
    await this.backend.saveSnapshot(processedSnapshot);
  }

  /**
   * Get a snapshot from storage (with middleware processing)
   */
  async getSnapshot(id: string): Promise<QSSnapshot | undefined> {
    const snapshot = await this.backend.getSnapshot(id);
    if (!snapshot) {
      return undefined;
    }
    
    return await this.applyAfterReadMiddlewares(id, snapshot);
  }

  /**
   * Delete a snapshot from storage
   */
  async deleteSnapshot(id: string): Promise<void> {
    await this.backend.deleteSnapshot(id);
  }

  /**
   * List snapshots, optionally filtered by store name
   */
  async listSnapshots(storeName?: string): Promise<QSSnapshotMeta[]> {
    return await this.backend.listSnapshots(storeName);
  }

  /**
   * Clear snapshots, optionally filtered by store name
   */
  async clearSnapshots(storeName?: string): Promise<void> {
    await this.backend.clearSnapshots(storeName);
  }

  /**
   * Close the storage manager
   */
  async close(): Promise<void> {
    if (this.backend.close) {
      await this.backend.close();
    }
  }

  /**
   * Add a middleware to the manager
   */
  addMiddleware(middleware: StorageMiddleware): void {
    this.middlewares.push(middleware);
  }

  /**
   * Remove a middleware from the manager
   */
  removeMiddleware(middleware: StorageMiddleware): void {
    const index = this.middlewares.indexOf(middleware);
    if (index > -1) {
      this.middlewares.splice(index, 1);
    }
  }

  /**
   * Get the current backend instance
   */
  getBackend(): StorageBackend {
    return this.backend;
  }
}