import type { AssetRuntimeAdapter } from '@quajs/assets'
import { MemoryAssetStorage } from '@quajs/assets'
import { emitRenderToLogic, QuaEngine } from '@quajs/engine'
import { AudioPlugin, playVoiceWithEngine } from '@quajs/plugin-audio'
import { getSettingsDeveloperValues, getSettingsProjection, SettingsPlugin } from '@quajs/plugin-settings'
import { MemoryBackend } from '@quajs/store'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  BACKLOG_PLUGIN_ID,
  BACKLOG_SETTINGS_SCOPE,
  BacklogPlugin,
  BacklogRenderToLogicEvents,
  getBacklogProjection,
  setBacklogPolicyWithEngine,
} from '../src'

describe('@quajs/plugin-backlog', () => {
  afterEach(async () => {
    QuaEngine.resetInstance()
  })

  it('records dialogue and choice projection entries as view-only by default', async () => {
    const engine = createEngine()
    engine.use(new BacklogPlugin())
    await engine.init()
    await engine.setStoryPoint({ chapterId: 'chapter-1', stepId: 'line-1' })

    await engine.showDialogue({ characterName: 'Alice', text: 'Hello' })
    await engine.showChoices([{ id: 'yes', text: 'Yes' }])

    const projection = getBacklogProjection(engine)
    expect(projection.defaultPolicy.rewindable).toBe(false)
    expect(projection.entries).toHaveLength(2)
    expect(projection.entries[0]).toMatchObject({
      kind: 'dialogue',
      speaker: 'Alice',
      text: 'Hello',
      rewindable: false,
    })
    expect(projection.entries[0].checkpointId).toBeUndefined()
    expect(projection.entries[1]).toMatchObject({
      kind: 'choice',
      text: 'Yes',
      rewindable: false,
    })
    expect(projection.entries[1].checkpointId).toBeUndefined()
    expect(engine.getViewState().plugins[BACKLOG_PLUGIN_ID]).toEqual(expect.objectContaining({ revision: projection.revision }))
  })

  it('creates rewind checkpoints when a backlog point is explicitly rewindable', async () => {
    const engine = createEngine()
    engine.use(new BacklogPlugin())
    await engine.init()
    await engine.setStoryPoint({ chapterId: 'chapter-1', stepId: 'line-1' })
    await setBacklogPolicyWithEngine(engine, { rewindable: true })

    await engine.showDialogue({ text: 'Return point' })

    const entry = getBacklogProjection(engine).entries[0]
    expect(entry).toMatchObject({
      text: 'Return point',
      rewindable: true,
    })
    expect(entry.checkpointId).toBeTruthy()
    expect(engine.getCheckpoint(entry.checkpointId!)).toBeTruthy()
  })

  it('supports project-wide rewindable backlog defaults', async () => {
    const engine = createEngine()
    engine.use(new BacklogPlugin({ defaultPolicy: { rewindable: true } }))
    await engine.init()
    await engine.setStoryPoint({ chapterId: 'chapter-1', stepId: 'line-1' })

    await engine.showDialogue({ text: 'Default rewindable' })

    const entry = getBacklogProjection(engine).entries[0]
    expect(entry).toMatchObject({
      text: 'Default rewindable',
      rewindable: true,
    })
    expect(entry.checkpointId).toBeTruthy()
  })

  it('respects NoBacklog-style policy and current-chapter retention', async () => {
    const engine = createEngine()
    engine.use(new BacklogPlugin({ retention: { scope: 'chapter', maxEntries: 5 } }))
    await engine.init()

    await engine.setStoryPoint({ chapterId: 'chapter-1', stepId: 'line-1' })
    await engine.showDialogue({ text: 'Kept' })
    await setBacklogPolicyWithEngine(engine, { include: false })
    await engine.showDialogue({ text: 'Hidden' })
    await engine.setStoryPoint({ chapterId: 'chapter-2', stepId: 'line-2' })
    await engine.showDialogue({ text: 'Next chapter' })

    expect(getBacklogProjection(engine).entries.map(entry => entry.text)).toEqual(['Next chapter'])
  })

  it('applies plugin default policy and route retention options', async () => {
    const engine = createEngine()
    engine.use(new BacklogPlugin({
      retention: { scope: 'route', maxEntries: 2 },
      defaultPolicy: { include: false },
    }))
    await engine.init()

    await engine.setStoryPoint({ chapterId: 'chapter-1', routeId: 'a', stepId: 'line-1' })
    await engine.showDialogue({ text: 'Hidden by default' })
    expect(getBacklogProjection(engine).entries).toEqual([])

    await setBacklogPolicyWithEngine(engine, { include: true })
    await engine.showDialogue({ text: 'Route A 1' })
    await setBacklogPolicyWithEngine(engine, { include: true })
    await engine.showDialogue({ text: 'Route A 2' })
    await engine.setStoryPoint({ chapterId: 'chapter-1', routeId: 'b', stepId: 'line-2' })
    await setBacklogPolicyWithEngine(engine, { include: true })
    await engine.showDialogue({ text: 'Route B' })

    expect(getBacklogProjection(engine).entries.map(entry => entry.text)).toEqual(['Route B'])
  })

  it('exposes retention and default policy as developer settings only', async () => {
    const engine = createEngine()
    engine.use(new SettingsPlugin({ builtin: false }))
    engine.use(new BacklogPlugin({
      retention: { scope: 'global', maxEntries: 3 },
      defaultPolicy: { include: false, rewindable: false, voiceReplay: true },
    }))
    await engine.init()

    expect(getSettingsDeveloperValues(engine, BACKLOG_SETTINGS_SCOPE)).toEqual({
      retentionScope: 'global',
      maxEntries: 3,
      includeByDefault: false,
      rewindableByDefault: false,
      voiceReplayByDefault: true,
    })
    expect(getSettingsProjection(engine)?.scopes[BACKLOG_SETTINGS_SCOPE]).toBeUndefined()
    expect(getBacklogProjection(engine)).toEqual(expect.objectContaining({
      retention: { scope: 'global', maxEntries: 3 },
      defaultPolicy: {
        include: false,
        rewindable: false,
        voiceReplay: true,
      },
    }))
  })

  it('keeps voice replay disabled when the audio engine plugin is absent', async () => {
    const engine = createEngine()
    engine.use(new BacklogPlugin())
    await engine.init()
    await engine.setStoryPoint({ chapterId: 'chapter-1', stepId: 'line-1', lineId: 'line-1' })
    await engine.setPluginProjection('audio', {
      currentLineId: 'line-1',
      voices: [{ assetKey: 'voice/line-1.ogg', lineId: 'line-1' }],
    })

    await engine.showDialogue({ text: 'Voiced line' })

    expect(getBacklogProjection(engine).entries[0]).toMatchObject({
      voice: { assetKey: 'voice/line-1.ogg' },
      voiceReplay: false,
    })
  })

  it('records runtime package dependencies on entries and checkpoints', async () => {
    const engine = createEngine()
    engine.use(new BacklogPlugin())
    await engine.init()
    await engine.setStoryPoint({
      chapterId: 'chapter-1',
      stepId: 'runtime-line',
      contentPackageId: 'runtime.story',
      requiredRuntimePackages: ['runtime.story', 'runtime.delta'],
    })
    await setBacklogPolicyWithEngine(engine, { rewindable: true })

    await engine.showDialogue({ text: 'Runtime line' })

    const entry = getBacklogProjection(engine).entries[0]
    expect(entry.requiredRuntimePackages).toEqual(['runtime.story', 'runtime.delta'])
    expect(engine.getCheckpoint(entry.checkpointId!)?.metadata?.requiredRuntimePackages).toEqual(['runtime.story', 'runtime.delta'])
    expect(getBacklogProjection(engine).requiredRuntimePackages).toEqual(['runtime.story', 'runtime.delta'])
    expect(engine.getRuntimeViewRequiredPackageIds()).toEqual(['runtime.story', 'runtime.delta'])

    await engine.notifyRuntimePackageUnload({ id: 'runtime.delta', version: '1.0.0' }, 'runtime.delta')

    expect(getBacklogProjection(engine).entries).toEqual([])
    expect(getBacklogProjection(engine).requiredRuntimePackages).toEqual([])
  })

  it('loads required runtime packages before replaying package-scoped voices', async () => {
    const engine = createEngine()
    engine.use(new AudioPlugin())
    engine.use(new BacklogPlugin())
    await engine.init()
    await engine.setStoryPoint({
      chapterId: 'chapter-1',
      stepId: 'line-1',
      lineId: 'line-1',
      contentPackageId: 'runtime.story',
    })
    await playVoiceWithEngine(engine, 'voice/runtime.ogg', {
      lineId: 'line-1',
      contentPackageId: 'runtime.voice',
    })
    const ensureRuntimePackages = vi.spyOn(engine, 'ensureRuntimePackages').mockResolvedValue(undefined)

    await engine.showDialogue({ text: 'Voiced runtime line' })
    const entry = getBacklogProjection(engine).entries[0]

    expect(entry).toEqual(expect.objectContaining({
      requiredRuntimePackages: ['runtime.story', 'runtime.voice'],
      voiceReplay: true,
      voice: expect.objectContaining({
        assetKey: 'voice/runtime.ogg',
        contentPackageId: 'runtime.voice',
        requiredRuntimePackages: ['runtime.voice'],
      }),
    }))

    await engine.getPipeline().emit(BacklogRenderToLogicEvents.REPLAY_VOICE_REQUEST, { entryId: entry.id })

    expect(ensureRuntimePackages).toHaveBeenCalledWith(['runtime.voice'])
  })

  it('handles backlog jump and optional voice replay intents through pipeline', async () => {
    const engine = createEngine()
    engine.use(new BacklogPlugin())
    await engine.init()
    await engine.setStoryPoint({ chapterId: 'chapter-1', stepId: 'line-1' })
    await setBacklogPolicyWithEngine(engine, { rewindable: true })
    await engine.showDialogue({ text: 'Return here' })
    const entry = getBacklogProjection(engine).entries[0]
    await engine.showDialogue({ text: 'Elsewhere' })

    await engine.getPipeline().emit(BacklogRenderToLogicEvents.JUMP_REQUEST, { entryId: entry.id })
    expect(engine.getViewState().dialogue.text).toBe('Return here')
    expect(getBacklogProjection(engine).entries.map(item => item.text)).toEqual(['Return here', 'Elsewhere'])
    expect(getBacklogProjection(engine).visible).toBe(false)

    await expect(engine.getPipeline().emit(BacklogRenderToLogicEvents.REPLAY_VOICE_REQUEST, { entryId: entry.id }))
      .resolves
      .toBeUndefined()
  })

  it('toggles backlog visibility from renderer intent events', async () => {
    const engine = createEngine()
    engine.use(new BacklogPlugin())
    await engine.init()

    await emitRenderToLogic(engine.getPipeline(), BacklogRenderToLogicEvents.OPEN_REQUEST as any, {
      source: 'test',
      scene: {
        id: 'test:backlog',
        presentation: 'scene',
        overlay: {
          variant: 'test-panel',
          hideHud: true,
          hideDialogue: true,
        },
      },
    })
    expect(getBacklogProjection(engine)).toEqual(expect.objectContaining({
      visible: true,
      ui: {
        source: 'test',
        scene: {
          id: 'test:backlog',
          presentation: 'scene',
          overlay: {
            variant: 'test-panel',
            hideHud: true,
            hideDialogue: true,
          },
        },
      },
    }))

    await emitRenderToLogic(engine.getPipeline(), BacklogRenderToLogicEvents.CLOSE_REQUEST as any, {})
    expect(getBacklogProjection(engine)).toEqual(expect.objectContaining({
      visible: false,
      ui: undefined,
    }))
  })

  it('creates default UI scene metadata for bare backlog open requests', async () => {
    const engine = createEngine()
    engine.use(new BacklogPlugin())
    await engine.init()

    await emitRenderToLogic(engine.getPipeline(), BacklogRenderToLogicEvents.OPEN_REQUEST as any, {})

    expect(getBacklogProjection(engine)).toEqual(expect.objectContaining({
      visible: true,
      ui: {
        scene: {
          id: 'plugin:backlog',
          presentation: 'overlay',
          overlay: {
            variant: 'backlog',
            hideHud: true,
            hideDialogue: true,
          },
        },
      },
    }))
  })
})

function createEngine(): QuaEngine {
  return new QuaEngine({
    assets: {
      adapter: createMemoryAdapter(),
    },
    store: {
      storage: {
        backend: MemoryBackend,
      },
    },
  })
}

function createMemoryAdapter(): AssetRuntimeAdapter {
  return {
    name: 'backlog-plugin-test-memory',
    storage: new MemoryAssetStorage(),
    crypto: {
      async sha256() {
        return ''
      },
    },
  }
}
