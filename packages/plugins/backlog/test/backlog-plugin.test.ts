import type { AssetRuntimeAdapter } from '@quajs/assets'
import { MemoryAssetStorage } from '@quajs/assets'
import { emitRenderToLogic, QuaEngine } from '@quajs/engine'
import { MemoryBackend } from '@quajs/store'
import { afterEach, describe, expect, it } from 'vitest'
import {
  BACKLOG_PLUGIN_ID,
  BacklogPlugin,
  BacklogRenderToLogicEvents,
  getBacklogProjection,
  setBacklogPolicyWithEngine,
} from '../src'

describe('@quajs/plugin-backlog', () => {
  afterEach(async () => {
    QuaEngine.resetInstance()
  })

  it('records dialogue and choice projection entries with checkpoints', async () => {
    const engine = createEngine()
    engine.use(new BacklogPlugin())
    await engine.init()
    await engine.setStoryPoint({ chapterId: 'chapter-1', stepId: 'line-1' })

    await engine.showDialogue({ characterName: 'Alice', text: 'Hello' })
    await engine.showChoices([{ id: 'yes', text: 'Yes' }])

    const projection = getBacklogProjection(engine)
    expect(projection.entries).toHaveLength(2)
    expect(projection.entries[0]).toMatchObject({
      kind: 'dialogue',
      speaker: 'Alice',
      text: 'Hello',
      rewindable: true,
    })
    expect(projection.entries[0].checkpointId).toBeTruthy()
    expect(projection.entries[1]).toMatchObject({
      kind: 'choice',
      text: 'Yes',
    })
    expect(engine.getViewState().plugins[BACKLOG_PLUGIN_ID]).toEqual(expect.objectContaining({ revision: projection.revision }))
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

  it('handles backlog jump and optional voice replay intents through pipeline', async () => {
    const engine = createEngine()
    engine.use(new BacklogPlugin())
    await engine.init()
    await engine.setStoryPoint({ chapterId: 'chapter-1', stepId: 'line-1' })
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

    await emitRenderToLogic(engine.getPipeline(), BacklogRenderToLogicEvents.OPEN_REQUEST as any, {})
    expect(getBacklogProjection(engine).visible).toBe(true)

    await emitRenderToLogic(engine.getPipeline(), BacklogRenderToLogicEvents.CLOSE_REQUEST as any, {})
    expect(getBacklogProjection(engine).visible).toBe(false)
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
