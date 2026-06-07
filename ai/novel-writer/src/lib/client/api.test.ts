import { afterEach, describe, expect, it, vi } from 'vitest'
import { deleteProject, defaultRequestTimeoutMs } from './api'

const originalFetch = globalThis.fetch

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  globalThis.fetch = originalFetch
})

describe('client API requests', () => {
  it('aborts normal project requests when they exceed the interaction timeout', async () => {
    vi.useFakeTimers()
    const aborts: AbortSignal[] = []
    globalThis.fetch = vi.fn((_url, init) => {
      const signal = init?.signal as AbortSignal | undefined
      if (signal) {
        aborts.push(signal)
      }
      return new Promise<Response>((_resolve, reject) => {
        signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })
      })
    }) as typeof fetch

    const request = expect(deleteProject('slow-project')).rejects.toThrow('请求超时')
    await vi.advanceTimersByTimeAsync(defaultRequestTimeoutMs)

    await request
    expect(aborts[0]?.aborted).toBe(true)
  })
})
