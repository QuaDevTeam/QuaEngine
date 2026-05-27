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
import { createCipheriv, createDecipheriv, createHash, randomBytes, scrypt } from 'node:crypto'
import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { deserialize, serialize } from 'node:v8'

export const QUASTORE_FILE_EXTENSION = '.quastore'
export const QUASTORE_KEY_ENV = 'QUASTORE_KEY'

const MAGIC = Buffer.from('QUASTORE', 'ascii')
const VERSION = 1
const FLAG_ENCRYPTED = 1
const HEADER_SIZE = MAGIC.byteLength + 1 + 1 + 4 + 4 + 4 + 4
const AES_256_GCM = 'aes-256-gcm'
const GCM_IV_BYTES = 12
const GCM_TAG_BYTES = 16
const SCRYPT_SALT_BYTES = 16
const AAD = Buffer.from('QUASTORE:v1:aes-256-gcm', 'utf8')
export interface QuastoreKeyDerivationOptions {
  cost?: number
  blockSize?: number
  parallelization?: number
  maxmem?: number
}

export interface QuastoreEncryptionOptions {
  key?: string | Uint8Array
  keyEnv?: string
  kdf?: QuastoreKeyDerivationOptions
}

export interface QuastoreFileBackendOptions {
  rootDir?: string
  encryption?: QuastoreEncryptionOptions | false
}

export interface NodeStoreStorageOptions extends QuastoreFileBackendOptions {
  middlewares?: StorageMiddleware[]
}

type QuastoreRecord
  = | QuaSnapshot
    | QuaGameSaveSlotIndex
    | QuaGameSaveSlotPayload
    | QuaGameSavePreviewRecord

export interface QuastoreRecordEnvelope<TRecord extends QuastoreRecord = QuastoreRecord> {
  format: 'quastore'
  version: 1
  kind: QuastoreRecordKind
  record: TRecord
}

type QuastoreRecordKind = 'snapshot' | 'game-slot-index' | 'game-slot-payload' | 'game-slot-preview'

interface ResolvedEncryptionConfig {
  keyMaterial: Buffer
  kdf: Required<QuastoreKeyDerivationOptions>
}

interface LoadedRecord<T> {
  path: string
  record: T
}

interface QuastoreDirectoryRecord {
  fileName: string
  bytes: Buffer
}

interface QuastoreTransactionSnapshot {
  snapshots: QuastoreDirectoryRecord[]
  gameSlotIndexes: QuastoreDirectoryRecord[]
  gameSlotPayloads: QuastoreDirectoryRecord[]
  gameSlotPreviews: QuastoreDirectoryRecord[]
}

export class QuastoreFileBackend implements StorageBackend {
  private readonly rootDir: string
  private readonly snapshotsDir: string
  private readonly gameSlotIndexesDir: string
  private readonly gameSlotPayloadsDir: string
  private readonly gameSlotPreviewsDir: string
  private readonly encryptionOptions: QuastoreEncryptionOptions | false | undefined
  private encryptionConfig: ResolvedEncryptionConfig | false | undefined
  private transactionDepth = 0

  constructor(options: QuastoreFileBackendOptions = {}) {
    this.rootDir = resolve(options.rootDir || join(process.cwd(), '.qua-store'))
    this.snapshotsDir = join(this.rootDir, 'snapshots')
    this.gameSlotIndexesDir = join(this.rootDir, 'slot-indexes')
    this.gameSlotPayloadsDir = join(this.rootDir, 'slot-payloads')
    this.gameSlotPreviewsDir = join(this.rootDir, 'slot-previews')
    this.encryptionOptions = options.encryption
  }

  async init(): Promise<void> {
    this.encryptionConfig = this.resolveEncryptionConfig()
    await mkdir(this.snapshotsDir, { recursive: true })
    await mkdir(this.gameSlotIndexesDir, { recursive: true })
    await mkdir(this.gameSlotPayloadsDir, { recursive: true })
    await mkdir(this.gameSlotPreviewsDir, { recursive: true })
  }

  async saveSnapshot(snapshot: QuaSnapshot): Promise<void> {
    await this.writeRecord(this.snapshotPath(snapshot.id), {
      format: 'quastore',
      version: VERSION,
      kind: 'snapshot',
      record: snapshot,
    })
  }

