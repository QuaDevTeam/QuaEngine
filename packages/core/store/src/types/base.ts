export interface QuaState {
  [key: string]: any
}

export type QuaStoreSnapshotScope = 'all' | string | readonly string[]

export interface QuaSnapshotScopeMeta {
  type: 'store' | 'stores' | 'all'
  storeNames: string[]
}

export interface QuaSnapshotOptions {
  id?: string
  scope?: QuaStoreSnapshotScope
  storeName?: string
  storeNames?: readonly string[]
}

export interface QuaGetters {
  [key: string]: (state: QuaState) => any
}

export interface QuaMutations {
  [key: string]: (state: QuaState, payload?: any) => void
}

export interface QuaActionContext {
  state: QuaState
  commit: (mutationName: string, payload?: any) => void
}

export interface QuaActions {
  [key: string]: (context: QuaActionContext, payload?: any) => Promise<void> | void
}

export interface QuaConstructorOpts {
  state?: QuaState
  getters?: QuaGetters
  mutations?: QuaMutations
  actions?: QuaActions
  storage?: import('./storage').StorageConfig
}

export interface QuaRestoreOptions {
  force?: boolean
}

export interface QuaScopedRestoreOptions extends QuaRestoreOptions {
  scope?: QuaStoreSnapshotScope
  storeName?: string
  storeNames?: readonly string[]
  strict?: boolean
}

export interface QuaSnapshot {
  id: string
  storeName: string
  data: QuaState
  createdAt: Date
  scope?: QuaSnapshotScopeMeta
}

export interface QuaSnapshotMeta {
  id: string
  storeName: string
  createdAt: Date
  scope?: QuaSnapshotScopeMeta
}

/**
 * Game save slot data structure
 */
export interface QuaGameSaveSlot {
  slotId: string
  name?: string
  timestamp: Date
  screenshot?: string
  metadata: {
    sceneName?: string
    stepId?: string
    playtime?: number
    [key: string]: unknown
  }
  // Complete store state including all snapshots
  storeData: {
    state: QuaState
    snapshots: QuaSnapshot[]
  }
}

/**
 * Game save slot metadata (without full data)
 */
export interface QuaGameSaveSlotMeta {
  slotId: string
  name?: string
  timestamp: Date
  screenshot?: string
  metadata: {
    sceneName?: string
    stepId?: string
    playtime?: number
    [key: string]: unknown
  }
}
