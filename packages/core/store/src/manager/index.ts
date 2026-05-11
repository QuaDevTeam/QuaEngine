import type {
  QuaConstructorOpts,
  QuaRestoreOptions,
  QuaScopedRestoreOptions,
  QuaSerializedState,
  QuaSnapshot,
  QuaSnapshotMeta,
  QuaSnapshotOptions,
  QuaStateSerializer,
} from '../types/base'
import type { StorageConfig } from '../types/storage'
import { assertStateSerializer } from '../serializer'
import { StorageManager } from '../storage/manager'
import QuaStore from '../store'
import logger, { generateId } from '../utils'

interface ExQuaConstructorOpts extends QuaConstructorOpts {
  name: string
}

const ALL_STORES_SNAPSHOT_NAME = '__ALL_STORES__'
const STORE_GROUP_SNAPSHOT_NAME = '__STORE_GROUP__'

function getTargetNames(name: string): [string, string] {
  if (!name.includes('/')) {
    throw new Error('Invalid action name.')
  }
  const slashIdx = name.indexOf('/')
  const storeName = name.slice(0, slashIdx)
  const targetName = name.slice(slashIdx + 1)
  return [storeName, targetName]
}

export function useStore(name: string): QuaStore | null {
  const store = QuaStoreManager.stores[name]
  if (!store) {
    console.error('No matched store.')
    return null
  }
  return store
}

function callMethod(action: 'commit' | 'dispatch', name: string, payload?: unknown): any {
  const [storeName, targetName] = getTargetNames(name)
  const store = useStore(storeName)
  if (!store) {
    throw new Error(`Cannot find the certain store named "${storeName}".`)
  }
  return store[action](targetName, payload)
}

export function dispatch(name: string, payload?: unknown) {
  return callMethod('dispatch', name, payload) as Promise<void>
}

export function commit(name: string, payload?: unknown): void {
  callMethod('commit', name, payload)
}

class QuaStoreManager {
  public static stores: Record<string, QuaStore> = {}
  private static storageManager: StorageManager | null = null
  private static globalStorageConfig: StorageConfig | null = null
  private static globalSerializer: QuaStateSerializer | null = null

  /**
   * Configure global storage settings
   */
  public static configureStorage(config: StorageConfig) {
    this.globalStorageConfig = config
    this.storageManager = new StorageManager(config)
  }

  /**
   * Configure global state serialization settings for stores created after this call
   */
  public static configureSerialization(serializer: QuaStateSerializer | null) {
    this.globalSerializer = serializer ? assertStateSerializer(serializer) : null
  }

  /**
   * Get or create the storage manager
   */
  private static async getStorageManager(config?: StorageConfig): Promise<StorageManager> {
    if (!this.storageManager) {
      const storageConfig = config || this.globalStorageConfig || {}
      this.storageManager = new StorageManager(storageConfig)
      await this.storageManager.init()
    }
    return this.storageManager
  }

  public static createStore(opts: ExQuaConstructorOpts) {
    const { name } = opts
    if (!name) {
      throw new Error('Must specify the name of store.')
    }

    logger.module('manager').info(`Creating store: ${name}`)
    const storeOptions = this.globalSerializer && !opts.serializer
      ? { ...opts, serializer: this.globalSerializer }
      : opts
    const newStore = new QuaStore(opts.name, storeOptions)
    QuaStoreManager.stores[name] = newStore
    logger.module('manager').debug(`Store created and registered: ${name}`)
    return newStore
  }

  public static register(name: string, store: QuaStore) {
    if (this.stores[name]) {
      throw new Error('The name has already been existed.')
    }
    this.stores[name] = store
  }

  public static unregister(name: string) {
    if (!this.stores[name]) {
      throw new Error(`Cannot find the certain store named "${name}".`)
    }
    delete this.stores[name]
  }

  public static getStore(name: string): QuaStore | null {
    return useStore(name)
  }

