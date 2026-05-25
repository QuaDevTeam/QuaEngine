import type { AssetRuntimeAdapter, BundleManifest, RuntimePackageManifest } from '@quajs/assets'
import type { RendererPlugin } from '@quajs/render-core'
import type { EngineContext, EnginePlugin, StepContext } from '../src'
import type { RuntimePackageTrustContext } from '../src'
import { MemoryAssetStorage } from '@quajs/assets'
import {
  createNoopSavePreviewCaptureResponder,
  createTestSavePreviewCaptureResponder,
  emitRenderToLogic as emitRenderToLogicEvent,
  onRenderToLogic,
  RendererPluginHost,
} from '@quajs/render-core'
import { createStore, MemoryBackend } from '@quajs/store'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createViewLayoutProjection, emitRenderToLogic, LogicToRenderEvents, onLogicToRender, QuaEngine, RenderToLogicEvents, Scene, UiOverlayPlugin } from '../src'

class TrackingMemoryBackend extends MemoryBackend {
  static latest: TrackingMemoryBackend | undefined

  constructor() {
    super()
    TrackingMemoryBackend.latest = this
  }
}

class FailingSaveIndexBackend extends TrackingMemoryBackend {
  override async saveGameSlotIndex(slot: any): Promise<void> {
    await super.saveGameSlotIndex(slot)
    throw new Error('save slot index failed')
  }
}

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

  it('reports step errors through system error events before rejecting', async () => {
    const engine = createEngine()
    await engine.init()
    const errors: unknown[] = []
    onLogicToRender(engine.getPipeline(), LogicToRenderEvents.SYSTEM_ERROR, payload => errors.push(payload))

    await expect(engine.dialogue([{
      uuid: 'broken-step',
      run: async () => {
        throw new Error('broken step')
      },
    }])).rejects.toThrow('broken step')

    expect(errors).toEqual([expect.objectContaining({
      message: 'Step "broken-step" failed.',
      source: 'script',
      phase: 'step:run',
    })])
  })

  it('bridges renderer errors into engine-owned system error events', async () => {
    const engine = createEngine()
    await engine.init()
    const errors: unknown[] = []
    onLogicToRender(engine.getPipeline(), LogicToRenderEvents.SYSTEM_ERROR, payload => errors.push(payload))

    await emitRenderToLogic(engine.getPipeline(), RenderToLogicEvents.RENDER_ERROR, {
      message: 'Renderer layer failed',
      source: 'renderer',
      phase: 'vue-layer:render',
      rendererId: 'vue',
      error: { message: 'render exploded' },
    })

    expect(errors).toEqual([expect.objectContaining({
      message: 'Renderer layer failed',
      source: 'renderer',
      phase: 'vue-layer:render',
      metadata: expect.objectContaining({ rendererId: 'vue' }),
    })])
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

  it('keeps read-only skip package-aware for same-scene runtime continuations', async () => {
    vi.useFakeTimers()
    const engine = createEngine()
    await engine.init()

    const runRuntimeLine = (packageId: string) => {
      let waitReady!: () => void
      const ready = new Promise<void>((resolve) => {
        waitReady = resolve
      })
      let completed = false
      const active = engine.dialogue([{
        uuid: 'shared-scene-line',
        metadata: {
          point: {
            sceneId: 'shared-scene',
            contentPackageId: packageId,
            scriptModuleId: `${packageId}.scene`,
            scriptModuleVersion: '1.0.0',
          },
        },
        run: async (ctx) => {
          await ctx.engine.showDialogue({ text: packageId })
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

    const first = runRuntimeLine('runtime.same-scene.a')
    await first.ready
    await emitRenderToLogic(engine.getPipeline(), RenderToLogicEvents.USER_ADVANCE, { source: 'manual' })
    await first.active
    expect(first.completed()).toBe(true)

    await engine.hideDialogue()
    await engine.setFlowControlMode('skip')
    const second = runRuntimeLine('runtime.same-scene.b')
    await second.ready
    await vi.runOnlyPendingTimersAsync()

    expect(second.completed()).toBe(false)
    expect(engine.getFlowControlState().mode).toBe('normal')

    await emitRenderToLogic(engine.getPipeline(), RenderToLogicEvents.USER_ADVANCE, { source: 'manual' })
    await second.active
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

  it('records semantic renderer input commands without making them authoritative flow state', async () => {
    const engine = createEngine()
    await engine.init()
    const inputCommands: unknown[] = []
    engine.getPipeline().on(RenderToLogicEvents.USER_INPUT_COMMAND, context => inputCommands.push(context.event.payload))

    await emitRenderToLogic(engine.getPipeline(), RenderToLogicEvents.USER_INPUT_COMMAND, {
      command: 'skip:start',
      device: 'keyboard',
      source: 'keyboard:ControlLeft',
      pressed: true,
      timestamp: 1,
    })

    expect(inputCommands).toEqual([expect.objectContaining({ command: 'skip:start' })])
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

  it('resolves structured choice targets through engine-owned story target resolvers', async () => {
    const engine = createEngine()
    await engine.init()
    engine.registerStoryTargetResolver((target) => {
      if (target.kind !== 'node' || (target as any).id !== 'library') {
        return undefined
      }
      return {
        target,
        point: { sceneId: 'school', nodeId: 'library', stepId: 'library-step' },
        requiredRuntimePackages: ['runtime.library'],
      }
    })

    await engine.setStoryPoint({ sceneId: 'school', nodeId: 'start', stepId: 'start' })
    await engine.showChoices([{
      id: 'go-library',
      text: 'Go library',
      target: { kind: 'node', id: 'library', requiredRuntimePackages: ['runtime.library'] } as any,
    }])

    await expect(engine.jumpToChoice('go-library')).rejects.toThrow('Required runtime package "runtime.library" is not active')
  })

  it('enters registered scenes from explicit scene choice targets with initial state', async () => {
    const engine = createEngine()
    await engine.init()
    const received: unknown[] = []
    class DormScene extends Scene {
      readonly name = 'dorm'
      init(ctx?: any) { received.push(['init', ctx?.entry, ctx?.initialState]) }
      run(ctx?: any) { received.push(['run', ctx?.entry, ctx?.initialState]) }
    }
    engine.registerScene('dorm', () => new DormScene())
    await engine.setStoryPoint({
      storyId: 'main',
      chapterId: 'chapter-1',
      sceneId: 'library',
      nodeId: 'library.enter',
      labelId: 'old-label',
      stepId: 'library-step',
      contentPackageId: 'runtime.library',
      scriptModuleId: 'runtime.library.scene',
      scriptModuleVersion: '1.0.0',
    } as any)
    await engine.showChoices([{
      id: 'return-dorm',
      text: 'Return dorm',
      target: { kind: 'scene', sceneId: 'dorm', entry: 'nightReturn', state: { from: 'library' } } as any,
    }])

    await engine.jumpToChoice('return-dorm')

    expect(received).toEqual([
      ['init', 'nightReturn', { from: 'library' }],
      ['run', 'nightReturn', { from: 'library' }],
    ])
    expect(engine.getCurrentSceneName()).toBe('dorm')
    expect(engine.getStoryPoint()).toEqual(expect.objectContaining({
      storyId: 'main',
      chapterId: 'chapter-1',
      sceneId: 'dorm',
      entryId: 'nightReturn',
      stepId: 'nightReturn',
    }))
    expect(engine.getStoryPoint()).not.toEqual(expect.objectContaining({
      nodeId: 'library.enter',
      labelId: 'old-label',
      contentPackageId: 'runtime.library',
      scriptModuleId: 'runtime.library.scene',
      scriptModuleVersion: '1.0.0',
    }))
  })

  it('loads QPK scene factories through the runtime package registry before entering scene targets', async () => {
    const manifest = createRuntimeBundleManifest({
      id: 'runtime.dorm.scene',
      version: '1.0.0',
      scenes: [{ id: 'dorm', version: '1.0.0', assetName: 'dorm-scene.js', exportName: 'createScene' }],
    })
    const qpk = createQpkBundle(manifest, new Map([
      ['assets/scripts/dorm-scene.js', utf8('export function createScene() { return { name: "dorm", init() {}, run() {} } }')],
    ]))
    const received: unknown[] = []
    const resolveStoryTarget = vi.fn(async target => target.kind === 'scene' && target.sceneId === 'dorm' ? 'dorm-scene.qpk' : undefined)
    const loadSceneModule = vi.fn(async () => ({
      createScene: () => ({
        name: 'dorm',
        init: (ctx?: any) => received.push(['init', ctx?.entry, ctx?.initialState, ctx?.requiredRuntimePackages]),
        run: (ctx?: any) => received.push(['run', ctx?.entry, ctx?.initialState, ctx?.requiredRuntimePackages]),
      }),
    }))
    const engine = new QuaEngine({
      assets: {
        endpoint: 'https://cdn.example.com',
        adapter: createMemoryAdapter({
          'https://cdn.example.com/dorm-scene.qpk': qpk,
        }),
      },
      store: {
        storage: {
          backend: MemoryBackend,
        },
      },
      runtimePackageRegistry: {
        resolvePackage: vi.fn(async () => undefined),
        resolveStoryTarget,
      },
      runtimeModuleLoader: {
        loadSceneModule,
      },
      trustPolicy: {
        allowUnsignedInDevelopment: true,
      },
    })
    await engine.init()
    await engine.setStoryPoint({
      storyId: 'main',
      chapterId: 'chapter-1',
      sceneId: 'library',
      nodeId: 'library.enter',
      stepId: 'library-step',
      contentPackageId: 'runtime.library',
      scriptModuleId: 'runtime.library.scene',
    })
    await engine.showChoices([{
      id: 'return-dorm',
      text: 'Return dorm',
      target: {
        kind: 'scene',
        sceneId: 'dorm',
        entry: 'nightReturn',
        state: { from: 'library' },
        requiredRuntimePackages: ['runtime.dorm.scene'],
      } as any,
    }])

    await engine.jumpToChoice('return-dorm')

    expect(resolveStoryTarget).toHaveBeenCalledTimes(1)
    expect(resolveStoryTarget.mock.calls[0][0]).toEqual(expect.objectContaining({ kind: 'scene', sceneId: 'dorm' }))
    expect(resolveStoryTarget.mock.calls[0][1].currentPoint).toEqual(expect.objectContaining({ sceneId: 'library' }))
    expect(loadSceneModule).toHaveBeenCalledTimes(1)
    expect(loadSceneModule.mock.calls[0][0]).toEqual(expect.objectContaining({ id: 'dorm', assetName: 'dorm-scene.js' }))
    expect(loadSceneModule.mock.calls[0][1].package.id).toBe('runtime.dorm.scene')
    expect(engine.getRuntimePackages()).toEqual([expect.objectContaining({
      id: 'runtime.dorm.scene',
      state: 'active',
      sceneIds: ['dorm'],
    })])
    expect(received).toEqual([
      ['init', 'nightReturn', { from: 'library' }, ['runtime.dorm.scene']],
      ['run', 'nightReturn', { from: 'library' }, ['runtime.dorm.scene']],
    ])
    expect(engine.getCurrentSceneName()).toBe('dorm')
    expect(engine.getStoryPoint()).toEqual(expect.objectContaining({
      storyId: 'main',
      chapterId: 'chapter-1',
      sceneId: 'dorm',
      entryId: 'nightReturn',
      stepId: 'nightReturn',
    }))
    expect(engine.getStoryPoint()).not.toEqual(expect.objectContaining({
      contentPackageId: 'runtime.library',
      scriptModuleId: 'runtime.library.scene',
      nodeId: 'library.enter',
    }))

    await engine.unloadRuntimePackage('runtime.dorm.scene', { force: true })
    expect(engine.hasScene('dorm')).toBe(false)
    resolveStoryTarget.mockResolvedValue(undefined)
    await expect(engine.resolveStoryTarget({ kind: 'scene', sceneId: 'dorm', entry: 'nightReturn' } as any))
      .rejects.toThrow('Unable to resolve story target')
  })

  it('resolves story asset refs through engine-owned assets without creating renderer URLs', async () => {
    const manifest = createRuntimeBundleManifest({
      id: 'runtime.story.assets',
      version: '1.0.0',
    })
    manifest.assets.images = {
      'story/library.png': createImageAssetInfo('story/library.png'),
    }
    const qpk = createQpkBundle(manifest, new Map([
      ['assets/images/story/library.png', utf8('PNG')],
    ]))
    const engine = new QuaEngine({
      assets: {
        endpoint: 'https://cdn.example.com',
        adapter: createMemoryAdapter({
          'https://cdn.example.com/story-assets.qpk': qpk,
        }),
      },
      store: {
        storage: {
          backend: MemoryBackend,
        },
      },
      runtimePackageRegistry: {
        resolvePackage: vi.fn(packageId => packageId === 'runtime.story.assets' ? 'story-assets.qpk' : undefined),
      },
      trustPolicy: {
        allowUnsignedInDevelopment: true,
      },
    })
    await engine.init()

    const resolved = await engine.resolveStoryAssetRef({
      type: 'images',
      name: 'story/library.png',
      runtimePackageId: 'runtime.story.assets',
      alt: 'Library',
    })

    expect(new TextDecoder().decode(resolved.asset.data)).toBe('PNG')
    expect(resolved.asset.runtimePackageId).toBe('runtime.story.assets')
    expect(resolved.contentPackageId).toBe('runtime.story.assets')
    expect(resolved.requiredRuntimePackages).toEqual(['runtime.story.assets'])
    expect(resolved.ref).toEqual({
      type: 'images',
      name: 'story/library.png',
      runtimePackageId: 'runtime.story.assets',
      alt: 'Library',
    })
  })

  it('rolls back statements through silent replay and emits only the final projection', async () => {
    const engine = createEngine()
    await engine.init()

    await engine.dialogue([
      createDialogueStep('rollback-a', 'Alpha'),
      createDialogueStep('rollback-b', 'Beta'),
      createDialogueStep('rollback-c', 'Gamma'),
    ])

    const emitted: string[] = []
    const offDialogue = onLogicToRender(engine.getPipeline(), LogicToRenderEvents.DIALOGUE_SHOW, () => {
      emitted.push('dialogue')
    })
    const offScene = onLogicToRender(engine.getPipeline(), LogicToRenderEvents.SCENE_INIT, () => {
      emitted.push('scene')
    })
    const offView = onLogicToRender(engine.getPipeline(), LogicToRenderEvents.VIEW_UPDATE, () => {
      emitted.push('view')
    })

    await engine.rollback('rollback-a')

    offDialogue()
    offScene()
    offView()

    expect(engine.getStoryPoint()?.stepId).toBe('rollback-a')
    expect(engine.getViewState().dialogue.text).toBe('Alpha')
    expect(emitted).toEqual(['scene', 'view'])
  })

  it('records renderer input and reuses it during rollback replay', async () => {
    const engine = createEngine()
    await engine.init()
    let waitReady!: () => void
    const ready = new Promise<void>((resolve) => {
      waitReady = resolve
    })

    const active = engine.dialogue([
      {
        uuid: 'input-a',
        run: async (ctx) => {
          await ctx.engine.showDialogue({ text: 'Input A' })
          const wait = ctx.engine.waitFor(RenderToLogicEvents.USER_ADVANCE)
          waitReady()
          await wait
        },
      },
      createDialogueStep('input-b', 'Input B'),
    ])
    await ready
    await emitRenderToLogic(engine.getPipeline(), RenderToLogicEvents.USER_ADVANCE, { source: 'manual' })
    await active

    await engine.rollback('input-a')

    expect(engine.getStoryPoint()?.stepId).toBe('input-a')
    expect(engine.getViewState().dialogue.text).toBe('Input A')
  })

  it('rolls back to choices without consuming the recorded choice input', async () => {
    const engine = createEngine()
    await engine.init()
    let choiceReady!: () => void
    const ready = new Promise<void>((resolve) => {
      choiceReady = resolve
    })

    const active = engine.dialogue([
      {
        uuid: 'choice-anchor-step',
        run: async (ctx) => {
          await ctx.engine.showChoices([
            { id: 'left', text: 'Left' },
            { id: 'right', text: 'Right' },
          ])
          const wait = ctx.engine.waitFor(RenderToLogicEvents.USER_CHOICE_SELECT)
          choiceReady()
          await wait
          await ctx.engine.clearChoices()
        },
      },
      createDialogueStep('choice-after-step', 'After choice'),
    ])
    await ready
    await emitRenderToLogic(engine.getPipeline(), RenderToLogicEvents.USER_CHOICE_SELECT, { choiceId: 'left' })
    await active

    await engine.rollback('choice-anchor-step')

    expect(engine.getStoryPoint()?.stepId).toBe('choice-anchor-step')
    expect(engine.getViewState().choices).toEqual([
      { id: 'left', text: 'Left', enabled: true, metadata: undefined },
      { id: 'right', text: 'Right', enabled: true, metadata: undefined },
    ])
  })

  it('uses checkpoint density instead of LRU-style checkpoint truncation', async () => {
    const engine = new QuaEngine({
      assets: {
        adapter: createMemoryAdapter(),
      },
      store: {
        storage: {
          backend: MemoryBackend,
        },
      },
      rollback: {
        checkpoints: {
          interval: 50,
        },
      },
    })
    await engine.init()

    await engine.dialogue(Array.from({ length: 220 }, (_, index) =>
      createDialogueStep(`dense-${index + 1}`, `Line ${index + 1}`),
    ))

    const history = engine.getRuntimeStateSnapshot().checkpointHistory
    expect(history).toEqual(['dense-1', 'dense-51', 'dense-101', 'dense-151', 'dense-201'])
    expect(history.length).toBe(5)
  })

  it('keeps density anchors even when interval is not listed in mandatory anchor reasons', async () => {
    const engine = new QuaEngine({
      assets: {
        adapter: createMemoryAdapter(),
      },
      store: {
        storage: {
          backend: MemoryBackend,
        },
      },
      rollback: {
        checkpoints: {
          interval: 3,
          anchorOn: ['segment-start'],
        },
      },
    })
    await engine.init()

    await engine.dialogue(Array.from({ length: 8 }, (_, index) =>
      createDialogueStep(`density-required-${index + 1}`, `Line ${index + 1}`),
    ))

    expect(engine.getRuntimeStateSnapshot().checkpointHistory).toEqual([
      'density-required-1',
      'density-required-4',
      'density-required-7',
    ])
    await engine.rollback('density-required-3')
    expect(engine.getViewState().dialogue.text).toBe('Line 3')
  })

  it('keeps rollback inside scene boundaries by default and allows configured cross-scene rollback', async () => {
    const engine = createEngine()
    await engine.init()

    await engine.dialogue([
      createDialogueStep('scene-a-step', 'Scene A', { sceneId: 'scene-a' }),
      createDialogueStep('scene-b-step', 'Scene B', { sceneId: 'scene-b' }),
    ])

    expect(engine.getRollbackTargets().map(target => target.stepId)).not.toContain('scene-a-step')
    await expect(engine.rollback('scene-a-step')).rejects.toThrow('outside the current rollback boundary')

    const flexible = new QuaEngine({
      assets: {
        adapter: createMemoryAdapter(),
      },
      store: {
        storage: {
          backend: MemoryBackend,
        },
      },
      rollback: {
        boundary: {
          scene: 'allow',
        },
      },
    })
    await flexible.init()
    await flexible.dialogue([
      createDialogueStep('allow-scene-a-step', 'Scene A', { sceneId: 'scene-a' }),
      createDialogueStep('allow-scene-b-step', 'Scene B', { sceneId: 'scene-b' }),
    ])

    await flexible.rollback('allow-scene-a-step')
    expect(flexible.getViewState().dialogue.text).toBe('Scene A')
  })

  it('moves the rollback cursor segment after forced cross-boundary rollback', async () => {
    const engine = createEngine()
    await engine.init()

    await engine.setPluginProjection('protected-reference', { checkpointId: 'force-boundary-a' })
    await engine.dialogue([
      createDialogueStep('force-boundary-a', 'Scene A', { sceneId: 'force-scene-a' }),
      createDialogueStep('force-boundary-b', 'Scene B', { sceneId: 'force-scene-b' }),
    ])

    await engine.rollback('force-boundary-a', { force: true })

    expect(engine.canRollback()).toBe(false)
    await engine.dialogue([createDialogueStep('force-boundary-branch', 'Branch from A')])
    expect(engine.getRollbackTargets().map(target => target.stepId)).toEqual(['force-boundary-a'])
    expect(engine.canRollForward()).toBe(false)
  })

  it('rolls forward after rollback and truncates future on divergence', async () => {
    const engine = createEngine()
    await engine.init()

    await engine.dialogue([
      createDialogueStep('forward-a', 'Alpha'),
      createDialogueStep('forward-b', 'Beta'),
      createDialogueStep('forward-c', 'Gamma'),
    ])

    await engine.rollback('forward-a')
    expect(engine.canRollForward()).toBe(true)
    await engine.rollForward()
    expect(engine.getStoryPoint()?.stepId).toBe('forward-b')
    expect(engine.getViewState().dialogue.text).toBe('Beta')

    await engine.rollback('forward-a')
    await engine.dialogue([createDialogueStep('forward-branch', 'Branch')])
    expect(engine.canRollForward()).toBe(false)
    expect(engine.getRollbackTargets().map(target => target.stepId)).not.toContain('forward-c')
  })

  it('restores registered developer QuaStores together with engine state', async () => {
    const engine = createEngine()
    const devStore = createStore({
      name: `rollback-dev-${Date.now()}`,
      state: { value: 0 },
      mutations: {
        set(state, value: number) {
          state.value = value
        },
      },
      storage: {
        backend: MemoryBackend,
      },
    })
    engine.registerRollbackStore(devStore.getName(), devStore)
    await engine.init()

    await engine.dialogue([
      {
        uuid: 'store-a',
        run: async (ctx) => {
          devStore.commit('set', 1)
          await ctx.engine.showDialogue({ text: 'Store A' })
        },
      },
      {
        uuid: 'store-b',
        run: async (ctx) => {
          devStore.commit('set', 2)
          await ctx.engine.showDialogue({ text: 'Store B' })
        },
      },
    ])

    await engine.rollback('store-a')

    expect(devStore.state.value).toBe(1)
    expect(engine.getViewState().dialogue.text).toBe('Store A')
  })

  it('does not replay the current statement again when restoring an in-statement anchor', async () => {
    const engine = createEngine()
    const devStore = createStore({
      name: `rollback-anchor-dev-${Date.now()}`,
      state: { value: 0 },
      mutations: {
        add(state, value: number) {
          state.value += value
        },
      },
      storage: {
        backend: MemoryBackend,
      },
    })
    engine.registerRollbackStore(devStore.getName(), devStore)
    await engine.init()

    await engine.dialogue([
      {
        uuid: 'anchor-a',
        run: async (ctx) => {
          devStore.commit('add', 1)
          await ctx.engine.createRollbackAnchor('developer')
          await ctx.engine.showDialogue({ text: 'Anchor A' })
        },
      },
      {
        uuid: 'anchor-b',
        run: async (ctx) => {
          devStore.commit('add', 10)
          await ctx.engine.showDialogue({ text: 'Anchor B' })
        },
      },
    ])

    await engine.rollback('anchor-a')

    expect(devStore.state.value).toBe(1)
    expect(engine.getViewState().dialogue.text).toBe('Anchor A')
  })

  it('applies rollback boundaries immediately to the current statement', async () => {
    const engine = createEngine()
    await engine.init()

    await engine.dialogue([
      createDialogueStep('boundary-a', 'Before boundary'),
      {
        uuid: 'boundary-b',
        run: async (ctx) => {
          await ctx.engine.markRollbackBoundary('no-rollback')
          await ctx.engine.showDialogue({ text: 'Boundary' })
        },
      },
    ])

    expect(engine.canRollback()).toBe(false)

    await engine.dialogue([createDialogueStep('boundary-c', 'After boundary')])

    expect(engine.getRollbackTargets().map(target => target.stepId)).toEqual(['boundary-b'])
    await expect(engine.rollback('boundary-a')).rejects.toThrow('outside the current rollback boundary')
  })

  it('prunes checkpoint anchors from closed rollback segments without LRU limits', async () => {
    const engine = createEngine()
    await engine.init()

    await engine.dialogue([
      createDialogueStep('prune-scene-a-1', 'Scene A 1', { sceneId: 'prune-scene-a' }),
      createDialogueStep('prune-scene-a-2', 'Scene A 2', { sceneId: 'prune-scene-a' }),
      createDialogueStep('prune-scene-b-1', 'Scene B 1', { sceneId: 'prune-scene-b' }),
    ])

    expect(engine.getRuntimeStateSnapshot().checkpointHistory).toEqual(['prune-scene-b-1'])
    await expect(engine.rollback('prune-scene-a-1')).rejects.toThrow('outside the current rollback boundary')
  })

  it('replays recorded inputs through engine intent handlers during silent replay', async () => {
    const engine = createEngine()
    await engine.init()
    let waitReady!: () => void
    const ready = new Promise<void>((resolve) => {
      waitReady = resolve
    })

    const active = engine.dialogue([
      {
        uuid: 'advance-read',
        metadata: {
          point: { sceneId: 'read-scene', lineId: 'read-line' },
        },
        run: async (ctx) => {
          await ctx.engine.showDialogue({ text: 'Needs advance' })
          const wait = ctx.engine.waitFor(RenderToLogicEvents.USER_ADVANCE)
          waitReady()
          await wait
        },
      },
      createDialogueStep('after-advance-read', 'After'),
    ])
    await ready
    await emitRenderToLogic(engine.getPipeline(), RenderToLogicEvents.USER_ADVANCE, { source: 'manual' })
    await active

    const readKeysBeforeRollback = [...engine.getStore().state.engine.flowControlProgress.readKeys]
    expect(readKeysBeforeRollback.length).toBeGreaterThan(0)

    await engine.rollback('advance-read')

    expect(engine.getStore().state.engine.flowControlProgress.readKeys).toEqual(readKeysBeforeRollback)
  })

  it('saves and loads registered rollback stores with rollback history', async () => {
    const engine = createEngine()
    const devStore = createStore({
      name: `rollback-save-dev-${Date.now()}`,
      state: { value: 0 },
      mutations: {
        set(state, value: number) {
          state.value = value
        },
      },
      storage: {
        backend: MemoryBackend,
      },
    })
    engine.registerRollbackStore(devStore.getName(), devStore)
    await engine.init()

    await engine.dialogue([
      {
        uuid: 'save-store-a',
        run: async (ctx) => {
          devStore.commit('set', 1)
          await ctx.engine.showDialogue({ text: 'Save Store A' })
        },
      },
      {
        uuid: 'save-store-b',
        run: async (ctx) => {
          devStore.commit('set', 2)
          await ctx.engine.showDialogue({ text: 'Save Store B' })
        },
      },
    ])
    await engine.saveToSlot('rollback-store-slot')
    devStore.commit('set', 99)

    await engine.loadFromSlot('rollback-store-slot', { force: true })
    expect(devStore.state.value).toBe(2)

    await engine.rollback('save-store-a')
    expect(devStore.state.value).toBe(1)
  })

  it('hydrates rollback checkpoints from save data after load', async () => {
    const engine = createEngine()
    await engine.init()

    await engine.dialogue([
      createDialogueStep('load-rollback-a', 'Load A'),
      createDialogueStep('load-rollback-b', 'Load B'),
    ])
    await engine.saveToSlot('rollback-load-slot')
    await engine.dialogue([createDialogueStep('load-rollback-c', 'Load C')])

    await engine.loadFromSlot('rollback-load-slot', { force: true })

    expect(engine.getRuntimeStateSnapshot().checkpointHistory).toContain('load-rollback-a')
    await engine.rollback('load-rollback-a')
    expect(engine.getViewState().dialogue.text).toBe('Load A')
  })

  it('clears rollback journal when loading a save without rollback history', async () => {
    const engine = new QuaEngine({
      assets: {
        adapter: createMemoryAdapter(),
      },
      store: {
        storage: {
          backend: MemoryBackend,
        },
      },
      saves: {
        preview: {
          defaults: {
            mode: 'disabled',
          },
        },
      },
      rollback: {
        saves: {
          includeRollbackHistory: false,
        },
      },
    })
    await engine.init()

    await engine.dialogue([
      createDialogueStep('no-history-a', 'No History A'),
      createDialogueStep('no-history-b', 'No History B'),
    ])
    await engine.saveToSlot('no-rollback-history-slot')
    await engine.dialogue([createDialogueStep('no-history-c', 'No History C')])

    await engine.loadFromSlot('no-rollback-history-slot', { force: true })

    expect(engine.canRollback()).toBe(false)
    await expect(engine.rollback('no-history-a')).rejects.toThrow('Unable to resolve rollback target')
  })

  it('prevents divergence inside fixed rollback history', async () => {
    const engine = createEngine()
    await engine.init()

    await engine.dialogue([
      createDialogueStep('fixed-a', 'Fixed A'),
      createDialogueStep('fixed-b', 'Fixed B'),
    ])
    await engine.fixRollback()
    await engine.rollback('fixed-a')

    await expect(engine.dialogue([createDialogueStep('fixed-branch', 'Branch')]))
      .rejects.toThrow('Cannot diverge inside fixed rollback history')
    await engine.rollForward()
    await engine.dialogue([createDialogueStep('fixed-after', 'After fixed')])
    expect(engine.getViewState().dialogue.text).toBe('After fixed')
  })

  it('records runtime package dependencies on manual checkpoints from the current story point', async () => {
    const engine = createEngine()
    await engine.init()

    await engine.setStoryPoint({
      sceneId: 'runtime-scene',
      stepId: 'runtime-step',
      contentPackageId: 'runtime.story',
      scriptModuleId: 'runtime.story.scene',
    })

    const checkpoint = await engine.createCheckpoint({ id: 'manual-runtime', kind: 'manual' })

    expect(checkpoint.metadata?.requiredRuntimePackages).toEqual(['runtime.story'])
    expect(engine.getCheckpoint('manual-runtime')?.metadata?.requiredRuntimePackages).toEqual(['runtime.story'])
  })

  it('carries current step checkpoint runtime dependencies into later save checkpoints', async () => {
    const engine = createEngine()
    await engine.init()

    await engine.dialogue([{
      uuid: 'runtime-step-with-extra-deps',
      metadata: {
        point: {
          sceneId: 'runtime-scene',
          contentPackageId: 'runtime.story',
          scriptModuleId: 'runtime.story.scene',
        },
        requiredRuntimePackages: ['runtime.voice'],
      },
      run: async (ctx) => {
        await ctx.engine.showDialogue({ text: 'Runtime line' })
      },
    }])
    await engine.quickSave({ name: 'Runtime deps save' })

    expect(engine.getCheckpoint('runtime-step-with-extra-deps')?.metadata?.requiredRuntimePackages).toEqual([
      'runtime.voice',
      'runtime.story',
    ])
    expect(engine.getCheckpoint('save:quicksave')?.metadata?.requiredRuntimePackages).toEqual([
      'runtime.story',
      'runtime.voice',
    ])
    expect((await engine.listSaveSlots())[0].metadata.requiredRuntimePackages).toEqual([
      'runtime.story',
      'runtime.voice',
    ])
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

  it('stores provided save previews without renderer capture', async () => {
    const engine = createEngine()
    await engine.init()
    const previewDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

    await engine.saveToSlot('slot-provided-preview', { name: 'Provided Preview' }, {
      preview: {
        mode: 'provided',
        image: {
          kind: 'data-url',
          dataUrl: previewDataUrl,
          width: 1,
          height: 1,
          capturedAt: 123,
        },
      },
    })

    const slot = await engine.getStore().getSlot('slot-provided-preview')
    expect(slot?.index.previewStatus).toBe('ready')
    expect(slot?.index.preview).toEqual(expect.objectContaining({
      mimeType: 'image/png',
      width: 1,
      height: 1,
    }))
    await expect(engine.getStore().getSlotPreview('slot-provided-preview', { format: 'data-url' }))
      .resolves.toEqual(expect.objectContaining({
        kind: 'data-url',
        dataUrl: previewDataUrl,
      }))
  })

  it('stores JSON-safe preview policy summaries without renderer hints', async () => {
    const engine = createEngine()
    await engine.init()
    const previewDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

    await engine.saveToSlot('slot-policy-summary', { name: 'Policy Summary' }, {
      preview: {
        mode: 'provided',
        policy: {
          uiMode: 'custom',
          format: 'image/png',
          quality: 0.75,
          maxWidth: 320,
          timeoutMs: 250,
          rendererHints: {
            hiddenRoles: ['overlay'],
            hideSelectors: ['.debug'],
          },
        },
        image: {
          kind: 'data-url',
          dataUrl: previewDataUrl,
        },
      },
    })

    const slot = await engine.getStore().getSlot('slot-policy-summary')
    expect(slot?.index.preview?.policySummary).toEqual(expect.objectContaining({
      uiMode: 'custom',
      format: 'image/png',
      quality: 0.75,
      maxWidth: 320,
      timeoutMs: 250,
    }))
    expect(slot?.index.preview?.policySummary).not.toHaveProperty('rendererHints')
  })

  it('captures sync save previews through the test responder plugin', async () => {
    const engine = createPreviewEngine()
    await engine.init()
    const responder = await mountRendererPlugin(engine, createTestSavePreviewCaptureResponder({
      result: {
        mimeType: 'image/webp',
        image: {
          kind: 'bytes',
          bytes: new Uint8Array([1, 2, 3, 4]),
        },
        width: 64,
        height: 36,
        capturedAt: 456,
      },
    }))

    try {
      await engine.saveToSlot('slot-sync-preview')
    }
    finally {
      await responder.destroy()
    }

    const slot = await engine.getStore().getSlot('slot-sync-preview')
    expect(slot?.index.previewStatus).toBe('ready')
    expect(slot?.index.preview).toEqual(expect.objectContaining({
      mimeType: 'image/webp',
      width: 64,
      height: 36,
      byteLength: 4,
    }))
    await expect(engine.getStore().getSlotPreview('slot-sync-preview'))
      .resolves.toEqual(expect.objectContaining({
        kind: 'bytes',
        bytes: new Uint8Array([1, 2, 3, 4]),
      }))
  })

  it('commits sync saves without a preview when the noop responder reports a recoverable capture error', async () => {
    const engine = createPreviewEngine()
    await engine.init()
    const responder = await mountRendererPlugin(engine, createNoopSavePreviewCaptureResponder())

    try {
      await engine.saveToSlot('slot-noop-preview')
    }
    finally {
      await responder.destroy()
    }

    const slot = await engine.getStore().getSlot('slot-noop-preview')
    expect(slot?.index.previewStatus).toBe('none')
    expect(slot?.index.preview).toBeUndefined()
  })

  it('patches autosave previews asynchronously and discards stale capture results', async () => {
    const engine = createPreviewEngine({
      saves: {
        preview: {
          autoSave: {
            mode: 'renderer-capture',
            transaction: 'async-clone',
            policy: {
              timeoutMs: 100,
              format: 'image/webp',
            },
          },
        },
      },
    })
    await engine.init()
    const captureRequests: Array<{
      requestId: string
      saveOpId: string
      slotId: string
    }> = []
    const stopCaptureRequests = onLogicToRender(engine.getPipeline(), LogicToRenderEvents.SAVE_PREVIEW_CAPTURE_REQUEST, (payload) => {
      captureRequests.push({
        requestId: payload.requestId,
        saveOpId: payload.saveOpId,
        slotId: payload.slotId,
      })
    })

    try {
      await engine.autoSave({ name: 'Auto Save A' })
      expect((await engine.listSaveSlots())[0]).toEqual(expect.objectContaining({
        slotId: 'autosave',
        previewStatus: 'pending',
      }))
      const firstRequest = captureRequests.shift()
      expect(firstRequest).toBeDefined()

      await engine.autoSave({ name: 'Auto Save B' })
      const secondRequest = captureRequests.shift()
      expect(secondRequest).toBeDefined()

      await emitRenderToLogicEvent(engine.getPipeline(), RenderToLogicEvents.SAVE_PREVIEW_CAPTURE_RESULT, {
        requestId: firstRequest!.requestId,
        saveOpId: firstRequest!.saveOpId,
        slotId: firstRequest!.slotId,
        mimeType: 'image/webp',
        image: {
          kind: 'bytes',
          bytes: new Uint8Array([7, 7, 7]),
        },
        capturedAt: 100,
      })
      await flushAsyncPreviewWork()
      expect((await engine.listSaveSlots())[0]).toEqual(expect.objectContaining({
        slotId: 'autosave',
        previewStatus: 'pending',
      }))

      await emitRenderToLogicEvent(engine.getPipeline(), RenderToLogicEvents.SAVE_PREVIEW_CAPTURE_RESULT, {
        requestId: secondRequest!.requestId,
        saveOpId: secondRequest!.saveOpId,
        slotId: secondRequest!.slotId,
        mimeType: 'image/webp',
        image: {
          kind: 'bytes',
          bytes: new Uint8Array([9, 9, 9, 9]),
        },
        width: 96,
        height: 54,
        capturedAt: 200,
      })
      await waitForSlotPreviewStatus(engine, 'autosave', 'ready')

      const slot = await engine.getStore().getSlot('autosave')
      expect(slot?.index.previewStatus).toBe('ready')
      expect(slot?.index.preview).toEqual(expect.objectContaining({
        width: 96,
        height: 54,
        byteLength: 4,
      }))
      await expect(engine.getStore().getSlotPreview('autosave'))
        .resolves.toEqual(expect.objectContaining({
          kind: 'bytes',
          bytes: new Uint8Array([9, 9, 9, 9]),
        }))
    }
    finally {
      stopCaptureRequests()
    }
  })

  it('marks autosave previews as error when async capture times out', async () => {
    const engine = createPreviewEngine({
      saves: {
        preview: {
          autoSave: {
            mode: 'renderer-capture',
            transaction: 'async-clone',
            policy: {
              timeoutMs: 10,
              format: 'image/webp',
            },
          },
        },
      },
    })
    await engine.init()

    await engine.autoSave({ name: 'Timed Auto Save' })
    await new Promise(resolve => setTimeout(resolve, 30))

    expect((await engine.listSaveSlots())[0]).toEqual(expect.objectContaining({
      slotId: 'autosave',
      previewStatus: 'error',
    }))
  })

  it('restores the previous checkpoint state when checkpoint creation fails after a hook error', async () => {
    const engine = new QuaEngine({
      assets: {
        adapter: createMemoryAdapter(),
      },
      store: {
        storage: {
          backend: TrackingMemoryBackend,
        },
      },
      saves: {
        preview: {
          defaults: {
            mode: 'disabled',
          },
        },
      },
    })
    engine.use({
      name: 'failing-checkpoint-hook',
      async init() {},
      async onAfterCheckpoint(ctx: EngineContext) {
        if (ctx.checkpoint?.id === 'broken-checkpoint') {
          throw new Error('checkpoint hook failed')
        }
      },
    })
    await engine.init()

    await engine.createCheckpoint({ id: 'base-checkpoint', kind: 'manual' })
    await expect(engine.createCheckpoint({ id: 'broken-checkpoint', kind: 'manual' })).rejects.toThrow('checkpoint hook failed')

    expect(engine.getCheckpoint('base-checkpoint')).toEqual(expect.objectContaining({
      id: 'base-checkpoint',
    }))
    expect(engine.getCheckpoint('broken-checkpoint')).toBeUndefined()
    expect(engine.getRuntimeStateSnapshot().checkpointHistory).toEqual(['base-checkpoint'])
    expect(TrackingMemoryBackend.latest?.getSnapshotStorageSize()).toBe(1)
  })

  it('restores the previous save checkpoint when slot persistence fails', async () => {
    const engine = new QuaEngine({
      assets: {
        adapter: createMemoryAdapter(),
      },
      store: {
        storage: {
          backend: FailingSaveIndexBackend,
        },
      },
      saves: {
        preview: {
          defaults: {
            mode: 'disabled',
          },
        },
      },
    })
    await engine.init()

    await engine.createCheckpoint({ id: 'base-checkpoint', kind: 'manual' })
    await expect(engine.saveToSlot('failed-save', { name: 'Failed Save' })).rejects.toThrow('save slot index failed')

    expect(engine.getCheckpoint('base-checkpoint')).toEqual(expect.objectContaining({
      id: 'base-checkpoint',
    }))
    expect(engine.getCheckpoint('save:failed-save')).toBeUndefined()
    expect(engine.getRuntimeStateSnapshot().checkpointHistory).toEqual(['base-checkpoint'])
    expect(TrackingMemoryBackend.latest?.getSnapshotStorageSize()).toBe(1)
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

  it('loads runtime packages, applies migrations once, runs script modules, and reloads save dependencies through registry', async () => {
    const manifest = createRuntimeBundleManifest({
      id: 'runtime.story',
      version: '1.0.0',
      priority: 5,
      scripts: [{ id: 'runtime.story.scene', version: '1.0.0', assetName: 'scene.js' }],
      plugins: [
        { id: 'runtime.story.engine', kind: 'engine', version: '1.0.0', module: 'runtime-engine-plugin' },
        { id: 'runtime.story.renderer', kind: 'renderer', version: '1.0.0', assetName: 'renderer.js' },
      ],
      storeMigrations: [{ id: 'runtime.story.defaults', version: '1', scope: 'story', assetName: 'migrate.js' }],
      integrity: { hash: 'runtime-story-hash', algorithm: 'sha256' },
      signature: { value: 'signed' },
    })
    const qpk = createQpkBundle(manifest, new Map([
      ['assets/scripts/scene.js', utf8('export default function createQuaScript() {}')],
      ['assets/scripts/migrate.js', utf8('export default function migrate() {}')],
      ['assets/scripts/renderer.js', utf8('export default {}')],
    ]))
    const migration = vi.fn(async (ctx: any) => {
      await ctx.engine.setPluginProjection('runtimeDefaults', {
        packageId: ctx.package.id,
        migrated: true,
      })
    })
    const enginePluginInit = vi.fn()
    const enginePluginDestroy = vi.fn()
    const enginePluginHooks: string[] = []
    const rendererPluginEvents: unknown[] = []
    const engine = new QuaEngine({
      assets: {
        endpoint: 'https://cdn.example.com',
        adapter: createMemoryAdapter({
          'https://cdn.example.com/runtime-story.qpk': qpk,
        }, 'runtime-story-hash'),
      },
      store: {
        storage: {
          backend: MemoryBackend,
        },
      },
      saves: {
        preview: {
          defaults: {
            mode: 'disabled',
          },
        },
      },
      runtimePackageRegistry: {
        resolvePackage: vi.fn(packageId => packageId === 'runtime.story' ? 'runtime-story.qpk' : undefined),
      },
      runtimeModuleLoader: {
        loadScriptModule: vi.fn(async () => ({
          default: (scope?: { line?: string }) => [{
            uuid: 'runtime-step',
            run: async (ctx: any) => {
              await ctx.engine.showDialogue({ text: scope?.line || 'runtime line' })
            },
          }],
        })),
        loadStoreMigrationModule: vi.fn(async () => ({ default: migration })),
        loadEnginePluginModule: vi.fn(async () => ({
          default: {
            name: 'runtime-engine-plugin',
            init: enginePluginInit,
            destroy: enginePluginDestroy,
            onRuntimePackageActivate: async (ctx: any) => {
              enginePluginHooks.push(`activate:${ctx.runtimePackage?.package.id}`)
              await ctx.engine.showUI('runtime-activation-ui', { open: true })
            },
            onRuntimePackageUnload: (ctx: any) => enginePluginHooks.push(`unload:${ctx.runtimePackage?.package.id}`),
          },
        })),
      },
      trustPolicy: {
        requireSignature: true,
        verifyPackage: vi.fn(() => true),
      },
    })
    onLogicToRender(engine.getPipeline(), LogicToRenderEvents.RUNTIME_PACKAGE_PLUGIN, payload => rendererPluginEvents.push(payload))

    await engine.init()
    const state = await engine.loadRuntimePackage('runtime-story.qpk')
    await engine.runScriptModule('runtime.story.scene', { line: 'dynamic line' })
    await engine.quickSave({ name: 'Runtime save' })

    expect(state).toEqual(expect.objectContaining({ id: 'runtime.story', state: 'active', priority: 5 }))
    expect(engine.getRuntimePackages()).toEqual([expect.objectContaining({ id: 'runtime.story', state: 'active' })])
    expect(engine.getViewState().dialogue.text).toBe('dynamic line')
    expect(engine.getStoryPoint()).toEqual(expect.objectContaining({
      stepId: 'runtime-step',
      contentPackageId: 'runtime.story',
      scriptModuleId: 'runtime.story.scene',
      scriptModuleVersion: '1.0.0',
    }))
    expect(engine.getCheckpoint('runtime-step')?.metadata?.requiredRuntimePackages).toEqual(['runtime.story'])
    expect((await engine.listSaveSlots())[0].metadata.requiredRuntimePackages).toEqual(['runtime.story'])
    expect(engine.getPluginProjection('runtimeDefaults')).toEqual({
      contentPackageId: 'runtime.story',
      packageId: 'runtime.story',
      migrated: true,
    })
    expect(engine.getViewState().ui.overlays?.['runtime-activation-ui']).toEqual({
      contentPackageId: 'runtime.story',
      open: true,
    })
    expect(migration).toHaveBeenCalledTimes(1)
    expect(enginePluginInit).toHaveBeenCalledTimes(1)
    expect(enginePluginHooks).toContain('activate:runtime.story')
    expect(rendererPluginEvents).toEqual([expect.objectContaining({
      packageId: 'runtime.story',
      plugins: [expect.objectContaining({ id: 'runtime.story.renderer', kind: 'renderer' })],
    })])

    await expect(engine.unloadRuntimePackage('runtime.story')).rejects.toThrow('current story point')
    await engine.unloadRuntimePackage('runtime.story', { force: true })
    expect(enginePluginHooks).toContain('unload:runtime.story')
    expect(enginePluginDestroy).toHaveBeenCalledTimes(1)
    await engine.quickLoad()

    expect(engine.getRuntimePackages().find(pkg => pkg.id === 'runtime.story')).toEqual(expect.objectContaining({ state: 'active' }))
    expect(engine.getStoryPoint()).toEqual(expect.objectContaining({ contentPackageId: 'runtime.story' }))
    expect(migration).toHaveBeenCalledTimes(1)
    expect(enginePluginInit).toHaveBeenCalledTimes(2)
  })

  it('rejects runtime packages that require a newer game version and leaves no loaded package behind', async () => {
    const manifest = createRuntimeBundleManifest({
      id: 'runtime.future',
      version: '1.0.0',
      compatibility: { minGameVersion: '1.1.0' },
      scripts: [{ id: 'runtime.future.scene', version: '1.0.0', assetName: 'scene.js' }],
    })
    const qpk = createQpkBundle(manifest, new Map([
      ['assets/scripts/scene.js', utf8('export default function createQuaScript() {}')],
    ]))
    const engine = new QuaEngine({
      appVersion: '1.0.0',
      assets: {
        endpoint: 'https://cdn.example.com',
        adapter: createMemoryAdapter({
          'https://cdn.example.com/future.qpk': qpk,
        }),
      },
      store: {
        storage: {
          backend: MemoryBackend,
        },
      },
      trustPolicy: {
        allowUnsignedInDevelopment: true,
      },
    })
    await engine.init()

    await expect(engine.loadRuntimePackage('future.qpk')).rejects.toThrow('requires game version 1.1.0')
    expect(engine.getRuntimePackages()).toEqual([])
    await expect(engine.getAssets().getText('scripts', 'scene.js', { bundleName: 'runtime.future' })).rejects.toThrow('Asset not found')
  })

  it('loads runtime packages when the app version satisfies minGameVersion', async () => {
    const manifest = createRuntimeBundleManifest({
      id: 'runtime.compatible',
      version: '1.0.0',
      compatibility: { minGameVersion: '1.1.0' },
      scripts: [{ id: 'runtime.compatible.scene', version: '1.0.0', assetName: 'scene.js' }],
    })
    const qpk = createQpkBundle(manifest, new Map([
      ['assets/scripts/scene.js', utf8('export default function createQuaScript() {}')],
    ]))
    const engine = new QuaEngine({
      appVersion: '1.1.0',
      assets: {
        endpoint: 'https://cdn.example.com',
        adapter: createMemoryAdapter({
          'https://cdn.example.com/compatible.qpk': qpk,
        }),
      },
      store: {
        storage: {
          backend: MemoryBackend,
        },
      },
      trustPolicy: {
        allowUnsignedInDevelopment: true,
      },
    })
    await engine.init()

    await expect(engine.loadRuntimePackage('compatible.qpk', { activate: false })).resolves.toEqual(expect.objectContaining({
      id: 'runtime.compatible',
      state: 'loaded',
      compatibility: { minGameVersion: '1.1.0' },
    }))
  })

  it('rejects duplicate runtime package loads without unloading the existing mounted bundle', async () => {
    const manifest = createRuntimeBundleManifest({
      id: 'runtime.duplicate',
      version: '1.0.0',
      scripts: [{ id: 'runtime.duplicate.scene', version: '1.0.0', assetName: 'scene.js' }],
    })
    const qpk = createQpkBundle(manifest, new Map([
      ['assets/scripts/scene.js', utf8('export default function createQuaScript() {}')],
    ]))
    const engine = new QuaEngine({
      assets: {
        endpoint: 'https://cdn.example.com',
        adapter: createMemoryAdapter({
          'https://cdn.example.com/duplicate.qpk': qpk,
        }),
      },
      store: {
        storage: {
          backend: MemoryBackend,
        },
      },
      trustPolicy: {
        allowUnsignedInDevelopment: true,
      },
    })
    await engine.init()

    await engine.loadRuntimePackage('duplicate.qpk', { activate: false })
    await expect(engine.loadRuntimePackage('duplicate.qpk', { activate: false })).rejects.toThrow('already loaded')

    expect(engine.getRuntimePackages()).toEqual([expect.objectContaining({
      id: 'runtime.duplicate',
      state: 'loaded',
    })])
    await expect(engine.getAssets().getText('scripts', 'scene.js', { bundleName: 'runtime.duplicate' })).resolves.toContain('createQuaScript')
  })

  it('resolves runtime script locale variants and caches modules by fallback locale', async () => {
    const manifest = createRuntimeBundleManifest({
      id: 'runtime.locale',
      version: '1.0.0',
      scripts: [{
        id: 'runtime.locale.scene',
        version: '1.0.0',
        assetName: 'scene.js',
        variants: {
          zh: {
            assetName: 'scene.zh.js',
            version: '1.0.0-zh',
          },
          'en-US': {
            assetName: 'scene.en-us.js',
            version: '1.0.0-en',
          },
        },
      }],
    })
    const qpk = createQpkBundle(manifest, new Map([
      ['assets/scripts/scene.js', utf8('export default function createQuaScript() {}')],
      ['assets/scripts/scene.zh.js', utf8('export default function createQuaScript() {}')],
      ['assets/scripts/scene.en-us.js', utf8('export default function createQuaScript() {}')],
    ]))
    const loadCalls: Array<{ assetName: string, locale?: string, version?: string }> = []
    const engine = new QuaEngine({
      assets: {
        endpoint: 'https://cdn.example.com',
        adapter: createMemoryAdapter({
          'https://cdn.example.com/locale.qpk': qpk,
        }),
        locale: 'zh-CN',
      },
      store: {
        storage: {
          backend: MemoryBackend,
        },
      },
      runtimeModuleLoader: {
        loadScriptModule: vi.fn(async (record, ctx) => {
          loadCalls.push({
            assetName: record.assetName,
            locale: ctx.locale,
            version: record.version,
          })
          return {
            default: () => [{
              uuid: `locale-step-${ctx.locale}`,
              run: async (stepCtx: any) => {
                await stepCtx.engine.showDialogue({
                  text: `${ctx.locale}:${record.assetName}:${record.version}`,
                })
              },
            }],
          }
        }),
      },
      trustPolicy: {
        allowUnsignedInDevelopment: true,
      },
    })

    await engine.init()
    await engine.loadRuntimePackage('locale.qpk')
    await engine.runScriptModule('runtime.locale.scene')
    await engine.runScriptModule('runtime.locale.scene')
    engine.getAssets().setLocale('zh-HK')
    await engine.runScriptModule('runtime.locale.scene')
    engine.getAssets().setLocale('ja-JP')
    await engine.runScriptModule('runtime.locale.scene')
    await engine.runScriptModule('runtime.locale.scene', undefined, { locale: 'en-US' })

    expect(loadCalls).toEqual([
      { assetName: 'scene.zh.js', locale: 'zh', version: '1.0.0-zh' },
      { assetName: 'scene.js', locale: 'default', version: '1.0.0' },
      { assetName: 'scene.en-us.js', locale: 'en-us', version: '1.0.0-en' },
    ])
    expect(engine.getViewState().dialogue.text).toBe('en-us:scene.en-us.js:1.0.0-en')
    expect(engine.getStoryPoint()).toEqual(expect.objectContaining({
      contentPackageId: 'runtime.locale',
      scriptModuleLocale: 'en-us',
      scriptModuleVersion: '1.0.0-en',
    }))
  })

  it('loads deferred locale packs through the registry and merges script variants into the base module', async () => {
    const baseManifest = createRuntimeBundleManifest({
      id: 'runtime.base',
      version: '1.0.0',
      scripts: [{
        id: 'runtime.base.scene',
        version: '1.0.0',
        assetName: 'scene.js',
      }],
    })
    const localeManifest = createRuntimeBundleManifest({
      id: 'runtime.base.locale.zh-cn',
      version: '1.0.0',
      dependencies: ['runtime.base'],
      localePack: {
        locale: 'zh-cn',
        targets: [{ kind: 'runtimePackage', id: 'runtime.base' }],
        resourceTypes: ['scripts'],
      },
      scripts: [{
        id: 'runtime.base.scene',
        version: '1.0.0-zh',
        assetName: 'scene.zh-cn.js',
      }],
    })
    baseManifest.assets.data = {
      'i18n/messages.json': createDataAssetInfo('i18n/messages.json'),
    }
    localeManifest.locales = ['zh-cn']
    localeManifest.defaultLocale = 'zh-cn'
    localeManifest.assets.data = {
      'i18n/messages.json': createDataAssetInfo('i18n/messages.json', ['zh-cn']),
    }
    const loadCalls: Array<{ packageId: string, assetName: string, locale?: string, version?: string }> = []
    const engine = new QuaEngine({
      assets: {
        endpoint: 'https://cdn.example.com',
        adapter: createMemoryAdapter({
          'https://cdn.example.com/base.qpk': createQpkBundle(baseManifest, new Map([
            ['assets/scripts/scene.js', utf8('export default function createQuaScript() {}')],
            ['assets/data/i18n/messages.json', utf8('{"runtime.greeting":"Base hello"}')],
          ])),
          'https://cdn.example.com/locale.qpk': createQpkBundle(localeManifest, new Map([
            ['assets/scripts/scene.zh-cn.js', utf8('export default function createQuaScript() {}')],
            ['assets/data/i18n/messages.json', utf8('{"runtime.greeting":"本地化你好"}')],
          ])),
        }),
        locale: 'default',
      },
      store: {
        storage: {
          backend: MemoryBackend,
        },
      },
      runtimePackageRegistry: {
        resolvePackage: vi.fn(async () => undefined),
        resolveLocalePacks: vi.fn(async locale => locale === 'zh-cn' ? [{ source: 'locale.qpk' }] : []),
      },
      runtimeModuleLoader: {
        loadScriptModule: vi.fn(async (record, ctx) => {
          loadCalls.push({
            packageId: ctx.package.id,
            assetName: record.assetName,
            locale: ctx.locale,
            version: record.version,
          })
          return {
            default: () => [{
              uuid: 'base-step',
              run: async (stepCtx: StepContext) => {
                await stepCtx.engine.showDialogue({
                  text: `${ctx.package.id}:${ctx.locale}:${record.assetName}:${record.version}:${await stepCtx.t('runtime.greeting')}`,
                })
              },
            }],
          }
        }),
      },
      trustPolicy: {
        allowUnsignedInDevelopment: true,
      },
    })

    await engine.init()
    await engine.loadRuntimePackage('base.qpk')
    await engine.setLocale('zh-CN', { ensurePacks: true, targetPackageIds: ['runtime.base'] })
    await engine.runScriptModule('runtime.base.scene')

    expect(loadCalls).toEqual([{
      packageId: 'runtime.base.locale.zh-cn',
      assetName: 'scene.zh-cn.js',
      locale: 'zh-cn',
      version: '1.0.0-zh',
    }])
    expect(engine.getLocale()).toBe('zh-cn')
    expect(engine.getRuntimeStateSnapshot().activeLocalePackIds).toEqual(['runtime.base.locale.zh-cn'])
    expect(engine.getViewState().dialogue.text).toBe('runtime.base.locale.zh-cn:zh-cn:scene.zh-cn.js:1.0.0-zh:本地化你好')
    expect(engine.getStoryPoint()).toEqual(expect.objectContaining({
      contentPackageId: 'runtime.base',
      scriptModuleLocale: 'zh-cn',
      scriptModuleVersion: '1.0.0-zh',
    }))
    expect(engine.getCheckpoint('base-step')?.metadata?.requiredRuntimePackages).toEqual([
      'runtime.base',
      'runtime.base.locale.zh-cn',
    ])
    await expect(engine.unloadRuntimePackage('runtime.base.locale.zh-cn')).rejects.toThrow('current locale')
    await engine.unloadRuntimePackage('runtime.base.locale.zh-cn', { force: true })
    expect(engine.getRuntimeStateSnapshot().activeLocalePackIds).toEqual([])
  })

  it('notifies renderer runtime unload before removing dynamic bundle assets', async () => {
    const manifest = createRuntimeBundleManifest({
      id: 'runtime.unload-order',
      version: '1.0.0',
      plugins: [
        { id: 'runtime.unload-order.renderer', kind: 'renderer', assetName: 'renderer.js' },
      ],
    })
    const qpk = createQpkBundle(manifest, new Map([
      ['assets/scripts/renderer.js', utf8('export default {}')],
    ]))
    const engine = new QuaEngine({
      assets: {
        endpoint: 'https://cdn.example.com',
        adapter: createMemoryAdapter({
          'https://cdn.example.com/unload-order.qpk': qpk,
        }),
      },
      store: {
        storage: {
          backend: MemoryBackend,
        },
      },
      trustPolicy: {
        allowUnsignedInDevelopment: true,
      },
    })
    const eventOrder: string[] = []
    onLogicToRender(engine.getPipeline(), LogicToRenderEvents.RUNTIME_PACKAGE_UNLOAD, () => eventOrder.push('runtime-unload'))
    onLogicToRender(engine.getPipeline(), LogicToRenderEvents.ASSET_CHANGED, (payload) => {
      if (payload.type === 'removed') {
        eventOrder.push('asset-removed')
      }
    })

    await engine.init()
    await engine.loadRuntimePackage('unload-order.qpk')
    await engine.unloadRuntimePackage('runtime.unload-order', { force: true })
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(eventOrder[0]).toBe('runtime-unload')
    expect(eventOrder).toContain('asset-removed')
  })

  it('continues the same scene across different runtime QPK script modules', async () => {
    const manifestA = createRuntimeBundleManifest({
      id: 'runtime.scene.a',
      version: '1.0.0',
      scripts: [{ id: 'runtime.scene.a.module', version: '1.0.0', assetName: 'a.js' }],
    })
    const manifestB = createRuntimeBundleManifest({
      id: 'runtime.scene.b',
      version: '1.0.0',
      scripts: [{ id: 'runtime.scene.b.module', version: '1.0.0', assetName: 'b.js' }],
    })
    const engine = new QuaEngine({
      assets: {
        endpoint: 'https://cdn.example.com',
        adapter: createMemoryAdapter({
          'https://cdn.example.com/a.qpk': createQpkBundle(manifestA, new Map([
            ['assets/scripts/a.js', utf8('export default function a() { return [] }')],
          ])),
          'https://cdn.example.com/b.qpk': createQpkBundle(manifestB, new Map([
            ['assets/scripts/b.js', utf8('export default function b() { return [] }')],
          ])),
        }),
      },
      store: {
        storage: {
          backend: MemoryBackend,
        },
      },
      saves: {
        preview: {
          defaults: {
            mode: 'disabled',
          },
        },
      },
      runtimePackageRegistry: {
        resolvePackage: vi.fn(packageId => packageId === 'runtime.scene.b' ? 'b.qpk' : undefined),
      },
      runtimeModuleLoader: {
        loadScriptModule: vi.fn(async (record) => ({
          default: () => [{
            uuid: `qs:${record.id}:line-1`,
            metadata: {
              point: {
                storyId: 'story.main',
                sceneId: 'shared-scene',
                timelineId: 'main',
                nodeId: `${record.packageId}:node`,
              },
            },
            run: async (ctx: any) => {
              await ctx.engine.showDialogue({ text: record.packageId })
            },
          }],
        })),
      },
      trustPolicy: {
        allowUnsignedInDevelopment: true,
      },
    })
    await engine.init()

    await engine.loadRuntimePackage('a.qpk')
    await engine.loadRuntimePackage('b.qpk')
    await engine.runScriptModule('runtime.scene.a.module')
    await engine.runScriptModule('runtime.scene.b.module')
    await engine.quickSave({ name: 'Same scene runtime continuation' })

    expect(engine.getStoryPoint()).toEqual(expect.objectContaining({
      storyId: 'story.main',
      sceneId: 'shared-scene',
      timelineId: 'main',
      nodeId: 'runtime.scene.b:node',
      contentPackageId: 'runtime.scene.b',
      scriptModuleId: 'runtime.scene.b.module',
    }))
    expect((await engine.listSaveSlots())[0].metadata.requiredRuntimePackages).toEqual([
      'runtime.scene.b',
      'runtime.scene.a',
    ])

    await engine.unloadRuntimePackage('runtime.scene.b', { force: true })
    await engine.quickLoad()

    expect(engine.getRuntimePackages().find(pkg => pkg.id === 'runtime.scene.b')).toEqual(expect.objectContaining({
      state: 'active',
    }))
    expect(engine.getStoryPoint()).toEqual(expect.objectContaining({
      sceneId: 'shared-scene',
      contentPackageId: 'runtime.scene.b',
    }))
  })

  it('keeps active view dependencies when same-scene runtime packages apply visual diffs', async () => {
    const manifestA = createRuntimeBundleManifest({
      id: 'runtime.scene.visual.a',
      version: '1.0.0',
      scripts: [{ id: 'runtime.scene.visual.a.module', version: '1.0.0', assetName: 'a.js' }],
    })
    const manifestB = createRuntimeBundleManifest({
      id: 'runtime.scene.visual.b',
      version: '1.0.0',
      scripts: [{ id: 'runtime.scene.visual.b.module', version: '1.0.0', assetName: 'b.js' }],
    })
    const engine = new QuaEngine({
      assets: {
        endpoint: 'https://cdn.example.com',
        adapter: createMemoryAdapter({
          'https://cdn.example.com/visual-a.qpk': createQpkBundle(manifestA, new Map([
            ['assets/scripts/a.js', utf8('export default function a() { return [] }')],
          ])),
          'https://cdn.example.com/visual-b.qpk': createQpkBundle(manifestB, new Map([
            ['assets/scripts/b.js', utf8('export default function b() { return [] }')],
          ])),
        }),
      },
      store: {
        storage: {
          backend: MemoryBackend,
        },
      },
      saves: {
        preview: {
          defaults: {
            mode: 'disabled',
          },
        },
      },
      runtimeModuleLoader: {
        loadScriptModule: vi.fn(async (record) => ({
          default: () => [{
            uuid: `qs:${record.id}:line-1`,
            metadata: {
              point: {
                storyId: 'story.main',
                sceneId: 'shared-scene',
                timelineId: 'main',
              },
            },
            run: async (ctx: any) => {
              if (record.packageId === 'runtime.scene.visual.a') {
                await ctx.engine.showCharacter({ id: 'Alice', name: 'Alice', sprite: 'alice/base.png' })
                await ctx.engine.setBackgroundProjection({
                  mode: 'layered',
                  layers: [{ id: 'base', assetName: 'bg/base.png' }],
                })
              }
              else {
                await ctx.engine.setCharacterExpression('Alice', 'happy')
                const current = ctx.engine.getViewState().background
                await ctx.engine.setBackgroundProjection({
                  ...current,
                  mode: 'layered',
                  layers: [
                    ...(current?.layers || []),
                    { id: 'lighting', assetName: 'bg/lighting.png' },
                  ],
                })
              }
            },
          }],
        })),
      },
      trustPolicy: {
        allowUnsignedInDevelopment: true,
      },
    })
    await engine.init()

    await engine.loadRuntimePackage('visual-a.qpk')
    await engine.loadRuntimePackage('visual-b.qpk')
    await engine.runScriptModule('runtime.scene.visual.a.module')
    await engine.runScriptModule('runtime.scene.visual.b.module')
    await engine.quickSave({ name: 'Visual continuation' })

    expect(engine.getViewState().characters[0]).toEqual(expect.objectContaining({
      id: 'Alice',
      sprite: 'alice/base.png',
      expression: 'happy',
      metadata: {
        contentPackageId: 'runtime.scene.visual.a',
        requiredRuntimePackages: ['runtime.scene.visual.a', 'runtime.scene.visual.b'],
      },
    }))
    expect(engine.getViewState().background).toEqual(expect.objectContaining({
      mode: 'layered',
      metadata: {
        contentPackageId: 'runtime.scene.visual.a',
        requiredRuntimePackages: ['runtime.scene.visual.a', 'runtime.scene.visual.b'],
      },
      layers: [
        expect.objectContaining({
          id: 'base',
          metadata: { contentPackageId: 'runtime.scene.visual.a' },
        }),
        expect.objectContaining({
          id: 'lighting',
          metadata: { contentPackageId: 'runtime.scene.visual.b' },
        }),
      ],
    }))
    expect(engine.getCheckpoint('qs:runtime.scene.visual.b.module:line-1')?.metadata?.requiredRuntimePackages).toEqual([
      'runtime.scene.visual.b',
      'runtime.scene.visual.a',
    ])
    expect((await engine.listSaveSlots())[0].metadata.requiredRuntimePackages).toEqual([
      'runtime.scene.visual.b',
      'runtime.scene.visual.a',
    ])
    await expect(engine.unloadRuntimePackage('runtime.scene.visual.a')).rejects.toThrow('current view projection')
  })

  it('tags and clears core view projections produced by runtime package scripts', async () => {
    const manifest = createRuntimeBundleManifest({
      id: 'runtime.view',
      version: '1.0.0',
      scripts: [{ id: 'runtime.view.module', version: '1.0.0', assetName: 'view.js' }],
    })
    const engine = new QuaEngine({
      assets: {
        endpoint: 'https://cdn.example.com',
        adapter: createMemoryAdapter({
          'https://cdn.example.com/view.qpk': createQpkBundle(manifest, new Map([
            ['assets/scripts/view.js', utf8('export default function view() { return [] }')],
          ])),
        }),
      },
      store: {
        storage: {
          backend: MemoryBackend,
        },
      },
      saves: {
        preview: {
          defaults: {
            mode: 'disabled',
          },
        },
      },
      runtimeModuleLoader: {
        loadScriptModule: vi.fn(async () => ({
          default: () => [{
            uuid: 'runtime-view-step',
            run: async (ctx: any) => {
              await ctx.engine.showCharacter({ id: 'RuntimeHero', sprite: 'hero/base.png' })
              await ctx.engine.showDialogue({ text: 'Runtime dialogue' })
              await ctx.engine.setBackgroundProjection({ mode: 'image', assetName: 'runtime-bg.png' })
              await ctx.engine.showChoices([{ id: 'runtime-choice', text: 'Runtime Choice' }])
              await ctx.engine.applyEffect({ id: 'runtime-flash', type: 'flash' })
              await ctx.engine.showUI('runtime-panel', { open: true })
              await ctx.engine.setPluginProjection('runtime-custom-view', {
                contentPackageId: 'runtime.view',
                value: true,
              })
            },
          }],
        })),
      },
      trustPolicy: {
        allowUnsignedInDevelopment: true,
      },
    })
    await engine.init()
    await engine.loadRuntimePackage('view.qpk')
    await engine.runScriptModule('runtime.view.module')

    expect(engine.getViewState().characters[0].metadata).toEqual({ contentPackageId: 'runtime.view' })
    expect(engine.getViewState().dialogue).toEqual(expect.objectContaining({
      visible: true,
      text: 'Runtime dialogue',
      metadata: { contentPackageId: 'runtime.view' },
    }))
    expect(engine.getViewState().background?.metadata).toEqual({ contentPackageId: 'runtime.view' })
    expect(engine.getViewState().choices[0].metadata).toEqual({ contentPackageId: 'runtime.view' })
    expect(engine.getViewState().effects[0].options).toEqual({ contentPackageId: 'runtime.view' })
    expect(engine.getViewState().ui.overlays?.['runtime-panel']).toEqual({ open: true, contentPackageId: 'runtime.view' })
    expect(engine.getPluginProjection('runtime-custom-view')).toEqual({ contentPackageId: 'runtime.view', value: true })

    await engine.quickSave({ name: 'Runtime view deps' })
    expect((await engine.listSaveSlots())[0].metadata.requiredRuntimePackages).toEqual(['runtime.view'])

    await engine.setStoryPoint({ sceneId: 'base-scene', stepId: 'base-step' })
    await engine.createCheckpoint({ id: 'base-checkpoint', kind: 'manual' })
    await expect(engine.unloadRuntimePackage('runtime.view')).rejects.toThrow('current view projection')
    await engine.unloadRuntimePackage('runtime.view', { force: true })

    expect(engine.getViewState().characters).toEqual([])
    expect(engine.getViewState().dialogue).toEqual({ visible: false, text: '' })
    expect(engine.getViewState().background).toBeUndefined()
    expect(engine.getViewState().choices).toEqual([])
    expect(engine.getViewState().effects).toEqual([])
    expect(engine.getViewState().ui.overlays).toEqual({})
    expect(engine.getPluginProjection('runtime-custom-view')).toBeUndefined()
  })

  it('does not block plugin unload hooks for package-scoped registries', async () => {
    const manifest = createRuntimeBundleManifest({
      id: 'runtime.registry',
      version: '1.0.0',
    })
    const engine = new QuaEngine({
      assets: {
        endpoint: 'https://cdn.example.com',
        adapter: createMemoryAdapter({
          'https://cdn.example.com/registry.qpk': createQpkBundle(manifest, new Map()),
        }),
      },
      store: {
        storage: {
          backend: MemoryBackend,
        },
      },
      trustPolicy: {
        allowUnsignedInDevelopment: true,
      },
    })
    await engine.init()
    engine.use(createRegistryProjectionPlugin())
    await engine.loadRuntimePackage('registry.qpk')
    await engine.setPluginProjection('runtime-registry', {
      revision: 1,
      entries: [{ id: 'font-face', contentPackageId: 'runtime.registry' }],
    })

    expect(engine.getRuntimeViewRequiredPackageIds()).toEqual([])
    await engine.unloadRuntimePackage('runtime.registry')

    expect(engine.getPluginProjection('runtime-registry')).toEqual({ revision: 2, entries: [] })
  })

  it('keeps top-level plugin projections as active unload blockers', async () => {
    const manifest = createRuntimeBundleManifest({
      id: 'runtime.plugin-view',
      version: '1.0.0',
    })
    const engine = new QuaEngine({
      assets: {
        endpoint: 'https://cdn.example.com',
        adapter: createMemoryAdapter({
          'https://cdn.example.com/plugin-view.qpk': createQpkBundle(manifest, new Map()),
        }),
      },
      store: {
        storage: {
          backend: MemoryBackend,
        },
      },
      trustPolicy: {
        allowUnsignedInDevelopment: true,
      },
    })
    await engine.init()
    await engine.loadRuntimePackage('plugin-view.qpk')
    await engine.setPluginProjection('runtime-active-plugin-view', {
      contentPackageId: 'runtime.plugin-view',
      value: true,
    })

    expect(engine.getRuntimeViewRequiredPackageIds()).toEqual(['runtime.plugin-view'])
    await expect(engine.unloadRuntimePackage('runtime.plugin-view')).rejects.toThrow('current view projection')
  })

  it('rejects runtime packages that fail the configured trust policy', async () => {
    const manifest = createRuntimeBundleManifest({
      id: 'runtime.unsigned',
      version: '1.0.0',
      scripts: [],
    })
    const engine = new QuaEngine({
      assets: {
        endpoint: 'https://cdn.example.com',
        adapter: createMemoryAdapter({
          'https://cdn.example.com/unsigned.qpk': createQpkBundle(manifest, new Map([
            ['assets/scripts/empty.js', utf8('export default []')],
          ])),
        }),
      },
      trustPolicy: {
        requireSignature: true,
      },
    })
    await engine.init()

    await expect(engine.loadRuntimePackage('unsigned.qpk')).rejects.toThrow('missing a required signature')
  })

  it('requires signatures in production even when development opts allow unsigned packages', async () => {
    const previousNodeEnv = process.env.NODE_ENV
    process.env.NODE_ENV = 'production'
    const manifest = createRuntimeBundleManifest({
      id: 'runtime.production-unsigned',
      version: '1.0.0',
    })
    const engine = new QuaEngine({
      assets: {
        endpoint: 'https://cdn.example.com',
        adapter: createMemoryAdapter({
          'https://cdn.example.com/production-unsigned.qpk': createQpkBundle(manifest, new Map()),
        }),
      },
      trustPolicy: {
        requireSignature: false,
        allowUnsignedInDevelopment: true,
      },
    })
    await engine.init()

    try {
      await expect(engine.loadRuntimePackage('production-unsigned.qpk')).rejects.toThrow('missing a required signature')
      expect(engine.getRuntimePackages()).toEqual([])
      expect(await engine.getAssets().getBundleManifest('runtime.production-unsigned')).toBeUndefined()
    }
    finally {
      process.env.NODE_ENV = previousNodeEnv
    }
  })

  it('exposes the computed bundle hash to the trust verifier', async () => {
    const manifest = createRuntimeBundleManifest({
      id: 'runtime.tampered',
      version: '1.0.0',
      integrity: { hash: 'expected-hash', algorithm: 'sha256' },
      signature: { value: 'signed' },
    })
    const verifyPackage = vi.fn((ctx: RuntimePackageTrustContext) => ctx.bundle.hash === ctx.package.integrity?.hash)
    const engine = new QuaEngine({
      assets: {
        endpoint: 'https://cdn.example.com',
        adapter: createMemoryAdapter({
          'https://cdn.example.com/tampered.qpk': createQpkBundle(manifest, new Map()),
        }, 'actual-hash'),
      },
      trustPolicy: {
        requireSignature: true,
        verifyPackage,
      },
    })
    await engine.init()

    await expect(engine.loadRuntimePackage('tampered.qpk')).rejects.toThrow('failed trust verification')
    expect(verifyPackage).toHaveBeenCalledWith(expect.objectContaining({
      bundle: expect.objectContaining({ hash: 'actual-hash' }),
    }))
    expect(engine.getRuntimePackages()).toEqual([])
    expect(await engine.getAssets().getBundleManifest('runtime.tampered')).toBeUndefined()
  })

  it('rolls back runtime package activation when an engine plugin name collides', async () => {
    const manifest = createRuntimeBundleManifest({
      id: 'runtime.collision',
      version: '1.0.0',
      plugins: [
        { id: 'runtime.collision.engine', kind: 'engine', module: 'runtime-engine-plugin' },
      ],
    })
    const staticDestroy = vi.fn()
    const runtimeDestroy = vi.fn()
    const engine = new QuaEngine({
      assets: {
        endpoint: 'https://cdn.example.com',
        adapter: createMemoryAdapter({
          'https://cdn.example.com/collision.qpk': createQpkBundle(manifest, new Map()),
        }),
      },
      store: {
        storage: {
          backend: MemoryBackend,
        },
      },
      runtimeModuleLoader: {
        loadEnginePluginModule: vi.fn(async () => ({
          default: {
            name: 'shared-plugin',
            init: vi.fn(),
            destroy: runtimeDestroy,
          },
        })),
      },
      trustPolicy: {
        allowUnsignedInDevelopment: true,
      },
    })
    engine.use({
      name: 'shared-plugin',
      init() {},
      destroy: staticDestroy,
    })
    await engine.init()

    await expect(engine.loadRuntimePackage('collision.qpk')).rejects.toThrow('conflicts with already registered engine plugin')

    expect(staticDestroy).not.toHaveBeenCalled()
    expect(runtimeDestroy).not.toHaveBeenCalled()
    expect(engine.getRuntimePackages().find(pkg => pkg.id === 'runtime.collision')).toEqual(expect.objectContaining({
      state: 'unloaded',
    }))
    expect(await engine.getAssets().getBundleManifest('runtime.collision')).toBeUndefined()
  })

  it('rolls direct runtime package activation back to loaded when activation hooks fail', async () => {
    const manifest = createRuntimeBundleManifest({
      id: 'runtime.activate-fails',
      version: '1.0.0',
      plugins: [
        { id: 'runtime.activate-fails.engine', kind: 'engine', module: 'runtime-engine-plugin' },
        { id: 'runtime.activate-fails.renderer', kind: 'renderer', assetName: 'renderer.js' },
      ],
      storeMigrations: [
        { id: 'runtime.activate-fails.defaults', version: '1', scope: 'runtime', assetName: 'migrate.js' },
      ],
    })
    const runtimeDestroy = vi.fn()
    const migration = vi.fn(async (ctx: any) => {
      await ctx.engine.setPluginProjection('activationRollback', {
        contentPackageId: ctx.package.id,
        migrated: true,
      })
    })
    const rendererPluginEvents: unknown[] = []
    const engine = new QuaEngine({
      assets: {
        endpoint: 'https://cdn.example.com',
        adapter: createMemoryAdapter({
          'https://cdn.example.com/activate-fails.qpk': createQpkBundle(manifest, new Map([
            ['assets/scripts/migrate.js', utf8('export default function migrate() {}')],
            ['assets/scripts/renderer.js', utf8('export default {}')],
          ])),
        }),
      },
      store: {
        storage: {
          backend: MemoryBackend,
        },
      },
      runtimeModuleLoader: {
        loadStoreMigrationModule: vi.fn(async () => ({ default: migration })),
        loadEnginePluginModule: vi.fn(async () => ({
          default: {
            name: 'activate-fails-plugin',
            init: vi.fn(),
            destroy: runtimeDestroy,
            onRuntimePackageActivate: () => {
              throw new Error('activation hook failed')
            },
          },
        })),
      },
      trustPolicy: {
        allowUnsignedInDevelopment: true,
      },
    })
    onLogicToRender(engine.getPipeline(), LogicToRenderEvents.RUNTIME_PACKAGE_PLUGIN, payload => rendererPluginEvents.push(payload))
    await engine.init()

    await engine.loadRuntimePackage('activate-fails.qpk', { activate: false })
    await expect(engine.activateRuntimePackage('runtime.activate-fails')).rejects.toThrow('activation hook failed')

    expect(migration).toHaveBeenCalledTimes(1)
    expect(engine.getPluginProjection('activationRollback')).toBeUndefined()
    expect(engine.getRuntimeStateSnapshot().appliedRuntimeMigrations).not.toContain('runtime.activate-fails:runtime.activate-fails.defaults:1')
    expect(engine.getRuntimePackages().find(pkg => pkg.id === 'runtime.activate-fails')).toEqual(expect.objectContaining({
      state: 'loaded',
      activatedAt: undefined,
    }))
    expect(runtimeDestroy).toHaveBeenCalledTimes(1)
    expect(rendererPluginEvents).toEqual([])
    expect(await engine.getAssets().getBundleManifest('runtime.activate-fails')).toBeDefined()
  })

  it('keeps dependency package activation when a dependent package rolls back', async () => {
    const baseManifest = createRuntimeBundleManifest({
      id: 'runtime.rollback-base',
      version: '1.0.0',
      storeMigrations: [
        { id: 'runtime.rollback-base.defaults', version: '1', scope: 'runtime', assetName: 'base-migrate.js' },
      ],
    })
    const childManifest = createRuntimeBundleManifest({
      id: 'runtime.rollback-child',
      version: '1.0.0',
      dependencies: ['runtime.rollback-base'],
      plugins: [
        { id: 'runtime.rollback-child.engine', kind: 'engine', module: 'runtime-child-plugin' },
      ],
    })
    const baseMigration = vi.fn(async (ctx: any) => {
      await ctx.engine.setPluginProjection('rollbackBase', {
        contentPackageId: ctx.package.id,
        activated: true,
      })
    })
    const childDestroy = vi.fn()
    const engine = new QuaEngine({
      assets: {
        endpoint: 'https://cdn.example.com',
        adapter: createMemoryAdapter({
          'https://cdn.example.com/rollback-base.qpk': createQpkBundle(baseManifest, new Map([
            ['assets/scripts/base-migrate.js', utf8('export default function migrate() {}')],
          ])),
          'https://cdn.example.com/rollback-child.qpk': createQpkBundle(childManifest, new Map()),
        }),
      },
      store: {
        storage: {
          backend: MemoryBackend,
        },
      },
      runtimeModuleLoader: {
        loadStoreMigrationModule: vi.fn(async () => ({ default: baseMigration })),
        loadEnginePluginModule: vi.fn(async () => ({
          default: {
            name: 'rollback-child-plugin',
            init: vi.fn(),
            destroy: childDestroy,
            onRuntimePackageActivate: () => {
              throw new Error('child activation failed')
            },
          },
        })),
      },
      trustPolicy: {
        allowUnsignedInDevelopment: true,
      },
    })
    await engine.init()

    await engine.loadRuntimePackage('rollback-base.qpk', { activate: false })
    await engine.loadRuntimePackage('rollback-child.qpk', { activate: false })
    await expect(engine.activateRuntimePackage('runtime.rollback-child')).rejects.toThrow('child activation failed')

    expect(baseMigration).toHaveBeenCalledTimes(1)
    expect(childDestroy).toHaveBeenCalledTimes(1)
    expect(engine.getRuntimePackages().find(pkg => pkg.id === 'runtime.rollback-base')).toEqual(expect.objectContaining({
      state: 'active',
    }))
    expect(engine.getRuntimePackages().find(pkg => pkg.id === 'runtime.rollback-child')).toEqual(expect.objectContaining({
      state: 'loaded',
      activatedAt: undefined,
    }))
    expect(engine.getPluginProjection('rollbackBase')).toEqual({
      contentPackageId: 'runtime.rollback-base',
      activated: true,
    })
  })

  it('prevents unloading active runtime package dependencies', async () => {
    const baseManifest = createRuntimeBundleManifest({
      id: 'runtime.base',
      version: '1.0.0',
    })
    const childManifest = createRuntimeBundleManifest({
      id: 'runtime.child',
      version: '1.0.0',
      dependencies: ['runtime.base'],
    })
    const engine = new QuaEngine({
      assets: {
        endpoint: 'https://cdn.example.com',
        adapter: createMemoryAdapter({
          'https://cdn.example.com/base.qpk': createQpkBundle(baseManifest, new Map()),
          'https://cdn.example.com/child.qpk': createQpkBundle(childManifest, new Map()),
        }),
      },
      store: {
        storage: {
          backend: MemoryBackend,
        },
      },
      trustPolicy: {
        allowUnsignedInDevelopment: true,
      },
    })
    await engine.init()

    await engine.loadRuntimePackage('base.qpk')
    await engine.loadRuntimePackage('child.qpk')

    await expect(engine.unloadRuntimePackage('runtime.base')).rejects.toThrow('active packages depend on it: runtime.child')

    await engine.unloadRuntimePackage('runtime.child')
    await engine.unloadRuntimePackage('runtime.base')
    await engine.unloadRuntimePackage('runtime.base')
    expect(engine.getRuntimePackages()).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'runtime.base', state: 'unloaded' }),
      expect.objectContaining({ id: 'runtime.child', state: 'unloaded' }),
    ]))
  })

  it('prevents unloading runtime packages referenced by the current checkpoint metadata', async () => {
    const storyManifest = createRuntimeBundleManifest({
      id: 'runtime.story',
      version: '1.0.0',
    })
    const voiceManifest = createRuntimeBundleManifest({
      id: 'runtime.voice',
      version: '1.0.0',
    })
    const engine = new QuaEngine({
      assets: {
        endpoint: 'https://cdn.example.com',
        adapter: createMemoryAdapter({
          'https://cdn.example.com/story.qpk': createQpkBundle(storyManifest, new Map()),
          'https://cdn.example.com/voice.qpk': createQpkBundle(voiceManifest, new Map()),
        }),
      },
      store: {
        storage: {
          backend: MemoryBackend,
        },
      },
      trustPolicy: {
        allowUnsignedInDevelopment: true,
      },
    })
    await engine.init()
    await engine.loadRuntimePackage('story.qpk')
    await engine.loadRuntimePackage('voice.qpk')

    await engine.dialogue([{
      uuid: 'runtime-story-line',
      metadata: {
        point: {
          contentPackageId: 'runtime.story',
          scriptModuleId: 'runtime.story.scene',
        },
        requiredRuntimePackages: ['runtime.voice'],
      },
      run: async (ctx) => {
        await ctx.engine.showDialogue({ text: 'Runtime voice line' })
      },
    }])

    await expect(engine.unloadRuntimePackage('runtime.voice')).rejects.toThrow('current checkpoint')
    await engine.unloadRuntimePackage('runtime.voice', { force: true })
    expect(engine.getRuntimePackages().find(pkg => pkg.id === 'runtime.voice')).toEqual(expect.objectContaining({
      state: 'unloaded',
    }))
  })

  it('destroys runtime packages in dependency order even when load order differs from activation order', async () => {
    const baseManifest = createRuntimeBundleManifest({
      id: 'runtime.base',
      version: '1.0.0',
    })
    const childManifest = createRuntimeBundleManifest({
      id: 'runtime.child',
      version: '1.0.0',
      dependencies: ['runtime.base'],
    })
    const engine = new QuaEngine({
      assets: {
        endpoint: 'https://cdn.example.com',
        adapter: createMemoryAdapter({
          'https://cdn.example.com/child.qpk': createQpkBundle(childManifest, new Map()),
          'https://cdn.example.com/base.qpk': createQpkBundle(baseManifest, new Map()),
        }),
      },
      store: {
        storage: {
          backend: MemoryBackend,
        },
      },
      trustPolicy: {
        allowUnsignedInDevelopment: true,
      },
    })
    await engine.init()

    await engine.loadRuntimePackage('child.qpk', { activate: false })
    await engine.loadRuntimePackage('base.qpk')
    await engine.activateRuntimePackage('runtime.child')

    await expect(engine.destroy()).resolves.toBeUndefined()
  })

  it('rejects runtime package dependency cycles instead of recursing forever', async () => {
    const aManifest = createRuntimeBundleManifest({
      id: 'runtime.a',
      version: '1.0.0',
      dependencies: ['runtime.b'],
    })
    const bManifest = createRuntimeBundleManifest({
      id: 'runtime.b',
      version: '1.0.0',
      dependencies: ['runtime.a'],
    })
    const engine = new QuaEngine({
      assets: {
        endpoint: 'https://cdn.example.com',
        adapter: createMemoryAdapter({
          'https://cdn.example.com/a.qpk': createQpkBundle(aManifest, new Map()),
          'https://cdn.example.com/b.qpk': createQpkBundle(bManifest, new Map()),
        }),
      },
      store: {
        storage: {
          backend: MemoryBackend,
        },
      },
      trustPolicy: {
        allowUnsignedInDevelopment: true,
      },
    })
    await engine.init()

    await engine.loadRuntimePackage('a.qpk', { activate: false })
    await engine.loadRuntimePackage('b.qpk', { activate: false })

    await expect(engine.activateRuntimePackage('runtime.a')).rejects.toThrow('dependency cycle')
  })

  it('rejects duplicate runtime script module ids across packages', async () => {
    const firstManifest = createRuntimeBundleManifest({
      id: 'runtime.first',
      version: '1.0.0',
      scripts: [{ id: 'runtime.shared.scene', assetName: 'first.js' }],
    })
    const secondManifest = createRuntimeBundleManifest({
      id: 'runtime.second',
      version: '1.0.0',
      scripts: [{ id: 'runtime.shared.scene', assetName: 'second.js' }],
    })
    const engine = new QuaEngine({
      assets: {
        endpoint: 'https://cdn.example.com',
        adapter: createMemoryAdapter({
          'https://cdn.example.com/first.qpk': createQpkBundle(firstManifest, new Map([
            ['assets/scripts/first.js', utf8('export default function first() { return [] }')],
          ])),
          'https://cdn.example.com/second.qpk': createQpkBundle(secondManifest, new Map([
            ['assets/scripts/second.js', utf8('export default function second() { return [] }')],
          ])),
        }),
      },
      trustPolicy: {
        allowUnsignedInDevelopment: true,
      },
    })
    await engine.init()

    await engine.loadRuntimePackage('first.qpk', { activate: false })
    await expect(engine.loadRuntimePackage('second.qpk', { activate: false })).rejects.toThrow('already registered by package "runtime.first"')
    expect(await engine.getAssets().getBundleManifest('runtime.second')).toBeUndefined()
  })

  it('unloads packages that a registry resolves to the wrong id', async () => {
    const wrongManifest = createRuntimeBundleManifest({
      id: 'runtime.wrong',
      version: '1.0.0',
    })
    const engine = new QuaEngine({
      assets: {
        endpoint: 'https://cdn.example.com',
        adapter: createMemoryAdapter({
          'https://cdn.example.com/wrong.qpk': createQpkBundle(wrongManifest, new Map()),
        }),
      },
      runtimePackageRegistry: {
        resolvePackage: vi.fn(packageId => packageId === 'runtime.expected' ? 'wrong.qpk' : undefined),
      },
      trustPolicy: {
        allowUnsignedInDevelopment: true,
      },
    })
    await engine.init()

    await expect(engine.ensureRuntimePackages(['runtime.expected'])).rejects.toThrow('resolved "runtime.expected" to package "runtime.wrong"')
    expect(engine.getRuntimePackages().find(pkg => pkg.id === 'runtime.wrong')).toEqual(expect.objectContaining({
      state: 'unloaded',
    }))
    expect(await engine.getAssets().getBundleManifest('runtime.wrong')).toBeUndefined()
  })

  it('rejects jumps to unloaded runtime package story points when no registry can resolve them', async () => {
    const engine = createEngine()
    await engine.init()

    await expect(engine.jumpTo({
      stepId: 'dynamic-step',
      contentPackageId: 'missing.runtime',
    })).rejects.toThrow('Required runtime package "missing.runtime" is not active.')
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

  it('handles renderer save and load intents through engine-owned slot APIs', async () => {
    const engine = createEngine()
    await engine.init()
    const saveToSlot = vi.spyOn(engine, 'saveToSlot')
    const loadFromSlot = vi.spyOn(engine, 'loadFromSlot')

    await emitRenderToLogic(engine.getPipeline(), RenderToLogicEvents.GAME_SAVE_REQUEST, { slotId: 'slot-1' })
    await emitRenderToLogic(engine.getPipeline(), RenderToLogicEvents.GAME_LOAD_REQUEST, { slotId: 'slot-1' })

    expect(saveToSlot).toHaveBeenCalledWith('slot-1', {}, { preview: undefined })
    expect(loadFromSlot).toHaveBeenCalledWith('slot-1', { force: true, reason: 'renderer-load' })
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
    saves: {
      preview: {
        defaults: {
          mode: 'disabled',
        },
      },
    },
  })
}

function createPreviewEngine(config: ConstructorParameters<typeof QuaEngine>[0] = {}): QuaEngine {
  return new QuaEngine({
    assets: {
      adapter: createMemoryAdapter(),
      ...(config.assets || {}),
    },
    store: {
      storage: {
        backend: MemoryBackend,
      },
      ...(config.store || {}),
    },
    saves: {
      ...(config.saves || {}),
      preview: {
        defaults: {
          mode: 'renderer-capture',
          transaction: 'sync',
          policy: {
            timeoutMs: 100,
            format: 'image/webp',
          },
        },
        ...(config.saves?.preview || {}),
      },
    },
  })
}

async function mountRendererPlugin(engine: QuaEngine, plugin: RendererPlugin): Promise<RendererPluginHost> {
  const host = new RendererPluginHost([plugin])
  await host.init({
    getPipeline: () => engine.getPipeline(),
    getViewState: () => engine.getViewState(),
    refresh: () => {},
    emitRenderToLogic: (type, payload) => emitRenderToLogicEvent(engine.getPipeline(), type as any, payload as any),
    onLogicToRender: (type, handler) => onLogicToRender(engine.getPipeline(), type as any, handler as any),
    onRenderToLogic: (type, handler) => onRenderToLogic(engine.getPipeline(), type as any, handler as any),
    reportError: async () => {},
  })
  return host
}

async function flushAsyncPreviewWork(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
}

async function waitForSlotPreviewStatus(
  engine: QuaEngine,
  slotId: string,
  status: 'none' | 'pending' | 'ready' | 'error',
): Promise<void> {
  for (let index = 0; index < 20; index += 1) {
    const slot = await engine.getStore().getSlot(slotId)
    if (slot?.index.previewStatus === status) {
      return
    }
    await new Promise(resolve => setTimeout(resolve, 0))
  }
  throw new Error(`Timed out waiting for slot "${slotId}" preview status "${status}".`)
}

function createDialogueStep(uuid: string, text: string, point: Partial<StoryPoint> = {}) {
  return {
    uuid,
    metadata: {
      point,
    },
    run: async (ctx: StepContext) => {
      await ctx.engine.showDialogue({ text })
    },
  }
}

function createMemoryAdapter(files: Record<string, Uint8Array> = {}, hash = ''): AssetRuntimeAdapter {
  const fileMap = new Map(Object.entries(files))
  return {
    name: 'engine-test-memory',
    storage: new MemoryAssetStorage(),
    fetcher: {
      async fetchBytes(url) {
        const data = fileMap.get(url) || fileMap.get(url.replace(/^\/+/, ''))
        if (!data) {
          throw new Error(`No test asset file registered: ${url}`)
        }
        return { data: new Uint8Array(data), size: data.byteLength }
      },
    },
    crypto: {
      async sha256() {
        return hash
      },
    },
  }
}

function createRuntimeBundleManifest(runtimePackage: RuntimePackageManifest): BundleManifest {
  const integrity = {
    ...(runtimePackage.integrity || {}),
    algorithm: runtimePackage.integrity?.algorithm || 'sha256',
    hash: runtimePackage.integrity?.hash || `merkle:${runtimePackage.id}:${runtimePackage.version}`,
  }
  const runtimePackageWithIntegrity = {
    ...runtimePackage,
    integrity,
  }

  return {
    name: runtimePackageWithIntegrity.id,
    version: runtimePackageWithIntegrity.version,
    bundler: '@quajs/quack',
    created: new Date(0).toISOString(),
    createdAt: 0,
    format: 'qpk',
    bundleVersion: 1,
    buildNumber: 'runtime-test',
    compression: { algorithm: 'none' },
    encryption: { enabled: false, algorithm: 'none' },
    locales: ['default'],
    defaultLocale: 'default',
    assets: {
      scripts: Object.fromEntries([
        ...(runtimePackage.scripts || []).map(script => [script.assetName, createScriptAssetInfo(script.assetName)]),
        ...(runtimePackage.scenes || []).map(scene => [scene.assetName, createScriptAssetInfo(scene.assetName)]),
        ...(runtimePackage.plugins || [])
          .filter(plugin => plugin.assetName)
          .map(plugin => [plugin.assetName!, createScriptAssetInfo(plugin.assetName!)]),
        ...(runtimePackage.storeMigrations || []).map(migration => [migration.assetName, createScriptAssetInfo(migration.assetName)]),
      ]),
    },
    totalFiles: 0,
    totalSize: 0,
    merkleRoot: integrity.hash,
    compatibility: runtimePackageWithIntegrity.compatibility,
    runtimePackage: runtimePackageWithIntegrity,
  }
}

function createScriptAssetInfo(name: string) {
  return {
    name,
    path: `scripts/${name}`,
    relativePath: `scripts/${name}`,
    size: 0,
    hash: '',
    type: 'scripts' as const,
    locales: ['default'],
    mimeType: 'text/javascript',
  }
}

function createDataAssetInfo(name: string, locales = ['default']) {
  return {
    name: name.split('/').pop() || name,
    path: `data/${name}`,
    relativePath: `data/${name}`,
    size: 0,
    hash: '',
    type: 'data' as const,
    locales,
    mimeType: 'application/json',
  }
}

function createImageAssetInfo(name: string, locales = ['default']) {
  return {
    name,
    path: `images/${name}`,
    relativePath: `images/${name}`,
    size: 0,
    hash: '',
    type: 'images' as const,
    locales,
    mimeType: 'image/png',
  }
}

function createRegistryProjectionPlugin(): EnginePlugin {
  return {
    name: 'runtime-registry-plugin',
    id: 'runtime-registry',
    async init() {},
    async onRuntimePackageUnload(ctx: EngineContext) {
      const packageId = ctx.runtimePackage?.package.id
      if (!packageId) {
        return
      }
      const projection = ctx.engine.getPluginProjection<{ revision: number, entries: Array<{ contentPackageId?: string }> }>('runtime-registry')
      if (!projection) {
        return
      }
      await ctx.engine.setPluginProjection('runtime-registry', {
        revision: projection.revision + 1,
        entries: projection.entries.filter(entry => entry.contentPackageId !== packageId),
      })
    },
  }
}

function createQpkBundle(manifest: BundleManifest, files: Map<string, Uint8Array>): Uint8Array {
  const entries = Array.from(files.entries()).map(([path, data]) => {
    const pathBytes = utf8(path)
    const entry = new Uint8Array(4 + pathBytes.byteLength + 4 + data.byteLength)
    const view = new DataView(entry.buffer)
    view.setUint32(0, pathBytes.byteLength, true)
    entry.set(pathBytes, 4)
    view.setUint32(4 + pathBytes.byteLength, data.byteLength, true)
    entry.set(data, 4 + pathBytes.byteLength + 4)
    return entry
  })
  const dataSection = concatBytes(entries)
  const manifestBytes = utf8(JSON.stringify(manifest))
  const headerSize = 32
  const bytes = new Uint8Array(headerSize + dataSection.byteLength + manifestBytes.byteLength)
  const view = new DataView(bytes.buffer)
  view.setUint32(0, 0x51504B00, false)
  view.setUint32(4, 1, true)
  view.setUint32(8, 0, true)
  view.setUint32(12, headerSize, true)
  setUint64LE(view, 16, headerSize + dataSection.byteLength)
  setUint64LE(view, 24, manifestBytes.byteLength)
  bytes.set(dataSection, headerSize)
  bytes.set(manifestBytes, headerSize + dataSection.byteLength)
  return bytes
}

function concatBytes(chunks: Uint8Array[]): Uint8Array {
  const result = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0))
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.byteLength
  }
  return result
}

function setUint64LE(view: DataView, offset: number, value: number): void {
  view.setUint32(offset, value >>> 0, true)
  view.setUint32(offset + 4, Math.floor(value / 2 ** 32), true)
}

function utf8(value: string): Uint8Array {
  return new TextEncoder().encode(value)
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
