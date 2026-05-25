import type {
  QuaGameSavePreviewDescriptor,
  QuaGameSavePreviewPayload,
  QuaGameSavePreviewReadFormat,
  QuaGameSavePreviewRecord,
  QuaGameSavePreviewWriteInput,
  QuaGameSaveSlotIndex,
  QuaGameSaveSlotPayload,
} from './types/base'
import { generateId } from './utils'

type RuntimeBuffer = {
  from: (input: string | Uint8Array, encoding?: string) => {
    readonly buffer: ArrayBufferLike
    readonly byteLength: number
    readonly length: number
    [index: number]: number
    toString: (encoding?: string) => string
  }
}

type RuntimeTextEncoder = new () => {
  encode: (input: string) => Uint8Array
}

const runtime = globalThis as typeof globalThis & {
  atob?: (input: string) => string
  btoa?: (input: string) => string
  Buffer?: RuntimeBuffer
  TextEncoder?: RuntimeTextEncoder
}

export function cloneSaveSlotIndex(index: QuaGameSaveSlotIndex): QuaGameSaveSlotIndex {
  return {
    ...index,
    timestamp: new Date(index.timestamp),
    preview: index.preview ? clonePreviewDescriptor(index.preview) : undefined,
    metadata: { ...(index.metadata || {}) },
  }
}

export function cloneSaveSlotPayload(slot: QuaGameSaveSlotPayload): QuaGameSaveSlotPayload {
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

export function clonePreviewDescriptor(descriptor: QuaGameSavePreviewDescriptor): QuaGameSavePreviewDescriptor {
  return {
    ...descriptor,
    policySummary: descriptor.policySummary ? { ...descriptor.policySummary } : undefined,
  }
}

export function clonePreviewRecord(record: QuaGameSavePreviewRecord): QuaGameSavePreviewRecord {
  return {
    ...record,
    bytes: new Uint8Array(record.bytes),
    policySummary: record.policySummary ? { ...record.policySummary } : undefined,
  }
}

export function getPreviewDescriptorFromRecord(record: QuaGameSavePreviewRecord): QuaGameSavePreviewDescriptor {
  return {
    previewId: record.previewId,
    mimeType: record.mimeType,
    byteLength: record.byteLength,
    width: record.width,
    height: record.height,
    capturedAt: record.capturedAt,
    hash: record.hash,
    policySummary: record.policySummary ? { ...record.policySummary } : undefined,
  }
}

export function materializePreviewPayload(
  record: QuaGameSavePreviewRecord,
  format: QuaGameSavePreviewReadFormat = 'bytes',
): QuaGameSavePreviewPayload {
  if (format === 'data-url') {
    return {
      kind: 'data-url',
      dataUrl: bytesToDataUrl(record.bytes, record.mimeType),
      mimeType: record.mimeType,
      width: record.width,
      height: record.height,
      capturedAt: record.capturedAt,
    }
  }

  return {
    kind: 'bytes',
    mimeType: record.mimeType,
    bytes: new Uint8Array(record.bytes),
    width: record.width,
    height: record.height,
    capturedAt: record.capturedAt,
  }
}

export function normalizePreviewInput(
  slotId: string,
  input: QuaGameSavePreviewWriteInput,
): QuaGameSavePreviewRecord {
  const mimeType = resolvePreviewMimeType(input)
  const bytes = input.kind === 'bytes'
    ? new Uint8Array(input.bytes)
    : dataUrlToBytes(input.dataUrl)
  const capturedAt = input.capturedAt ?? Date.now()

  return {
    previewId: input.previewId || `preview:${slotId}:${generateId()}`,
    slotId,
    mimeType,
    bytes,
    byteLength: bytes.byteLength,
    width: input.width,
    height: input.height,
    capturedAt,
    hash: input.hash || hashBytes(bytes),
    policySummary: input.policySummary ? { ...input.policySummary } : undefined,
  }
}

export function resolvePreviewMimeType(input: QuaGameSavePreviewWriteInput): string {
  if (input.kind === 'bytes') {
    return input.mimeType
  }

  if (input.mimeType) {
    return input.mimeType
  }

  const match = /^data:([^;,]+)[;,]/.exec(input.dataUrl)
  if (match?.[1]) {
    return match[1]
  }

  return 'application/octet-stream'
}

export function dataUrlToBytes(dataUrl: string): Uint8Array {
  const match = /^data:([^;,]+)?(?:;charset=[^;,]+)?(;base64)?,(.*)$/i.exec(dataUrl)
  if (!match) {
    throw new Error('Invalid data URL preview payload.')
  }

  const body = match[3] || ''
  if (match[2]) {
    return base64ToBytes(body)
  }

  return utf8ToBytes(decodeURIComponent(body))
}

export function bytesToDataUrl(bytes: Uint8Array, mimeType: string): string {
  return `data:${mimeType};base64,${bytesToBase64(bytes)}`
}

function base64ToBytes(base64: string): Uint8Array {
  if (typeof runtime.atob === 'function') {
    const binary = runtime.atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index)
    }
    return bytes
  }

  if (runtime.Buffer) {
    return new Uint8Array(runtime.Buffer.from(base64, 'base64'))
  }

  throw new Error('No base64 decoder is available for preview payloads.')
}

function bytesToBase64(bytes: Uint8Array): string {
  if (typeof runtime.btoa === 'function') {
    let binary = ''
    for (const value of bytes) {
      binary += String.fromCharCode(value)
    }
    return runtime.btoa(binary)
  }

  if (runtime.Buffer) {
    return runtime.Buffer.from(bytes).toString('base64')
  }

  throw new Error('No base64 encoder is available for preview payloads.')
}

function utf8ToBytes(input: string): Uint8Array {
  if (runtime.TextEncoder) {
    return new runtime.TextEncoder().encode(input)
  }

  if (runtime.Buffer) {
    return new Uint8Array(runtime.Buffer.from(input, 'utf8'))
  }

  const bytes = new Uint8Array(input.length)
  for (let index = 0; index < input.length; index += 1) {
    bytes[index] = input.charCodeAt(index)
  }
  return bytes
}

function hashBytes(bytes: Uint8Array): string {
  let hash = 0xcbf29ce484222325n
  for (const value of bytes) {
    hash ^= BigInt(value)
    hash = (hash * 0x100000001b3n) & 0xFFFFFFFFFFFFFFFFn
  }
  return hash.toString(16).padStart(16, '0')
}
