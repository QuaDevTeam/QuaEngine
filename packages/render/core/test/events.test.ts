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
  resolveActiveUiSceneProjection,
  uiSceneAllowsDefaultChrome,
  uiSceneAllowsDialogueChrome,
  uiSceneAllowsHudChrome,
  waitForPipelineEvent,
} from '../src'

describe('render-core event contracts', () => {
  it('normalizes project layout presets for aspect-interval rendering', () => {
    expect(createViewLayoutProjection('landscape')).toEqual(expect.objectContaining({
      orientation: 'landscape',
      width: 1920,
      height: 1080,
      aspectRatio: 16 / 9,
      minAspectRatio: 16 / 10,
      maxAspectRatio: 16 / 9,
    }))

    expect(createViewLayoutProjection('portrait')).toEqual(expect.objectContaining({
      orientation: 'portrait',
      width: 1080,
      height: 2340,
      aspectRatio: 9 / 19.5,
      minAspectRatio: 9 / 21,
      maxAspectRatio: 9 / 16,
    }))

    expect(createViewLayoutProjection({
      preset: 'landscape',
      aspectRatio: 2,
    }).aspectRatio).toBe(16 / 9)

    expect(createViewLayoutProjection({
      preset: 'portrait',
      aspectRatio: 0.3,
    }).aspectRatio).toBe(9 / 21)

    expect(createViewLayoutProjection({
      preset: 'landscape',
      orientation: 'portrait',
    }).orientation).toBe('landscape')
  })

  it('accepts background composition payloads for layered projection', () => {
    const background = {
      mode: 'layered' as const,
      fit: 'cover' as const,
      origin: 'center center',
      composition: {
        isolation: true,
        filter: { brightness: 1.1 },
      },
      layers: [{
        id: 'fog',
        assetName: 'fog.png',
        fit: 'cover' as const,
        width: '100%',
        height: '100%',
        composition: {
          blendMode: 'screen',
          filter: { blur: 4, hueRotate: 12 },
          mask: { assetName: 'fog-mask.png', mode: 'alpha' },
        },
      }],
    }

    expect(background.layers[0].composition.mask.assetName).toBe('fog-mask.png')
  })

  it('resolves active UI scene chrome policy from projection metadata', () => {
    const active = resolveActiveUiSceneProjection({
      gameMenu: {
        scene: {
          id: 'game:menu',
          presentation: 'overlay',
          overlay: {
            defaultChrome: false,
          },
        },
      },
      settings: {
        scene: {
          id: 'system:settings',
          presentation: 'scene',
          overlay: {
            hideHud: true,
            hideDialogue: true,
          },
        },
      },
    })

    expect(active?.id).toBe('system:settings')
    expect(uiSceneAllowsDefaultChrome(active)).toBe(true)
    expect(uiSceneAllowsHudChrome(active)).toBe(false)
    expect(uiSceneAllowsDialogueChrome(active)).toBe(false)
    expect(uiSceneAllowsDefaultChrome({ id: 'bare' })).toBe(true)
    expect(uiSceneAllowsDefaultChrome({
      id: 'chrome-free',
      overlay: { defaultChrome: false },
    })).toBe(false)
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

  it('dispatches semantic renderer input commands before built-in intents', async () => {
    const pipeline = new Pipeline()
    const commands: unknown[] = []
    onRenderToLogic(pipeline, RenderToLogicEvents.USER_INPUT_COMMAND, payload => commands.push(payload))

    await emitRenderToLogic(pipeline, RenderToLogicEvents.USER_INPUT_COMMAND, {
      command: 'advance',
      device: 'keyboard',
      source: 'keyboard:Enter',
      pressed: true,
      timestamp: 123,
      metadata: { code: 'Enter' },
    })

    expect(commands).toEqual([expect.objectContaining({
      command: 'advance',
      device: 'keyboard',
      source: 'keyboard:Enter',
    })])
  })

  it('normalizes renderer errors through the shared render-to-logic channel', async () => {
    const pipeline = new Pipeline()
    const errors: unknown[] = []
    onRenderToLogic(pipeline, RenderToLogicEvents.RENDER_ERROR, payload => errors.push(payload))

    await emitRenderToLogic(pipeline, RenderToLogicEvents.RENDER_ERROR, {
      message: 'Layer failed',
      source: 'renderer',
      phase: 'layer:render',
      error: { message: 'boom' },
      recoverable: true,
    })

    expect(errors).toEqual([expect.objectContaining({
      message: 'Layer failed',
      source: 'renderer',
      phase: 'layer:render',
      recoverable: true,
    })])
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

  it('reports renderer plugin setup failures and keeps healthy plugins active', async () => {
    const pipeline = new Pipeline()
    const reportError = vi.fn(async () => {})
    const failedDisposer = vi.fn()
    const failedDestroy = vi.fn()
    const healthySetup = vi.fn()
    const healthyDestroy = vi.fn()
    const host = new RendererPluginHost([{
      name: 'broken-plugin',
      setup(context) {
        context.addDisposer(failedDisposer)
        throw new Error('plugin setup failed')
      },
      destroy: failedDestroy,
    }, {
      name: 'healthy-plugin',
      setup: healthySetup,
      destroy: healthyDestroy,
    }])

    await expect(host.init({
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
      refresh: vi.fn(),
      emitRenderToLogic: (type, payload) => emitRenderToLogic(pipeline, type as any, payload as any),
      onLogicToRender: (type, handler) => onLogicToRender(pipeline, type as any, handler as any),
      onRenderToLogic: (type, handler) => onRenderToLogic(pipeline, type as any, handler as any),
      reportError,
    })).resolves.toBeUndefined()

    expect(reportError).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({
      phase: 'renderer-plugin:setup',
      pluginName: 'broken-plugin',
    }))
    expect(failedDisposer).toHaveBeenCalledTimes(1)
    expect(healthySetup).toHaveBeenCalledTimes(1)

    await host.destroy()

    expect(failedDestroy).not.toHaveBeenCalled()
    expect(failedDisposer).toHaveBeenCalledTimes(1)
    expect(healthyDestroy).toHaveBeenCalledTimes(1)
  })

  it('reports renderer plugin event handler failures without recursively reporting error-channel failures', async () => {
    const pipeline = new Pipeline()
    const reportError = vi.fn(async () => {})
    const host = new RendererPluginHost([{
      name: 'event-plugin',
      setup(context) {
        context.addDisposer(context.onLogicToRender(LogicToRenderEvents.VIEW_UPDATE, () => {
          throw new Error('handler failed')
        }))
        context.addDisposer(context.onRenderToLogic(RenderToLogicEvents.RENDER_ERROR, () => {
          throw new Error('error handler failed')
        }))
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
      refresh: vi.fn(),
      emitRenderToLogic: (type, payload) => emitRenderToLogic(pipeline, type as any, payload as any),
      onLogicToRender: (type, handler) => onLogicToRender(pipeline, type as any, handler as any),
      onRenderToLogic: (type, handler) => onRenderToLogic(pipeline, type as any, handler as any),
      reportError,
    })

    await expect(emitLogicToRender(pipeline, LogicToRenderEvents.VIEW_UPDATE, {
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
    })).resolves.toBeUndefined()

    expect(reportError).toHaveBeenCalledTimes(1)
    expect(reportError).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({
      phase: 'renderer-plugin:on-logic-to-render',
      pluginName: 'event-plugin',
      metadata: { event: LogicToRenderEvents.VIEW_UPDATE },
    }))
    await emitRenderToLogic(pipeline, RenderToLogicEvents.RENDER_ERROR, {
      message: 'existing renderer error',
      source: 'renderer',
    })
    expect(reportError).toHaveBeenCalledTimes(1)
    await host.destroy()
  })
})
