import { QuaSnapshot, QuaSnapshotMeta, QuaGameSaveSlot, QuaGameSaveSlotMeta } from './base';

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
  saveSnapshot(snapshot: QuaSnapshot): Promise<void>;

  /**
   * Get a snapshot from storage
   * @param id - The snapshot ID
   */
  getSnapshot(id: string): Promise<QuaSnapshot | undefined>;

  /**
   * Delete a snapshot from storage
   * @param id - The snapshot ID
   */
  deleteSnapshot(id: string): Promise<void>;

  /**
   * List snapshots, optionally filtered by store name
   * @param storeName - Optional store name filter
   */
  listSnapshots(storeName?: string): Promise<QuaSnapshotMeta[]>;

  /**
   * Clear snapshots, optionally filtered by store name
   * @param storeName - Optional store name filter
   */
  clearSnapshots(storeName?: string): Promise<void>;

  /**
   * Save a game save slot (separate from snapshots)
   * @param slot - The game save slot to save
   */
  saveGameSlot(slot: QuaGameSaveSlot): Promise<void>;

  /**
   * Get a game save slot from storage
   * @param slotId - The slot ID
   */
  getGameSlot(slotId: string): Promise<QuaGameSaveSlot | undefined>;

  /**
   * Delete a game save slot from storage
   * @param slotId - The slot ID
   */
  deleteGameSlot(slotId: string): Promise<void>;

  /**
   * List game save slots
   */
  listGameSlots(): Promise<QuaGameSaveSlotMeta[]>;

  /**
   * Clear all game save slots
   */
  clearGameSlots(): Promise<void>;

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