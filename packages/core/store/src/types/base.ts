export interface QuaState {
  [key: string]: any
}

export type QuaSerializedState = any

export interface QuaStateSerializer {
  serialize: <T = QuaState>(state: T) => QuaSerializedState
  deserialize: <T = QuaState>(serializedState: QuaSerializedState) => T
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
  serializer?: QuaStateSerializer
  storage?: import('./storage').StorageConfig
  storageManager?: import('../storage/manager').StorageManager
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
  data: QuaSerializedState
  createdAt: Date
  scope?: QuaSnapshotScopeMeta
}

export interface QuaSnapshotMeta {
  id: string
  storeName: string
  createdAt: Date
  scope?: QuaSnapshotScopeMeta
}

export interface QuaStoreSaveData {
  state: QuaSerializedState
  snapshots: QuaSnapshot[]
}

export interface QuaGameSaveSlotMetadata {
  sceneName?: string
  stepId?: string
  playtime?: number
  [key: string]: unknown
}

export type QuaGameSavePreviewStatus = 'none' | 'pending' | 'ready' | 'error'
export type QuaGameSavePreviewReadFormat = 'bytes' | 'data-url'

export interface QuaGameSavePreviewBytesPayload {
  kind: 'bytes'
  mimeType: string
  bytes: Uint8Array
  width?: number
  height?: number
  capturedAt?: number
}

export interface QuaGameSavePreviewDataUrlPayload {
  kind: 'data-url'
  dataUrl: string
  mimeType?: string
  width?: number
  height?: number
  capturedAt?: number
}

export type QuaGameSavePreviewPayload
  = | QuaGameSavePreviewBytesPayload
    | QuaGameSavePreviewDataUrlPayload

export type QuaGameSavePreviewWriteInput = QuaGameSavePreviewPayload & {
  previewId?: string
  hash?: string
  policySummary?: Readonly<Record<string, unknown>>
}

export interface QuaGameSavePreviewDescriptor {
  previewId: string
  mimeType: string
  byteLength: number
  width?: number
  height?: number
  capturedAt: number
  hash: string
  policySummary?: Readonly<Record<string, unknown>>
}

export interface QuaGameSavePreviewRecord {
  previewId: string
  slotId: string
  mimeType: string
  bytes: Uint8Array
  byteLength: number
  width?: number
  height?: number
  capturedAt: number
  hash: string
  policySummary?: Readonly<Record<string, unknown>>
}

export interface QuaGameSaveSlotIndex {
  slotId: string
  name?: string
  timestamp: Date
  revision: number
  saveOpId?: string
  previewStatus: QuaGameSavePreviewStatus
  preview?: QuaGameSavePreviewDescriptor
  metadata: QuaGameSaveSlotMetadata
}

export interface QuaGameSaveSlotPayload {
  slotId: string
  index: QuaGameSaveSlotIndex
  storeData: QuaStoreSaveData
}

export type QuaGameSaveSlot = QuaGameSaveSlotPayload
export type QuaGameSaveSlotMeta = QuaGameSaveSlotIndex

export interface QuaGameSaveSlotWriteInput {
  slotId: string
  name?: string
  timestamp?: Date
  revision?: number
  saveOpId?: string
  previewStatus?: QuaGameSavePreviewStatus
  preview?: QuaGameSavePreviewWriteInput
  metadata: QuaGameSaveSlotMetadata
  storeData: QuaStoreSaveData
}

export interface QuaGameSaveSlotPreviewPatchInput {
  preview?: QuaGameSavePreviewWriteInput
  previewStatus?: QuaGameSavePreviewStatus
  saveOpId?: string
  expectedSaveOpId?: string
  expectedRevision?: number
  timestamp?: Date
  clearPreview?: boolean
}

export interface QuaGameSavePreviewReadOptions {
  format?: QuaGameSavePreviewReadFormat
}
