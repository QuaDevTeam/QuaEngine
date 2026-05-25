import type {
  QuaActions,
  QuaConstructorOpts,
  QuaGameSavePreviewPayload,
  QuaGameSavePreviewReadOptions,
  QuaGameSaveSlotMetadata,
  QuaGameSaveSlotIndex,
  QuaGameSaveSlotPayload,
  QuaGameSaveSlotPreviewPatchInput,
  QuaGameSaveSlotWriteInput,
  QuaGetters,
  QuaMutations,
  QuaRestoreOptions,
  QuaSerializedState,
  QuaSnapshot,
  QuaState,
  QuaStateSerializer,
  QuaStoreSaveData,
} from '../types/base'
import {
  cloneSaveSlotIndex,
  cloneSaveSlotPayload,
  getPreviewDescriptorFromRecord,
  materializePreviewPayload,
  normalizePreviewInput,
} from '../preview'
import { assertStateSerializer, jsonStateSerializer } from '../serializer'
import { StorageManager } from '../storage/manager'
import logger, { generateId } from '../utils'

class QuaStore {
  public state: QuaState
  public getters: QuaGetters
  private name: string
  private mutations: QuaMutations
  private actions: QuaActions
  private innerGetters: QuaGetters
  private initialState: QuaSerializedState
  private storageManager: StorageManager | null = null
  private serializer: QuaStateSerializer