  // Snapshot management methods
  public static async snapshot(storeName: string, id?: string): Promise<string>
  public static async snapshot(options: QuaSnapshotOptions): Promise<string>
  public static async snapshot(storeNameOrOptions: string | QuaSnapshotOptions, id?: string): Promise<string> {
    if (typeof storeNameOrOptions === 'string') {
      return await this.snapshotStore(storeNameOrOptions, id)
    }

    const request = this.normalizeSnapshotOptions(storeNameOrOptions)
    if (request.allStores) {
      return await this.snapshotAll(request.id)
    }
    if (request.storeNames.length === 1) {
      return await this.snapshotStore(request.storeNames[0], request.id)
    }
    return await this.snapshotStores(request.storeNames, request.id)
  }

  public static async snapshotStore(storeName: string, id?: string): Promise<string> {
    const store = useStore(storeName)
    if (!store) {
      throw new Error(`Cannot find the certain store named "${storeName}".`)
    }
    return await store.snapshot(id)
  }

  public static async snapshotAll(id?: string): Promise<string> {
    return await this.createStoresSnapshot(this.listStores(), id, { allStores: true })
  }

  public static async snapshotStores(storeNames: readonly string[], id?: string): Promise<string> {
    return await this.createStoresSnapshot(storeNames, id, { allStores: false })
  }

  private static async createStoresSnapshot(
    storeNames: readonly string[],
    id?: string,
    options: { allStores: boolean } = { allStores: false },
  ): Promise<string> {
    const normalizedStoreNames = options.allStores
      ? this.normalizeStoreNames(storeNames, { allowEmpty: true })
      : this.normalizeStoreNames(storeNames)
    const snapshotId = id || generateId()
    const allStoresData: Record<string, QuaSerializedState> = {}

    for (const name of normalizedStoreNames) {
      const store = this.stores[name]
      if (!store) {
        throw new Error(`Cannot find the certain store named "${name}".`)
      }
      allStoresData[name] = store.serializeState()
    }

    const snapshotType: 'store' | 'stores' | 'all' = options.allStores
      ? 'all'
      : normalizedStoreNames.length === 1 ? 'store' : 'stores'

    const snapshot = {
      id: snapshotId,
      storeName: snapshotType === 'store'
        ? normalizedStoreNames[0]
        : snapshotType === 'all' ? ALL_STORES_SNAPSHOT_NAME : STORE_GROUP_SNAPSHOT_NAME,
      data: snapshotType === 'store' ? allStoresData[normalizedStoreNames[0]] : allStoresData,
      createdAt: new Date(),
      scope: {
        type: snapshotType,
        storeNames: normalizedStoreNames,
      },
    }

    const storageManager = await this.getStorageManager()
    await storageManager.saveSnapshot(snapshot)
    return snapshotId
  }

  public static async restoreStore(name: string, snapshotId: string, options?: QuaRestoreOptions) {
    const store = useStore(name)
    if (!store) {
      throw new Error(`Cannot find the certain store named "${name}".`)
    }

    const storageManager = await this.getStorageManager()
    const snapshot = await storageManager.getSnapshot(snapshotId)
    if (snapshot) {
      await this.restoreSnapshotData(snapshot, {
        ...options,
        storeNames: [name],
      })
      return
    }

    await store.restore(snapshotId, options)
  }

  public static async restore(snapshotId: string, options: QuaScopedRestoreOptions = {}): Promise<void> {
    const explicitTarget = this.normalizeRestoreTarget(options)
    if (explicitTarget.allStores) {
      await this.restoreAll(snapshotId, options)
      return
    }
    if (explicitTarget.storeNames.length === 1) {
      try {
        await this.restoreStores(snapshotId, {
          ...options,
          storeNames: explicitTarget.storeNames,
        })
      }
      catch (error) {
        if (!isSnapshotNotFoundError(error)) {
          throw error
        }
        await this.restoreStore(explicitTarget.storeNames[0], snapshotId, options)
      }
      return
    }
    if (explicitTarget.storeNames.length > 1) {
      await this.restoreStores(snapshotId, {
        ...options,
        storeNames: explicitTarget.storeNames,
      })
      return
    }

    const storageManager = await this.getStorageManager()
    const snapshot = await storageManager.getSnapshot(snapshotId)
    if (snapshot) {
      await this.restoreSnapshotData(snapshot, options)
      return
    }

    await this.restoreSingleSnapshotFromRegisteredStores(snapshotId, options)
  }

