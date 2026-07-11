import type { QuaNativeHostApi, QuaNativeHostInfo } from '@quajs/native-contracts'
import { RenderToLogicEvents } from '@quajs/engine'
import { createNativeRendererIntent } from '@quajs/native-contracts'
import { describe, expect, it, vi } from 'vitest'
import { drainNativeRendererIntentsToPipeline, emitNativeRendererIntentToPipeline, NativeHostPlugin } from '../src'

function createHostInfo(): QuaNativeHostInfo {
  return {
    app: {
      name: 'Native Intent Fixture',
      bundleId: 'dev.quajs.native.intent',
      version: '1.0.0',
      buildNumber: '100',
      profile: 'debug',
      platform: 'macos',
      arch: 'arm64',
    },
    renderer: {
      packageName: '@quajs/native-renderer',
      version: '0.1.0',
      backend: 'wgpu',
      capabilityManifestHash: 'sha256:intent-fixture',
      capabilities: [],
    },
    runtime: {
      quickjsVersion: 'unsupported',
      nativeRuntimeVersion: '0.1.0',
      assetAdapterVersion: '0.1.0',
      storeAdapterVersion: '0.1.0',
    },
  }
}

function createHost(hostInfo = createHostInfo()): QuaNativeHostApi {
  return {
    getHostInfo: vi.fn(async () => hostInfo),
    readAssetBytes: vi.fn(),
    readStorage: vi.fn(),
    writeStorage: vi.fn(),
    deleteStorage: vi.fn(),
    hashBytes: vi.fn(),
  }
}

function createTestPipeline() {
  const listeners = new Map<string, Set<(context: any) => unknown>>()
  return {
    on: vi.fn((type: string, listener: (context: any) => unknown) => {
      const eventListeners = listeners.get(type) || new Set()
      eventListeners.add(listener)
      listeners.set(type, eventListeners)
    }),
    off: vi.fn((type: string, listener: (context: any) => unknown) => {
      listeners.get(type)?.delete(listener)
    }),
    emit: vi.fn(async (type: string, payload: unknown) => {
      for (const listener of listeners.get(type) || []) {
        await listener({
          event: {
            type,
            payload,
            timestamp: Date.now(),
            id: `${type}:test`,
          },
          handled: false,
          stopPropagation: false,
        })
      }
    }),
  }
}

function flushMicrotasks(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0))
}

const AUDIO_EVENTS = {
  ENDED: 'audio/ended',
  INTERRUPTED: 'audio/interrupted',
  UNLOCKED: 'audio/unlocked',
  ERROR: 'audio/error',
} as const

