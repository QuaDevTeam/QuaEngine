import type {
  CocosHost,
} from '@quajs/cocos-host'
import type {
  QuaGameSavePreviewRecord,
  QuaGameSaveSlotIndex,
  QuaGameSaveSlotPayload,
  QuaSnapshot,
  QuaSnapshotMeta,
  StorageBackend,
  StorageConfig,
  StorageMiddleware,
  StorageTransactionMode,
} from '@quajs/store'

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

export interface CocosStoreBackendOptions {
  host: CocosHost
  root?: string
}

export interface CocosStoreStorageOptions extends CocosStoreBackendOptions {
  middlewares?: StorageMiddleware[]
}

type CocosStoreKind = 'snapshot' | 'game-slot-index' | 'game-slot-payload' | 'game-slot-preview'
type CocosStoreRecord = QuaSnapshot | QuaGameSaveSlotIndex | QuaGameSaveSlotPayload | QuaGameSavePreviewRecord

interface CocosStoreEnvelope<T extends CocosStoreRecord = CocosStoreRecord> {
  format: 'quastore-cocos'
  version: 1
  kind: CocosStoreKind
  record: T
}

export class CocosFileStoreBackend implements StorageBackend {
  private readonly root: string
  private transactionDepth = 0
  private transactionJournal?: Map<string, string | undefined>
  private transactionSerial = 0

  constructor(private readonly options: CocosStoreBackendOptions) {
    this.root = normalizeRoot(options.root || 'qua-store')
  }

  async init(): Promise<void> {
    await this.options.host.storage.ensureDir(this.root)
    await this.options.host.storage.ensureDir(this.snapshotsDir())
    await this.options.host.storage.ensureDir(this.slotIndexesDir())
    await this.options.host.storage.ensureDir(this.slotPayloadsDir())
    await this.options.host.storage.ensureDir(this.slotPreviewsDir())
  }

  async saveSnapshot(snapshot: QuaSnapshot): Promise<void> {
    await this.writeRecord(this.snapshotPath(snapshot.id), 'snapshot', snapshot)
  }

  async getSnapshot(id: string): Promise<QuaSnapshot | undefined> {
    return this.readOptionalRecord<QuaSnapshot>(this.snapshotPath(id), 'snapshot')
  }

  async deleteSnapshot(id: string): Promise<void> {
    await this.deleteRecord(this.snapshotPath(id))
  }

  async listSnapshots(storeName?: string): Promise<QuaSnapshotMeta[]> {
    const snapshots = await this.readRecords<QuaSnapshot>(this.snapshotsDir(), 'snapshot')
    return snapshots
      .filter(snapshot => !storeName || snapshot.storeName === storeName)
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
      .map(snapshot => ({
        id: snapshot.id,
        storeName: snapshot.storeName,
        createdAt: snapshot.createdAt,
        scope: snapshot.scope,
      }))
  }

  async clearSnapshots(storeName?: string): Promise<void> {
    const snapshots = await this.readRecords<QuaSnapshot>(this.snapshotsDir(), 'snapshot')
    for (const snapshot of snapshots) {
      if (!storeName || snapshot.storeName === storeName) {
        await this.deleteSnapshot(snapshot.id)
      }
    }
  }

  async saveGameSlotIndex(slot: QuaGameSaveSlotIndex): Promise<void> {
    await this.writeRecord(this.slotIndexPath(slot.slotId), 'game-slot-index', cloneSaveSlotIndex(slot))
  }

  async getGameSlotIndex(slotId: string): Promise<QuaGameSaveSlotIndex | undefined> {
    const slot = await this.readOptionalRecord<QuaGameSaveSlotIndex>(this.slotIndexPath(slotId), 'game-slot-index')
    return slot ? cloneSaveSlotIndex(slot) : undefined
  }

