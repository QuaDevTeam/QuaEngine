import { Pipeline } from '@quajs/pipeline'
import { describe, expect, it, vi } from 'vitest'
import {
  createFlowControlProjection,
  createViewLayoutProjection,
  emitLogicToRender,
  emitRenderToLogic,
  LogicToRenderEvents,
  onLogicToRender,
  onRenderToLogic,
  RendererPluginHost,
  RenderToLogicEvents,
  waitForPipelineEvent,
} from '../src'

describe('render-core event contracts', () => {
  it('normalizes project layout presets for landscape and portrait rendering', () => {
    expect(createViewLayoutProjection('landscape')).toEqual(expect.objectContaining({
      orientation: 'landscape',
      width: 1920,
      height: 1080,
      minAspectRatio: 16 / 10,
      maxAspectRatio: 16 / 9,
    }))

    expect(createViewLayoutProjection('portrait')).toEqual(expect.objectContaining({
      orientation: 'portrait',
      width: 1080,
      height: 1920,
      minAspectRatio: 9 / 16,
      maxAspectRatio: 10 / 16,
    }))

    expect(createViewLayoutProjection({
      preset: 'landscape',
      aspectRatio: 2,
    }).aspectRatio).toBe(16 / 9)
  })

  it('dispatches typed logic-to-render events through @quajs/pipeline', async () => {
    const pipeline = new Pipeline()
    const handler = vi.fn()
    const off = onLogicToRender(pipeline, LogicToRenderEvents.DIALOGUE_SHOW, handler)

    await emitLogicToRender(pipeline, LogicToRenderEvents.DIALOGUE_SHOW, {
      characterId: 'Alice',
      characterName: 'Alice',
      text: 'Hello',
    })
    off()
    await emitLogicToRender(pipeline, LogicToRenderEvents.DIALOGUE_SHOW, {
      text: 'Ignored',
    })

    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ text: 'Hello' }), expect.any(Object))
  })

  it('dispatches typed render-to-logic intent events through @quajs/pipeline', async () => {
    const pipeline = new Pipeline()
    const handler = vi.fn()
    onRenderToLogic(pipeline, RenderToLogicEvents.USER_CHOICE_SELECT, handler)

    await emitRenderToLogic(pipeline, RenderToLogicEvents.USER_CHOICE_SELECT, { choiceId: 'yes' })

    expect(handler).toHaveBeenCalledWith({ choiceId: 'yes' }, expect.any(Object))
  })

  it('waits for matching pipeline events, timeout, and cancellation', async () => {
    const pipeline = new Pipeline()

    const wait = waitForPipelineEvent(
      pipeline,
      RenderToLogicEvents.USER_CLICK,
      payload => payload.target === 'stage',
      { timeout: 1000 },
    )
    await emitRenderToLogic(pipeline, RenderToLogicEvents.USER_CLICK, { target: 'dialogue' })
    await emitRenderToLogic(pipeline, RenderToLogicEvents.USER_CLICK, { target: 'stage', x: 1 })

    await expect(wait).resolves.toEqual({ target: 'stage', x: 1 })
    await expect(waitForPipelineEvent(pipeline, RenderToLogicEvents.USER_ADVANCE, undefined, { timeout: 1 }))
      .rejects
      .toThrow('Timed out waiting for pipeline event')

    const controller = new AbortController()
    const cancelled = waitForPipelineEvent(pipeline, RenderToLogicEvents.USER_ADVANCE, undefined, {
      signal: controller.signal,
    })
    controller.abort()

    await expect(cancelled).rejects.toThrow('cancelled')
  })

  it('runs renderer plugins through pipeline helpers without creating another bus', async () => {
    const pipeline = new Pipeline()
    const refresh = vi.fn()
    const host = new RendererPluginHost([{
      name: 'probe',
      setup(context) {
        context.addDisposer(context.onLogicToRender(LogicToRenderEvents.VIEW_UPDATE, () => context.refresh()))
      },
    }])

    await host.init({
      getPipeline: () => pipeline,
      getViewState: () => ({
        layout: createViewLayoutProjection(),
        characters: [],
        dialogue: { visible: false, text: '' },
        choices: [],
        ui: { visible: true },
        flowControl: createFlowControlProjection(),
        effects: [],
        animations: [],
        plugins: { audio: { revision: 0, unlocked: false } },
      }),
      refresh,
      emitRenderToLogic: (type, payload) => emitRenderToLogic(pipeline, type as any, payload as any),
      onLogicToRender: (type, handler) => onLogicToRender(pipeline, type as any, handler as any),
      onRenderToLogic: (type, handler) => onRenderToLogic(pipeline, type as any, handler as any),
    })

    await emitLogicToRender(pipeline, LogicToRenderEvents.VIEW_UPDATE, {
      view: {
        layout: createViewLayoutProjection(),
        characters: [],
        dialogue: { visible: false, text: '' },
        choices: [],
        ui: { visible: true },
        flowControl: createFlowControlProjection(),
        effects: [],
        animations: [],
        plugins: { audio: { revision: 1, unlocked: true } },
      },
    })

    expect(refresh).toHaveBeenCalledTimes(1)
    await host.destroy()
    await emitLogicToRender(pipeline, LogicToRenderEvents.VIEW_UPDATE, {
      view: {
        layout: createViewLayoutProjection(),
        characters: [],
        dialogue: { visible: false, text: '' },
        choices: [],
        ui: { visible: true },
        flowControl: createFlowControlProjection(),
        effects: [],
        animations: [],
        plugins: { audio: { revision: 2, unlocked: true } },
      },
    })
    expect(refresh).toHaveBeenCalledTimes(1)
  })
})
