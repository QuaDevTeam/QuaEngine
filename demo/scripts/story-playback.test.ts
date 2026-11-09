import type { StoryState } from '../src/game/story/prologue-state'
import { createMemoryAssetsAdapter } from '@quajs/assets-memory'
import { clearCharacterRuntime, configureCharacterRuntime } from '@quajs/character'
import { LogicToRenderEvents, onLogicToRender, QuaEngine, RenderToLogicEvents } from '@quajs/engine'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createDemoEngineRuntime } from '../src/game/runtime-shared'
import { DEMO_STORY_ERROR, DEMO_STORY_REQUEST } from '../src/game/story/prologue-state'

describe('compiled demo story routes', () => {
  let runtime: Awaited<ReturnType<typeof createDemoEngineRuntime>> | undefined

  afterEach(async () => {
    clearCharacterRuntime()
    await runtime?.engine.destroy()
    QuaEngine.resetInstance()
    vi.useRealTimers()
  })

  it.each(['tomorrow', 'letter', 'handoff'] as const)('reaches the %s ending through authored choices', async (ending) => {
    vi.useFakeTimers()
    runtime = await createDemoEngineRuntime({
      engine: { assets: { adapter: createMemoryAssetsAdapter() } },
      systemLocale: 'zh-cn',
    })
    const { engine } = runtime
    // Headless playback still executes every compiled step and engine mutation.
    // Advance animation clocks below; no renderer or image decoding is asserted.
    configureCharacterRuntime({ engine, waitForAdvance: false })
    const pipeline = engine.getPipeline()
    const errors: unknown[] = []
    const selections: string[] = []
    let lines = 0
    pipeline.on(DEMO_STORY_ERROR, context => errors.push(context.event.payload))
    onLogicToRender(pipeline, LogicToRenderEvents.DIALOGUE_SHOW, () => {
      lines++
    })
    onLogicToRender(pipeline, LogicToRenderEvents.DIALOGUE_CHOICE, ({ choices }) => {
      const preferred = ending === 'handoff' ? 'early-handoff' : ending === 'letter' ? 'formal-followup' : 'external-preservation'
      const choice = choices.find(choice => choice.id === preferred) ?? choices[0]
      if (!choice)
        return
      selections.push(choice.id)
      // Let the compiled step subscribe before delivering a user intent.
      setTimeout(() => {
        void pipeline.emit(RenderToLogicEvents.USER_CHOICE_SELECT, { choiceId: choice.id })
      }, 1)
    })
    await pipeline.emit(DEMO_STORY_REQUEST, { action: 'start' })
    let state: StoryState | undefined
    for (let tick = 0; tick < 600; tick++) {
      await vi.advanceTimersByTimeAsync(1000)
      state = engine.getPluginProjection<StoryState>('demo-story')
      if (state?.status === 'ended' || errors.length)
        break
    }
    expect(errors).toEqual([])
    expect(state).toMatchObject({ status: 'ended', ending })
    expect(selections).toHaveLength(ending === 'handoff' ? 7 : 8)
    expect(lines).toBeGreaterThan(1000)
    expect(state?.choices).toEqual(selections)
    expect((await engine.listSaveSlots()).map(slot => slot.slotId)).toContain('chapter-chapter-05')
  }, 60_000)
})