  async getSnapshot(id: string): Promise<QuaSnapshot | undefined> {
    return await this.readOptionalRecord<QuaSnapshot>(this.snapshotPath(id), 'snapshot')
  }

  async deleteSnapshot(id: string): Promise<void> {
    await rm(this.snapshotPath(id), { force: true })
  }

  async listSnapshots(storeName?: string): Promise<QuaSnapshotMeta[]> {
    const snapshots = await this.readRecords<QuaSnapshot>(this.snapshotsDir, 'snapshot')
    return snapshots
      .map(({ record }) => record)
      .filter(snapshot => !storeName || snapshot.storeName === storeName)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map(snapshot => ({
        id: snapshot.id,
        storeName: snapshot.storeName,
        createdAt: snapshot.createdAt,
        scope: snapshot.scope,
      }))
  }

  async clearSnapshots(storeName?: string): Promise<void> {
    await this.transaction('readwrite', async () => {
      if (!storeName) {
        await rm(this.snapshotsDir, { recursive: true, force: true })
        await mkdir(this.snapshotsDir, { recursive: true })
        return
      }

      const snapshots = await this.readRecords<QuaSnapshot>(this.snapshotsDir, 'snapshot')
      for (const snapshot of snapshots) {
        if (snapshot.record.storeName === storeName) {
          await rm(snapshot.path, { force: true })
        }
      }
    })
  }

  async saveGameSlotIndex(slot: QuaGameSaveSlotIndex): Promise<void> {
    await this.writeRecord(this.gameSlotIndexPath(slot.slotId), {
      format: 'quastore',
      version: VERSION,
      kind: 'game-slot-index',
      record: slot,
    })
  }

  async getGameSlotIndex(slotId: string): Promise<QuaGameSaveSlotIndex | undefined> {
    return await this.readOptionalRecord<QuaGameSaveSlotIndex>(this.gameSlotIndexPath(slotId), 'game-slot-index')
  }

  async deleteGameSlotIndex(slotId: string): Promise<void> {
    await rm(this.gameSlotIndexPath(slotId), { force: true })
  }

  async listGameSlotIndexes(): Promise<QuaGameSaveSlotIndex[]> {
    const slots = await this.readRecords<QuaGameSaveSlotIndex>(this.gameSlotIndexesDir, 'game-slot-index')
    return slots
      .map(({ record }) => record)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
  }

  async saveGameSlotPayload(slot: QuaGameSaveSlotPayload): Promise<void> {
    await this.writeRecord(this.gameSlotPayloadPath(slot.slotId), {
      format: 'quastore',
      version: VERSION,
      kind: 'game-slot-payload',
      record: slot,
    })
  }

  async getGameSlotPayload(slotId: string): Promise<QuaGameSaveSlotPayload | undefined> {
    return await this.readOptionalRecord<QuaGameSaveSlotPayload>(this.gameSlotPayloadPath(slotId), 'game-slot-payload')
  }

  async deleteGameSlotPayload(slotId: string): Promise<void> {
    await rm(this.gameSlotPayloadPath(slotId), { force: true })
  }

  async saveGameSlotPreview(preview: QuaGameSavePreviewRecord): Promise<void> {
    await this.writeRecord(this.gameSlotPreviewPath(preview.previewId), {
      format: 'quastore',
      version: VERSION,
      kind: 'game-slot-preview',
      record: preview,
    })
  }

  async getGameSlotPreview(previewId: string): Promise<QuaGameSavePreviewRecord | undefined> {
    return await this.readOptionalRecord<QuaGameSavePreviewRecord>(this.gameSlotPreviewPath(previewId), 'game-slot-preview')
  }

  async deleteGameSlotPreview(previewId: string): Promise<void> {
    await rm(this.gameSlotPreviewPath(previewId), { force: true })
  }

  async clearGameSlots(): Promise<void> {
    await this.transaction('readwrite', async () => {
      await rm(this.gameSlotIndexesDir, { recursive: true, force: true })
      await rm(this.gameSlotPayloadsDir, { recursive: true, force: true })
      await rm(this.gameSlotPreviewsDir, { recursive: true, force: true })
      await mkdir(this.gameSlotIndexesDir, { recursive: true })
      await mkdir(this.gameSlotPayloadsDir, { recursive: true })
      await mkdir(this.gameSlotPreviewsDir, { recursive: true })
    })
  }