  public static async restoreAll(snapshotId: string, options?: QuaRestoreOptions) {
    const storageManager = await this.getStorageManager()
    const snapshot = await storageManager.getSnapshot(snapshotId)
    if (!snapshot) {
      throw new Error(`Snapshot with id "${snapshotId}" not found.`)
    }

    if (!this.isAllStoresSnapshot(snapshot)) {
      throw new Error(`Snapshot "${snapshotId}" is not a global snapshot.`)
    }

    const { force = false } = options || {}

    // Check if any store has data and force is not set
    if (!force) {
      for (const [name, store] of Object.entries(this.stores)) {
        if (Object.keys(store.state).length > 0) {
          throw new Error(`Store "${name}" has data. Use force option to override.`)
        }
      }
    }

    await this.restoreSnapshotData(snapshot, { ...options, force: true })
  }

  public static async restoreStores(snapshotId: string, options: QuaScopedRestoreOptions = {}) {
    const storageManager = await this.getStorageManager()
    const snapshot = await storageManager.getSnapshot(snapshotId)
    if (!snapshot) {
      throw new Error(`Snapshot with id "${snapshotId}" not found.`)
    }

    await this.restoreSnapshotData(snapshot, options)
  }

  private static normalizeSnapshotOptions(options: QuaSnapshotOptions): { id?: string, storeNames: string[], allStores: boolean } {
    if (options.scope === 'all') {
      return { id: options.id, storeNames: this.listStores(), allStores: true }
    }

    if (Array.isArray(options.scope)) {
      return { id: options.id, storeNames: this.normalizeStoreNames(options.scope), allStores: false }
    }

    if (typeof options.scope === 'string') {
      return { id: options.id, storeNames: this.normalizeStoreNames([options.scope]), allStores: false }
    }

    if (options.storeNames) {
      return { id: options.id, storeNames: this.normalizeStoreNames(options.storeNames), allStores: false }
    }

    if (options.storeName) {
      return { id: options.id, storeNames: this.normalizeStoreNames([options.storeName]), allStores: false }
    }

    throw new Error('Snapshot options must specify scope, storeName, or storeNames.')
  }

  private static normalizeRestoreTarget(options: QuaScopedRestoreOptions): { storeNames: string[], allStores: boolean } {
    if (options.scope === 'all') {
      return { storeNames: this.listStores(), allStores: true }
    }

    if (Array.isArray(options.scope)) {
      return { storeNames: this.normalizeStoreNames(options.scope), allStores: false }
    }

    if (typeof options.scope === 'string') {
      return { storeNames: this.normalizeStoreNames([options.scope]), allStores: false }
    }

    if (options.storeNames) {
      return { storeNames: this.normalizeStoreNames(options.storeNames), allStores: false }
    }

    if (options.storeName) {
      return { storeNames: this.normalizeStoreNames([options.storeName]), allStores: false }
    }

    return { storeNames: [], allStores: false }
  }

  private static normalizeStoreNames(storeNames: readonly string[], options: { allowEmpty?: boolean } = {}): string[] {
    const names = [...new Set(storeNames.map(name => name.trim()).filter(Boolean))]
    if (names.length === 0 && !options.allowEmpty) {
      throw new Error('At least one store name is required.')
    }
    return names
  }

  private static isAllStoresSnapshot(snapshot: QuaSnapshot): boolean {
    return snapshot.storeName === ALL_STORES_SNAPSHOT_NAME || snapshot.scope?.type === 'all'
  }

  private static isStoreGroupSnapshot(snapshot: QuaSnapshot): boolean {
    return this.isAllStoresSnapshot(snapshot)
      || snapshot.storeName === STORE_GROUP_SNAPSHOT_NAME
      || snapshot.scope?.type === 'stores'
  }

