import { emitLogicToRender, LogicToRenderEvents, RenderToLogicEvents } from '@quajs/engine'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NativeSceneTransitionController } from '../src'
import { createTestPipeline } from './fixtures'

describe('native scene transition controller', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('emits native scene readiness immediately for instant transitions', async () => {
    const pipeline = createTestPipeline()
    const ready: unknown[] = []
    pipeline.on(RenderToLogicEvents.SCENE_READY, context => ready.push(context.event.payload))
    const controller = new NativeSceneTransitionController()
    controller.setup(pipeline as any)

    await emitLogicToRender(pipeline as any, LogicToRenderEvents.SCENE_CHANGE, {
      toScene: 'chapter-2',
      transition: { type: 'instant', waitForRenderer: true },
    })
    await vi.waitFor(() => expect(ready).toEqual([
      expect.objectContaining({ sceneId: 'chapter-2' }),
    ]))
    expect(controller.getSnapshot()).toBeUndefined()
    controller.destroy()
  })

  it('projects deterministic logical transition progress and emits ready on completion', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(1_000)
    const pipeline = createTestPipeline()
    const ready: unknown[] = []
    const requestRender = vi.fn()
    pipeline.on(RenderToLogicEvents.SCENE_READY, context => ready.push(context.event.payload))
    const controller = new NativeSceneTransitionController({ requestRender })
    controller.setup(pipeline as any)

    await emitLogicToRender(pipeline as any, LogicToRenderEvents.SCENE_CHANGE, {
      fromScene: 'chapter-1',
      toScene: 'chapter-2',
      transition: { type: 'slide_left', duration: 100, easing: 'linear', waitForRenderer: true },
    })
    expect(controller.getSnapshot(1_050)).toEqual(expect.objectContaining({
      active: true,
      type: 'slide_left',
      fromScene: 'chapter-1',
      toScene: 'chapter-2',
      progress: 0.5,
      easedProgress: 0.5,
    }))

    await vi.advanceTimersByTimeAsync(100)
    expect(controller.getSnapshot()).toBeUndefined()
    expect(ready).toEqual([expect.objectContaining({ sceneId: 'chapter-2', timestamp: 1_100 })])
    expect(requestRender).toHaveBeenCalled()
    controller.destroy()
  })

  it('cancels replaced scene transitions without emitting stale readiness', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(2_000)
    const pipeline = createTestPipeline()
    const ready: unknown[] = []
    pipeline.on(RenderToLogicEvents.SCENE_READY, context => ready.push(context.event.payload))
    const controller = new NativeSceneTransitionController()
    controller.setup(pipeline as any)

    await emitLogicToRender(pipeline as any, LogicToRenderEvents.SCENE_CHANGE, {
      toScene: 'stale',
      transition: { type: 'fade', duration: 100 },
    })
    await vi.advanceTimersByTimeAsync(50)
    await emitLogicToRender(pipeline as any, LogicToRenderEvents.SCENE_CHANGE, {
      toScene: 'current',
      transition: { type: 'fade', duration: 100 },
    })
    await vi.advanceTimersByTimeAsync(100)

    expect(ready).toEqual([expect.objectContaining({ sceneId: 'current' })])
    controller.destroy()
  })
})
