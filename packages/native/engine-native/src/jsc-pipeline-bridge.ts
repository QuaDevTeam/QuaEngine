import type { GameStepAssetHint } from '@quajs/engine'
import type { NativeAssetPreloadOptions } from './asset-preload'
import { LogicToRenderEvents, onLogicToRender } from '@quajs/render-core'
import { createNativeAssetPreloadProjection } from './asset-preload'

type NativePipeline = Parameters<typeof onLogicToRender>[0]

export interface NativeJscPipelineBridge {
  emit: (event: string, payload: unknown) => void
}

export interface NativeJscPipelineBridgeOptions {
  assetPreload?: NativeAssetPreloadOptions
  events?: readonly LogicToRenderEvents[]
  initialView?: unknown
  onError?: (error: unknown, event: string) => void
}

export function resolveNativeJscPipelineBridge(): NativeJscPipelineBridge | undefined {
  const root = globalThis as typeof globalThis & {
    __quaNativePipelineBridge?: NativeJscPipelineBridge
  }
  const bridge = root.__quaNativePipelineBridge
  return bridge && typeof bridge.emit === 'function' ? bridge : undefined
}

export function installNativeJscPipelineBridge(
  bridge: NativeJscPipelineBridge,
  pipeline: NativePipeline,
  options: NativeJscPipelineBridgeOptions = {},
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

  const preloadListener: Parameters<NativePipeline['on']>[1] = (context) => {
    try {
      const { hints } = context.event.payload as { hints?: GameStepAssetHint[] }
      if (Array.isArray(hints))
        bridge.emit('assets/preload', createNativeAssetPreloadProjection(hints, options.assetPreload))
    }
    catch (error) {
      options.onError?.(error, 'assets/preload')
    }
  }
  pipeline.on('assets/preload', preloadListener)
  disposers.push(() => pipeline.off('assets/preload', preloadListener))

  if (options.initialView !== undefined) {
    bridge.emit(LogicToRenderEvents.VIEW_UPDATE, { view: options.initialView })
  }

  return () => {
    for (const dispose of disposers) {
      dispose()
    }
  }
}
