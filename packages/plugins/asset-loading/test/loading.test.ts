import { MemoryAssetStorage } from '@quajs/assets'
import { QuaEngine } from '@quajs/engine'
import { MemoryBackend } from '@quajs/store'
import { describe, expect, it, vi } from 'vitest'
import { ASSET_LOADING_RENDERER_PROGRESS, ASSET_LOADING_RETRY, AssetLoadingPlugin } from '../src'

async function setup() {
  const engine = new QuaEngine({
    assets: { adapter: { name: 'memory', storage: new MemoryAssetStorage(), crypto: { sha256: async () => '' } } },
    store: { storage: { backend: MemoryBackend } },
  })
  const loading = new AssetLoadingPlugin()
  engine.use(loading)
  await engine.init()
  return { engine, loading }
}

describe('asset loading scene lifecycle', () => {
  it('waits for matching GPU readiness, rejects stale reports, and retries a failed preparation', async () => {
    const { engine, loading } = await setup()
    const run = loading.prepareRenderer('Startup', [{ assetType: 'images', assetName: 'title.webp' }])
    const finished = vi.fn()
    void run.then(finished)
    await vi.waitFor(() => expect(loading.getProjection()?.preparation).toBeDefined())
    expect(loading.getProjection()?.phase).toBe('loading-local')
    const first = loading.getProjection()!.preparation!.id
    await engine.getPipeline().emit(ASSET_LOADING_RENDERER_PROGRESS, { id: 'stale', completed: 1, total: 1 })
    expect(finished).not.toHaveBeenCalled()
    await engine.getPipeline().emit(ASSET_LOADING_RENDERER_PROGRESS, { id: first, error: 'decode failed' })
    await vi.waitFor(() => expect(loading.getProjection()?.state).toBe('error'))
    expect(finished).not.toHaveBeenCalled()
    await engine.getPipeline().emit(ASSET_LOADING_RETRY, {})
    await vi.waitFor(() => {
      expect(loading.getProjection()?.preparation?.id).toBeDefined()
      expect(loading.getProjection()?.preparation?.id).not.toBe(first)
    })
    const second = loading.getProjection()!.preparation!.id
    expect(loading.getProjection()?.phase).toBe('loading-local')
    await engine.getPipeline().emit(ASSET_LOADING_RENDERER_PROGRESS, { id: first, completed: 1, total: 1 })
    await engine.getPipeline().emit(ASSET_LOADING_RENDERER_PROGRESS, { id: second, completed: 2, total: 1 })
    expect(finished).not.toHaveBeenCalled()
    await engine.getPipeline().emit(ASSET_LOADING_RENDERER_PROGRESS, { id: second, completed: 1, total: 1 })
    await run
    expect(loading.getProjection()).toMatchObject({ visible: false, state: 'ready', progress: 1 })
    expect(loading.getProjection()?.preparation).toBeUndefined()
    await engine.destroy()
  })

  it('disposes the pending renderer waiter without advancing continuation', async () => {
    const { engine, loading } = await setup()
    const run = loading.prepareRenderer('Startup', [{ assetType: 'images', assetName: 'title.webp' }])
    const rejected = expect(run).rejects.toThrow('disposed')
    await vi.waitFor(() => expect(loading.getProjection()?.preparation).toBeDefined())
    await engine.destroy()
    await rejected
  })
  it('holds continuation on failure, retries by pipeline intent, and preserves the story point', async () => {
    const { engine, loading } = await setup()
    await engine.setStoryPoint({ sceneId: 'chapter', stepId: 'entry' })
    const point = engine.getStoryPoint()
    let calls = 0
    const run = loading.run('Chapter two', async (report) => {
      calls++
      report({ phase: 'downloading', progress: null, loaded: 17 })
      if (calls === 1)
        throw new Error('network disconnected')
      return 'mounted'
    })
    const finished = vi.fn()
    void run.then(finished)
    await vi.waitFor(() => expect(loading.getProjection()?.state).toBe('error'))
    expect(finished).not.toHaveBeenCalled()
    expect(loading.getProjection()).toMatchObject({ visible: true, error: 'network disconnected', attempt: 1, progress: null })
    await engine.getPipeline().emit(ASSET_LOADING_RETRY, {})
    await expect(run).resolves.toBe('mounted')
    expect(loading.getProjection()).toMatchObject({ visible: false, state: 'ready', progress: 1, attempt: 2 })
    expect(engine.getStoryPoint()).toEqual(point)
    await engine.destroy()
  })

  it('rejects overlapping scenes and releases a pending retry on teardown', async () => {
    const { engine, loading } = await setup()
    const run = loading.run('Startup', async () => {
      throw new Error('offline')
    })
    const rejected = expect(run).rejects.toThrow('disposed')
    await vi.waitFor(() => expect(loading.getProjection()?.state).toBe('error'))
    await expect(loading.run('Other', async () => 1)).rejects.toThrow('already active')
    await loading.destroy()
    await rejected
    await engine.destroy()
  })
})