  private static async restoreSnapshotData(snapshot: QuaSnapshot, options: QuaScopedRestoreOptions = {}): Promise<void> {
    const { force = false, strict = false } = options
    const dataByStore = this.getSnapshotDataByStore(snapshot)
    const requestedTarget = this.normalizeRestoreTarget(options)
    const requireTargetMatches = !requestedTarget.allStores && requestedTarget.storeNames.length > 0
    const targetStoreNames = requestedTarget.allStores || requestedTarget.storeNames.length === 0
      ? Object.keys(dataByStore)
      : requestedTarget.storeNames

    if (!force) {
      for (const name of targetStoreNames) {
        const store = this.stores[name]
        if (store && Object.keys(store.state).length > 0) {
          throw new Error(`Store "${name}" has data. Use force option to override.`)
        }
      }
    }

    for (const name of targetStoreNames) {
      const store = this.stores[name]
      const storeData = dataByStore[name]

      if (!store) {
        if (strict || requireTargetMatches) {
          throw new Error(`Cannot find the certain store named "${name}".`)
        }
        continue
      }

      if (storeData === undefined) {
        if (strict || requireTargetMatches) {
          throw new Error(`Snapshot "${snapshot.id}" does not contain store "${name}".`)
        }
        continue
      }

      store.restoreSerializedState(storeData)
    }
  }

  private static getSnapshotDataByStore(snapshot: QuaSnapshot): Record<string, QuaSerializedState> {
    if (this.isStoreGroupSnapshot(snapshot)) {
      return snapshot.data as Record<string, QuaSerializedState>
    }

    return {
      [snapshot.storeName]: snapshot.data,
    }
  }

  private static async restoreSingleSnapshotFromRegisteredStores(snapshotId: string, options: QuaScopedRestoreOptions): Promise<void> {
    for (const store of Object.values(this.stores)) {
      try {
        await store.restore(snapshotId, options)
        return
      }
      catch (error) {
        if (isRestoreProbeMiss(error)) {
          continue
        }
        throw error
      }
    }

    throw new Error(`Snapshot with id "${snapshotId}" not found.`)
  }

  public static async getSnapshot(id: string): Promise<QuaSnapshot | undefined> {
    const storageManager = await this.getStorageManager()
    return await storageManager.getSnapshot(id)
  }

  public static async listSnapshots(storeName?: string): Promise<QuaSnapshotMeta[]> {
    const storageManager = await this.getStorageManager()
    return await storageManager.listSnapshots(storeName)
  }

  public static async deleteSnapshot(id: string): Promise<void> {
    const storageManager = await this.getStorageManager()
    await storageManager.deleteSnapshot(id)
  }

  public static async clearSnapshots(storeName?: string): Promise<void> {
    const storageManager = await this.getStorageManager()
    await storageManager.clearSnapshots(storeName)
  }

  public static async clearAllSnapshots(): Promise<void> {
    const storageManager = await this.getStorageManager()
    await storageManager.clearSnapshots()
  }

  // Store management methods
  public static listStores(): string[] {
    return Object.keys(this.stores)
  }

  public static hasStore(name: string): boolean {
    return name in this.stores
  }

  public static getStoreCount(): number {
    return Object.keys(this.stores).length
  }

  public static resetStore(name: string): void {
    const store = useStore(name)
    if (!store) {
      throw new Error(`Cannot find the certain store named "${name}".`)
    }
    store.reset()
  }

  public static resetAllStores(): void {
    for (const store of Object.values(this.stores)) {
      store.reset()
    }
  }

  /**
   * Reset storage manager and global state config (for testing purposes)
   */
  public static resetStorageManager(): void {
    this.storageManager = null
    this.globalStorageConfig = null
    this.globalSerializer = null
  }

  /**
   * Get the current storage manager instance (for testing purposes)
   */
  public static async getGlobalStorageManager(): Promise<StorageManager | null> {
    if (this.storageManager) {
      return this.storageManager
    }
    if (this.globalStorageConfig) {
      await this.getStorageManager()
      return this.storageManager
    }
    return null
  }
}

function isSnapshotNotFoundError(error: unknown): boolean {
  return error instanceof Error && /^Snapshot with id ".+" not found\.$/.test(error.message)
}

function isRestoreProbeMiss(error: unknown): boolean {
  return error instanceof Error
    && (
      isSnapshotNotFoundError(error)
      || /^Snapshot belongs to store ".+", not ".+"\.$/.test(error.message)
    )
}

export default QuaStoreManager