  public constructor(name: string, options: QuaConstructorOpts) {
    this.name = name
    this.serializer = assertStateSerializer(options.serializer || jsonStateSerializer)

    this.state = options.state || {}
    this.actions = options.actions || {}
    this.mutations = options.mutations || {}
    this.innerGetters = options.getters || {}
    this.initialState = this.serializeState()

    if (options.storage) {
      this.storageManager = new StorageManager(options.storage)
      this.storageManager.init().catch((error) => {
        logger.module(name).error('Failed to initialize storage manager:', error)
      })
    }

    const thisName = this.name
    logger.module(name).debug('Creating store with options:', options)

    this.getters = new Proxy<QuaGetters>(this.innerGetters, {
      get: (target, prop) => {
        const key = prop as string
        const getter = target[key]
        if (typeof getter !== 'function') {
          throw new TypeError(`Invalid getter in store [${thisName}]`)
        }
        return getter(this.state)
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

  private async getStorageManager(): Promise<StorageManager> {
    if (!this.storageManager) {
      const QuaStoreManager = (await import('../manager/index')).default
      const globalManager = await QuaStoreManager.getGlobalStorageManager()
      if (globalManager) {
        this.storageManager = globalManager
        return this.storageManager
      }

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
      data: this.serializeState(),
      createdAt: new Date(),
      scope: {
        type: 'store',
        storeNames: [this.name],
      },
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

    this.restoreSerializedState(snapshot.data)
    return this
  }

  public async deleteSnapshot(snapshotId: string): Promise<void> {
    const storageManager = await this.getStorageManager()
    await storageManager.deleteSnapshot(snapshotId)
  }

  public async saveToSlot(input: QuaGameSaveSlotWriteInput): Promise<QuaGameSaveSlotPayload>
  public async saveToSlot(
    slotId: string,
    metadata?: Omit<QuaGameSaveSlotWriteInput, 'slotId' | 'storeData'> & Record<string, unknown>,
  ): Promise<QuaGameSaveSlotPayload>
  public async saveToSlot(
    slotIdOrInput: string | QuaGameSaveSlotWriteInput,
    metadata?: Omit<QuaGameSaveSlotWriteInput, 'slotId' | 'storeData'> & Record<string, unknown>,
  ): Promise<QuaGameSaveSlotPayload> {
    const input = typeof slotIdOrInput === 'string'
      ? await this.createLegacySlotWriteInput(slotIdOrInput, metadata)
      : slotIdOrInput
    logger.module(this.name).info(`Saving store to slot: ${input.slotId}`)

    const storageManager = await this.getStorageManager()
    const nextSlot = await storageManager.transaction('readwrite', async () => {
      const existingIndex = await storageManager.getGameSlotIndex(input.slotId)
      const previewRecord = input.preview
        ? normalizePreviewInput(input.slotId, input.preview)
        : undefined
      const nextIndex: QuaGameSaveSlotIndex = {
        slotId: input.slotId,
        name: input.name,
        timestamp: input.timestamp ? new Date(input.timestamp) : new Date(),
        revision: input.revision ?? (existingIndex?.revision ?? 0) + 1,
        saveOpId: input.saveOpId,
        previewStatus: previewRecord ? 'ready' : input.previewStatus || 'none',
        preview: previewRecord ? getPreviewDescriptorFromRecord(previewRecord) : undefined,
        metadata: {
          ...input.metadata,
        },
      }
      const nextSlot: QuaGameSaveSlotPayload = {
        slotId: input.slotId,
        index: nextIndex,
        storeData: {
          state: input.storeData.state,
          snapshots: input.storeData.snapshots,
        },
      }

      await storageManager.saveGameSlotPayload(nextSlot)
      if (previewRecord) {
        await storageManager.saveGameSlotPreview(previewRecord)
      }
      await storageManager.saveGameSlotIndex(nextIndex)

      const previousPreviewId = existingIndex?.preview?.previewId
      if (previousPreviewId && previousPreviewId !== previewRecord?.previewId) {
        await storageManager.deleteGameSlotPreview(previousPreviewId)
      }

      return nextSlot
    })

    logger.module(this.name).info(`Store saved to slot successfully: ${input.slotId}`)
    return cloneSaveSlotPayload(nextSlot)
  }

  public async patchSlotPreview(slotId: string, patch: QuaGameSaveSlotPreviewPatchInput): Promise<QuaGameSaveSlotIndex | undefined> {
    const storageManager = await this.getStorageManager()
    return await storageManager.transaction('readwrite', async () => {
      const currentIndex = await storageManager.getGameSlotIndex(slotId)
      if (!currentIndex) {
        return undefined
      }
      const currentPayload = await storageManager.getGameSlotPayload(slotId)

      if (patch.expectedSaveOpId && currentIndex.saveOpId !== patch.expectedSaveOpId) {
        return undefined
      }
      if (patch.expectedRevision !== undefined && currentIndex.revision !== patch.expectedRevision) {
        return undefined
      }

      const previewRecord = patch.preview
        ? normalizePreviewInput(slotId, patch.preview)
        : undefined
      const nextIndex: QuaGameSaveSlotIndex = {
        ...currentIndex,
        timestamp: patch.timestamp ? new Date(patch.timestamp) : currentIndex.timestamp,
        revision: currentIndex.revision + 1,
        saveOpId: patch.saveOpId ?? currentIndex.saveOpId,
        previewStatus: previewRecord
          ? 'ready'
          : patch.clearPreview
            ? patch.previewStatus || 'none'
            : patch.previewStatus || currentIndex.previewStatus,
        preview: previewRecord
          ? getPreviewDescriptorFromRecord(previewRecord)
          : patch.clearPreview
            ? undefined
            : currentIndex.preview,
        metadata: {
          ...currentIndex.metadata,
        },
      }
      const nextPayload = currentPayload
        ? {
            ...currentPayload,
            index: nextIndex,
          }
        : undefined

      if (previewRecord) {
        await storageManager.saveGameSlotPreview(previewRecord)
      }
      if (nextPayload) {
        await storageManager.saveGameSlotPayload(nextPayload)
      }
      await storageManager.saveGameSlotIndex(nextIndex)

      const previousPreviewId = currentIndex.preview?.previewId
      if (patch.clearPreview && previousPreviewId) {
        await storageManager.deleteGameSlotPreview(previousPreviewId)
      }
      else if (previewRecord && previousPreviewId && previousPreviewId !== previewRecord.previewId) {
        await storageManager.deleteGameSlotPreview(previousPreviewId)
      }

      return cloneSaveSlotIndex(nextIndex)
    })
  }

  public async exportSaveData(): Promise<QuaStoreSaveData> {
    return {
      state: this.serializeState(),
      snapshots: await this.collectSnapshotData(),
    }
  }

  public async loadFromSlot(slotId: string, options: { force?: boolean } = {}): Promise<void> {
    logger.module(this.name).info(`Loading store from slot: ${slotId}`)

    const storageManager = await this.getStorageManager()
    const gameSlot = await storageManager.getGameSlotPayload(slotId)

    if (!gameSlot) {
      throw new Error(`Game slot "${slotId}" not found.`)
    }

    const { force = false } = options

    if (Object.keys(this.state).length && !force) {
      throw new Error('Cannot load from slot due to some data already exists in store. Use force option to override.')
    }

    const nextState = this.deserializeState(gameSlot.storeData.state)
    await storageManager.transaction('readwrite', async () => {
      await storageManager.clearSnapshots(this.name)

      for (const snapshot of gameSlot.storeData.snapshots) {
        await storageManager.saveSnapshot(snapshot)
      }
    })

    this.state = nextState

    logger.module(this.name).info(`Store loaded from slot successfully: ${slotId}`)
  }

  public async importSaveData(data: QuaStoreSaveData, options: { force?: boolean } = {}): Promise<void> {
    const { force = false } = options
    if (Object.keys(this.state).length && !force) {
      throw new Error('Cannot import store save data due to some data already exists in store. Use force option to override.')
    }

    const nextState = this.deserializeState(data.state)
    const storageManager = await this.getStorageManager()
    await storageManager.transaction('readwrite', async () => {
      await storageManager.clearSnapshots(this.name)
      for (const snapshot of data.snapshots) {
        await storageManager.saveSnapshot(snapshot)
      }
    })
    this.state = nextState
  }

  public async deleteSlot(slotId: string): Promise<void> {
    logger.module(this.name).info(`Deleting slot: ${slotId}`)

    const storageManager = await this.getStorageManager()
    await storageManager.transaction('readwrite', async () => {
      const index = await storageManager.getGameSlotIndex(slotId)
      if (index?.preview?.previewId) {
        await storageManager.deleteGameSlotPreview(index.preview.previewId)
      }
      await storageManager.deleteGameSlotPayload(slotId)
      await storageManager.deleteGameSlotIndex(slotId)
    })

    logger.module(this.name).info(`Slot deleted successfully: ${slotId}`)
  }

  public async listSlots(): Promise<QuaGameSaveSlotIndex[]> {
    const storageManager = await this.getStorageManager()
    return await storageManager.listGameSlotIndexes()
  }

  public async getSlot(slotId: string): Promise<QuaGameSaveSlotPayload | undefined> {
    const storageManager = await this.getStorageManager()
    return await storageManager.getGameSlotPayload(slotId)
  }

  public async getSlotPreview(
    slotId: string,
    options: QuaGameSavePreviewReadOptions = {},
  ): Promise<QuaGameSavePreviewPayload | undefined> {
    const storageManager = await this.getStorageManager()
    const slotIndex = await storageManager.getGameSlotIndex(slotId)
    const previewId = slotIndex?.preview?.previewId
    if (!previewId) {
      return undefined
    }

    const preview = await storageManager.getGameSlotPreview(previewId)
    if (!preview) {
      return undefined
    }
    return materializePreviewPayload(preview, options.format)
  }

  public async getSlotPreviews(
    slotIds: readonly string[],
    options: QuaGameSavePreviewReadOptions = {},
  ): Promise<Record<string, QuaGameSavePreviewPayload | undefined>> {
    const entries = await Promise.all(slotIds.map(async (slotId) => {
      return [slotId, await this.getSlotPreview(slotId, options)] as const
    }))
    return Object.fromEntries(entries)
  }

  public async hasSlot(slotId: string): Promise<boolean> {
    const storageManager = await this.getStorageManager()
    const slot = await storageManager.getGameSlotIndex(slotId)
    return slot !== undefined
  }

  public reset() {
    this.restoreSerializedState(this.initialState)
  }

  public getName(): string {
    return this.name
  }

  public serializeState(): QuaSerializedState {
    return this.serializer.serialize(this.state)
  }

  public deserializeState(serializedState: QuaSerializedState): QuaState {
    return this.serializer.deserialize<QuaState>(serializedState)
  }

  public restoreSerializedState(serializedState: QuaSerializedState): void {
    this.state = this.deserializeState(serializedState)
  }

  public getState(): QuaState {
    return this.state
  }

  private async collectSnapshotData(): Promise<QuaSnapshot[]> {
    const storageManager = await this.getStorageManager()
    const allSnapshots = await storageManager.listSnapshots(this.name)
    const snapshotData: QuaSnapshot[] = []

    for (const snapshotMeta of allSnapshots) {
      const snapshot = await storageManager.getSnapshot(snapshotMeta.id)
      if (snapshot) {
        snapshotData.push(snapshot)
      }
    }

    return snapshotData
  }

  private async createLegacySlotWriteInput(
    slotId: string,
    metadata: (Omit<QuaGameSaveSlotWriteInput, 'slotId' | 'storeData'> & Record<string, unknown>) | undefined,
  ): Promise<QuaGameSaveSlotWriteInput> {
    const typedMetadata = metadata as (Omit<QuaGameSaveSlotWriteInput, 'slotId' | 'storeData'> & Record<string, unknown>) | undefined
    const {
      name,
      timestamp,
      revision,
      saveOpId,
      previewStatus,
      preview,
      metadata: nestedMetadata,
      ...restMetadata
    } = typedMetadata || {}
    const topLevelSceneName = typeof typedMetadata?.sceneName === 'string' ? typedMetadata.sceneName : undefined
    const topLevelStepId = typeof typedMetadata?.stepId === 'string' ? typedMetadata.stepId : undefined
    const topLevelPlaytime = typeof typedMetadata?.playtime === 'number' ? typedMetadata.playtime : undefined
    const nextMetadata: QuaGameSaveSlotMetadata = {
      ...restMetadata,
      ...(nestedMetadata || {}),
      sceneName: typeof nestedMetadata?.sceneName === 'string' ? nestedMetadata.sceneName : topLevelSceneName,
      stepId: typeof nestedMetadata?.stepId === 'string' ? nestedMetadata.stepId : topLevelStepId,
      playtime: typeof nestedMetadata?.playtime === 'number' ? nestedMetadata.playtime : topLevelPlaytime,
    }

    return {
      slotId,
      name,
      timestamp,
      revision,
      saveOpId,
      previewStatus,
      preview,
      metadata: nextMetadata,
      storeData: {
        state: this.serializeState(),
        snapshots: await this.collectSnapshotData(),
      },
    }
  }
}

export default QuaStore
