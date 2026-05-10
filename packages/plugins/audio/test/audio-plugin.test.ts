import { afterEach, describe, expect, it } from 'vitest'
import { QuaEngine } from '@quajs/engine'
import {
  AUDIO_PLUGIN_ID,
  AudioPlugin,
  AudioRenderToLogicEvents,
  configureAudioChapterWithEngine,
  emitAudioRenderToLogic,
  playVoiceWithEngine,
  setAudioAutomationWithEngine,
  setAudioEqWithEngine,
  setAudioGainWithEngine,
} from '../src'

const engines: QuaEngine[] = []

describe('@quajs/plugin-audio', () => {
  afterEach(async () => {
    await Promise.all(engines.splice(0).map(engine => engine.destroy().catch(() => {})))
    QuaEngine.resetInstance()
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
})

function createEngine(): QuaEngine {
  const engine = new QuaEngine({
    assets: {
      adapter: createMemoryAdapter(),
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
