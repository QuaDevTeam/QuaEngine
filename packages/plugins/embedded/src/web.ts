import type { EmbeddedMessage, EmbeddedOpen, EmbeddedOutcome } from './protocol'
import { createEmbeddedOpen, embeddedMessage, parseEmbeddedCancel, parseEmbeddedMessage, parseEmbeddedOpen } from './protocol'
/** Child-side boundary. Business traffic is restricted to open and cancel. */
export function installEmbeddedWebModule(options: {
  allowedParentOrigins: readonly string[]
  mount: (request: EmbeddedOpen, emit: (message: EmbeddedMessage) => void, signal: AbortSignal) => Promise<{
    cancel: (request: unknown) => Promise<void>
    destroy: () => Promise<void>
  }>
}) {
  const allowed = new Set(options.allowedParentOrigins.map(exactOrigin))
  interface Owner {
    origin: string
    open: EmbeddedOpen
    mount: ReturnType<typeof options.mount>
    abort: AbortController
    closing?: Promise<void>
    result?: boolean
    closed?: boolean
  }
  let owner: Owner | undefined
  const usedSessions = new Set<string>()
  const send = (origin: string, message: EmbeddedMessage) => window.parent.postMessage(message, origin)
  const close = (current: Owner) => current.closing ||= (async () => {
    try {
      await (await current.mount).destroy()
    }
    catch (error) {
      send(current.origin, embeddedMessage(current.open.sessionId, 'error', { error: { code: 'CLEANUP_FAILED', message: String(error).slice(0, 4096) } }))
    }
    finally {
      if (owner === current)
        owner = undefined
    }
  })()
  const listener = (event: MessageEvent) => {
    if (window.parent === window || event.source !== window.parent || !allowed.has(event.origin))
      return
    let data: EmbeddedOpen | ReturnType<typeof parseEmbeddedCancel>
    try {
      data = event.data?.type === 'open' ? parseEmbeddedOpen(event.data) : parseEmbeddedCancel(event.data)
    }
    catch {
      return
    }
    if (data.type === 'cancel') {
      const current = owner
      if (!current || data.sessionId !== current.open.sessionId)
        return
      current.abort.abort()
      void current.mount.then(session => session.cancel(data)).then(() => close(current)).catch(() => close(current))
      return
    }
    if (owner || usedSessions.has(data.sessionId) || usedSessions.size >= 256)
      return // Duplicates/replays never create another session.
    const open = data
    usedSessions.add(open.sessionId)
    const current: Owner = { origin: event.origin, open, mount: undefined!, abort: new AbortController() }
    owner = current
    current.mount = Promise.resolve().then(() => options.mount(open, (message) => {
      send(current.origin, message)
      if (message.type === 'result')
        current.result = true
      if (message.type === 'closed') {
        current.closed = true
        if (owner === current)
          owner = undefined
      }
    }, current.abort.signal))
    void current.mount.catch((error) => {
      if (!current.result)
        send(current.origin, embeddedMessage(open.sessionId, 'result', { outcome: { status: 'error', code: 'STARTUP_FAILED', message: String(error).slice(0, 4096) } }))
      if (!current.closed)
        send(current.origin, embeddedMessage(open.sessionId, 'closed'))
      if (owner === current)
        owner = undefined
    })
  }
  window.addEventListener('message', listener)
  return async () => {
    window.removeEventListener('message', listener)
    if (owner)
      await close(owner)
  }
}
/**
 Parent-side SDK. A fresh iframe creates a fresh realm;
dispose waits for closed.
 */
