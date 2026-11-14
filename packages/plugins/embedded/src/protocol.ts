export const EMBEDDED_PROTOCOL = 'qua-embedded' as const
export const EMBEDDED_VERSION = 1 as const
export type JsonValue = null | boolean | number | string | JsonValue[] | {
  [key: string]: JsonValue
}
export interface EmbeddedOpen {
  protocol: typeof EMBEDDED_PROTOCOL
  version: 1
  type: 'open'
  sessionId: string
  storageNamespace: string
  parameters: {
    [key: string]: JsonValue
  }
}
export interface EmbeddedCancel {
  protocol: typeof EMBEDDED_PROTOCOL
  version: 1
  type: 'cancel'
  sessionId: string
}
export type EmbeddedOutcome = {
  status: 'completed'
  value: JsonValue
} | {
  status: 'cancelled'
  reason: string
} | {
  status: 'error'
  code: string
  message: string
}
export interface EmbeddedMessage {
  protocol: typeof EMBEDDED_PROTOCOL
  version: 1
  sessionId: string
  type: 'ready' | 'result' | 'closed' | 'error'
  outcome?: EmbeddedOutcome
  error?: {
    code: string
    message: string
  }
}
/** Bound both native and postMessage input; never coerce, execute or accept binary objects. */
export function cloneEmbeddedJson<T extends JsonValue>(input: T): T {
  const active = new Set<object>()
  let size = 0
  const visit = (value: unknown, depth: number): JsonValue => {
    size += 4
    if (depth > 24 || size > 65536)
      throw new Error('Embedded payload exceeds limits')
    if (value === null || typeof value === 'boolean')
      return value
    if (typeof value === 'number' && Number.isFinite(value))
      return value
    if (typeof value === 'string') {
      size += value.length * 3
      if (size > 65536)
        throw new Error('Embedded payload exceeds limits')
      return value
    }
    if (!value || typeof value !== 'object' || active.has(value))
      throw new Error('Embedded payload must be acyclic JSON')
    if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)
      throw new Error('Embedded payload must contain plain JSON objects')
    active.add(value)
    let result: JsonValue
    if (Array.isArray(value)) {
      if (value.length > 16384 || Object.keys(value).length !== value.length)
        throw new Error('Embedded arrays must be dense JSON')
      const array: JsonValue[] = []
      for (let index = 0; index < value.length; index++) {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index))
        if (!descriptor || !('value' in descriptor))
          throw new Error('Embedded arrays cannot contain accessors')
        array.push(visit(descriptor.value, depth + 1))
      }
      result = array
    }
    else {
      const object: Record<string, JsonValue> = {}
      for (const key of Object.keys(value)) {
        if (['__proto__', 'prototype', 'constructor'].includes(key))
          throw new Error('Reserved embedded JSON key')
        size += key.length * 3
        const descriptor = Object.getOwnPropertyDescriptor(value, key)!
        if (!('value' in descriptor))
          throw new Error('Embedded payload cannot contain accessors')
        object[key] = visit(descriptor.value, depth + 1)
      }
      result = object
    }
    active.delete(value)
    return result
  }
  return visit(input, 0) as T
}
function envelope(value: unknown): Record<string, any> {
  const data = cloneEmbeddedJson(value as JsonValue) as Record<string, any>
  if (!data || Array.isArray(data) || data.protocol !== EMBEDDED_PROTOCOL || data.version !== 1 || typeof data.sessionId !== 'string' || !/^[\w.-]{1,128}$/.test(data.sessionId))
    throw new Error('Invalid embedded protocol envelope')
  return data
}
export function parseEmbeddedOpen(value: unknown): EmbeddedOpen {
  const data = envelope(value)
  if (data.type !== 'open' || typeof data.storageNamespace !== 'string' || !/^[\w./-]{1,192}$/.test(data.storageNamespace) || data.storageNamespace.split('/').some((part: string) => !part || part === '.' || part === '..') || !data.parameters || Array.isArray(data.parameters) || typeof data.parameters !== 'object')
    throw new Error('Invalid embedded open request')
  if (Object.keys(data).some(key => !['protocol', 'version', 'type', 'sessionId', 'storageNamespace', 'parameters'].includes(key)))
    throw new Error('Unknown embedded open field')
  return data as EmbeddedOpen
}
export function createEmbeddedOpen(input: Pick<EmbeddedOpen, 'sessionId' | 'storageNamespace' | 'parameters'>): EmbeddedOpen {
  return parseEmbeddedOpen({ protocol: EMBEDDED_PROTOCOL, version: 1, type: 'open', sessionId: input.sessionId, storageNamespace: input.storageNamespace, parameters: input.parameters })
}
export function parseEmbeddedCancel(value: unknown): EmbeddedCancel {
  const data = envelope(value)
  if (data.type !== 'cancel' || Object.keys(data).some(key => !['protocol', 'version', 'type', 'sessionId'].includes(key)))
    throw new Error('Invalid embedded cancel')
  return data as EmbeddedCancel
}
export function parseEmbeddedMessage(value: unknown): EmbeddedMessage {
  const data = envelope(value)
  if (!['ready', 'result', 'closed', 'error'].includes(data.type))
    throw new Error('Invalid embedded response')
  if (data.type === 'result') {
    const outcome = data.outcome
    if (!outcome || !['completed', 'cancelled', 'error'].includes(outcome.status)
      || (outcome.status === 'completed' && !Object.hasOwn(outcome, 'value'))
      || (outcome.status === 'cancelled' && typeof outcome.reason !== 'string')
      || (outcome.status === 'error' && (typeof outcome.code !== 'string' || typeof outcome.message !== 'string'))) {
      throw new Error('Invalid embedded result')
    }
  }
  if (data.type === 'error' && (!data.error || typeof data.error.code !== 'string' || typeof data.error.message !== 'string'))
    throw new Error('Invalid embedded error')
  return data as EmbeddedMessage
}
export function embeddedMessage(sessionId: string, type: EmbeddedMessage['type'], fields: Partial<EmbeddedMessage> = {}): EmbeddedMessage {
  return parseEmbeddedMessage({ protocol: EMBEDDED_PROTOCOL, version: 1, sessionId, type, ...fields })
}
