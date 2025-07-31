import { QSSnapshot, QSSnapshotMeta } from './base';

/**
 * Middleware function for storage operations
 */
export interface StorageMiddleware {
  /**
   * Called before a value is written to storage
   * @param key - The storage key
   * @param value - The value to be stored
   * @returns The processed value or a promise that resolves to the processed value
   */
  beforeWrite?: (key: string, value: any) => any | Promise<any>;

  /**
   * Called after a value is read from storage
   * @param key - The storage key
   * @param value - The value read from storage
   * @returns The processed value or a promise that resolves to the processed value
   */
  afterRead?: (key: string, value: any) => any | Promise<any>;
}

/**
 * Abstract storage backend interface
 */
export interface StorageBackend {
  /**
   * Initialize the storage backend
   * @param options - Initialization options
   */
  init?(options?: any): Promise<void> | void;

  /**
   * Save a snapshot to storage
   * @param snapshot - The snapshot to save
   */
  saveSnapshot(snapshot: QSSnapshot): Promise<void>;

  /**
   * Get a snapshot from storage
   * @param id - The snapshot ID
   */
  getSnapshot(id: string): Promise<QSSnapshot | undefined>;

  /**
   * Delete a snapshot from storage
   * @param id - The snapshot ID
   */
  deleteSnapshot(id: string): Promise<void>;

  /**
   * List snapshots, optionally filtered by store name
   * @param storeName - Optional store name filter
   */
  listSnapshots(storeName?: string): Promise<QSSnapshotMeta[]>;

  /**
   * Clear snapshots, optionally filtered by store name
   * @param storeName - Optional store name filter
   */
  clearSnapshots(storeName?: string): Promise<void>;

  /**
   * Close/cleanup the storage backend
   */
  close?(): Promise<void> | void;
}

/**
 * Storage backend constructor interface
 */
export interface StorageBackendConstructor {
  new (options?: any): StorageBackend;
}

/**
 * Backend configuration options
 */
export interface BackendConfig {
  /**
   * The storage backend constructor
   */
  driver: StorageBackendConstructor;
  
  /**
   * Options to pass to the backend constructor
   */
  options?: any;
}

/**
 * Storage manager configuration
 */
export interface StorageConfig {
  /**
   * Storage backend - can be a constructor class or a config object
   */
  backend?: StorageBackendConstructor | BackendConfig;
  
  /**
   * Middleware functions to apply to storage operations
   */
  middlewares?: StorageMiddleware[];
}