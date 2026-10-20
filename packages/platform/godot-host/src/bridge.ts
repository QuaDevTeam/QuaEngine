export interface GodotNativeBridge {
  call: (method: string, payload: string) => string
  read: (path: string) => Uint8Array
  write: (path: string, bytes: Uint8Array) => boolean
  resource: (metadata: string, bytes: Uint8Array) => string
}

// Global ambient declarations intentionally describe host-provided VM bindings.
/* eslint-disable vars-on-top */
declare global {
  var __quaCall: GodotNativeBridge['call']
  var __quaRead: GodotNativeBridge['read']
  var __quaWrite: GodotNativeBridge['write']
  var __quaResource: GodotNativeBridge['resource']
  var __quaEncodeUtf8: (text: string) => Uint8Array
  var __quaDecodeUtf8: (bytes: Uint8Array) => string
  var __quaTick: (now: number, events: string) => void
}

export function nativeBridge(): GodotNativeBridge {
  return { call: globalThis.__quaCall, read: globalThis.__quaRead, write: globalThis.__quaWrite, resource: globalThis.__quaResource }
}

export function callGodot<T = void>(bridge: GodotNativeBridge, method: string, payload: unknown = {}): T {
  const result = JSON.parse(bridge.call(method, JSON.stringify(payload)))
  if (result?.error)
    throw new Error(`Godot ${method}: ${result.error}`)
  return result?.value as T
}

export function resourcePath(path: string): string {
  const normalized = path.startsWith('res://') ? path.slice(6) : path
  if (!normalized || normalized.includes('\\') || normalized.includes(':') || normalized.split('/').some(part => !part || part === '.' || part === '..'))
    throw new Error(`Invalid Godot resource path: ${path}`)
  return `res://${normalized}`
}

export function storagePath(path: string): string {
  return resourcePath(path).replace('res://', 'user://qua/')
}
