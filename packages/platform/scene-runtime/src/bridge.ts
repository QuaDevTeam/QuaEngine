export interface SceneScriptBridge {
  call: (method: string, payload: string) => string
  read: (path: string) => Uint8Array
  write: (path: string, bytes: Uint8Array) => boolean
  resource: (metadata: string, bytes: Uint8Array) => string
}

// Global ambient declarations intentionally describe host-provided VM bindings.
/* eslint-disable vars-on-top */
declare global {
  var __quaCall: SceneScriptBridge['call']
  var __quaRead: SceneScriptBridge['read']
  var __quaWrite: SceneScriptBridge['write']
  var __quaResource: SceneScriptBridge['resource']
  var __quaEncodeUtf8: (text: string) => Uint8Array
  var __quaDecodeUtf8: (bytes: Uint8Array) => string
  var __quaTick: (now: number, events: string) => void
}

export function nativeBridge(): SceneScriptBridge {
  return { call: globalThis.__quaCall, read: globalThis.__quaRead, write: globalThis.__quaWrite, resource: globalThis.__quaResource }
}

export function callSceneHost<T = void>(bridge: SceneScriptBridge, method: string, payload: unknown = {}): T {
  const result = JSON.parse(bridge.call(method, JSON.stringify(payload)))
  if (result?.error)
    throw new Error(`Scene ${method}: ${result.error}`)
  return result?.value as T
}

export function resolveSceneResourcePath(path: string, prefix: string, name = 'Scene'): string {
  const normalized = path.startsWith(prefix) ? path.slice(prefix.length) : path
  if (!normalized || normalized.includes('\\') || normalized.includes(':') || normalized.includes('\0') || normalized.split('/').some(part => !part || part === '.' || part === '..'))
    throw new Error(`Invalid ${name} resource path: ${path}`)
  return `${prefix}${normalized}`
}
