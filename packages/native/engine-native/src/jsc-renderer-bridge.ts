import type { NativeRendererIntent } from '@quajs/native-contracts'
import type { NativeRendererIntentBridgeOptions, NativeRendererIntentDispatchResult } from './renderer-intents'
import { emitNativeRendererIntentToPipeline } from './renderer-intents'

type NativeRendererIntentPipeline = Parameters<typeof emitNativeRendererIntentToPipeline>[0]

export interface NativeJscRendererIntentBridge {
  subscribe: (
    listener: (intent: NativeRendererIntent) => void | Promise<void>,
  ) => () => void
}

export interface NativeJscRendererIntentSubscriptionOptions extends NativeRendererIntentBridgeOptions {
  onDispatch?: (result: NativeRendererIntentDispatchResult, intent: NativeRendererIntent) => void
}

export function resolveNativeJscRendererIntentBridge(): NativeJscRendererIntentBridge | undefined {
  const root = globalThis as typeof globalThis & {
    __quaNativeRendererBridge?: NativeJscRendererIntentBridge
  }
  const bridge = root.__quaNativeRendererBridge
  return bridge && typeof bridge.subscribe === 'function' ? bridge : undefined
}

export function installNativeJscRendererIntentBridge(
  bridge: NativeJscRendererIntentBridge,
  pipeline: NativeRendererIntentPipeline,
  options: NativeJscRendererIntentSubscriptionOptions = {},
): () => void {
  return bridge.subscribe(async (intent) => {
    try {
      const result = await emitNativeRendererIntentToPipeline(pipeline, intent, options)
      options.onDispatch?.(result, intent)
      if (!result.handled) {
        options.onError?.(
          new Error(`Native renderer intent "${intent.type}" was not handled by the JavaScriptCore UI bridge.`),
          intent,
        )
      }
    }
    catch (error) {
      options.onError?.(error, intent)
    }
  })
}