  async listGameSlotIndexes(): Promise<QuaGameSaveSlotIndex[]> {
    return (await this.readRecords<QuaGameSaveSlotIndex>(this.slotIndexesDir(), 'game-slot-index'))
      .map(slot => cloneSaveSlotIndex(slot))
      .sort((left, right) => right.timestamp.getTime() - left.timestamp.getTime())
  }

  async deleteGameSlotIndex(slotId: string): Promise<void> {
    await this.deleteRecord(this.slotIndexPath(slotId))
  }

  async saveGameSlotPayload(slot: QuaGameSaveSlotPayload): Promise<void> {
    await this.writeRecord(this.slotPayloadPath(slot.slotId), 'game-slot-payload', cloneSaveSlotPayload(slot))
  }

  async getGameSlotPayload(slotId: string): Promise<QuaGameSaveSlotPayload | undefined> {
    const slot = await this.readOptionalRecord<QuaGameSaveSlotPayload>(this.slotPayloadPath(slotId), 'game-slot-payload')
    return slot ? cloneSaveSlotPayload(slot) : undefined
  }

  async deleteGameSlotPayload(slotId: string): Promise<void> {
    await this.deleteRecord(this.slotPayloadPath(slotId))
  }

  async saveGameSlotPreview(preview: QuaGameSavePreviewRecord): Promise<void> {
    await this.writeRecord(this.slotPreviewPath(preview.previewId), 'game-slot-preview', clonePreviewRecord(preview))
  }

  async getGameSlotPreview(previewId: string): Promise<QuaGameSavePreviewRecord | undefined> {
    const preview = await this.readOptionalRecord<QuaGameSavePreviewRecord>(this.slotPreviewPath(previewId), 'game-slot-preview')
    return preview ? clonePreviewRecord(preview) : undefined
  }

  async deleteGameSlotPreview(previewId: string): Promise<void> {
    await this.deleteRecord(this.slotPreviewPath(previewId))
  }

  async clearGameSlots(): Promise<void> {
    for (const directory of [this.slotIndexesDir(), this.slotPayloadsDir(), this.slotPreviewsDir()]) {
      for (const file of await this.options.host.storage.list(directory))
        await this.deleteRecord(file.path)
    }
  }

  async transaction<T>(mode: StorageTransactionMode, action: () => Promise<T>): Promise<T> {
    if (this.transactionDepth > 0)
      throw new Error('Cocos store transactions must not overlap or nest; await the active transaction first.')
    if (mode === 'readonly') {
      this.transactionDepth = 1
      try {
        return await action()
      }
      finally {
        this.transactionDepth = 0
      }
    }

    this.transactionDepth = 1
    const journal = new Map<string, string | undefined>()
    this.transactionJournal = journal
    let canDeleteBackups = false
    try {
      try {
        const result = await action()
        canDeleteBackups = true
        return result
      }
      catch (error) {
        this.transactionJournal = undefined
        await this.restoreJournal(journal)
        canDeleteBackups = true
        throw error
      }
    }
    finally {
      this.transactionJournal = undefined
      try {
        if (canDeleteBackups) {
          for (const backup of journal.values()) {
            if (backup)
              await this.options.host.storage.delete(backup)
          }
        }
      }
      finally {
        this.transactionDepth = 0
      }
    }
  }

  async close(): Promise<void> {}

  private async writeRecord<T extends CocosStoreRecord>(path: string, kind: CocosStoreKind, record: T): Promise<void> {
    await this.backupRecord(path)
    await this.options.host.storage.writeText(path, encodeEnvelope({ format: 'quastore-cocos', version: 1, kind, record }))
  }

  private async deleteRecord(path: string): Promise<void> {
    await this.backupRecord(path)
    await this.options.host.storage.delete(path)
  }

  private async readOptionalRecord<T extends CocosStoreRecord>(path: string, expectedKind: CocosStoreKind): Promise<T | undefined> {
    const text = await this.options.host.storage.readText(path)
    if (!text)
      return undefined
    const envelope = decodeEnvelope<T>(text)
    if (envelope.kind !== expectedKind) {
      throw new Error(`Unexpected Cocos store record kind "${envelope.kind}" at ${path}; expected "${expectedKind}".`)
    }
    return envelope.record
  }