  async close(): Promise<void> {}

  async transaction<T>(mode: 'readonly' | 'readwrite', action: () => Promise<T>): Promise<T> {
    if (mode === 'readonly' || this.transactionDepth > 0) {
      this.transactionDepth += 1
      try {
        return await action()
      }
      finally {
        this.transactionDepth -= 1
      }
    }

    this.transactionDepth = 1
    try {
      const backup = await this.captureTransactionSnapshot()
      try {
        return await Promise.resolve().then(action)
      }
      catch (error) {
        await this.restoreTransactionSnapshot(backup)
        throw error
      }
    }
    finally {
      this.transactionDepth = 0
    }
  }

  getRootDir(): string {
    return this.rootDir
  }

  private async writeRecord(path: string, envelope: QuastoreRecordEnvelope): Promise<void> {
    await mkdir(dirname(path), { recursive: true })
    const plaintext = serialize(envelope)
    const bytes = await this.encode(plaintext)
    const tempPath = `${path}.${randomBytes(8).toString('hex')}.tmp`
    try {
      await writeFile(tempPath, bytes)
      await rename(tempPath, path)
    }
    catch (error) {
      await rm(tempPath, { force: true }).catch(() => {})
      throw error
    }
  }

  private async readOptionalRecord<T extends QuastoreRecord>(path: string, expectedKind: QuastoreRecordKind): Promise<T | undefined> {
    let bytes: Buffer
    try {
      bytes = await readFile(path)
    }
    catch (error) {
      if (isNodeError(error) && error.code === 'ENOENT') {
        return undefined
      }
      throw error
    }

    return this.decodeEnvelope<T>(await this.decode(bytes), expectedKind).record
  }

  private async readRecords<T extends QuastoreRecord>(dir: string, expectedKind: QuastoreRecordKind): Promise<Array<LoadedRecord<T>>> {
    let entries: string[]
    try {
      entries = await readdir(dir)
    }
    catch (error) {
      if (isNodeError(error) && error.code === 'ENOENT') {
        return []
      }
      throw error
    }

    const records: Array<LoadedRecord<T>> = []
    for (const entry of entries) {
      if (!entry.endsWith(QUASTORE_FILE_EXTENSION)) {
        continue
      }
      const path = join(dir, entry)
      const envelope = this.decodeEnvelope<T>(await this.decode(await readFile(path)), expectedKind)
      records.push({ path, record: envelope.record })
    }
    return records
  }

  private async captureTransactionSnapshot(): Promise<QuastoreTransactionSnapshot> {
    return {
      snapshots: await this.captureDirectorySnapshot(this.snapshotsDir),
      gameSlotIndexes: await this.captureDirectorySnapshot(this.gameSlotIndexesDir),
      gameSlotPayloads: await this.captureDirectorySnapshot(this.gameSlotPayloadsDir),
      gameSlotPreviews: await this.captureDirectorySnapshot(this.gameSlotPreviewsDir),
    }
  }

  private async captureDirectorySnapshot(dir: string): Promise<QuastoreDirectoryRecord[]> {
    let entries: string[]
    try {
      entries = await readdir(dir)
    }
    catch (error) {
      if (isNodeError(error) && error.code === 'ENOENT') {
        return []
      }
      throw error
    }

    const records: QuastoreDirectoryRecord[] = []
    for (const fileName of entries.sort()) {
      if (!fileName.endsWith(QUASTORE_FILE_EXTENSION)) {
        continue
      }
      records.push({
        fileName,
        bytes: await readFile(join(dir, fileName)),
      })
    }
    return records
  }

  private async restoreTransactionSnapshot(snapshot: QuastoreTransactionSnapshot): Promise<void> {
    await this.restoreDirectorySnapshot(this.snapshotsDir, snapshot.snapshots)
    await this.restoreDirectorySnapshot(this.gameSlotIndexesDir, snapshot.gameSlotIndexes)
    await this.restoreDirectorySnapshot(this.gameSlotPayloadsDir, snapshot.gameSlotPayloads)
    await this.restoreDirectorySnapshot(this.gameSlotPreviewsDir, snapshot.gameSlotPreviews)
  }

