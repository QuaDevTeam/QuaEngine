import type {
  QuaGameSavePreviewRecord,
  QuaGameSaveSlotIndex,
  QuaGameSaveSlotPayload,
  QuaSnapshot,
  QuaSnapshotMeta,
  StorageBackend,
  StorageConfig,
  StorageMiddleware,
} from '@quajs/store'
import type { QuaNativeHostApi, QuaNativeHostInfo } from '@quajs/native-contracts'

declare const TextEncoder: {
  new(): { encode: (input: string) => Uint8Array }
}

declare const TextDecoder: {
  new(): { decode: (input: Uint8Array) => string }
}

export interface NativeStoreBackendOptions {
  host: QuaNativeHostApi
  hostInfo?: QuaNativeHostInfo
  profileId?: string
  namespace?: string
  middlewares?: StorageMiddleware[]
}

type NativeStoreRecord
  = | QuaSnapshot
    | QuaGameSaveSlotIndex
    | QuaGameSaveSlotPayload
    | QuaGameSavePreviewRecord

interface NativeStoreEnvelope<TRecord extends NativeStoreRecord = NativeStoreRecord> {
  format: 'qua-native-store'
  version: 1
  kind: NativeStoreRecordKind
  record: TRecord
}

type NativeStoreRecordKind = 'snapshot' | 'game-slot-index' | 'game-slot-payload' | 'game-slot-preview'

export class NativeStoreBackend implements StorageBackend {
  private readonly namespace: string

  constructor(private readonly options: NativeStoreBackendOptions) {
    this.namespace = createNativeStoreNamespace(options)
  }

  async saveSnapshot(snapshot: QuaSnapshot): Promise<void> {
    await this.writeRecord(this.key('snapshots', snapshot.id), 'snapshot', snapshot)
  }

  async getSnapshot(id: string): Promise<QuaSnapshot | undefined> {
    return await this.readRecord<QuaSnapshot>(this.key('snapshots', id), 'snapshot')
  }

  async deleteSnapshot(id: string): Promise<void> {
    await this.options.host.deleteStorage(this.key('snapshots', id))
  }

  async listSnapshots(storeName?: string): Promise<QuaSnapshotMeta[]> {
    const snapshots = await this.readRecords<QuaSnapshot>('snapshots', 'snapshot')
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
    const snapshots = await this.readRecords<QuaSnapshot>('snapshots', 'snapshot')
    await Promise.all(snapshots
      .filter(snapshot => !storeName || snapshot.storeName === storeName)
      .map(snapshot => this.deleteSnapshot(snapshot.id)))
  }

  async saveGameSlotIndex(slot: QuaGameSaveSlotIndex): Promise<void> {
    await this.writeRecord(this.key('slot-indexes', slot.slotId), 'game-slot-index', slot)
  }

  async getGameSlotIndex(slotId: string): Promise<QuaGameSaveSlotIndex | undefined> {
    return await this.readRecord<QuaGameSaveSlotIndex>(this.key('slot-indexes', slotId), 'game-slot-index')
  }

  async listGameSlotIndexes(): Promise<QuaGameSaveSlotIndex[]> {
    const slots = await this.readRecords<QuaGameSaveSlotIndex>('slot-indexes', 'game-slot-index')
    return slots.sort((left, right) => right.timestamp.getTime() - left.timestamp.getTime())
  }

  async deleteGameSlotIndex(slotId: string): Promise<void> {
    await this.options.host.deleteStorage(this.key('slot-indexes', slotId))
  }

  async saveGameSlotPayload(slot: QuaGameSaveSlotPayload): Promise<void> {
    await this.writeRecord(this.key('slot-payloads', slot.slotId), 'game-slot-payload', slot)
  }

  async getGameSlotPayload(slotId: string): Promise<QuaGameSaveSlotPayload | undefined> {
    return await this.readRecord<QuaGameSaveSlotPayload>(this.key('slot-payloads', slotId), 'game-slot-payload')
  }

  async deleteGameSlotPayload(slotId: string): Promise<void> {
    await this.options.host.deleteStorage(this.key('slot-payloads', slotId))
  }

  async saveGameSlotPreview(preview: QuaGameSavePreviewRecord): Promise<void> {
    await this.writeRecord(this.key('slot-previews', preview.previewId), 'game-slot-preview', preview)
  }

  async getGameSlotPreview(previewId: string): Promise<QuaGameSavePreviewRecord | undefined> {
    return await this.readRecord<QuaGameSavePreviewRecord>(this.key('slot-previews', previewId), 'game-slot-preview')
  }

  async deleteGameSlotPreview(previewId: string): Promise<void> {
    await this.options.host.deleteStorage(this.key('slot-previews', previewId))
  }

  async clearGameSlots(): Promise<void> {
    await Promise.all([
      this.deletePrefix('slot-indexes'),
      this.deletePrefix('slot-payloads'),
      this.deletePrefix('slot-previews'),
    ])
  }

  async transaction<T>(_mode: 'readonly' | 'readwrite', action: () => Promise<T>): Promise<T> {
    return await action()
  }

