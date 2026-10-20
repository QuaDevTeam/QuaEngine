import { callGodot, nativeBridge } from './bridge'
import { installGodotCancellation } from './cancellation'

type Callback = (...args: unknown[]) => void
const timers = new Map<number, { callback: Callback, at: number, interval?: number }>()
let sequence = 0
let now = 0
const tickListeners = new Set<(time: number, events: unknown[]) => void>()

export function onGodotTick(listener: (time: number, events: unknown[]) => void): () => void {
  tickListeners.add(listener)
  return () => tickListeners.delete(listener)
}

/** Only bytes, cancellation, logging and scheduling primitives; no DOM or network emulation. */
export function installGodotGlobals(): void {
  const bridge = nativeBridge()
  now = callGodot<number>(bridge, 'clock')
  const set = (name: string, value: unknown) => Object.defineProperty(globalThis, name, { value, writable: true, configurable: true })
  const timer = (callback: Callback, delay = 0, interval?: number) => {
    const id = ++sequence
    timers.set(id, { callback, at: now + Math.max(0, delay), interval })
    return id
  }
  set('setTimeout', (callback: Callback, delay = 0, ...args: unknown[]) => timer(() => callback(...args), delay))
  set('clearTimeout', (id: number) => timers.delete(id))
  set('setInterval', (callback: Callback, delay = 0, ...args: unknown[]) => timer(() => callback(...args), delay, Math.max(1, delay)))
  set('clearInterval', (id: number) => timers.delete(id))
  set('queueMicrotask', (callback: () => void) => void Promise.resolve().then(callback))
  set('performance', { now: () => now })
  set('TextEncoder', class {
    encode(text = '') { return globalThis.__quaEncodeUtf8(text) }
    encodeInto(text: string, destination: Uint8Array) {
      // Respect codepoint boundaries, matching the Encoding API contract.
      let read = 0
      let written = 0
      for (const character of text) {
        const bytes = globalThis.__quaEncodeUtf8(character)
        if (written + bytes.length > destination.length)
          break
        destination.set(bytes, written)
        read += character.length
        written += bytes.length
      }
      return { read, written }
    }
  })
  set('TextDecoder', class {
    decode(bytes?: ArrayBuffer | ArrayBufferView) {
      if (!bytes)
        return ''
      return globalThis.__quaDecodeUtf8(bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength))
    }
  })
  set('console', Object.fromEntries(['log', 'info', 'debug', 'warn', 'error'].map(level => [level, (...args: unknown[]) => callGodot(bridge, 'log', { level, text: args.map(value => typeof value === 'string' ? value : JSON.stringify(value)).join(' ') })])))
  installGodotCancellation()
  globalThis.__quaTick = (timestamp, input) => {
    now = timestamp
    for (const [id, pending] of [...timers]) {
      if (pending.at > now || !timers.has(id))
        continue
      if (pending.interval)
        pending.at = now + pending.interval
      else timers.delete(id)
      pending.callback()
    }
    const events = JSON.parse(input) as unknown[]
    for (const listener of tickListeners)
      listener(now, events)
  }
}