  private async restoreDirectorySnapshot(dir: string, records: QuastoreDirectoryRecord[]): Promise<void> {
    await rm(dir, { recursive: true, force: true })
    await mkdir(dir, { recursive: true })
    for (const record of records) {
      await writeFile(join(dir, record.fileName), record.bytes)
    }
  }

  private async encode(plaintext: Buffer): Promise<Buffer> {
    const encryption = this.requireEncryptionState()
    if (!encryption) {
      return packQuastoreFile({
        flags: 0,
        salt: Buffer.alloc(0),
        iv: Buffer.alloc(0),
        tag: Buffer.alloc(0),
        payload: plaintext,
      })
    }

    const salt = randomBytes(SCRYPT_SALT_BYTES)
    const iv = randomBytes(GCM_IV_BYTES)
    const key = await deriveKey(encryption, salt)
    const cipher = createCipheriv(AES_256_GCM, key, iv)
    cipher.setAAD(AAD)
    const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()])
    return packQuastoreFile({
      flags: FLAG_ENCRYPTED,
      salt,
      iv,
      tag: cipher.getAuthTag(),
      payload: encrypted,
    })
  }

  private async decode(bytes: Buffer): Promise<Buffer> {
    const file = unpackQuastoreFile(bytes)
    const encryption = this.requireEncryptionState()

    if ((file.flags & ~FLAG_ENCRYPTED) !== 0) {
      throw new Error('Unsupported .quastore file flags.')
    }

    if ((file.flags & FLAG_ENCRYPTED) === 0) {
      if (encryption) {
        throw new Error('Refusing to read plaintext .quastore file while encryption is enabled.')
      }
      return file.payload
    }

    if (file.salt.byteLength !== SCRYPT_SALT_BYTES || file.iv.byteLength !== GCM_IV_BYTES || file.tag.byteLength !== GCM_TAG_BYTES) {
      throw new Error('Invalid encrypted .quastore file header.')
    }

    if (!encryption) {
      throw new Error('Cannot read encrypted .quastore file because encryption is disabled for this backend.')
    }

    const key = await deriveKey(encryption, file.salt)
    const decipher = createDecipheriv(AES_256_GCM, key, file.iv)
    decipher.setAAD(AAD)
    decipher.setAuthTag(file.tag)
    return Buffer.concat([decipher.update(file.payload), decipher.final()])
  }

  private decodeEnvelope<T extends QuastoreRecord>(plaintext: Buffer, expectedKind: QuastoreRecordKind): QuastoreRecordEnvelope<T> {
    const envelope = deserialize(plaintext) as QuastoreRecordEnvelope
    if (envelope.format !== 'quastore' || envelope.version !== VERSION || envelope.kind !== expectedKind) {
      throw new Error(`Invalid .quastore ${expectedKind} record.`)
    }
    return envelope as QuastoreRecordEnvelope<T>
  }

  private snapshotPath(id: string): string {
    return join(this.snapshotsDir, `${hashStorageId(id)}${QUASTORE_FILE_EXTENSION}`)
  }

  private gameSlotIndexPath(slotId: string): string {
    return join(this.gameSlotIndexesDir, `${hashStorageId(slotId)}${QUASTORE_FILE_EXTENSION}`)
  }

  private gameSlotPayloadPath(slotId: string): string {
    return join(this.gameSlotPayloadsDir, `${hashStorageId(slotId)}${QUASTORE_FILE_EXTENSION}`)
  }

  private gameSlotPreviewPath(previewId: string): string {
    return join(this.gameSlotPreviewsDir, `${hashStorageId(previewId)}${QUASTORE_FILE_EXTENSION}`)
  }

  private resolveEncryptionConfig(): ResolvedEncryptionConfig | false {
    if (this.encryptionOptions === false) {
      return false
    }

    const options = this.encryptionOptions || {}
    const key = options.key ?? process.env[options.keyEnv || QUASTORE_KEY_ENV]
    if (key === undefined) {
      throw new Error(`QuastoreFileBackend encryption is enabled by default. Provide encryption.key, set ${options.keyEnv || QUASTORE_KEY_ENV}, or pass encryption: false for development-only plaintext storage.`)
    }

    const keyMaterial = typeof key === 'string' ? Buffer.from(key, 'utf8') : Buffer.from(key)
    if (keyMaterial.byteLength === 0) {
      throw new Error('QuastoreFileBackend encryption key must not be empty.')
    }

    return {
      keyMaterial,
      kdf: {
        cost: options.kdf?.cost || 16384,
        blockSize: options.kdf?.blockSize || 8,
        parallelization: options.kdf?.parallelization || 1,
        maxmem: options.kdf?.maxmem || 64 * 1024 * 1024,
      },
    }
  }

  private requireEncryptionState(): ResolvedEncryptionConfig | false {
    if (this.encryptionConfig === undefined) {
      this.encryptionConfig = this.resolveEncryptionConfig()
    }
    return this.encryptionConfig
  }
}

