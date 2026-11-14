import { createMemoryAssetsAdapter } from '@quajs/assets-memory'
import { QuaEngine } from '@quajs/engine'
import { MemoryBackend } from '@quajs/store'
import { describe, expect, it, vi } from 'vitest'
import { EMBEDDED_PLUGIN_ID } from '../src'
import { cloneEmbeddedJson, createEmbeddedOpen, parseEmbeddedOpen } from '../src/protocol'
import { createEmbeddedSession } from '../src/session'

const open = () => createEmbeddedOpen({ sessionId: 'quest-42', storageNamespace: 'game/account', parameters: { quest: 42, name: '玩家' } })
async function engine() {
  const value = QuaEngine.getInstance({ assets: { adapter: createMemoryAssetsAdapter() }, store: { storage: { backend: MemoryBackend } } })
  await value.init()
  return value
}
describe('embedded business protocol', () => {
  it('rebinds restored save metadata to the current host session without replaying a result', async () => {
    const runtime = await engine()
    try {
      const first = createEmbeddedSession(open(), () => {})
      await first.attach(runtime)
      await runtime.saveToSlot('prior-host', {}, { preview: { mode: 'disabled' } })
      await first.beforeClose()
      await runtime.unuse(EMBEDDED_PLUGIN_ID)
      const messages: unknown[] = []
      const second = createEmbeddedSession({ ...open(), sessionId: 'new-session', parameters: { quest: 99 } }, message => messages.push(message))
      await second.attach(runtime)
      await runtime.loadFromSlot('prior-host', { force: true })
      expect(runtime.getPluginProjection(EMBEDDED_PLUGIN_ID)).toMatchObject({ sessionId: 'new-session', parameters: { quest: 99 }, status: 'active' })
      expect(messages).toHaveLength(0)
      await second.beforeClose()
    }
    finally { await runtime.destroy() }
  })
  it('rejects arbitrary commands, path traversal, cyclic/non-JSON/accessor and oversized input without evaluating getters', () => {
    expect(() => parseEmbeddedOpen({ ...open(), type: 'eval' })).toThrow()
    expect(() => parseEmbeddedOpen({ ...open(), storageNamespace: '../account' })).toThrow()
    expect(() => parseEmbeddedOpen({ ...open(), version: 2 })).toThrow()
    expect(() => cloneEmbeddedJson(new Date() as any)).toThrow()
    expect(() => cloneEmbeddedJson({ value: 'x'.repeat(65536) })).toThrow()
    expect(() => cloneEmbeddedJson({ n: Number.NaN })).toThrow()
    const cyclic: any = {}
    cyclic.self = cyclic
    expect(() => cloneEmbeddedJson(cyclic)).toThrow()
    let called = false
    expect(() => cloneEmbeddedJson({ get value() {
      called = true
      return 3
    } })).toThrow()
    expect(called).toBe(false)
    const accessor = [1]
    Object.defineProperty(accessor, '0', { enumerable: true, get() {
      called = true
      return 2
    } })
    expect(() => cloneEmbeddedJson(accessor)).toThrow()
    expect(called).toBe(false)
    expect(() => cloneEmbeddedJson(Array.from({ length: 4 }))).toThrow()
  })
  it('persists before one terminal result, reserves completion against cancellation and separates closed from result', async () => {
    const runtime = await engine()
    try {
      const messages: any[] = []
      const session = createEmbeddedSession(open(), message => messages.push(message))
      let persist!: () => void
      await session.attach(runtime, {
        beforeResult: () => new Promise<void>((resolve) => {
          persist = resolve
        }),
      })
      await session.ready()
      const completion = session.context.complete({ reward: 'badge' })
      const cancellation = session.context.cancel()
      await vi.waitFor(() => expect(persist).toBeTypeOf('function'))
      expect(messages.map(message => message.type)).toEqual(['ready'])
      persist()
      expect(await completion).toEqual({ status: 'completed', value: { reward: 'badge' } })
      expect(await cancellation).toEqual(await completion)
      await session.beforeClose()
      await runtime.destroy()
      session.closed()
      session.closed()
      expect(messages.map(message => message.type)).toEqual(['ready', 'result', 'closed'])
    }
    finally {
      await runtime.destroy()
    }
  })
  it('turns failed persistence into an error result and never acknowledges a reward', async () => {
    const runtime = await engine()
    try {
      const messages: any[] = []
      const session = createEmbeddedSession(open(), value => messages.push(value))
      await session.attach(runtime, {
        beforeResult: async () => {
          throw new Error('disk full')
        },
      })
      await session.context.complete({ reward: 100 })
      expect(messages[0].outcome).toMatchObject({ status: 'error', code: 'PERSISTENCE_FAILED' })
      expect(messages).toHaveLength(1)
    }
    finally {
      await runtime.destroy()
    }
  })
  it.each(['listener', 'middleware'] as const)('keeps a terminal host result when a pipeline %s fails', async (failure) => {
    const runtime = await engine()
    try {
      if (failure === 'listener') {
        runtime.getPipeline().on('embedded/result', () => {
          throw new Error('listener failed')
        })
      }
      else {
        runtime.getPipeline().addMiddleware(async (context, next) => {
          if (context.event.type === 'embedded/result')
            throw new Error('middleware failed')
          await next()
        })
      }
      const messages: any[] = []
      const session = createEmbeddedSession(open(), value => messages.push(value))
      await session.attach(runtime)
      const outcome = await session.context.complete({ quest: 42 })
      expect(outcome).toMatchObject(failure === 'middleware' ? { status: 'error', code: 'RESULT_EVENT_FAILED' } : { status: 'completed', value: { quest: 42 } })
      await session.beforeClose()
      session.closed()
      expect(messages.map(message => message.type)).toEqual(['result', 'closed'])
    }
    finally { await runtime.destroy() }
  })
  it('rejects mismatched sessions and cancels initialization without ready, with no duplicate fallback result', async () => {
    const messages: any[] = []
    const session = createEmbeddedSession(open(), value => messages.push(value))
    await session.receive({ protocol: 'qua-embedded', version: 1, type: 'cancel', sessionId: 'another' })
    expect(messages).toHaveLength(0)
    await session.receive({ protocol: 'qua-embedded', version: 1, type: 'cancel', sessionId: 'quest-42' })
    const runtime = await engine()
    try {
      await session.attach(runtime)
      await session.ready()
      await session.beforeClose()
      session.closed()
    }
    finally {
      await runtime.destroy()
    }
    expect(messages.map(message => message.type)).toEqual(['result', 'closed'])
    expect(messages[0].outcome.status).toBe('cancelled')
    const startup: any[] = []
    const failed = createEmbeddedSession(open(), value => startup.push(value))
    await failed.failStartup('failed')
    await failed.beforeClose()
    failed.closed()
    expect(startup.map(value => value.type)).toEqual(['result', 'closed'])
    expect(startup[0].outcome.status).toBe('error')
  })
})
