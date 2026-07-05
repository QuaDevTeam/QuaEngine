import type { QuaNativeHostApi, QuaNativeHostInfo } from '@quajs/native-contracts'
import { RenderToLogicEvents } from '@quajs/engine'
import { createNativeRendererIntent } from '@quajs/native-contracts'
import { describe, expect, it, vi } from 'vitest'
import { emitNativeRendererIntentToPipeline, NativeHostPlugin } from '../src'

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

describe('@quajs/engine-native renderer intents', () => {
  it('maps native renderer pointer intents into render-to-logic pipeline events', async () => {
    const pipeline = createTestPipeline()
    const received: Array<{ type: string, payload: unknown }> = []
    for (const type of [
      RenderToLogicEvents.USER_CHOICE_SELECT,
      RenderToLogicEvents.USER_INPUT_COMMAND,
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
      { type: RenderToLogicEvents.WINDOW_BLUR, payload: {} },
      { type: RenderToLogicEvents.WINDOW_FOCUS, payload: {} },
    ])
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
})
