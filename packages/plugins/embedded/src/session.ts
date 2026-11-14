import type { QuaEngine } from '@quajs/engine'
import type { EmbeddedMessage, EmbeddedOpen, EmbeddedOutcome, JsonValue } from './protocol'
import { EmbeddedSessionPlugin } from './index'
import { embeddedMessage, parseEmbeddedCancel, parseEmbeddedOpen } from './protocol'

export interface EmbeddedStoryContext {
  readonly sessionId: string
  readonly parameters: EmbeddedOpen['parameters']
  complete: (value: JsonValue) => Promise<EmbeddedOutcome>
  cancel: (reason?: string) => Promise<EmbeddedOutcome>
  fail: (error: unknown) => Promise<EmbeddedOutcome>
}
export function createEmbeddedSession(request: unknown, emit: (message: EmbeddedMessage) => void) {
  const open = parseEmbeddedOpen(request)
  let plugin: EmbeddedSessionPlugin | undefined
  let ready = false
  let closed = false
  let cancelPending = false
  let deliveredResult = false
  const result = (outcome: EmbeddedOutcome) => {
    if (!deliveredResult) {
      deliveredResult = true
      emit(embeddedMessage(open.sessionId, 'result', { outcome }))
    }
  }
  const requirePlugin = () => {
    if (!plugin)
      throw new Error('Embedded story is not initialized')
    return plugin
  }
  const context: EmbeddedStoryContext = {
    sessionId: open.sessionId,
    get parameters() { return parseEmbeddedOpen(open).parameters },
    complete: value => requirePlugin().complete(value),
    cancel: reason => requirePlugin().cancel(reason),
    fail: error => requirePlugin().fail(error),
  }
  return {
    request: open,
    context,
    async attach(engine: QuaEngine, hooks: {
      beforeResult?: (outcome: EmbeddedOutcome) => Promise<void>
      onResult?: (outcome: EmbeddedOutcome) => void | Promise<void>
    } = {}) {
      if (plugin || closed)
        throw new Error('Embedded session already attached or closed')
      const candidate = new EmbeddedSessionPlugin(open, { beforeResult: hooks.beforeResult, onResult: async (outcome) => {
        result(outcome)
        await hooks.onResult?.(outcome)
      } })
      if (!await engine.useRuntimePlugin(candidate))
        throw new Error('An embedded session is already registered in this engine')
      plugin = candidate
      if (cancelPending)
        await plugin.cancel()
    },
    async ready() {
      if (closed || ready || cancelPending)
        return
      requirePlugin()
      ready = true
      emit(embeddedMessage(open.sessionId, 'ready'))
    },
    async receive(value: unknown) {
      const command = parseEmbeddedCancel(value)
      if (command.sessionId !== open.sessionId || closed)
        return
      cancelPending = true
      if (plugin)
        await plugin.cancel()
    },
    async beforeClose() {
      cancelPending = true
      if (plugin)
        await plugin.cancel('host-closed')
      else if (!closed)
        result({ status: 'cancelled', reason: 'closed-before-ready' })
    },
    async failStartup(error: unknown) {
      if (plugin)
        await plugin.fail(error)
      else
        result({ status: 'error', code: 'STARTUP_FAILED', message: String(error).slice(0, 4096) })
    },
    closed(error?: unknown) {
      if (closed)
        return
      closed = true
      if (!deliveredResult)
        result(error ? { status: 'error', code: 'CLEANUP_FAILED', message: String(error).slice(0, 4096) } : { status: 'cancelled', reason: 'closed-before-terminal' })
      if (error)
        emit(embeddedMessage(open.sessionId, 'error', { error: { code: 'CLEANUP_FAILED', message: String(error) } }))
      emit(embeddedMessage(open.sessionId, 'closed'))
    },
  }
}
