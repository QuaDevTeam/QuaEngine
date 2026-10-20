/**
 * QuickJS has no browser cancellation constructors. This supplies only cancellation
 * events required by engine steps, without fetch, DOM or a second event bus.
 */
export function installGodotCancellation(): void {
  if (typeof globalThis.AbortController === 'function')
    return
  class Signal {
    aborted = false
    reason: unknown
    onabort?: (event: unknown) => void
    private listeners = new Map<EventListenerOrEventListenerObject, boolean>()
    addEventListener(type: string, listener: EventListenerOrEventListenerObject | null, options?: boolean | { once?: boolean }) {
      if (type === 'abort' && listener)
        this.listeners.set(listener, typeof options === 'object' && options.once === true)
    }

    removeEventListener(type: string, listener: EventListenerOrEventListenerObject | null) {
      if (type === 'abort' && listener)
        this.listeners.delete(listener)
    }

    throwIfAborted() {
      if (this.aborted)
        throw this.reason
    }

    abort(reason?: unknown) {
      if (this.aborted)
        return
      this.aborted = true
      this.reason = reason ?? Object.assign(new Error('Operation aborted'), { name: 'AbortError' })
      const event = { type: 'abort', target: this, currentTarget: this } as unknown as Event
      for (const [listener, once] of [...this.listeners]) {
        if (!this.listeners.has(listener))
          continue
        if (once)
          this.listeners.delete(listener)
        if (typeof listener === 'function')
          listener.call(this, event)
        else listener.handleEvent(event)
      }
      this.onabort?.(event)
    }
  }
  class Controller {
    readonly signal = new Signal()
    abort(reason?: unknown) { this.signal.abort(reason) }
  }
  Object.defineProperty(globalThis, 'AbortController', { value: Controller, writable: true, configurable: true })
  if (typeof globalThis.AbortSignal !== 'function')
    Object.defineProperty(globalThis, 'AbortSignal', { value: Signal, writable: true, configurable: true })
}
