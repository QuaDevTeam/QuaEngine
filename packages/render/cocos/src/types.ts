import type { AssetData, AssetType, QuaAssets } from '@quajs/assets'
import type { CocosHost, CocosHostAudioHandle, CocosHostNode, CocosHostResource } from '@quajs/cocos-host'
import type { Pipeline } from '@quajs/pipeline'
import type { AudioTrackEventPayload } from '@quajs/plugin-audio/contracts'
import type {
  RendererActions,
  RendererPlugin,
  RendererPluginContext,
  ResolvedStageLayout,
} from '@quajs/render-core'

export interface CocosRendererSnapshot {
  pipeline: Pipeline
  assets?: QuaAssets
  view: ReturnType<RendererPluginContext['getViewState']>
  revision: number
  assetRevision: number
  actions: RendererActions
  stageLayout: ResolvedStageLayout
}

export type CocosRendererSnapshotListener = (snapshot: CocosRendererSnapshot) => void
export type CocosRendererAnimationSync = () => void | Promise<void>

export interface CocosRendererHostContext {
  host: CocosHost
  assets?: QuaAssets
  rendererId?: string
  getViewState: () => RendererPluginContext['getViewState'] extends () => infer T ? T : never
  getActions: () => RendererActions
  registerAdvanceInterceptor: (interceptor: (source?: string) => boolean | Promise<boolean>) => () => void
  registerAnimationSync: (sync: CocosRendererAnimationSync) => () => void
  getStageLayout: () => ResolvedStageLayout
  getRootNode: () => CocosHostNode
  getLayerNode: (id: string, kind?: string, order?: number) => CocosHostNode
  clearLayer: (id: string) => void
  resolveAsset: (type: AssetType, name: string | undefined, options?: { targetPackageId?: string }) => Promise<CocosHostResource | undefined>
  releaseLayerResources: (id: string) => void
  setLayerResource: (layerId: string, key: string, resource?: CocosHostResource) => void
  syncAudioHandle: (layerId: string, key: string, resource: CocosHostResource, options: {
    loop?: boolean
    volume?: number
    playbackRate?: number
    bus?: string
    playing?: boolean
    playAt?: number
    state?: string
    fadeInMs?: number
    fadeOutMs?: number
    seekMs?: number
    offsetMs?: number
    automation?: readonly Record<string, unknown>[]
    interruptible?: boolean
    endedPayload?: AudioTrackEventPayload
  }) => Promise<CocosHostAudioHandle>
  releaseAudioHandles: (layerId: string, activeKeys?: readonly string[]) => void
  interruptAudioTracks: (kind: string, source?: string) => Promise<void>
  captureStage: (
    options?: { mimeType?: string, quality?: number, maxWidth?: number, maxHeight?: number },
    policy?: { uiMode?: string },
  ) => Promise<{
    bytes: Uint8Array
    mimeType: string
    width?: number
    height?: number
    capturedAt: number
  }>
  emitRenderToLogic: RendererPluginContext['emitRenderToLogic']
  refresh: () => void
  reportWarning: (message: string, metadata?: Record<string, unknown>) => void
  reportError: RendererPluginContext['reportError']
}

export type CocosRendererPluginContext = RendererPluginContext & { cocos: CocosRendererHostContext }

export interface CocosRendererPluginDefinition {
  readonly name: string
  setup: (context: CocosRendererPluginContext) => void | Promise<void>
  destroy?: () => void | Promise<void>
}

export type CocosRendererPlugin = RendererPlugin

export interface ResolvedCocosAsset {
  asset: AssetData
  resource: CocosHostResource
}
