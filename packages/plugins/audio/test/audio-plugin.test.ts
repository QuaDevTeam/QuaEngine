import { QuaEngine } from '@quajs/engine'
import { getSettingsDeveloperValues, getSettingsPlayerValues, getSettingsProjection, SettingsPlugin, updatePlayerSettingsWithEngine } from '@quajs/plugin-settings'
import { MemoryBackend } from '@quajs/store'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  AUDIO_PLUGIN_ID,
  AUDIO_SETTINGS_SCOPE,
  AudioPlugin,
  AudioRenderToLogicEvents,
  clearRuntimePackageAudioWithEngine,
  configureAudioChapterWithEngine,
  createInitialAudioProjection,
  emitAudioRenderToLogic,
  pauseAudioWithEngine,
  playAmbientWithEngine,
  playBGMWithEngine,
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
    vi.useRealTimers()
    vi.restoreAllMocks()
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

  it('exposes player bus gains and developer defaults through settings', async () => {
    const engine = createEngine()
    engine.use(new SettingsPlugin({ builtin: false }))
    engine.use(new AudioPlugin({
      defaultProjection: {
        buses: {
          master: { gainDb: -3 },
          bgm: { gainDb: -6 },
          voice: { gainDb: -2 },
          sfx: { gainDb: -8 },
          ambient: { gainDb: -12 },
        },
      },
    }))
    await engine.init()

    expect(getSettingsDeveloperValues(engine, AUDIO_SETTINGS_SCOPE)).toEqual({
      defaultMasterGainDb: -3,
      defaultBgmGainDb: -6,
      defaultVoiceGainDb: -2,
      defaultSfxGainDb: -8,
      defaultAmbientGainDb: -12,
    })
    expect(getSettingsPlayerValues(engine, AUDIO_SETTINGS_SCOPE)).toEqual({
      masterGainDb: -3,
      bgmGainDb: -6,
      voiceGainDb: -2,
      sfxGainDb: -8,
      ambientGainDb: -12,
    })
    expect(getSettingsProjection(engine)?.scopes[AUDIO_SETTINGS_SCOPE]).toEqual(expect.objectContaining({
      title: 'Audio',
      values: {
        masterGainDb: -3,
        bgmGainDb: -6,
        voiceGainDb: -2,
        sfxGainDb: -8,
        ambientGainDb: -12,
      },
    }))

    const result = await updatePlayerSettingsWithEngine(engine, AUDIO_SETTINGS_SCOPE, {
      masterGainDb: -10,
      voiceGainDb: -4,
    })

    expect(result.ok).toBe(true)
    const projection = engine.getViewState().plugins[AUDIO_PLUGIN_ID] as any
    expect(projection.buses.master.gainDb).toBe(-10)
    expect(projection.buses.voice.gainDb).toBe(-4)
    expect(projection.buses.bgm.gainDb).toBe(-6)
  })

  it('exposes engine-bound plugin instance audio APIs', async () => {
    const engine = createEngine()
    const audio = new AudioPlugin()
    engine.use(audio)
    await engine.init()
    vi.useFakeTimers({ now: 1_000 })

    expect(engine.getPluginById<AudioPlugin>(AUDIO_PLUGIN_ID)).toBe(audio)

    await audio.configureChapter('chapter-js', { bgm: 'bgm/js' })
    await audio.setGain('bgm', -8)
    await audio.playBGM('bgm/js', {
      id: 'js-bgm',
      delayMs: 250,
    })

    let projection = engine.getViewState().plugins[AUDIO_PLUGIN_ID] as any
    expect(projection.chapter).toEqual(expect.objectContaining({
      chapterId: 'chapter-js',
      bgm: 'bgm/js',
    }))
    expect(projection.buses.bgm.gainDb).toBe(-8)
    expect(projection.bgm).toEqual(expect.objectContaining({
      id: 'js-bgm',
      assetKey: 'bgm/js',
      playAt: 1_250,
    }))

    await audio.stopBGM({ fadeOutMs: 300 })

    projection = engine.getViewState().plugins[AUDIO_PLUGIN_ID] as any
    expect(projection.bgm).toEqual(expect.objectContaining({
      id: 'js-bgm',
      state: 'stopping',
      fadeOutMs: 300,
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

  it('projects audio asset duration for voice timing consumers', async () => {
    const engine = createEngine()
    engine.use(new AudioPlugin())
    await engine.init()
    vi.spyOn(engine, 'getAssetMetadata').mockResolvedValue({
      format: 'OGG',
      duration: 2.4,
    })

    await playVoiceWithEngine(engine, 'voice/timed', {
      lineId: 'line-1',
    })

    const projection = engine.getViewState().plugins[AUDIO_PLUGIN_ID] as any
    expect(projection.voices[0]).toEqual(expect.objectContaining({
      assetKey: 'voice/timed',
      durationMs: 2400,
    }))
  })

  it('normalizes delayed BGM playback onto the audio projection', async () => {
    const engine = createEngine()
    engine.use(new AudioPlugin())
    await engine.init()
    vi.useFakeTimers({ now: 1_700_000_000_000 })

    await playBGMWithEngine(engine, 'bgm/delayed', {
      id: 'delayed-bgm',
      delayMs: 750,
    })

    const projection = engine.getViewState().plugins[AUDIO_PLUGIN_ID] as any
    expect(projection.bgm).toEqual(expect.objectContaining({
      id: 'delayed-bgm',
      assetKey: 'bgm/delayed',
      state: 'playing',
      delayMs: 750,
      playAt: 1_700_000_000_750,
    }))
  })

  it('rejects invalid delayed audio playback options', async () => {
    const engine = createEngine()
    engine.use(new AudioPlugin())
    await engine.init()

    await expect(playBGMWithEngine(engine, 'bgm/invalid', { delayMs: -1 }))
      .rejects
      .toThrow('Audio delayMs must be a non-negative number.')
    await expect(playBGMWithEngine(engine, 'bgm/invalid', { playAt: Number.NaN }))
      .rejects
      .toThrow('Audio playAt must be a finite timestamp in milliseconds.')
  })

  it('ignores stale renderer audio completion events', async () => {
    const engine = createEngine()
    engine.use(new AudioPlugin())
    await engine.init()

    await playBGMWithEngine(engine, 'bgm/base', { id: 'base-bgm' })
    const revision = (engine.getViewState().plugins[AUDIO_PLUGIN_ID] as any).revision

    await emitAudioRenderToLogic(engine.getPipeline(), AudioRenderToLogicEvents.ENDED, {
      channel: 'bgm',
      id: 'stale-bgm',
      assetKey: 'bgm/old',
    })

    const projection = engine.getViewState().plugins[AUDIO_PLUGIN_ID] as any
    expect(projection.revision).toBe(revision)
    expect(projection.bgm).toEqual(expect.objectContaining({ id: 'base-bgm' }))
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

  it('stops tracks owned by an unloaded runtime package', async () => {
    const engine = createEngine()
    engine.use(new AudioPlugin())
    await engine.init()

    await engine.setStoryPoint({ stepId: 'runtime-audio-step', contentPackageId: 'runtime.audio' })
    await configureAudioChapterWithEngine(engine, 'runtime-audio', {
      bgm: 'bgm/runtime-chapter',
    })
    await playVoiceWithEngine(engine, 'voice/runtime', { id: 'runtime-voice' })
    await playBGMWithEngine(engine, 'bgm/runtime', { id: 'runtime-bgm' })
    await engine.setStoryPoint({ stepId: 'base-audio-step' })
    await playSFXWithEngine(engine, 'sfx/base', { id: 'base-sfx' })

    let projection = engine.getViewState().plugins[AUDIO_PLUGIN_ID] as any
    expect(projection.chapter.metadata).toEqual({ contentPackageId: 'runtime.audio' })
    expect(projection.voices[0]).toEqual(expect.objectContaining({ contentPackageId: 'runtime.audio' }))
    expect(projection.bgm).toEqual(expect.objectContaining({ contentPackageId: 'runtime.audio' }))
    expect(projection.requiredRuntimePackages).toEqual(['runtime.audio'])
    expect(engine.getRuntimeViewRequiredPackageIds()).toEqual(['runtime.audio'])

    await engine.notifyRuntimePackageUnload({ id: 'runtime.audio', version: '1.0.0' }, 'runtime.audio')

    projection = engine.getViewState().plugins[AUDIO_PLUGIN_ID] as any
    expect(projection.chapter).toBeUndefined()
    expect(projection.voices).toEqual([])
    expect(projection.bgm).toBeUndefined()
    expect(projection.sfx).toEqual([expect.objectContaining({ id: 'base-sfx', state: 'playing' })])
    expect(projection.requiredRuntimePackages).toEqual([])
  })

  it('does not rewrite audio projection when clearing an unrelated runtime package', async () => {
    const engine = createEngine()
    engine.use(new AudioPlugin())
    await engine.init()

    await configureAudioChapterWithEngine(engine, 'base-audio', {
      bgm: 'bgm/base-chapter',
    })
    await playBGMWithEngine(engine, 'bgm/base', { id: 'base-bgm' })

    const revision = (engine.getViewState().plugins[AUDIO_PLUGIN_ID] as any).revision
    await clearRuntimePackageAudioWithEngine(engine, 'runtime.unrelated')

    const projection = engine.getViewState().plugins[AUDIO_PLUGIN_ID] as any
    expect(projection.revision).toBe(revision)
    expect(projection.chapter).toEqual(expect.objectContaining({ chapterId: 'base-audio' }))
    expect(projection.bgm).toEqual(expect.objectContaining({ id: 'base-bgm' }))
  })

  it('tracks chapter-only runtime package metadata in active view dependencies', async () => {
    const engine = createEngine()
    engine.use(new AudioPlugin())
    await engine.init()

    await engine.setStoryPoint({ stepId: 'runtime-audio-chapter-step', contentPackageId: 'runtime.audio.chapter' })
    await configureAudioChapterWithEngine(engine, 'runtime-audio-chapter')

    const projection = engine.getViewState().plugins[AUDIO_PLUGIN_ID] as any
    expect(projection.chapter.metadata).toEqual({ contentPackageId: 'runtime.audio.chapter' })
    expect(projection.requiredRuntimePackages).toEqual(['runtime.audio.chapter'])
    expect(engine.getRuntimeViewRequiredPackageIds()).toEqual(['runtime.audio.chapter'])
  })

  it('merges current runtime package dependencies when audio extends existing package content', async () => {
    const engine = createEngine()
    engine.use(new AudioPlugin())
    await engine.init()

    await engine.setStoryPoint({ stepId: 'runtime-audio-delta-step', contentPackageId: 'runtime.audio.delta' })
    await playBGMWithEngine(engine, 'bgm/base-theme', {
      id: 'base-theme',
      metadata: { contentPackageId: 'base.audio' },
    })
    await configureAudioChapterWithEngine(engine, 'base-chapter-delta', {
      metadata: { contentPackageId: 'base.audio' },
    })

    let projection = engine.getViewState().plugins[AUDIO_PLUGIN_ID] as any
    expect(projection.bgm).toEqual(expect.objectContaining({
      contentPackageId: 'base.audio',
      metadata: {
        contentPackageId: 'base.audio',
        requiredRuntimePackages: ['base.audio', 'runtime.audio.delta'],
      },
    }))
    expect(projection.chapter.metadata).toEqual({
      contentPackageId: 'base.audio',
      requiredRuntimePackages: ['base.audio', 'runtime.audio.delta'],
    })
    expect(projection.requiredRuntimePackages).toEqual(['base.audio', 'runtime.audio.delta'])
    expect(engine.getRuntimeViewRequiredPackageIds()).toEqual(['base.audio', 'runtime.audio.delta'])

    await engine.notifyRuntimePackageUnload({ id: 'runtime.audio.delta', version: '1.0.0' }, 'runtime.audio.delta')

    projection = engine.getViewState().plugins[AUDIO_PLUGIN_ID] as any
    expect(projection.bgm).toBeUndefined()
    expect(projection.chapter).toBeUndefined()
    expect(projection.requiredRuntimePackages).toEqual([])
  })

  it('preserves mixed-package audio projection when engine clears package view state', async () => {
    const engine = createEngine()
    engine.use(new AudioPlugin())
    await engine.init()

    await engine.setStoryPoint({ stepId: 'runtime-audio-step', contentPackageId: 'runtime.audio' })
    await playVoiceWithEngine(engine, 'voice/runtime', { id: 'runtime-voice' })
    await engine.setStoryPoint({ stepId: 'base-audio-step' })
    await playSFXWithEngine(engine, 'sfx/base', { id: 'base-sfx' })

    await engine.clearRuntimePackageViewState('runtime.audio')

    const projection = engine.getViewState().plugins[AUDIO_PLUGIN_ID] as any
    expect(projection).toBeDefined()
    expect(projection.voices).toEqual([expect.objectContaining({ id: 'runtime-voice', contentPackageId: 'runtime.audio' })])
    expect(projection.sfx).toEqual([expect.objectContaining({ id: 'base-sfx', state: 'playing' })])
  })

  it('stops audio projections that require an unloaded runtime package', async () => {
    const engine = createEngine()
    engine.use(new AudioPlugin())
    await engine.init()

    await configureAudioChapterWithEngine(engine, 'dependent-audio', {
      bgm: 'bgm/dependent-chapter',
      metadata: {
        contentPackageId: 'base.audio',
        requiredRuntimePackages: ['runtime.audio-assets'],
      },
    })
    await playBGMWithEngine(engine, 'bgm/dependent', {
      id: 'dependent-bgm',
      contentPackageId: 'base.audio',
      metadata: { requiredRuntimePackages: ['runtime.audio-assets'] },
    })
    await playSFXWithEngine(engine, 'sfx/base', {
      id: 'base-sfx',
      contentPackageId: 'base.audio',
    })

    expect((engine.getViewState().plugins[AUDIO_PLUGIN_ID] as any).requiredRuntimePackages)
      .toEqual(['base.audio', 'runtime.audio-assets'])

    await engine.notifyRuntimePackageUnload({ id: 'runtime.audio-assets', version: '1.0.0' }, 'runtime.audio-assets')

    const projection = engine.getViewState().plugins[AUDIO_PLUGIN_ID] as any
    expect(projection.chapter).toBeUndefined()
    expect(projection.bgm).toBeUndefined()
    expect(projection.sfx).toEqual([expect.objectContaining({ id: 'base-sfx', state: 'playing' })])
    expect(projection.requiredRuntimePackages).toEqual(['base.audio'])
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