  private async readRecords<T extends CocosStoreRecord>(root: string, expectedKind: CocosStoreKind): Promise<T[]> {
    const files = await this.options.host.storage.list(root)
    const records: T[] = []
    for (const file of files) {
      if (!file.path.endsWith('.json'))
        continue
      const record = await this.readOptionalRecord<T>(file.path, expectedKind)
      if (record)
        records.push(record)
    }
    return records
  }

  private journalKey(path: string): string {
    // Host listing can return absolute paths whereas writes use relative paths.
    const index = path.lastIndexOf(`/${this.root}/`)
    return index >= 0 ? path.slice(index + 1) : path
  }

  private async backupRecord(path: string): Promise<void> {
    const journal = this.transactionJournal
    const key = this.journalKey(path)
    if (!journal || journal.has(key))
      return
    const bytes = await this.options.host.storage.readBytes(path)
    if (bytes === undefined) {
      journal.set(key, undefined)
      return
    }
    const directory = `${this.root}/transaction-backups`
    await this.options.host.storage.ensureDir(directory)
    const backup = `${directory}/${Date.now()}-${++this.transactionSerial}.bin`
    await this.options.host.storage.writeBytes(backup, bytes)
    journal.set(key, backup)
  }

  private async restoreJournal(journal: Map<string, string | undefined>): Promise<void> {
    for (const [path, backup] of journal) {
      if (!backup) {
        await this.options.host.storage.delete(path)
      }
      else {
        const bytes = await this.options.host.storage.readBytes(backup)
        if (bytes === undefined)
          throw new Error(`Cocos transaction backup is missing: ${backup}`)
        await this.options.host.storage.writeBytes(path, bytes)
      }
    }
  }

  private snapshotsDir(): string {
    return `${this.root}/snapshots`
  }

  private slotIndexesDir(): string {
    return `${this.root}/slot-indexes`
  }

  private slotPayloadsDir(): string {
    return `${this.root}/slot-payloads`
  }

  private slotPreviewsDir(): string {
    return `${this.root}/slot-previews`
  }

  private snapshotPath(id: string): string {
    return `${this.snapshotsDir()}/${encodeURIComponent(id)}.json`
  }

  private slotIndexPath(slotId: string): string {
    return `${this.slotIndexesDir()}/${encodeURIComponent(slotId)}.json`
  }

  private slotPayloadPath(slotId: string): string {
    return `${this.slotPayloadsDir()}/${encodeURIComponent(slotId)}.json`
  }

  private slotPreviewPath(previewId: string): string {
    return `${this.slotPreviewsDir()}/${encodeURIComponent(previewId)}.json`
  }
}

export function createCocosStoreStorage(options: CocosStoreStorageOptions): StorageConfig {
  const { middlewares, ...backendOptions } = options
  return {
    backend: {
      driver: CocosFileStoreBackend,
      options: backendOptions,
    },
    middlewares,
  }
}

function encodeEnvelope(envelope: CocosStoreEnvelope): string {
  return stringifyTypedJson(envelope)
}

function decodeEnvelope<T extends CocosStoreRecord>(text: string): CocosStoreEnvelope<T> {
  const envelope = JSON.parse(text, (_key, value) => {
    if (value && typeof value === 'object' && value.__quaType === 'Date') {
      return new Date(value.value)
    }
    if (value && typeof value === 'object' && value.__quaType === 'Uint8Array') {
      return base64ToBytes(value.value)
    }
    return value
  }) as CocosStoreEnvelope<T>
  if (envelope?.format !== 'quastore-cocos' || envelope.version !== 1 || !envelope.record || typeof envelope.record !== 'object')
    throw new Error('Invalid or unsupported Cocos store envelope.')
  return envelope
}

