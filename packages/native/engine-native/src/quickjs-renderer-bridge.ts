import type { NativeRendererIntent } from '@quajs/native-contracts'
import type { NativeRendererIntentBridgeOptions, NativeRendererIntentDispatchResult } from './renderer-intents'
import { emitNativeRendererIntentToPipeline } from './renderer-intents'

type NativeRendererIntentPipeline = Parameters<typeof emitNativeRendererIntentToPipeline>[0]

export interface NativeQuickJsRendererIntentBridge {
  subscribe: (
    listener: (intent: NativeRendererIntent) => void | Promise<void>,
  ) => () => void
}

export interface NativeQuickJsRendererIntentSubscriptionOptions extends NativeRendererIntentBridgeOptions {
  onDispatch?: (result: NativeRendererIntentDispatchResult, intent: NativeRendererIntent) => void
}

export function resolveNativeQuickJsRendererIntentBridge(): NativeQuickJsRendererIntentBridge | undefined {
  const root = globalThis as typeof globalThis & {
    __quaNativeRendererBridge?: NativeQuickJsRendererIntentBridge
  }
  const bridge = root.__quaNativeRendererBridge
  return bridge && typeof bridge.subscribe === 'function' ? bridge : undefined
}

export function installNativeQuickJsRendererIntentBridge(
  bridge: NativeQuickJsRendererIntentBridge,
  pipeline: NativeRendererIntentPipeline,
  options: NativeQuickJsRendererIntentSubscriptionOptions = {},
): () => void {
  return bridge.subscribe(async (intent) => {
    try {
      const result = await emitNativeRendererIntentToPipeline(pipeline, intent, options)
      options.onDispatch?.(result, intent)
      if (!result.handled) {
        options.onError?.(
          new Error(`Native renderer intent "${intent.type}" was not handled by the QuickJS UI bridge.`),
          intent,
        )
      }
    }
    catch (error) {
      options.onError?.(error, intent)
    }
  })
}
