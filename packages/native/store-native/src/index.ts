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
    const keys = await this.options.host.listStorageKeys?.(this.key(group, ''))
    if (!keys)
      return []
    const records = await Promise.all(keys.map(key => this.readRecord<TRecord>(key, kind)))
    return records.filter(record => record !== undefined)
  }

  private async deletePrefix(group: string): Promise<void> {
    const keys = await this.options.host.listStorageKeys?.(this.key(group, ''))
    if (!keys)
      return
    await Promise.all(keys.map(key => this.options.host.deleteStorage(key)))
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
  return new TextEncoder().encode(JSON.stringify(value))
}

function decodeJson<T>(bytes: Uint8Array): T {
  return JSON.parse(new TextDecoder().decode(bytes)) as T
}

function reviveRecord<TRecord extends NativeStoreRecord>(record: TRecord): TRecord {
  return reviveDates(record) as TRecord
}

function reviveDates(value: unknown): unknown {
  if (Array.isArray(value))
    return value.map(reviveDates)
  if (!value || typeof value !== 'object')
    return value

  const result: Record<string, unknown> = {}
  for (const [key, entry] of Object.entries(value)) {
    if ((key === 'createdAt' || key === 'timestamp') && typeof entry === 'string') {
      result[key] = new Date(entry)
    }
    else {
      result[key] = reviveDates(entry)
    }
  }
  return result
}