describe('@quajs/engine-native renderer intents', () => {
  it('maps allowlisted feature surface actions into plugin pipeline events', async () => {
    const pipeline = createTestPipeline()
    const received: unknown[] = []
    pipeline.on('backlog/close_request', context => received.push(context.event.payload))
    const featureSurfaces = [{
      pluginId: 'backlog',
      createOverlays: () => undefined,
      intentActions: [{
        action: 'backlog-close',
        event: 'backlog/close_request',
        createPayload: (payload: Readonly<Record<string, unknown>>) => ({
          source: payload.source,
        }),
      }],
    }]

    await expect(emitNativeRendererIntentToPipeline(
      pipeline as any,
      createNativeRendererIntent({
        type: 'ui/intent',
        payload: {
          action: 'backlog-close',
          elementId: 'backlog:close',
          source: 'native',
        },
      }),
      { featureSurfaces },
    )).resolves.toEqual({
      handled: true,
      emittedEvents: [
        {
          type: RenderToLogicEvents.UI_INTENT,
          payload: {
            action: 'backlog-close',
            elementId: 'backlog:close',
            source: 'native',
          },
        },
        {
          type: 'backlog/close_request',
          payload: { source: 'native' },
        },
      ],
    })
    expect(received).toEqual([{ source: 'native' }])
  })

  it('rejects duplicate feature surface action registrations', async () => {
    const pipeline = createTestPipeline()
    const duplicate = {
      pluginId: 'duplicate',
      createOverlays: () => undefined,
      intentActions: [{ action: 'feature-close', event: 'feature/close' }],
    }

    await expect(emitNativeRendererIntentToPipeline(
      pipeline as any,
      createNativeRendererIntent({
        type: 'ui/intent',
        payload: { action: 'feature-close', elementId: 'feature:close' },
      }),
      { featureSurfaces: [duplicate, duplicate] },
    )).rejects.toThrow('Native renderer feature intent action "feature-close" is registered more than once.')
  })

  it('maps native renderer pointer intents into render-to-logic pipeline events', async () => {
    const pipeline = createTestPipeline()
    const received: Array<{ type: string, payload: unknown }> = []
    for (const type of [
      RenderToLogicEvents.USER_CHOICE_SELECT,
      RenderToLogicEvents.USER_INPUT_COMMAND,
      RenderToLogicEvents.USER_TEXT_INPUT,
      RenderToLogicEvents.UI_INTENT,
      RenderToLogicEvents.UI_REQUEST_CLOSE,
      RenderToLogicEvents.UI_REQUEST_OPEN,
      RenderToLogicEvents.UI_REQUEST_UPDATE,
      RenderToLogicEvents.WINDOW_BLUR,
      RenderToLogicEvents.WINDOW_FOCUS,
    ]) {
      pipeline.on(type, context => received.push({
        type,
        payload: context.event.payload,
      }))
    }

    await expect(emitNativeRendererIntentToPipeline(
      pipeline as any,
      createNativeRendererIntent({ type: 'choice/select', payload: { choiceId: 'stay' } }),
    )).resolves.toEqual({
      handled: true,
      emittedEvents: [
        {
          type: RenderToLogicEvents.USER_CHOICE_SELECT,
          payload: { choiceId: 'stay' },
        },
      ],
    })

    await emitNativeRendererIntentToPipeline(
      pipeline as any,
      createNativeRendererIntent({ type: 'ui/intent', payload: { action: 'close', elementId: 'menu:close' } }),
    )
    await emitNativeRendererIntentToPipeline(
      pipeline as any,
      createNativeRendererIntent({
        type: 'ui/intent',
        payload: {
          action: 'open',
          elementId: 'settings',
          config: { tab: 'audio' },
        },
      }),
    )
    await emitNativeRendererIntentToPipeline(
      pipeline as any,
      createNativeRendererIntent({
        type: 'ui/intent',
        payload: {
          action: 'update',
          elementId: 'settings',
          config: { volume: 0.5 },
        },
      }),
    )
    await expect(emitNativeRendererIntentToPipeline(
      pipeline as any,
      createNativeRendererIntent({
        type: 'user/input_command',
        payload: {
          command: 'advance',
          device: 'keyboard',
          source: 'keyboard:Space',
          repeat: false,
          pressed: true,
          timestamp: 1234,
          metadata: {
            key: ' ',
            code: 'Space',
          },
        },
      }),
    )).resolves.toEqual({
      handled: true,
      emittedEvents: [
        {
          type: RenderToLogicEvents.USER_INPUT_COMMAND,
          payload: {
            command: 'advance',
            device: 'keyboard',
            source: 'keyboard:Space',
            repeat: false,
            pressed: true,
            timestamp: 1234,
            metadata: {
              key: ' ',
              code: 'Space',
            },
          },
        },
      ],
    })
    await expect(emitNativeRendererIntentToPipeline(
      pipeline as any,
      createNativeRendererIntent({
        type: 'user/text_input',
        payload: {
          phase: 'commit',
          source: 'ime',
          text: '決定',
          timestamp: 2345,
          metadata: {
            textByteCount: 6,
          },
        },
      }),
    )).resolves.toEqual({
      handled: true,
      emittedEvents: [
        {
          type: RenderToLogicEvents.USER_TEXT_INPUT,
          payload: {
            phase: 'commit',
            source: 'ime',
            text: '決定',
            timestamp: 2345,
            metadata: {
              textByteCount: 6,
            },
          },
        },
      ],
    })
    await expect(emitNativeRendererIntentToPipeline(
      pipeline as any,
      createNativeRendererIntent({ type: 'window/blur', payload: { ignored: true } }),
    )).resolves.toEqual({
      handled: true,
      emittedEvents: [
        {
          type: RenderToLogicEvents.WINDOW_BLUR,
          payload: {},
        },
      ],
    })
    await expect(emitNativeRendererIntentToPipeline(
      pipeline as any,
      createNativeRendererIntent({ type: 'window/focus', payload: { ignored: true } }),
    )).resolves.toEqual({
      handled: true,
      emittedEvents: [
        {
          type: RenderToLogicEvents.WINDOW_FOCUS,
          payload: {},
        },
      ],
    })
    await expect(emitNativeRendererIntentToPipeline(
      pipeline as any,
      createNativeRendererIntent({ type: 'ui/unknown', payload: { action: 'noop' } }),
    )).resolves.toEqual({
      handled: false,
      emittedEvents: [],
      ignoredReason: 'unknown-intent-type',
    })

    expect(received).toEqual([
      { type: RenderToLogicEvents.USER_CHOICE_SELECT, payload: { choiceId: 'stay' } },
      { type: RenderToLogicEvents.UI_INTENT, payload: { action: 'close', elementId: 'menu:close' } },
      { type: RenderToLogicEvents.UI_REQUEST_CLOSE, payload: { elementId: 'menu:close' } },
      {
        type: RenderToLogicEvents.UI_INTENT,
        payload: { action: 'open', elementId: 'settings', config: { tab: 'audio' } },
      },
      {
        type: RenderToLogicEvents.UI_REQUEST_OPEN,
        payload: { elementId: 'settings', config: { tab: 'audio' } },
      },
      {
        type: RenderToLogicEvents.UI_INTENT,
        payload: { action: 'update', elementId: 'settings', config: { volume: 0.5 } },
      },
      {
        type: RenderToLogicEvents.UI_REQUEST_UPDATE,
        payload: { elementId: 'settings', config: { volume: 0.5 } },
      },
      {
        type: RenderToLogicEvents.USER_INPUT_COMMAND,
        payload: {
          command: 'advance',
          device: 'keyboard',
          source: 'keyboard:Space',
          repeat: false,
          pressed: true,
          timestamp: 1234,
          metadata: {
            key: ' ',
            code: 'Space',
          },
        },
      },
      {
        type: RenderToLogicEvents.USER_TEXT_INPUT,
        payload: {
          phase: 'commit',
          source: 'ime',
          text: '決定',
          timestamp: 2345,
          metadata: {
            textByteCount: 6,
          },
        },
      },
      { type: RenderToLogicEvents.WINDOW_BLUR, payload: {} },
      { type: RenderToLogicEvents.WINDOW_FOCUS, payload: {} },
    ])
  })

  it('drains native host renderer intent ledgers into the existing pipeline', async () => {
    const host = createHost()
    host.drainRendererIntents = vi.fn(async () => [
      createNativeRendererIntent({ type: 'choice/select', payload: { choiceId: 'stay' } }),
      createNativeRendererIntent({ type: 'native/debug_probe', payload: { value: 1 } }),
    ])
    const pipeline = createTestPipeline()
    const received: unknown[] = []
    const errors: Array<{ message: string, type: string }> = []
    pipeline.on(RenderToLogicEvents.USER_CHOICE_SELECT, context => received.push(context.event.payload))

    const result = await drainNativeRendererIntentsToPipeline(host, pipeline as any, {
      onError: (error, event) => {
        errors.push({
          message: error instanceof Error ? error.message : String(error),
          type: event.type,
        })
      },
    })

    expect(host.drainRendererIntents).toHaveBeenCalledTimes(1)
    expect(result).toEqual({
      drainedCount: 2,
      dispatchResults: [
        {
          handled: true,
          emittedEvents: [{
            type: RenderToLogicEvents.USER_CHOICE_SELECT,
            payload: { choiceId: 'stay' },
          }],
        },
        {
          handled: false,
          emittedEvents: [],
          ignoredReason: 'unknown-intent-type',
        },
      ],
    })
    expect(received).toEqual([{ choiceId: 'stay' }])
    expect(errors).toEqual([{
      message: 'Native renderer intent "native/debug_probe" was not handled by the native engine bridge.',
      type: 'native/debug_probe',
    }])
  })

  it('forwards native audio renderer intents into the existing audio pipeline events', async () => {
    const pipeline = createTestPipeline()
    const received: Array<{ type: string, payload: unknown }> = []
    for (const type of Object.values(AUDIO_EVENTS)) {
      pipeline.on(type, context => received.push({
        type,
        payload: context.event.payload,
      }))
    }

    await expect(emitNativeRendererIntentToPipeline(
      pipeline as any,
      createNativeRendererIntent({
        type: AUDIO_EVENTS.ENDED,
        payload: {
          channel: 'voice',
          id: 'voice-line-1',
          assetKey: 'voice/ch01/line-1.ogg',
          chapterId: 'ch01',
          lineId: 'line-1',
          reason: 'finished',
          metadata: {
            contentPackageId: 'runtime.voice',
          },
        },
      }),
    )).resolves.toEqual({
      handled: true,
      emittedEvents: [
        {
          type: AUDIO_EVENTS.ENDED,
          payload: {
            channel: 'voice',
            id: 'voice-line-1',
            assetKey: 'voice/ch01/line-1.ogg',
            chapterId: 'ch01',
            lineId: 'line-1',
            reason: 'finished',
            metadata: {
              contentPackageId: 'runtime.voice',
            },
          },
        },
      ],
    })

    await emitNativeRendererIntentToPipeline(
      pipeline as any,
      createNativeRendererIntent({
        type: AUDIO_EVENTS.INTERRUPTED,
        payload: {
          channel: 'bgm',
          id: 'bgm-main',
          assetKey: 'audio/bgm/night.ogg',
          reason: 'stopped',
        },
      }),
    )
    await expect(emitNativeRendererIntentToPipeline(
      pipeline as any,
      createNativeRendererIntent({
        type: AUDIO_EVENTS.UNLOCKED,
        payload: {
          timestamp: 3456,
        },
      }),
    )).resolves.toEqual({
      handled: true,
      emittedEvents: [
        {
          type: AUDIO_EVENTS.UNLOCKED,
          payload: { timestamp: 3456 },
        },
      ],
    })
    await emitNativeRendererIntentToPipeline(
      pipeline as any,
      createNativeRendererIntent({
        type: AUDIO_EVENTS.ERROR,
        payload: {
          message: 'native decoder failed',
          trackId: 'sfx-click',
          error: { code: 'decode' },
        },
      }),
    )

    expect(received).toEqual([
      {
        type: AUDIO_EVENTS.ENDED,
        payload: {
          channel: 'voice',
          id: 'voice-line-1',
          assetKey: 'voice/ch01/line-1.ogg',
          chapterId: 'ch01',
          lineId: 'line-1',
          reason: 'finished',
          metadata: {
            contentPackageId: 'runtime.voice',
          },
        },
      },
      {
        type: AUDIO_EVENTS.INTERRUPTED,
        payload: {
          channel: 'bgm',
          id: 'bgm-main',
          assetKey: 'audio/bgm/night.ogg',
          reason: 'stopped',
        },
      },
      { type: AUDIO_EVENTS.UNLOCKED, payload: { timestamp: 3456 } },
      {
        type: AUDIO_EVENTS.ERROR,
        payload: {
          message: 'native decoder failed',
          trackId: 'sfx-click',
          error: { code: 'decode' },
        },
      },
    ])
  })

  it('rejects malformed native audio intents before emitting pipeline events', async () => {
    const pipeline = createTestPipeline()
    const received: unknown[] = []
    for (const type of Object.values(AUDIO_EVENTS)) {
      pipeline.on(type, context => received.push(context.event.payload))
    }

    await expect(emitNativeRendererIntentToPipeline(
      pipeline as any,
      createNativeRendererIntent({
        type: AUDIO_EVENTS.ENDED,
        payload: {
          channel: 'movie',
          id: 'voice-line-1',
          assetKey: 'voice/ch01/line-1.ogg',
        },
      }),
    )).rejects.toThrow('Native renderer audio/ended intent requires supported string payload field "channel".')

    await expect(emitNativeRendererIntentToPipeline(
      pipeline as any,
      createNativeRendererIntent({
        type: AUDIO_EVENTS.INTERRUPTED,
        payload: {
          channel: 'bgm',
          id: 'bgm-main',
        },
      }),
    )).rejects.toThrow('Native renderer audio/interrupted intent requires string payload field "assetKey".')

    await expect(emitNativeRendererIntentToPipeline(
      pipeline as any,
      createNativeRendererIntent({
        type: AUDIO_EVENTS.ENDED,
        payload: {
          channel: 'voice',
          id: 'voice-line-1',
          assetKey: 'voice/ch01/line-1.ogg',
          metadata: ['not-record'],
        },
      }),
    )).rejects.toThrow('Native renderer audio/ended intent payload field "metadata" must be an object when provided.')

    await expect(emitNativeRendererIntentToPipeline(
      pipeline as any,
      createNativeRendererIntent({
        type: AUDIO_EVENTS.UNLOCKED,
        payload: { timestamp: Number.NaN },
      }),
    )).rejects.toThrow('Native renderer audio/unlocked intent requires finite number payload field "timestamp".')

    await expect(emitNativeRendererIntentToPipeline(
      pipeline as any,
      createNativeRendererIntent({
        type: AUDIO_EVENTS.ERROR,
        payload: { trackId: 'sfx-click' },
      }),
    )).rejects.toThrow('Native renderer audio/error intent requires string payload field "message".')

    expect(received).toEqual([])
  })

  it('rejects malformed native input command intents before emitting pipeline events', async () => {
    const pipeline = createTestPipeline()
    const received: unknown[] = []
    pipeline.on(RenderToLogicEvents.USER_INPUT_COMMAND, context => received.push(context.event.payload))

    await expect(emitNativeRendererIntentToPipeline(
      pipeline as any,
      createNativeRendererIntent({
        type: 'user/input_command',
        payload: {
          command: 'debug:open-devtools',
          device: 'keyboard',
          source: 'keyboard:F12',
          timestamp: 1234,
        },
      }),
    )).rejects.toThrow('Native renderer user/input_command intent requires supported string payload field "command".')

    await expect(emitNativeRendererIntentToPipeline(
      pipeline as any,
      createNativeRendererIntent({
        type: 'user/input_command',
        payload: {
          command: 'advance',
          device: 'keyboard',
          source: 'keyboard:Space',
          timestamp: Number.NaN,
        },
      }),
    )).rejects.toThrow('Native renderer user/input_command intent requires finite number payload field "timestamp".')

    await expect(emitNativeRendererIntentToPipeline(
      pipeline as any,
      createNativeRendererIntent({
        type: 'user/input_command',
        payload: {
          command: 'advance',
          device: 'keyboard',
          source: 'keyboard:Space',
          timestamp: 1234,
          metadata: ['not-record'],
        },
      }),
    )).rejects.toThrow('Native renderer user/input_command intent payload field "metadata" must be an object when provided.')

    expect(received).toEqual([])
  })

  it('rejects malformed native text input intents before emitting pipeline events', async () => {
    const pipeline = createTestPipeline()
    const received: unknown[] = []
    pipeline.on(RenderToLogicEvents.USER_TEXT_INPUT, context => received.push(context.event.payload))

    await expect(emitNativeRendererIntentToPipeline(
      pipeline as any,
      createNativeRendererIntent({
        type: 'user/text_input',
        payload: {
          phase: 'replace-all-text',
          source: 'ime',
          timestamp: 1234,
        },
      }),
    )).rejects.toThrow('Native renderer user/text_input intent requires supported string payload field "phase".')

    await expect(emitNativeRendererIntentToPipeline(
      pipeline as any,
      createNativeRendererIntent({
        type: 'user/text_input',
        payload: {
          phase: 'commit',
          source: 'ime',
          text: ['not-text'],
          timestamp: 1234,
        },
      }),
    )).rejects.toThrow('Native renderer user/text_input intent payload field "text" must be a string when provided.')

    await expect(emitNativeRendererIntentToPipeline(
      pipeline as any,
      createNativeRendererIntent({
        type: 'user/text_input',
        payload: {
          phase: 'preedit',
          source: 'ime',
          timestamp: 1234,
          metadata: ['not-record'],
        },
      }),
    )).rejects.toThrow('Native renderer user/text_input intent payload field "metadata" must be an object when provided.')

    expect(received).toEqual([])
  })

  it('rejects malformed native choice select intents before emitting pipeline events', async () => {
    const pipeline = createTestPipeline()
    const received: unknown[] = []
    pipeline.on(RenderToLogicEvents.USER_CHOICE_SELECT, context => received.push(context.event.payload))

    await expect(emitNativeRendererIntentToPipeline(
      pipeline as any,
      createNativeRendererIntent({
        type: 'choice/select',
        payload: {},
      }),
    )).rejects.toThrow('Native renderer choice/select intent requires string payload field "choiceId".')

    await expect(emitNativeRendererIntentToPipeline(
      pipeline as any,
      createNativeRendererIntent({
        type: 'choice/select',
        payload: { choiceId: ['forged-choice'] },
      }),
    )).rejects.toThrow('Native renderer choice/select intent requires string payload field "choiceId".')

    expect(received).toEqual([])
  })

  it('preserves native UI intent metadata without inventing overlay shortcuts for custom actions', async () => {
    const pipeline = createTestPipeline()
    const received: Array<{ type: string, payload: unknown }> = []
    for (const type of [
      RenderToLogicEvents.UI_INTENT,
      RenderToLogicEvents.UI_REQUEST_CLOSE,
      RenderToLogicEvents.UI_REQUEST_OPEN,
      RenderToLogicEvents.UI_REQUEST_UPDATE,
    ]) {
      pipeline.on(type, context => received.push({
        type,
        payload: context.event.payload,
      }))
    }

    await expect(emitNativeRendererIntentToPipeline(
      pipeline as any,
      createNativeRendererIntent({
        type: 'ui/intent',
        payload: {
          action: 'save.slot.preview',
          elementId: 'save-slot-1',
          slotId: 'slot-1',
          hovered: true,
          config: { thumbnail: 'assets/save/slot-1.png' },
          nested: { source: 'runtime-ui' },
        },
      }),
    )).resolves.toEqual({
      handled: true,
      emittedEvents: [
        {
          type: RenderToLogicEvents.UI_INTENT,
          payload: {
            action: 'save.slot.preview',
            elementId: 'save-slot-1',
            slotId: 'slot-1',
            hovered: true,
            config: { thumbnail: 'assets/save/slot-1.png' },
            nested: { source: 'runtime-ui' },
          },
        },
      ],
    })

    expect(received).toEqual([
      {
        type: RenderToLogicEvents.UI_INTENT,
        payload: {
          action: 'save.slot.preview',
          elementId: 'save-slot-1',
          slotId: 'slot-1',
          hovered: true,
          config: { thumbnail: 'assets/save/slot-1.png' },
          nested: { source: 'runtime-ui' },
        },
      },
    ])
  })

  it('rejects malformed native UI intent canonical fields before emitting pipeline events', async () => {
    const pipeline = createTestPipeline()
    const received: Array<{ type: string, payload: unknown }> = []
    for (const type of [
      RenderToLogicEvents.UI_INTENT,
      RenderToLogicEvents.UI_REQUEST_CLOSE,
      RenderToLogicEvents.UI_REQUEST_OPEN,
      RenderToLogicEvents.UI_REQUEST_UPDATE,
    ]) {
      pipeline.on(type, context => received.push({
        type,
        payload: context.event.payload,
      }))
    }

    await expect(emitNativeRendererIntentToPipeline(
      pipeline as any,
      createNativeRendererIntent({
        type: 'ui/intent',
        payload: {
          action: ['open'],
          elementId: { forged: 'settings' },
          source: 'native-ui',
        },
      }),
    )).rejects.toThrow('Native renderer ui/intent payload field "action" must be a non-empty string when provided.')

    await expect(emitNativeRendererIntentToPipeline(
      pipeline as any,
      createNativeRendererIntent({
        type: 'ui/intent',
        payload: {
          action: 'open',
          elementId: { forged: 'settings' },
        },
      }),
    )).rejects.toThrow('Native renderer ui/intent payload field "elementId" must be a non-empty string when provided.')

    expect(received).toEqual([])
  })

  it('does not emit render-to-logic business events for malformed native renderer intents', async () => {
    const host = createHost()
    const pipeline = createTestPipeline()
    const received: Array<{ type: string, payload: unknown }> = []
    const errors: unknown[] = []
    for (const type of [
      RenderToLogicEvents.USER_CHOICE_SELECT,
      RenderToLogicEvents.UI_INTENT,
      RenderToLogicEvents.USER_INPUT_COMMAND,
    ]) {
      pipeline.on(type, context => received.push({
        type,
        payload: context.event.payload,
      }))
    }
    pipeline.on(RenderToLogicEvents.RENDER_ERROR, context => errors.push(context.event.payload))

    const plugin = new NativeHostPlugin({ host })
    await plugin.init({ pipeline } as any)
    host.emitRendererIntent?.(createNativeRendererIntent({
      type: 'user/input_command',
      payload: {
        command: 'advance',
        device: 'keyboard',
        source: 'keyboard:Space',
        timestamp: Number.NaN,
      },
    }))
    await flushMicrotasks()

    expect(received).toEqual([])
    expect(plugin.getRendererIntentErrors()).toHaveLength(1)
    expect(errors).toEqual([
      expect.objectContaining({
        message: 'Native renderer user/input_command intent requires finite number payload field "timestamp".',
        source: 'native-renderer',
        phase: 'renderer-intent',
        recoverable: true,
        metadata: {
          nativeIntentType: RenderToLogicEvents.USER_INPUT_COMMAND,
        },
      }),
    ])
  })

  it('installs native renderer intent callbacks on the host during plugin lifetime', async () => {
    const host = createHost()
    const pipeline = createTestPipeline()
    const received: unknown[] = []
    pipeline.on(RenderToLogicEvents.USER_CHOICE_SELECT, context => received.push(context.event.payload))

    const plugin = new NativeHostPlugin({ host })
    await plugin.init({ pipeline } as any)

    host.emitRendererIntent?.(createNativeRendererIntent({
      type: 'choice/select',
      payload: { choiceId: 'left' },
    }))
    await flushMicrotasks()

    expect(received).toEqual([{ choiceId: 'left' }])

    plugin.destroy()
    host.emitRendererIntent?.(createNativeRendererIntent({
      type: 'choice/select',
      payload: { choiceId: 'right' },
    }))
    await flushMicrotasks()

    expect(received).toEqual([{ choiceId: 'left' }])
  })

  it('drains native host renderer intents through the plugin without bouncing through host emit callbacks', async () => {
    const host = createHost()
    const previousEmitRendererIntent = vi.fn()
    host.emitRendererIntent = previousEmitRendererIntent
    host.drainRendererIntents = vi.fn(async () => [
      createNativeRendererIntent({
        type: 'choice/select',
        payload: { choiceId: 'from-rust-ledger' },
      }),
    ])
    const pipeline = createTestPipeline()
    const received: unknown[] = []
    pipeline.on(RenderToLogicEvents.USER_CHOICE_SELECT, context => received.push(context.event.payload))

    const plugin = new NativeHostPlugin({ host })
    await plugin.init({ pipeline } as any)
    const result = await plugin.drainRendererIntents()
    await flushMicrotasks()

    expect(result).toEqual({
      drainedCount: 1,
      dispatchResults: [{
        handled: true,
        emittedEvents: [{
          type: RenderToLogicEvents.USER_CHOICE_SELECT,
          payload: { choiceId: 'from-rust-ledger' },
        }],
      }],
    })
    expect(received).toEqual([{ choiceId: 'from-rust-ledger' }])
    expect(host.drainRendererIntents).toHaveBeenCalledTimes(1)
    expect(previousEmitRendererIntent).not.toHaveBeenCalled()
  })

  it('chains and restores existing native renderer intent callbacks without creating a second dispatch path', async () => {
    const host = createHost()
    const previousEmitRendererIntent = vi.fn()
    host.emitRendererIntent = previousEmitRendererIntent
    const pipeline = createTestPipeline()
    const received: unknown[] = []
    pipeline.on(RenderToLogicEvents.USER_CHOICE_SELECT, context => received.push(context.event.payload))

    const plugin = new NativeHostPlugin({ host })
    await plugin.init({ pipeline } as any)
    const leftIntent = createNativeRendererIntent({
      type: 'choice/select',
      payload: { choiceId: 'left' },
    })

    host.emitRendererIntent?.(leftIntent)
    await flushMicrotasks()

    expect(received).toEqual([{ choiceId: 'left' }])
    expect(previousEmitRendererIntent).toHaveBeenCalledTimes(1)
    expect(previousEmitRendererIntent).toHaveBeenCalledWith(leftIntent)

    plugin.destroy()
    expect(host.emitRendererIntent).toBe(previousEmitRendererIntent)
    host.emitRendererIntent?.(createNativeRendererIntent({
      type: 'choice/select',
      payload: { choiceId: 'right' },
    }))
    await flushMicrotasks()

    expect(received).toEqual([{ choiceId: 'left' }])
    expect(previousEmitRendererIntent).toHaveBeenCalledTimes(2)
  })

  it('reports previous native renderer intent callback failures without blocking pipeline dispatch', async () => {
    const previousError = new Error('previous native callback failed')
    const host = createHost()
    host.emitRendererIntent = vi.fn(() => {
      throw previousError
    })
    const pipeline = createTestPipeline()
    const received: unknown[] = []
    const errors: unknown[] = []
    pipeline.on(RenderToLogicEvents.USER_CHOICE_SELECT, context => received.push(context.event.payload))
    pipeline.on(RenderToLogicEvents.RENDER_ERROR, context => errors.push(context.event.payload))

    const plugin = new NativeHostPlugin({ host })
    await plugin.init({ pipeline } as any)
    const intent = createNativeRendererIntent({
      type: 'choice/select',
      payload: { choiceId: 'left' },
    })

    expect(() => host.emitRendererIntent?.(intent)).not.toThrow()
    await flushMicrotasks()

    expect(received).toEqual([{ choiceId: 'left' }])
    expect(plugin.getRendererIntentErrors()).toEqual([previousError])
    expect(errors).toEqual([
      expect.objectContaining({
        message: 'previous native callback failed',
        source: 'native-renderer',
        phase: 'renderer-intent',
        recoverable: true,
        metadata: {
          nativeIntentType: 'choice/select',
        },
      }),
    ])
  })

  it('reports malformed native renderer intent payloads through render errors', async () => {
    const host = createHost()
    const pipeline = createTestPipeline()
    const errors: unknown[] = []
    pipeline.on(RenderToLogicEvents.RENDER_ERROR, context => errors.push(context.event.payload))

    const plugin = new NativeHostPlugin({ host })
    await plugin.init({ pipeline } as any)
    host.emitRendererIntent?.({ type: 'choice/select', payloadJson: '{"choiceId":1}' })
    await flushMicrotasks()

    expect(plugin.getRendererIntentErrors()).toHaveLength(1)
    expect(errors).toEqual([
      expect.objectContaining({
        message: 'Native renderer choice/select intent requires string payload field "choiceId".',
        source: 'native-renderer',
        phase: 'renderer-intent',
        metadata: {
          nativeIntentType: 'choice/select',
        },
      }),
    ])
  })

  it('reports malformed native UI intent canonical fields through render errors', async () => {
    const host = createHost()
    const pipeline = createTestPipeline()
    const received: Array<{ type: string, payload: unknown }> = []
    const errors: unknown[] = []
    pipeline.on(RenderToLogicEvents.UI_INTENT, context => received.push({
      type: RenderToLogicEvents.UI_INTENT,
      payload: context.event.payload,
    }))
    pipeline.on(RenderToLogicEvents.RENDER_ERROR, context => errors.push(context.event.payload))

    const plugin = new NativeHostPlugin({ host })
    await plugin.init({ pipeline } as any)
    host.emitRendererIntent?.(createNativeRendererIntent({
      type: 'ui/intent',
      payload: {
        action: ['open'],
        elementId: 'settings',
      },
    }))
    await flushMicrotasks()

    expect(received).toEqual([])
    expect(plugin.getRendererIntentErrors()).toHaveLength(1)
    expect(errors).toEqual([
      expect.objectContaining({
        message: 'Native renderer ui/intent payload field "action" must be a non-empty string when provided.',
        source: 'native-renderer',
        phase: 'renderer-intent',
        metadata: {
          nativeIntentType: 'ui/intent',
        },
      }),
    ])
  })

  it('reports malformed native renderer intent JSON through render errors', async () => {
    const host = createHost()
    const pipeline = createTestPipeline()
    const received: Array<{ type: string, payload: unknown }> = []
    const errors: unknown[] = []
    for (const type of [
      RenderToLogicEvents.USER_CHOICE_SELECT,
      RenderToLogicEvents.UI_INTENT,
      RenderToLogicEvents.USER_INPUT_COMMAND,
    ]) {
      pipeline.on(type, context => received.push({
        type,
        payload: context.event.payload,
      }))
    }
    pipeline.on(RenderToLogicEvents.RENDER_ERROR, context => errors.push(context.event.payload))

    const plugin = new NativeHostPlugin({ host })
    await plugin.init({ pipeline } as any)
    host.emitRendererIntent?.({ type: 'choice/select', payloadJson: '{"choiceId":' })
    await flushMicrotasks()

    expect(received).toEqual([])
    expect(plugin.getRendererIntentErrors()).toHaveLength(1)
    expect(errors).toEqual([
      expect.objectContaining({
        message: expect.stringContaining('JSON'),
        source: 'native-renderer',
        phase: 'renderer-intent',
        recoverable: true,
        metadata: {
          nativeIntentType: 'choice/select',
        },
      }),
    ])
  })

  it('reports unhandled native renderer intent types through render errors', async () => {
    const host = createHost()
    const pipeline = createTestPipeline()
    const received: Array<{ type: string, payload: unknown }> = []
    const errors: unknown[] = []
    for (const type of [
      RenderToLogicEvents.USER_CHOICE_SELECT,
      RenderToLogicEvents.UI_INTENT,
      RenderToLogicEvents.USER_INPUT_COMMAND,
    ]) {
      pipeline.on(type, context => received.push({
        type,
        payload: context.event.payload,
      }))
    }
    pipeline.on(RenderToLogicEvents.RENDER_ERROR, context => errors.push(context.event.payload))

    const plugin = new NativeHostPlugin({ host })
    await plugin.init({ pipeline } as any)
    host.emitRendererIntent?.(createNativeRendererIntent({
      type: 'native/debug_probe',
      payload: { action: 'noop' },
    }))
    await flushMicrotasks()

    expect(received).toEqual([])
    expect(plugin.getRendererIntentErrors()).toHaveLength(1)
    expect(errors).toEqual([
      expect.objectContaining({
        message: 'Native renderer intent "native/debug_probe" was not handled by the native engine bridge.',
        source: 'native-renderer',
        phase: 'renderer-intent',
        recoverable: true,
        metadata: {
          nativeIntentType: 'native/debug_probe',
        },
      }),
    ])
  })
})