function normalizeRoot(root: string): string {
  return root.replace(/\/+$/, '')
}

function bytesToBase64(bytes: Uint8Array): string {
  let output = ''
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index]
    const second = bytes[index + 1]
    const third = bytes[index + 2]
    const value = (first << 16) | ((second || 0) << 8) | (third || 0)
    output += BASE64_ALPHABET[(value >> 18) & 63]
    output += BASE64_ALPHABET[(value >> 12) & 63]
    output += index + 1 < bytes.length ? BASE64_ALPHABET[(value >> 6) & 63] : '='
    output += index + 2 < bytes.length ? BASE64_ALPHABET[value & 63] : '='
  }
  return output
}

function base64ToBytes(value: string): Uint8Array {
  const normalized = value.replace(/\s+/g, '')
  if (normalized.length % 4 !== 0) {
    throw new Error('Invalid Cocos store base64 payload.')
  }
  const padding = normalized.endsWith('==') ? 2 : normalized.endsWith('=') ? 1 : 0
  const bytes = new Uint8Array((normalized.length / 4) * 3 - padding)
  let offset = 0
  for (let index = 0; index < normalized.length; index += 4) {
    const first = base64Value(normalized[index])
    const second = base64Value(normalized[index + 1])
    const third = normalized[index + 2] === '=' ? 0 : base64Value(normalized[index + 2])
    const fourth = normalized[index + 3] === '=' ? 0 : base64Value(normalized[index + 3])
    const chunk = (first << 18) | (second << 12) | (third << 6) | fourth
    if (offset < bytes.length)
      bytes[offset++] = (chunk >> 16) & 255
    if (offset < bytes.length)
      bytes[offset++] = (chunk >> 8) & 255
    if (offset < bytes.length)
      bytes[offset++] = chunk & 255
  }
  return bytes
}

function base64Value(char: string): number {
  const value = BASE64_ALPHABET.indexOf(char)
  if (value < 0)
    throw new Error('Invalid Cocos store base64 character.')
  return value
}

function stringifyTypedJson(value: unknown): string {
  return JSON.stringify(toTypedJsonValue(value))
}

function toTypedJsonValue(value: unknown): unknown {
  if (value instanceof Date) {
    return { __quaType: 'Date', value: value.toISOString() }
  }
  if (value instanceof Uint8Array) {
    return { __quaType: 'Uint8Array', value: bytesToBase64(value) }
  }
  if (Array.isArray(value)) {
    return value.map(item => toTypedJsonValue(item))
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .map(([key, item]) => [key, toTypedJsonValue(item)]),
    )
  }
  return value
}

function cloneSaveSlotIndex(index: QuaGameSaveSlotIndex): QuaGameSaveSlotIndex {
  return {
    ...index,
    timestamp: new Date(index.timestamp),
    preview: index.preview
      ? {
          ...index.preview,
          policySummary: index.preview.policySummary ? { ...index.preview.policySummary } : undefined,
        }
      : undefined,
    metadata: { ...(index.metadata || {}) },
  }
}

function cloneSaveSlotPayload(slot: QuaGameSaveSlotPayload): QuaGameSaveSlotPayload {
  return {
    slotId: slot.slotId,
    index: cloneSaveSlotIndex(slot.index),
    storeData: {
      state: slot.storeData.state,
      snapshots: slot.storeData.snapshots.map(snapshot => ({
        ...snapshot,
        createdAt: new Date(snapshot.createdAt),
        scope: snapshot.scope
          ? {
              type: snapshot.scope.type,
              storeNames: [...snapshot.scope.storeNames],
            }
          : undefined,
      })),
    },
  }
}

function clonePreviewRecord(record: QuaGameSavePreviewRecord): QuaGameSavePreviewRecord {
  return {
    ...record,
    bytes: new Uint8Array(record.bytes),
    policySummary: record.policySummary ? { ...record.policySummary } : undefined,
  }
}
