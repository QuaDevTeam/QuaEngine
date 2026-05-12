import { QuaEngine } from '@quajs/engine'
import { MemoryBackend } from '@quajs/store'
import { afterEach, describe, expect, it } from 'vitest'
import {
  AUDIO_PLUGIN_ID,
  AudioPlugin,
  AudioRenderToLogicEvents,
  configureAudioChapterWithEngine,
  createInitialAudioProjection,
  emitAudioRenderToLogic,
  pauseAudioWithEngine,
  playAmbientWithEngine,
  playSFXWithEngine,
  playVoiceWithEngine,
  resumeAudioWithEngine,
  setAudioAutomationWithEngine,
  setAudioEqWithEngine,
  setAudioGainWithEngine,
  stopAudioWithEngine,
} from '../src'

const engines: QuaEngine[] = []

describe('@quajs/plugin-audio', () => {
  afterEach(async () => {
    await Promise.all(engines.splice(0).map(engine => engine.destroy().catch(() => {})))
    QuaEngine.resetInstance()
  })

  it('initializes SFX and ambient projection lanes', () => {
    const projection = createInitialAudioProjection()

    expect(projection.buses).toEqual({
      master: { gainDb: 0 },
      bgm: { gainDb: 0 },
      voice: { gainDb: 0 },
      sfx: { gainDb: 0 },
      ambient: { gainDb: 0 },
    })
    expect(projection.sfx).toEqual([])
    expect(projection.ambients).toEqual([])
  })

  it('stores chapter, gain, eq, and automation projection state on the engine', async () => {
    const engine = createEngine()
    engine.use(new AudioPlugin())
    await engine.init()

    await configureAudioChapterWithEngine(engine, 'chapter-1', {
      voiceMap: {
        'chapter-1:1': 'voice/intro',
      },
      bgm: 'bgm/opening',
    })
    await setAudioGainWithEngine(engine, 'voice', -6)
    await setAudioEqWithEngine(engine, 'voice', [{
      type: 'peaking',
      frequency: 1000,
      gainDb: 3,
      q: 1.2,
    }])
    await setAudioAutomationWithEngine(engine, 'voice', 'gainDb', {
      points: [
        { at: 0, value: -12 },
        { at: 500, value: 0 },
      ],
    })
    await setAudioGainWithEngine(engine, 'sfx', -9)
    await setAudioAutomationWithEngine(engine, 'ambient', 'gainDb', {
      points: [
        { at: 0, value: -18 },
        { at: 1000, value: -6 },
      ],
    })

    const projection = engine.getViewState().plugins[AUDIO_PLUGIN_ID] as any
    expect(projection.chapter).toEqual(expect.objectContaining({
      chapterId: 'chapter-1',
      voiceMap: { 'chapter-1:1': 'voice/intro' },
      bgm: 'bgm/opening',
    }))
    expect(projection.buses.voice).toEqual(expect.objectContaining({
      gainDb: -6,
      eq: [expect.objectContaining({
        type: 'peaking',
        frequency: 1000,
        gainDb: 3,
      })],
      automation: [expect.objectContaining({
        propertyPath: 'gainDb',
      })],
    }))
    expect(projection.buses.sfx).toEqual(expect.objectContaining({ gainDb: -9 }))
    expect(projection.buses.ambient.automation).toEqual([expect.objectContaining({
      propertyPath: 'gainDb',
    })])
  })

  it('tracks voice playback and clears it when renderer events arrive', async () => {
    const engine = createEngine()
    engine.use(new AudioPlugin())
    await engine.init()

    await configureAudioChapterWithEngine(engine, 'chapter-1', {
      voiceMap: {
        'chapter-1:1': 'voice/intro',
      },
    })
    await playVoiceWithEngine(engine, 'voice/intro', {
      chapterId: 'chapter-1',
      lineId: 'chapter-1:1',
      characterId: 'Jack',
      gainDb: -3,
    })

    const projection = engine.getViewState().plugins[AUDIO_PLUGIN_ID] as any
    expect(projection.voices).toHaveLength(1)
    expect(projection.voices[0]).toMatchObject({
      assetKey: 'voice/intro',
      chapterId: 'chapter-1',
      lineId: 'chapter-1:1',
      gainDb: -3,
      state: 'playing',
    })

    await emitAudioRenderToLogic(engine.getPipeline(), AudioRenderToLogicEvents.ENDED, {
      channel: 'voice',
      id: projection.voices[0].id,
      assetKey: 'voice/intro',
      chapterId: 'chapter-1',
      lineId: 'chapter-1:1',
    })

    expect((engine.getViewState().plugins[AUDIO_PLUGIN_ID] as any).voices).toEqual([])
  })

  it('tracks concurrent SFX and looping ambient playback', async () => {
    const engine = createEngine()
    engine.use(new AudioPlugin())
    await engine.init()

    await playVoiceWithEngine(engine, 'voice/current', { lineId: 'chapter-1:voice' })
    await playSFXWithEngine(engine, 'sfx/click', { id: 'click-1', gainDb: -3 })
    await playSFXWithEngine(engine, 'sfx/line-hit', { id: 'line-hit', lineId: 'chapter-1:sfx' })
    await playSFXWithEngine(engine, 'sfx/door', { id: 'door-1' })
    await playAmbientWithEngine(engine, 'ambient/rain', { gainDb: -9 })
    await playAmbientWithEngine(engine, 'ambient/wind', { id: 'wind', lineId: 'chapter-1:ambient', gainDb: -12 })

    let projection = engine.getViewState().plugins[AUDIO_PLUGIN_ID] as any
    expect(projection.currentLineId).toBe('chapter-1:voice')
    expect(projection.sfx).toEqual([
      expect.objectContaining({ id: 'click-1', kind: 'sfx', assetKey: 'sfx/click', loop: false, interruptible: true }),
      expect.objectContaining({ id: 'line-hit', kind: 'sfx', assetKey: 'sfx/line-hit', lineId: 'chapter-1:sfx' }),
      expect.objectContaining({ id: 'door-1', kind: 'sfx', assetKey: 'sfx/door', loop: false, interruptible: true }),
    ])
    expect(projection.ambients).toEqual([
      expect.objectContaining({ id: 'ambient', kind: 'ambient', assetKey: 'ambient/rain', loop: true, interruptible: false }),
      expect.objectContaining({ id: 'wind', kind: 'ambient', assetKey: 'ambient/wind', loop: true, interruptible: false }),
    ])

    await emitAudioRenderToLogic(engine.getPipeline(), AudioRenderToLogicEvents.ENDED, {
      channel: 'sfx',
      id: 'click-1',
      assetKey: 'sfx/click',
    })
    projection = engine.getViewState().plugins[AUDIO_PLUGIN_ID] as any
    expect(projection.sfx).toEqual([
      expect.objectContaining({ id: 'line-hit', assetKey: 'sfx/line-hit' }),
      expect.objectContaining({ id: 'door-1', assetKey: 'sfx/door' }),
    ])

    await pauseAudioWithEngine(engine, 'ambient')
    projection = engine.getViewState().plugins[AUDIO_PLUGIN_ID] as any
    expect(projection.ambients).toEqual([
      expect.objectContaining({ id: 'ambient', state: 'paused' }),
      expect.objectContaining({ id: 'wind', state: 'paused' }),
    ])

    await resumeAudioWithEngine(engine, 'wind')
    projection = engine.getViewState().plugins[AUDIO_PLUGIN_ID] as any
    expect(projection.ambients).toEqual([
      expect.objectContaining({ id: 'ambient', state: 'paused' }),
      expect.objectContaining({ id: 'wind', state: 'playing' }),
    ])

    await stopAudioWithEngine(engine, 'master', { fadeOutMs: 100 })
    projection = engine.getViewState().plugins[AUDIO_PLUGIN_ID] as any
    expect(projection.sfx).toEqual([
      expect.objectContaining({ id: 'line-hit', state: 'stopping', fadeOutMs: 100 }),
      expect.objectContaining({ id: 'door-1', state: 'stopping', fadeOutMs: 100 }),
    ])
    expect(projection.ambients).toEqual([
      expect.objectContaining({ id: 'ambient', state: 'stopping', fadeOutMs: 100 }),
      expect.objectContaining({ id: 'wind', state: 'stopping', fadeOutMs: 100 }),
    ])
  })

  it('applies audio keep and stop strategies during engine jump transactions', async () => {
    const engine = createEngine()
    engine.use(new AudioPlugin())
    await engine.init()

    await playVoiceWithEngine(engine, 'voice/checkpoint', { id: 'checkpoint-voice' })
    const checkpoint = await engine.createCheckpoint({
      id: 'audio:checkpoint',
      kind: 'manual',
      point: { stepId: 'audio-checkpoint' },
    })
    await playVoiceWithEngine(engine, 'voice/current', { id: 'current-voice' })

    await engine.jumpTo(checkpoint.id, { audio: 'keep' })
    expect((engine.getViewState().plugins[AUDIO_PLUGIN_ID] as any).voices)
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ id: 'current-voice', assetKey: 'voice/current', state: 'playing' }),
      ]))

    await engine.jumpTo(checkpoint.id, { audio: 'stop' })
    expect((engine.getViewState().plugins[AUDIO_PLUGIN_ID] as any).voices)
      .toEqual([expect.objectContaining({ id: 'checkpoint-voice', state: 'stopping' })])
  })
})

function createEngine(): QuaEngine {
  const engine = new QuaEngine({
    assets: {
      adapter: createMemoryAdapter(),
    },
    store: {
      storage: {
        backend: MemoryBackend,
      },
    },
  })
  engines.push(engine)
  return engine
}

function createMemoryAdapter() {
  return {
    name: 'audio-plugin-test-memory',
    storage: {
      async open() {},
      async close() {},
      async getAsset() { return undefined },
      async storeAsset() {},
      async storeAssets() {},
      async findAssets() { return [] },
      async getAssetWithLocaleFallback() { return undefined },
      async deleteAssetsByBundle() { return 0 },
      async storeBundle() {},
      async getBundle() { return undefined },
      async getAllBundles() { return [] },
      async deleteBundle() {},
      async clearAll() {},
      async getDatabaseSize() { return 0 },
      async cleanupAssets() { return 0 },
      async getCacheStats() {
        return {
          totalAssets: 0,
          totalBundles: 0,
          totalSize: 0,
          oldestAsset: null,
          newestAsset: null,
        }
      },
    },
    fetcher: {
      async fetchBytes(url) {
        throw new Error(`No test asset file registered: ${url}`)
      },
    },
    crypto: {
      async sha256() {
        return ''
      },
    },
  }
}
