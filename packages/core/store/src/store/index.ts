import type { QuaActions, QuaConstructorOpts, QuaGameSaveSlot, QuaGameSaveSlotMeta, QuaGetters, QuaMutations, QuaRestoreOptions, QuaSnapshot, QuaState } from '../types/base'
import { StorageManager } from '../storage/manager'
import logger, { generateId } from '../utils'

class QuaStore {
  public state: QuaState
  public getters: QuaGetters
  private name: string
  private mutations: QuaMutations
  private actions: QuaActions
  private innerGetters: QuaGetters
  private initialState: QuaState
  private storageManager: StorageManager | null = null

  public constructor(name: string, options: QuaConstructorOpts) {
    this.name = name

    this.state = options.state || {}
    this.actions = options.actions || {}
    this.mutations = options.mutations || {}
    this.innerGetters = options.getters || {}
    this.initialState = options.state ? { ...options.state } : {}

    // Initialize storage manager if storage config is provided
    if (options.storage) {
      this.storageManager = new StorageManager(options.storage)
      this.storageManager.init().catch((error) => {
        logger.module(name).error('Failed to initialize storage manager:', error)
      })
    }

    const thisName = this.name
    const thisState = this.state

    logger.module(name).debug('Creating store with options:', options)

    this.getters = new Proxy<QuaGetters>(this.innerGetters, {
      get(target, prop) {
        const key = prop as string
        const getter = target[key]
        if (typeof getter !== 'function') {
          throw new TypeError(`Invalid getter in store [${thisName}]`)
        }
        return getter(thisState)
      },
    })
  }

  public commit(key: string, payload?: unknown) {
    const mutation = this.mutations[key]
    if (!mutation) {
      throw new Error('No matched mutation found.')
    }
    mutation(this.state, payload)
  }

  public async dispatch(key: string, payload?: unknown) {
    const action = this.actions[key]
    if (!action) {
      throw new Error('No matched action found.')
    }
    await action(
      {
        state: this.state,
        commit: this.commit.bind(this),
      },
      payload,
    )
  }

  /**
   * Get or create the default storage manager
   */
  private async getStorageManager(): Promise<StorageManager> {
    if (!this.storageManager) {
      // Try to use global storage manager if available
      const QuaStoreManager = (await import('../manager/index')).default
      const globalManager = await QuaStoreManager.getGlobalStorageManager()
      if (globalManager) {
        this.storageManager = globalManager
        return this.storageManager
      }

      // Create default storage manager with IndexedDB backend
      this.storageManager = new StorageManager()
      await this.storageManager.init()
    }
    return this.storageManager
  }

  public async snapshot(id?: string): Promise<string> {
    const snapshotId = id || generateId()
    logger.module(this.name).info(`Creating snapshot with ID: ${snapshotId}`)

    const snapshot: QuaSnapshot = {
      id: snapshotId,
      storeName: this.name,
      data: JSON.parse(JSON.stringify(this.state)),
      createdAt: new Date(),
    }

    const storageManager = await this.getStorageManager()
    await storageManager.saveSnapshot(snapshot)
    logger.module(this.name).debug(`Snapshot saved successfully: ${snapshotId}`)
    return snapshotId
  }

  public async restore(snapshotId: string, options: QuaRestoreOptions = {}) {
    const { force = false } = options

    const storageManager = await this.getStorageManager()
    const snapshot = await storageManager.getSnapshot(snapshotId)
    if (!snapshot) {
      throw new Error(`Snapshot with id "${snapshotId}" not found.`)
    }

    if (snapshot.storeName !== this.name) {
      throw new Error(`Snapshot belongs to store "${snapshot.storeName}", not "${this.name}".`)
    }

    if (Object.keys(this.state).length && !force) {
      throw new Error('Cannot restore snapshot due to some data already exists in store. Use force option to override.')
    }

    this.state = snapshot.data
    return this
  }

  /**
   * Save current store state and all snapshots to a game slot
   */
  public async saveToSlot(
    slotId: string,
    metadata: {
      name?: string
      screenshot?: string
      sceneName?: string
      stepId?: string
      playtime?: number
      [key: string]: unknown
    } = {},
  ): Promise<void> {
    logger.module(this.name).info(`Saving store to slot: ${slotId}`)

    const storageManager = await this.getStorageManager()

    // Get all snapshots for this store
    const allSnapshots = await storageManager.listSnapshots(this.name)
    const snapshotData: QuaSnapshot[] = []

    for (const snapshotMeta of allSnapshots) {
      const snapshot = await storageManager.getSnapshot(snapshotMeta.id)
      if (snapshot) {
        snapshotData.push(snapshot)
      }
    }

    const gameSlot: QuaGameSaveSlot = {
      slotId,
      name: metadata.name,
      timestamp: new Date(),
      screenshot: metadata.screenshot,
      metadata: {
        sceneName: metadata.sceneName,
        stepId: metadata.stepId,
        playtime: metadata.playtime,
        ...metadata,
      },
      storeData: {
        state: JSON.parse(JSON.stringify(this.state)),
        snapshots: snapshotData,
      },
    }

    await storageManager.saveGameSlot(gameSlot)
    logger.module(this.name).info(`Store saved to slot successfully: ${slotId}`)
  }

  /**
   * Load store state and snapshots from a game slot
   * This will completely overwrite the current state and all snapshots
   */
  public async loadFromSlot(slotId: string, options: { force?: boolean } = {}): Promise<void> {
    logger.module(this.name).info(`Loading store from slot: ${slotId}`)

    const storageManager = await this.getStorageManager()
    const gameSlot = await storageManager.getGameSlot(slotId)

    if (!gameSlot) {
      throw new Error(`Game slot "${slotId}" not found.`)
    }

    const { force = false } = options

    if (Object.keys(this.state).length && !force) {
      throw new Error('Cannot load from slot due to some data already exists in store. Use force option to override.')
    }

    // Clear existing snapshots for this store
    await storageManager.clearSnapshots(this.name)

    // Restore all snapshots
    for (const snapshot of gameSlot.storeData.snapshots) {
      await storageManager.saveSnapshot(snapshot)
    }

    // Restore state
    this.state = gameSlot.storeData.state

    logger.module(this.name).info(`Store loaded from slot successfully: ${slotId}`)
  }

  /**
   * Delete a game slot
   */
  public async deleteSlot(slotId: string): Promise<void> {
    logger.module(this.name).info(`Deleting slot: ${slotId}`)

    const storageManager = await this.getStorageManager()
    await storageManager.deleteGameSlot(slotId)

    logger.module(this.name).info(`Slot deleted successfully: ${slotId}`)
  }

  /**
   * List all game slots
   */
  public async listSlots(): Promise<QuaGameSaveSlotMeta[]> {
    const storageManager = await this.getStorageManager()
    return await storageManager.listGameSlots()
  }

  /**
   * Get a specific game slot
   */
  public async getSlot(slotId: string): Promise<QuaGameSaveSlot | undefined> {
    const storageManager = await this.getStorageManager()
    return await storageManager.getGameSlot(slotId)
  }

  /**
   * Check if a slot exists
   */
  public async hasSlot(slotId: string): Promise<boolean> {
    const slot = await this.getSlot(slotId)
    return slot !== undefined
  }

  public reset() {
    this.state = { ...this.initialState }
  }

  public getName(): string {
    return this.name
  }

  public getState(): QuaState {
    return this.state
  }
}

export default QuaStore