export function mountEmbeddedFrame(options: {
  container: HTMLElement
  url: string
  sessionId: string
  storageNamespace: string
  parameters: EmbeddedOpen['parameters']
  timeoutMs?: number
  onMessage?: (message: EmbeddedMessage) => void
}) {
  const request = createEmbeddedOpen(options)
  const url = new URL(options.url, window.location.href)
  const origin = exactOrigin(url.origin)
  if (url.username || url.password)
    throw new Error('Embedded URLs cannot contain credentials')
  if (options.timeoutMs !== undefined && (!Number.isFinite(options.timeoutMs) || options.timeoutMs < 50 || options.timeoutMs > 300000))
    throw new Error('Embedded timeout must be between 50 and 300000 ms')
  const frame = document.createElement('iframe')
  frame.title = 'Story module'
  frame.allow = 'autoplay; fullscreen'
  frame.style.cssText = 'width:100%;height:100%;border:0;display:block'
  frame.src = url.href
  let terminal = false
  let becameReady = false
  let disposed = false
  let loaded = false
  let cancellationRequested = false
  let readyResolve!: () => void
  let readyReject!: (error: Error) => void
  let resultResolve!: (outcome: EmbeddedOutcome) => void
  let resultReject!: (error: Error) => void
  let closedResolve!: () => void
  const ready = new Promise<void>((resolve, reject) => {
    readyResolve = resolve
    readyReject = reject
  })
  const result = new Promise<EmbeddedOutcome>((resolve, reject) => {
    resultResolve = resolve
    resultReject = reject
  })
  const closed = new Promise<void>((resolve) => {
    closedResolve = resolve
  })
  // Consumers may await ready before subscribing to result;
  // Avoid unhandled rejections.
  void ready.catch(() => { })
  void result.catch(() => { })
  const fail = (error: Error) => {
    readyReject(error)
    resultReject(error)
  }
  let timer: ReturnType<typeof setTimeout>
  let listener: (event: MessageEvent) => void
  const cleanup = () => {
    if (disposed)
      return
    disposed = true
    clearTimeout(timer)
    window.removeEventListener('message', listener)
    frame.remove()
    closedResolve()
  }
  listener = (event: MessageEvent) => {
    if (event.origin !== origin || event.source !== frame.contentWindow || disposed)
      return
    let message: EmbeddedMessage
    try {
      message = parseEmbeddedMessage(event.data)
    }
    catch {
      return
    }
    if (message.sessionId !== request.sessionId)
      return
    try {
      options.onMessage?.(message)
    }
    catch (error) { console.error('Embedded host callback failed', error) }
    if (message.type === 'ready') {
      becameReady = true
      clearTimeout(timer)
      readyResolve()
    }
    if (message.type === 'result' && !terminal) {
      terminal = true
      if (!becameReady)
        readyReject(new Error('Embedded story ended before becoming ready'))
      clearTimeout(timer)
      resultResolve(message.outcome!)
    }
    if (message.type === 'error')
      fail(new Error(`${message.error!.code}: ${message.error!.message}`))
    if (message.type === 'closed') {
      if (!terminal)
        fail(new Error('Module closed without a result'))
      cleanup()
    }
  }
  timer = setTimeout(() => {
    fail(new Error('Embedded module startup timed out'))
    cleanup()
  }, options.timeoutMs ?? 30000)
  window.addEventListener('message', listener)
  const cancel = () => {
    cancellationRequested = true
    if (loaded)
      frame.contentWindow?.postMessage({ protocol: request.protocol, version: 1, type: 'cancel', sessionId: request.sessionId }, origin)
  }
  frame.addEventListener('load', () => {
    loaded = true
    frame.contentWindow?.postMessage(request, origin)
    if (cancellationRequested)
      cancel()
  }, { once: true })
  options.container.append(frame)
  return { frame, ready, result, closed, cancel, async destroy() {
    if (disposed)
      return
    cancel()
    let timeout: ReturnType<typeof setTimeout> | undefined
    try {
      await Promise.race([closed, new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => reject(new Error('Embedded module close timed out')), options.timeoutMs ?? 30000)
      })])
    }
    catch (error) {
      fail(error instanceof Error ? error : new Error(String(error)))
      throw error
    }
    finally {
      clearTimeout(timeout)
      cleanup()
    }
  } }
}
function exactOrigin(value: string): string {
  const url = new URL(value)
  if (value.includes('*') || !['http:', 'https:'].includes(url.protocol) || url.origin !== value || url.username || url.password)
    throw new Error('Embedded Web origins must be exact HTTP(S) origins')
  return url.origin
}
