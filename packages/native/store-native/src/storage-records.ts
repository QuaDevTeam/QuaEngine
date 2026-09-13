import type {
  QuaGameSavePreviewRecord,
  QuaGameSaveSlotIndex,
  QuaGameSaveSlotPayload,
  QuaSnapshot,
} from '@quajs/store'

declare const TextEncoder: {
  new(): { encode: (input: string) => Uint8Array }
}

declare const TextDecoder: {
  new(): { decode: (input: Uint8Array) => string }
}

export type NativeStoreRecord
  = | QuaSnapshot
    | QuaGameSaveSlotIndex
    | QuaGameSaveSlotPayload
    | QuaGameSavePreviewRecord

export type NativeStoreRecordKind = 'snapshot' | 'game-slot-index' | 'game-slot-payload' | 'game-slot-preview'

interface NativeStoreEnvelope<TRecord extends NativeStoreRecord = NativeStoreRecord> {
  format: 'qua-native-store'
  version: 1
  kind: NativeStoreRecordKind
  record: TRecord
}

export function encodeNativeStoreRecord<TRecord extends NativeStoreRecord>(
  kind: NativeStoreRecordKind,
  record: TRecord,
): Uint8Array {
  const envelope: NativeStoreEnvelope<TRecord> = {
    format: 'qua-native-store',
    version: 1,
    kind,
    record,
  }
  return encodeJson(envelope)
}

export function decodeNativeStoreRecord<TRecord extends NativeStoreRecord>(
  bytes: Uint8Array,
  kind: NativeStoreRecordKind,
): TRecord | undefined {
  const envelope = decodeJson<NativeStoreEnvelope<TRecord>>(bytes)
  if (envelope.format !== 'qua-native-store' || envelope.kind !== kind)
    return undefined
  return reviveRecord(envelope.record)
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