export function createNodeStoreStorage(options: NodeStoreStorageOptions = {}): StorageConfig {
  const { middlewares, ...backendOptions } = options
  return {
    backend: {
      driver: QuastoreFileBackend,
      options: backendOptions,
    },
    middlewares,
  }
}

export const createQuastoreFileStorage = createNodeStoreStorage

async function deriveKey(config: ResolvedEncryptionConfig, salt: Buffer): Promise<Buffer> {
  return await new Promise((resolve, reject) => {
    scrypt(config.keyMaterial, salt, 32, {
      N: config.kdf.cost,
      r: config.kdf.blockSize,
      p: config.kdf.parallelization,
      maxmem: config.kdf.maxmem,
    }, (error, derivedKey) => {
      if (error) {
        reject(error)
        return
      }
      resolve(Buffer.from(derivedKey))
    })
  })
}

function packQuastoreFile(input: { flags: number, salt: Buffer, iv: Buffer, tag: Buffer, payload: Buffer }): Buffer {
  const header = Buffer.alloc(HEADER_SIZE)
  let offset = 0
  MAGIC.copy(header, offset)
  offset += MAGIC.byteLength
  header.writeUInt8(VERSION, offset++)
  header.writeUInt8(input.flags, offset++)
  header.writeUInt32BE(input.salt.byteLength, offset)
  offset += 4
  header.writeUInt32BE(input.iv.byteLength, offset)
  offset += 4
  header.writeUInt32BE(input.tag.byteLength, offset)
  offset += 4
  header.writeUInt32BE(input.payload.byteLength, offset)
  return Buffer.concat([header, input.salt, input.iv, input.tag, input.payload])
}

function unpackQuastoreFile(bytes: Buffer): { flags: number, salt: Buffer, iv: Buffer, tag: Buffer, payload: Buffer } {
  if (bytes.byteLength < HEADER_SIZE || !bytes.subarray(0, MAGIC.byteLength).equals(MAGIC)) {
    throw new Error('Invalid .quastore file header.')
  }

  let offset = MAGIC.byteLength
  const version = bytes.readUInt8(offset++)
  if (version !== VERSION) {
    throw new Error(`Unsupported .quastore file version: ${version}`)
  }

  const flags = bytes.readUInt8(offset++)
  const saltLength = bytes.readUInt32BE(offset)
  offset += 4
  const ivLength = bytes.readUInt32BE(offset)
  offset += 4
  const tagLength = bytes.readUInt32BE(offset)
  offset += 4
  const payloadLength = bytes.readUInt32BE(offset)
  offset += 4

  const payloadEnd = offset + saltLength + ivLength + tagLength + payloadLength
  if (payloadEnd !== bytes.byteLength) {
    throw new Error('Invalid .quastore file length.')
  }

  const salt = bytes.subarray(offset, offset + saltLength)
  offset += saltLength
  const iv = bytes.subarray(offset, offset + ivLength)
  offset += ivLength
  const tag = bytes.subarray(offset, offset + tagLength)
  offset += tagLength
  const payload = bytes.subarray(offset, offset + payloadLength)
  return { flags, salt, iv, tag, payload }
}

function hashStorageId(id: string): string {
  return createHash('sha256').update(id).digest('hex')
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error
}
