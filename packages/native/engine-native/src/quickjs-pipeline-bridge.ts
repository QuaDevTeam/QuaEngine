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

  // Transient native UI navigation uses the existing pipeline and host bridge.
  // It never writes scroll positions into the engine/store projection.
  const scrollListener: Parameters<NativePipeline['on']>[1] = (context) => {
    try {
      bridge.emit('native-ui/scroll', context.event.payload)
    }
    catch (error) {
      options.onError?.(error, 'native-ui/scroll')
    }
  }
  pipeline.on('native-ui/scroll', scrollListener)
  disposers.push(() => pipeline.off('native-ui/scroll', scrollListener))

  if (options.initialView !== undefined) {
    bridge.emit(LogicToRenderEvents.VIEW_UPDATE, { view: options.initialView })
  }

  return () => {
    for (const dispose of disposers) {
      dispose()
    }
  }
}
