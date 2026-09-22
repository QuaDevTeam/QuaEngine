import { MemoryAssetStorage } from '@quajs/assets'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createWebAssetsAdapter } from '../src'

afterEach(() => vi.useRealTimers())

describe('web transfer progress and deadlines', () => {
  it('keeps a progressing slow transfer alive and treats compressed lengths as unknown', async () => {
    vi.useFakeTimers()
    const onProgress = vi.fn()
    const fetcher: typeof fetch = async (_url, init) => new Response(new ReadableStream({
      start(controller) {
        init?.signal?.addEventListener('abort', () => controller.error(init.signal?.reason))
        setTimeout(() => controller.enqueue(new Uint8Array(12)), 40)
        setTimeout(() => controller.enqueue(new Uint8Array(12)), 80)
        setTimeout(() => controller.close(), 120)
      },
    }), { headers: { 'content-encoding': 'gzip', 'content-length': '6' } })
    const adapter = createWebAssetsAdapter({ storage: new MemoryAssetStorage(), fetcher })
    const transfer = adapter.fetcher!.fetchBytes('https://example.test/base.qpk', { timeout: 60, onProgress })
    await vi.advanceTimersByTimeAsync(125)
    await expect(transfer).resolves.toMatchObject({ size: 24 })
    expect(onProgress).toHaveBeenLastCalledWith(24, 0)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('rejects a stalled transfer and clears the request timer', async () => {
    vi.useFakeTimers()
    const fetcher: typeof fetch = async (_url, init) => new Response(new ReadableStream({
      start(controller) {
        init?.signal?.addEventListener('abort', () => controller.error(init.signal?.reason))
      },
    }))
    const adapter = createWebAssetsAdapter({ storage: new MemoryAssetStorage(), fetcher })
    const transfer = adapter.fetcher!.fetchBytes('https://example.test/base.qpk', { timeout: 60, onProgress: () => {} })
    const failed = expect(transfer).rejects.toThrow('timed out')
    await vi.advanceTimersByTimeAsync(61)
    await failed
    expect(vi.getTimerCount()).toBe(0)
  })
})
