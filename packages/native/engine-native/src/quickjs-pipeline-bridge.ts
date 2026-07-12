import { LogicToRenderEvents, onLogicToRender } from '@quajs/render-core'

type NativePipeline = Parameters<typeof onLogicToRender>[0]

export interface NativeQuickJsPipelineBridge {
  emit: (event: string, payload: unknown) => void
}

export interface NativeQuickJsPipelineBridgeOptions {
  events?: readonly LogicToRenderEvents[]
  initialView?: unknown
  onError?: (error: unknown, event: string) => void
}

export function resolveNativeQuickJsPipelineBridge(): NativeQuickJsPipelineBridge | undefined {
  const root = globalThis as typeof globalThis & {
    __quaNativePipelineBridge?: NativeQuickJsPipelineBridge
  }
  const bridge = root.__quaNativePipelineBridge
  return bridge && typeof bridge.emit === 'function' ? bridge : undefined
}

export function installNativeQuickJsPipelineBridge(
  bridge: NativeQuickJsPipelineBridge,
  pipeline: NativePipeline,
  options: NativeQuickJsPipelineBridgeOptions = {},
): () => void {
  const events = options.events ?? Object.values(LogicToRenderEvents)
  const disposers = events.map(event => onLogicToRender(
    pipeline,
    event,
    ((payload: unknown) => {
      try {
        bridge.emit(event, payload)
      }
      catch (error) {
        options.onError?.(error, event)
      }
    }) as never,
  ))

  if (options.initialView !== undefined) {
    bridge.emit(LogicToRenderEvents.VIEW_UPDATE, { view: options.initialView })
  }

  return () => {
    for (const dispose of disposers) {
      dispose()
    }
  }
}
