import type { AssetRuntimeAdapter, BundleManifest, RuntimePackageManifest } from '@quajs/assets'
import type { RuntimePackageTrustContext } from '../src'
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
            onRuntimePackageActivate: (ctx: any) => enginePluginHooks.push(`activate:${ctx.runtimePackage?.package.id}`),
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
    expect(engine.getPluginProjection('runtimeDefaults')).toEqual({ packageId: 'runtime.story', migrated: true })
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
    expect((await engine.listSaveSlots())[0].metadata.requiredRuntimePackages).toEqual(['runtime.scene.b'])

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
      runtimeModuleLoader: {
        loadScriptModule: vi.fn(async () => ({
          default: () => [{
            uuid: 'runtime-view-step',
            run: async (ctx: any) => {
              await ctx.engine.showCharacter({ id: 'RuntimeHero', sprite: 'hero/base.png' })
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
    expect(engine.getViewState().background?.metadata).toEqual({ contentPackageId: 'runtime.view' })
    expect(engine.getViewState().choices[0].metadata).toEqual({ contentPackageId: 'runtime.view' })
    expect(engine.getViewState().effects[0].options).toEqual({ contentPackageId: 'runtime.view' })
    expect(engine.getViewState().ui.overlays?.['runtime-panel']).toEqual({ open: true, contentPackageId: 'runtime.view' })
    expect(engine.getPluginProjection('runtime-custom-view')).toEqual({ contentPackageId: 'runtime.view', value: true })

    await engine.setStoryPoint({ sceneId: 'base-scene', stepId: 'base-step' })
    await engine.createCheckpoint({ id: 'base-checkpoint', kind: 'manual' })
    await expect(engine.unloadRuntimePackage('runtime.view')).rejects.toThrow('current view projection')
    await engine.unloadRuntimePackage('runtime.view', { force: true })

    expect(engine.getViewState().characters).toEqual([])
    expect(engine.getViewState().background).toBeUndefined()
    expect(engine.getViewState().choices).toEqual([])
    expect(engine.getViewState().effects).toEqual([])
    expect(engine.getViewState().ui.overlays).toEqual({})
    expect(engine.getPluginProjection('runtime-custom-view')).toBeUndefined()
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
    })
    const runtimeDestroy = vi.fn()
    const rendererPluginEvents: unknown[] = []
    const engine = new QuaEngine({
      assets: {
        endpoint: 'https://cdn.example.com',
        adapter: createMemoryAdapter({
          'https://cdn.example.com/activate-fails.qpk': createQpkBundle(manifest, new Map([
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

    expect(engine.getRuntimePackages().find(pkg => pkg.id === 'runtime.activate-fails')).toEqual(expect.objectContaining({
      state: 'loaded',
      activatedAt: undefined,
    }))
    expect(runtimeDestroy).toHaveBeenCalledTimes(1)
    expect(rendererPluginEvents).toEqual([])
    expect(await engine.getAssets().getBundleManifest('runtime.activate-fails')).toBeDefined()
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
        ...(runtimePackage.plugins || [])
          .filter(plugin => plugin.assetName)
          .map(plugin => [plugin.assetName!, createScriptAssetInfo(plugin.assetName!)]),
        ...(runtimePackage.storeMigrations || []).map(migration => [migration.assetName, createScriptAssetInfo(migration.assetName)]),
      ]),
    },
    totalFiles: 0,
    totalSize: 0,
    merkleRoot: integrity.hash,
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
