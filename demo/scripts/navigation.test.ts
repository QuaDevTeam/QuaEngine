import { createMemoryAssetsAdapter } from '@quajs/assets-memory'
import { clearCharacterRuntime, configureCharacterRuntime } from '@quajs/character'
import { LogicToRenderEvents, QuaEngine, RenderToLogicEvents } from '@quajs/engine'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createDemoEngineRuntime } from '../src/game/runtime-shared'
import { DEMO_STORY_ERROR } from '../src/game/story/prologue-state'
import { createDemoUiSession } from '../src/game/ui/session'

describe('shared demo story navigation without a preview capture provider', () => {
  let runtime: Awaited<ReturnType<typeof createDemoEngineRuntime>> | undefined
  let ui: Awaited<ReturnType<typeof createDemoUiSession>> | undefined

  afterEach(async () => {
    ui?.dispose()
    clearCharacterRuntime()
    await runtime?.engine.destroy()
    QuaEngine.resetInstance()
  })

  it('renders the first line without advance and returns, resumes and restarts promptly', async () => {
    runtime = await createDemoEngineRuntime({
      engine: { assets: { adapter: createMemoryAssetsAdapter() } },
      systemLocale: 'zh-cn',
    })
    const { engine } = runtime
    configureCharacterRuntime({ engine, waitForAdvance: true })
    ui = await createDemoUiSession(runtime)
    const pipeline = engine.getPipeline()
    const captures = vi.fn()
    const advances = vi.fn()
    const errors = vi.fn()
    pipeline.on(LogicToRenderEvents.SAVE_PREVIEW_CAPTURE_REQUEST, captures)
    pipeline.on(RenderToLogicEvents.USER_ADVANCE, advances)
    pipeline.on(DEMO_STORY_ERROR, errors)
    const intent = (target: string, action = 'open') => pipeline.emit('ui/intent', { action, arg0: target })
    const screen = () => ui!.getInteractionDiagnostics().screen
    const firstLine = '2019 年 6 月 10 日，青叶市。'

    await intent('story')
    // No renderer capture responder, synthetic click or elapsed timeout can
    // release startup. The real compiled QS must project its first step itself.
    await vi.waitFor(() => {
      expect(engine.getViewState().dialogue).toMatchObject({ text: firstLine, visible: true })
      expect(engine.getViewState().background).toMatchObject({ assetName: 'backgrounds/town-bus-rain.webp' })
    }, { timeout: 1000 })
    expect(screen()).toBe('game')
    expect(advances).not.toHaveBeenCalled()
    expect(captures).not.toHaveBeenCalled()
    expect((await engine.listSaveSlots()).map(slot => slot.slotId)).toEqual(expect.arrayContaining(['continue', 'chapter-prologue-arrival']))

    // Advance once to prove resume preserves an actual later line.
    await pipeline.emit(RenderToLogicEvents.USER_ADVANCE, { source: 'test' })
    await vi.waitFor(() => expect(engine.getViewState().dialogue.text).not.toBe(firstLine))
    const resumeText = engine.getViewState().dialogue.text
    const resumePoint = engine.getStoryPoint()
    await intent('game-menu')
    await intent('title-confirm')
    const returning = intent('title')
    await vi.waitFor(() => expect(screen()).toBe('title'), { timeout: 1000 })
    await returning
    expect(engine.getPluginProjection('demo-story')).toMatchObject({ status: 'paused' })
    expect(engine.getPluginProjection('demo-library')).toMatchObject({ canContinue: true })

    await intent('continue')
    await vi.waitFor(() => {
      expect(screen()).toBe('game')
      expect(engine.getViewState().dialogue.text).toBe(resumeText)
      expect(engine.getStoryPoint()?.stepId).toBe(resumePoint?.stepId)
      expect(engine.getPluginProjection('demo-story')).toMatchObject({ status: 'reading' })
    })
    await intent('game-menu')
    await intent('title-confirm')
    await intent('title')
    await intent('story')
    await vi.waitFor(() => expect(engine.getViewState().dialogue.text).toBe(firstLine), { timeout: 1000 })
    expect(screen()).toBe('game')
    expect(engine.getStoryPoint()?.stepId).toBe('prologue-arrival')
    expect(captures).not.toHaveBeenCalled()
    expect(errors).not.toHaveBeenCalled()
    expect(ui.getInteractionDiagnostics().error).toBeNull()
  })
})
