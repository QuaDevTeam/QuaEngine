import type { AssetRuntimeAdapter } from '@quajs/assets'
import { MemoryAssetStorage } from '@quajs/assets'
import { MemoryBackend } from '@quajs/store'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createViewLayoutProjection, emitRenderToLogic, LogicToRenderEvents, onLogicToRender, QuaEngine, RenderToLogicEvents, UiOverlayPlugin } from '../src'

describe('quaEngine runtime architecture', () => {
  afterEach(async () => {
    vi.useRealTimers()
    QuaEngine.resetInstance()
  })

  it('requires explicit assets adapter injection', () => {
    expect(() => new QuaEngine()).toThrow('QuaEngine requires assets config with an adapter')
  })

  it('stores render-relevant state as the authoritative view projection', async () => {
    const engine = createEngine()
    await engine.init()

    await engine.setBackgroundProjection({ mode: 'image', assetName: 'bg.png', transition: { type: 'fade', duration: 300 } })
    await engine.showCharacter({ id: 'Alice', name: 'Alice', sprite: 'alice.png', position: { x: 40 } })
    await engine.showDialogue({ characterId: 'Alice', characterName: 'Alice', text: 'Hello' })
    await engine.showChoices([{ id: 'yes', text: 'Yes' }])
    await engine.setPluginProjection('audio', audioProjection({
      revision: 1,
      bgm: { id: 'bgm', kind: 'bgm', assetKey: 'theme.ogg', state: 'playing' },
      buses: {
        master: { gainDb: 0 },
        bgm: { gainDb: -6 },
        voice: { gainDb: 0 },
      },
    }))
    await engine.sceneManager.showUI('menu', { open: true })
    await engine.sceneManager.applyEffect('shake', { target: 'stage', duration: 200 })

    const view = engine.getViewState()
    expect(view.background).toEqual({ mode: 'image', assetName: 'bg.png', transition: { type: 'fade', duration: 300 } })
    expect(view.characters).toEqual([expect.objectContaining({ id: 'Alice', visible: true, sprite: 'alice.png' })])
    expect(view.dialogue).toEqual(expect.objectContaining({ visible: true, text: 'Hello' }))
    expect(view.choices).toEqual([{ id: 'yes', text: 'Yes', enabled: true, metadata: undefined }])
    expect(view.plugins.audio).toEqual(expect.objectContaining({
      revision: 1,
      bgm: expect.objectContaining({ assetKey: 'theme.ogg', state: 'playing' }),
      buses: expect.objectContaining({ bgm: { gainDb: -6 } }),
    }))
    expect(view.ui.overlays).toEqual({ menu: { open: true } })
    expect(view.effects).toEqual([expect.objectContaining({ type: 'shake', target: 'stage' })])
  })

  it('owns project layout settings in the view projection', async () => {
    const engine = new QuaEngine({
      layout: 'portrait',
      assets: {
        adapter: createMemoryAdapter(),
      },
      store: {
        storage: {
          backend: MemoryBackend,
        },
      },
    })
    await engine.init()

    expect(engine.getViewState().layout).toEqual(createViewLayoutProjection('portrait'))

    await engine.setLayoutProjection({
      preset: 'landscape',
      minAspectRatio: 16 / 10,
      maxAspectRatio: 16 / 9,
    })

    expect(engine.getViewState().layout).toEqual(createViewLayoutProjection('landscape'))
  })

  it('returns view snapshots instead of mutable store references', async () => {
    const engine = createEngine()
    await engine.init()
    await engine.showDialogue({ text: 'Authoritative' })
    await engine.setPluginProjection('audio', audioProjection({
      revision: 1,
      voices: [{ id: 'voice-1', kind: 'voice', assetKey: 'voice.ogg', state: 'playing' }],
    }))

    const projected = engine.getViewState() as any
    projected.dialogue.text = 'Mutated outside engine'
    projected.characters.push({ id: 'Injected', name: 'Injected', visible: true })
    projected.plugins.audio.voices.push({ id: 'external', kind: 'voice', assetKey: 'external.ogg', state: 'playing' })

    const next = engine.getViewState()
    expect(next.dialogue.text).toBe('Authoritative')
    expect(next.characters).toEqual([])
    expect((next.plugins.audio as any).voices).toEqual([
      { id: 'voice-1', kind: 'voice', assetKey: 'voice.ogg', state: 'playing' },
    ])
  })

  it('uses pipeline as the only render intent channel and waits for renderer events', async () => {
    const engine = createEngine()
    await engine.init()

    const wait = engine.waitFor(RenderToLogicEvents.USER_CHOICE_SELECT, payload => payload.choiceId === 'yes')
    await emitRenderToLogic(engine.getPipeline(), RenderToLogicEvents.USER_CHOICE_SELECT, { choiceId: 'yes' })

    await expect(wait).resolves.toEqual({ choiceId: 'yes' })
  })

  it('owns flow control state and advances skippable dialogue through pipeline', async () => {
    vi.useFakeTimers()
    const engine = createEngine()
    await engine.init()
    await engine.setFlowControlOptions({ skipMode: 'all' })
    await engine.setFlowControlMode('skip')

    let waitReady!: () => void
    const ready = new Promise<void>((resolve) => {
      waitReady = resolve
    })
    let completed = false
    const active = engine.dialogue([{
      uuid: 'flow-skip-line',
      run: async (ctx) => {
        await ctx.engine.showDialogue({ text: 'Skip me' })
        const wait = ctx.engine.waitFor(RenderToLogicEvents.USER_ADVANCE)
        waitReady()
        await wait
        completed = true
      },
    }])

    await ready
    await vi.runOnlyPendingTimersAsync()
    await active

    expect(completed).toBe(true)
    expect(engine.getFlowControlState()).toEqual(expect.objectContaining({
      mode: 'skip',
      lastAdvance: expect.objectContaining({ source: 'flow-control:skip' }),
    }))
  })

  it('respects non-skippable flow control policy until manual advance', async () => {
    vi.useFakeTimers()
    const engine = createEngine()
    await engine.init()
    await engine.setFlowControlOptions({ skipMode: 'all' })
    await engine.setFlowControlMode('skip')
    await engine.setFlowControlPolicy({ skippable: false })

    let waitReady!: () => void
    const ready = new Promise<void>((resolve) => {
      waitReady = resolve
    })
    let completed = false
    const active = engine.dialogue([{
      uuid: 'flow-blocked-line',
      run: async (ctx) => {
        await ctx.engine.showDialogue({ text: 'Do not skip' })
        const wait = ctx.engine.waitFor(RenderToLogicEvents.USER_ADVANCE)
        waitReady()
        await wait
        completed = true
      },
    }])

    await ready
    await vi.runOnlyPendingTimersAsync()
    expect(completed).toBe(false)

    await emitRenderToLogic(engine.getPipeline(), RenderToLogicEvents.USER_ADVANCE, { source: 'manual' })
    await active
    expect(completed).toBe(true)
  })

  it('stops read-only skip at unread story points and skips them after manual advance', async () => {
    vi.useFakeTimers()
    const engine = createEngine()
    await engine.init()

    const runLine = () => {
      let waitReady!: () => void
      const ready = new Promise<void>((resolve) => {
        waitReady = resolve
      })
      let completed = false
      const active = engine.dialogue([{
        uuid: 'read-mode-line',
        run: async (ctx) => {
          await ctx.engine.showDialogue({ text: 'Read-gated line' })
          const wait = ctx.engine.waitFor(RenderToLogicEvents.USER_ADVANCE)
          waitReady()
          await wait
          completed = true
        },
      }])
      return {
        active,
        ready,
        completed: () => completed,
      }
    }

    await engine.setFlowControlMode('skip')
    const first = runLine()
    await first.ready
    await vi.runOnlyPendingTimersAsync()
    expect(first.completed()).toBe(false)
    expect(engine.getFlowControlState().mode).toBe('normal')

    await emitRenderToLogic(engine.getPipeline(), RenderToLogicEvents.USER_ADVANCE, { source: 'manual' })
    await first.active
    expect(first.completed()).toBe(true)

    await engine.setFlowControlMode('skip')
    const second = runLine()
    await second.ready
    await vi.runOnlyPendingTimersAsync()
    await second.active
    expect(second.completed()).toBe(true)
    expect(engine.getFlowControlState().lastAdvance).toEqual(expect.objectContaining({
      source: 'flow-control:skip',
    }))
  })

  it('handles renderer flow control intents and stops flow modes at choices', async () => {
    const engine = createEngine()
    await engine.init()

    await emitRenderToLogic(engine.getPipeline(), RenderToLogicEvents.FLOW_CONTROL_START_FAST_FORWARD_REQUEST, {})
    expect(engine.getFlowControlState().mode).toBe('fast-forward')

    await emitRenderToLogic(engine.getPipeline(), RenderToLogicEvents.FLOW_CONTROL_START_SKIP_REQUEST, {})
    expect(engine.getFlowControlState().mode).toBe('skip')

    await engine.showChoices([{ id: 'go', text: 'Go' }])
    expect(engine.getFlowControlState().mode).toBe('normal')
  })

  it('creates checkpoints, restores story points through jump, and cancels pending waits', async () => {
    const engine = createEngine()
    await engine.init()
    const hooks: string[] = []
    engine.use({
      name: 'jump-hooks',
      init() {},
      onBeforeJump: () => hooks.push('before'),
      onAfterJump: () => hooks.push('after'),
    })

    await engine.showDialogue({ text: 'First' })
    const checkpoint = await engine.createCheckpoint({
      id: 'line:first',
      kind: 'line',
      point: { chapterId: 'chapter-1', stepId: 'step-1', lineId: 'line-1' },
    })
    await engine.showDialogue({ text: 'Second' })
    await engine.showChoices([{ id: 'go', text: 'Go' }])

    let waitRegistered!: () => void
    const waitReady = new Promise<void>((resolve) => {
      waitRegistered = resolve
    })
    const waitingStep = engine.executeStep({
      uuid: 'wait-step',
      run: async (ctx) => {
        const wait = ctx.engine.waitFor(RenderToLogicEvents.USER_ADVANCE)
        waitRegistered()
        await wait
      },
    })
    await waitReady
    await engine.jumpTo(checkpoint.id, { reason: 'test' })

    await expect(waitingStep).resolves.toBeUndefined()
    expect(engine.getStoryPoint()).toEqual({ chapterId: 'chapter-1', stepId: 'step-1', lineId: 'line-1' })
    expect(engine.getViewState().dialogue.text).toBe('First')
    expect(engine.getViewState().choices).toEqual([])
    expect(engine.getCheckpoint('line:first')).toEqual(checkpoint)
    expect(hooks).toEqual(['before', 'after'])
  })

  it('stops the active dialogue sequence when jump aborts a pending wait', async () => {
    const engine = createEngine()
    await engine.init()

    await engine.showDialogue({ text: 'Checkpoint' })
    const checkpoint = await engine.createCheckpoint({
      id: 'line:checkpoint',
      kind: 'line',
      point: { stepId: 'checkpoint-step', lineId: 'line-1' },
    })
    const nextRun = vi.fn(async () => {
      await engine.showDialogue({ text: 'Should not run' })
    })
    let waitRegistered!: () => void
    const waitReady = new Promise<void>((resolve) => {
      waitRegistered = resolve
    })

    const activeDialogue = engine.dialogue([
      {
        uuid: 'waiting-step',
        run: async (ctx) => {
          const wait = ctx.engine.waitFor(RenderToLogicEvents.USER_ADVANCE)
          waitRegistered()
          await wait
        },
      },
      {
        uuid: 'after-wait',
        run: nextRun,
      },
    ])
    await waitReady
    await engine.jumpTo(checkpoint.id, { reason: 'test' })

    await expect(activeDialogue).resolves.toBeUndefined()
    expect(nextRun).not.toHaveBeenCalled()
    expect(engine.getStoryPoint()).toEqual({ stepId: 'checkpoint-step', lineId: 'line-1' })
    expect(engine.getViewState().dialogue.text).toBe('Checkpoint')
  })

  it('exposes save slot convenience APIs through engine state', async () => {
    const engine = createEngine()
    const hooks: string[] = []
    engine.use({
      name: 'load-hooks',
      init() {},
      onBeforeJump: ctx => hooks.push(`before:${ctx.jump?.options.reason}`),
      onAfterJump: ctx => hooks.push(`after:${ctx.jump?.options.reason}`),
    })
    await engine.init()
    await engine.setStoryPoint({ chapterId: 'chapter-1', stepId: 'step-1' })
    await engine.showChoices([{ id: 'saved-choice', text: 'Saved Choice' }])
    await engine.quickSave({ name: 'Checkpoint' })
    await engine.showDialogue({ text: 'Changed' })
    await engine.clearChoices()
    await engine.quickLoad()

    expect(engine.getStoryPoint()).toEqual({ chapterId: 'chapter-1', stepId: 'step-1' })
    expect(engine.getViewState().choices).toEqual([{ id: 'saved-choice', text: 'Saved Choice', enabled: true, metadata: undefined }])
    expect(hooks).toEqual(['before:quick-load', 'after:quick-load'])
    expect((await engine.listSaveSlots()).map(slot => slot.slotId)).toContain('quicksave')

    await engine.deleteSaveSlot('quicksave')
    expect((await engine.listSaveSlots()).map(slot => slot.slotId)).not.toContain('quicksave')
  })

  it('executes imported QuaScript factories through dialogue', async () => {
    const engine = new QuaEngine({
      assets: {
        adapter: createMemoryAdapter(),
      },
      store: {
        enableSnapshots: false,
      },
    })
    await engine.init()
    const run = vi.fn()

    await engine.dialogue(scope => [{
      uuid: `step-${String(scope?.scene)}`,
      run,
    }], { scene: 'intro' })

    expect(run).toHaveBeenCalledWith(expect.objectContaining({
      engine,
      stepId: 'step-intro',
    }))
    expect(engine.getCurrentStepId()).toBe('step-intro')
  })

  it('exposes background projection writes on the engine instance', async () => {
    const engine = createEngine()
    await engine.init()

    await engine.setBackgroundProjection({ mode: 'image', assetName: 'bg.png' })
    expect(engine.getViewState().background).toEqual({ mode: 'image', assetName: 'bg.png' })

    await engine.setBackgroundProjection(undefined)
    expect(engine.getViewState().background).toBeUndefined()
  })

  it('stores animation projections in the engine-owned view lane', async () => {
    const engine = createEngine()
    await engine.init()

    await engine.setAnimationProjection({
      id: 'animation:1',
      definitionId: 'enter',
      state: 'running',
      startedAt: 1000,
      duration: 480,
      playbackRate: 1,
      resolvedTracks: [{
        target: 'character:Alice',
        property: 'position.x',
        keyframes: [{ at: 0, value: -180 }],
      }],
    })

    const projected = engine.getViewState() as any
    projected.animations[0].resolvedTracks[0].keyframes[0].value = 999

    expect(engine.getViewState().animations[0].resolvedTracks[0].keyframes[0].value).toBe(-180)

    await engine.removeAnimationProjection('animation:1')
    expect(engine.getViewState().animations).toEqual([])

    await engine.setAnimationProjection({
      id: 'animation:2',
      state: 'running',
      startedAt: 1000,
      duration: 100,
      playbackRate: 1,
      resolvedTracks: [],
    })
    await engine.clearAnimationProjections()
    expect(engine.getViewState().animations).toEqual([])
  })

  it('keeps scene lifecycle history and plugin projection state in engine-owned state', async () => {
    const engine = createEngine()
    await engine.init()
    const first = createScene('first')
    const second = createScene('second')
    const sceneChanges: unknown[] = []
    onLogicToRender(engine.getPipeline(), LogicToRenderEvents.SCENE_CHANGE, payload => sceneChanges.push(payload))

    await engine.loadScene(first)
    await engine.loadScene(second, { type: 'fade', duration: 120, easing: 'ease-out' })
    await engine.setPluginProjection('audio', audioProjection({
      revision: 2,
      buses: {
        master: { gainDb: 0 },
        bgm: { gainDb: -12 },
        voice: { gainDb: 0 },
      },
    }))

    expect(engine.sceneManager.getSceneHistory()).toEqual(['first'])
    expect(sceneChanges).toEqual([
      { fromScene: undefined, toScene: 'first', transition: undefined },
      { fromScene: 'first', toScene: 'second', transition: { type: 'fade', duration: 120, easing: 'ease-out' } },
    ])
    expect(engine.getPluginProjection('audio')).toEqual(expect.objectContaining({
      revision: 2,
      buses: expect.objectContaining({ bgm: { gainDb: -12 } }),
    }))
  })

  it('can wait for renderer scene readiness before running a scene', async () => {
    const engine = createEngine()
    await engine.init()
    const events: string[] = []
    const scene = {
      name: 'waited',
      init: vi.fn(() => events.push('init')),
      run: vi.fn(() => events.push('run')),
      destroy: vi.fn(),
    }
    onLogicToRender(engine.getPipeline(), LogicToRenderEvents.SCENE_CHANGE, async (payload) => {
      events.push(`change:${payload.toScene}`)
      await emitRenderToLogic(engine.getPipeline(), RenderToLogicEvents.SCENE_READY, {
        sceneId: payload.toScene,
        timestamp: Date.now(),
      })
      events.push(`ready:${payload.toScene}`)
    })

    await engine.loadScene(scene, {
      type: 'fade',
      duration: 80,
      waitForRenderer: true,
      rendererReadyTimeout: 100,
    })

    expect(events).toEqual(['init', 'change:waited', 'ready:waited', 'run'])
  })

  it('routes GameManager load through engine load path and emits view updates', async () => {
    const engine = createEngine()
    await engine.init()
    const listener = vi.fn()
    onLogicToRender(engine.getPipeline(), LogicToRenderEvents.VIEW_UPDATE, listener)

    const store = engine.getStore()
    vi.spyOn(store, 'hasSlot').mockResolvedValue(true)
    vi.spyOn(store, 'loadFromSlot').mockResolvedValue(undefined)
    const loadFromSlot = vi.spyOn(engine, 'loadFromSlot')

    await engine.gameManager.loadGame('slot-1')

    expect(loadFromSlot).toHaveBeenCalledWith('slot-1', { force: true })
    expect(listener).toHaveBeenCalled()
  })

  it('forwards asset changes from runtime to renderer through pipeline', async () => {
    const adapter = createMemoryAdapter()
    const engine = new QuaEngine({
      assets: {
        adapter,
        provider: {
          mode: 'memory',
          getManifest: async () => ({ version: '1', assets: [] }),
          getAsset: async () => {
            throw new Error('unused')
          },
          watch(listener) {
            ;(adapter as any).__change = listener
            return () => {}
          },
        },
      },
    })
    const received: unknown[] = []
    onLogicToRender(engine.getPipeline(), LogicToRenderEvents.ASSET_CHANGED, payload => received.push(payload))

    await engine.init()
    const change = {
      type: 'changed' as const,
      assetId: 'dev-vfs:default:images:bg.png',
      timestamp: Date.now(),
    }
    ;(adapter as any).__change(change)
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(received).toEqual([change])
  })

  it('handles overlay intents through an engine plugin', async () => {
    const engine = createEngine()
    engine.use(new UiOverlayPlugin())
    await engine.init()

    await emitRenderToLogic(engine.getPipeline(), RenderToLogicEvents.UI_REQUEST_OPEN, { elementId: 'menu', config: { open: true } })
    await emitRenderToLogic(engine.getPipeline(), RenderToLogicEvents.UI_REQUEST_OPEN, { elementId: 'settings', config: { open: true } })

    expect(engine.getViewState().ui.overlays).toEqual({
      menu: { open: true },
      settings: { open: true },
    })

    await emitRenderToLogic(engine.getPipeline(), RenderToLogicEvents.UI_REQUEST_CLOSE, { elementId: 'menu' })
    await emitRenderToLogic(engine.getPipeline(), RenderToLogicEvents.UI_REQUEST_CLOSE, { elementId: 'settings' })

    expect(engine.getViewState().ui.overlays).toEqual({})
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
    name: 'engine-test-memory',
    storage: new MemoryAssetStorage(),
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

function createScene(name: string) {
  return {
    name,
    init: vi.fn(),
    run: vi.fn(),
    destroy: vi.fn(),
  }
}

function audioProjection(overrides: Record<string, unknown> = {}) {
  const base = {
    revision: 0,
    unlocked: false,
    buses: {
      master: { gainDb: 0 },
      bgm: { gainDb: 0 },
      voice: { gainDb: 0 },
      sfx: { gainDb: 0 },
      ambient: { gainDb: 0 },
    },
    voices: [],
    sfx: [],
    ambients: [],
  }
  return {
    ...base,
    ...overrides,
    buses: {
      ...base.buses,
      ...((overrides.buses as Record<string, unknown> | undefined) || {}),
    },
  }
}