  private async writeRecord<TRecord extends NativeStoreRecord>(
    key: string,
    kind: NativeStoreRecordKind,
    record: TRecord,
  ): Promise<void> {
    const envelope: NativeStoreEnvelope<TRecord> = {
      format: 'qua-native-store',
      version: 1,
      kind,
      record,
    }
    await this.options.host.writeStorage(key, encodeJson(envelope))
  }

  private async readRecord<TRecord extends NativeStoreRecord>(
    key: string,
    kind: NativeStoreRecordKind,
  ): Promise<TRecord | undefined> {
    const data = await this.options.host.readStorage(key)
    if (!data)
      return undefined
    const envelope = decodeJson<NativeStoreEnvelope<TRecord>>(data)
    if (envelope.format !== 'qua-native-store' || envelope.kind !== kind)
      return undefined
    return reviveRecord(envelope.record)
  }

  private async readRecords<TRecord extends NativeStoreRecord>(
    group: string,
    kind: NativeStoreRecordKind,
  ): Promise<TRecord[]> {
    const keys = await this.requireListStorageKeys(this.key(group, ''))
    const records = await Promise.all(keys.map(key => this.readRecord<TRecord>(key, kind)))
    return records.filter(record => record !== undefined)
  }

  private async deletePrefix(group: string): Promise<void> {
    const keys = await this.requireListStorageKeys(this.key(group, ''))
    await Promise.all(keys.map(key => this.options.host.deleteStorage(key)))
  }

  private async requireListStorageKeys(prefix: string): Promise<string[]> {
    if (!this.options.host.listStorageKeys) {
      throw new Error('Native store host must provide listStorageKeys for list and clear operations.')
    }
    return await this.options.host.listStorageKeys(prefix)
  }

  private key(group: string, id: string): string {
    return `${this.namespace}/${group}/${encodeURIComponent(id)}`
  }
}

export function createNativeStorageConfig(options: NativeStoreBackendOptions): StorageConfig {
  return {
    backend: {
      driver: NativeStoreBackend,
      options,
    },
    middlewares: options.middlewares,
  }
}

export function createNativeStoreNamespace(options: Pick<NativeStoreBackendOptions, 'hostInfo' | 'namespace' | 'profileId'>): string {
  const app = options.hostInfo?.app
  const bundleId = app?.bundleId || 'unknown.app'
  const profile = app?.profile || 'debug'
  const profileId = options.profileId || 'default'
  const namespace = options.namespace || 'qua-store'
  return [bundleId, profile, profileId, namespace].map(encodeURIComponent).join('/')
}

function encodeJson(value: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(value, function (key, entry) {
    const original = key ? (this as Record<string, unknown>)[key] : entry
    if (original instanceof Date)
      return { __quaType: 'Date', value: original.toISOString() }
    if (original instanceof Uint8Array)
      return { __quaType: 'Uint8Array', value: bytesToBase64(original) }
    return entry
  }))
}

function decodeJson<T>(bytes: Uint8Array): T {
  return JSON.parse(new TextDecoder().decode(bytes), (_key, value) => {
    if (isTypedJsonDate(value))
      return new Date(value.value)
    if (isTypedJsonUint8Array(value))
      return base64ToBytes(value.value)
    return value
  }) as T
}

function reviveRecord<TRecord extends NativeStoreRecord>(record: TRecord): TRecord {
  return reviveLegacyRecord(record) as TRecord
}

function reviveLegacyRecord(value: unknown, keyName?: string): unknown {
  if (Array.isArray(value))
    return value.map(item => reviveLegacyRecord(item))
  if (!value || typeof value !== 'object')
    return value
  if (value instanceof Date || value instanceof Uint8Array)
    return value

  if (keyName === 'bytes' && isLegacySerializedUint8Array(value))
    return new Uint8Array(Object.values(value))

  const result: Record<string, unknown> = {}
  for (const [key, entry] of Object.entries(value)) {
    if ((key === 'createdAt' || key === 'timestamp') && typeof entry === 'string') {
      result[key] = new Date(entry)
    }
    else {
      result[key] = reviveLegacyRecord(entry, key)
    }
  }
  return result
}

function isTypedJsonDate(value: unknown): value is { __quaType: 'Date', value: string } {
  return Boolean(value && typeof value === 'object' && (value as { __quaType?: unknown }).__quaType === 'Date'
    && typeof (value as { value?: unknown }).value === 'string')
}

function isTypedJsonUint8Array(value: unknown): value is { __quaType: 'Uint8Array', value: string } {
  return Boolean(value && typeof value === 'object' && (value as { __quaType?: unknown }).__quaType === 'Uint8Array'
    && typeof (value as { value?: unknown }).value === 'string')
}

function isLegacySerializedUint8Array(value: object): value is Record<string, number> {
  const entries = Object.entries(value)
  return entries.length > 0
    && entries.every(([key, entry]) => /^\d+$/.test(key) && typeof entry === 'number')
    && entries
      .map(([key]) => Number(key))
      .sort((left, right) => left - right)
      .every((key, index) => key === index)
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
  if (normalized.length % 4 !== 0)
    throw new Error('Invalid native store base64 payload.')
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
    throw new Error('Invalid native store base64 character.')
  return value
}

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
