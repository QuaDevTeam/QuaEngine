import { afterEach, describe, expect, it, vi } from 'vitest'
import { deleteProject, defaultRequestTimeoutMs, exportProject } from './api'

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

  it('returns project export blobs with the server-provided filename', async () => {
    globalThis.fetch = vi.fn(async () => new Response('zip-bytes', {
      headers: {
        'Content-Disposition': 'attachment; filename="fallback.zip"; filename*=UTF-8\'\'Novel%20Export.zip',
        'Content-Type': 'application/zip',
      },
    })) as typeof fetch

    const download = await exportProject('project one')

    expect(globalThis.fetch).toHaveBeenCalledWith('/api/projects/project%20one/export', expect.objectContaining({
      signal: expect.any(AbortSignal),
    }))
    expect(download.filename).toBe('Novel Export.zip')
    expect(await download.blob.text()).toBe('zip-bytes')
  })
})
