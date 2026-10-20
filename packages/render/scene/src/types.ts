import type { AssetData, AssetType, QuaAssets } from '@quajs/assets'
import type { Pipeline } from '@quajs/pipeline'
import type { AudioTrackEventPayload } from '@quajs/plugin-audio/contracts'
import type {
  RendererActions,
  RendererPlugin,
  RendererPluginContext,
  ResolvedStageLayout,
} from '@quajs/render-core'
import type { SceneHost, SceneHostAudioHandle, SceneHostInputEvent, SceneHostNode, SceneHostResource } from '@quajs/scene-host'

export interface SceneRendererSnapshot {
  pipeline: Pipeline
  assets?: QuaAssets
  view: ReturnType<RendererPluginContext['getViewState']>
  revision: number
  assetRevision: number
  actions: RendererActions
  stageLayout: ResolvedStageLayout
}

export type SceneRendererSnapshotListener = (snapshot: SceneRendererSnapshot) => void
export type SceneRendererAnimationSync = () => void | Promise<void>

export interface SceneRendererHostContext {
  host: SceneHost
  assets?: QuaAssets
  rendererId?: string
  getAssetRevision: () => number
  /** Subscribe to readonly renderer snapshot changes, including setView/setAssets and layout. */
  subscribe: (listener: () => void) => () => void
  getViewState: () => RendererPluginContext['getViewState'] extends () => infer T ? T : never
  getActions: () => RendererActions
  registerAdvanceInterceptor: (interceptor: (source?: string) => boolean | Promise<boolean>) => () => void
  /** Transient popup keyboard handling before translating keys into game intents. */
  registerKeyInterceptor: (interceptor: (event: SceneHostInputEvent) => boolean | Promise<boolean>) => () => void
  interceptKey: (event: SceneHostInputEvent) => Promise<boolean>
  registerAnimationSync: (sync: SceneRendererAnimationSync) => () => void
  getStageLayout: () => ResolvedStageLayout
  /** Wait for transient asset materialization before sampling a backdrop. */
  waitForAssets?: () => Promise<void>
  getRootNode: () => SceneHostNode
  getLayerNode: (id: string, kind?: string, order?: number) => SceneHostNode
  clearLayer: (id: string) => void
  resolveAsset: (type: AssetType, name: string | undefined, options?: { targetPackageId?: string }) => Promise<SceneHostResource | undefined>
  releaseAsset: (resource: SceneHostResource) => void
  releaseLayerResources: (id: string) => void
  setLayerResource: (layerId: string, key: string, resource?: SceneHostResource) => void
  syncAudioHandle: (layerId: string, key: string, resource: SceneHostResource, options: {
    loop?: boolean
    volume?: number
    playbackRate?: number
    bus?: string
    playing?: boolean
    playAt?: number
    state?: string
    fadeInMs?: number
    fadeOutMs?: number
    crossfadeMs?: number
    seekMs?: number
    offsetMs?: number
    eq?: readonly unknown[]
    automation?: readonly Record<string, unknown>[]
    interruptible?: boolean
    endedPayload?: AudioTrackEventPayload
  }, isCurrent?: () => boolean) => Promise<SceneHostAudioHandle>
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

export type SceneRendererPluginContext = RendererPluginContext & { scene: SceneRendererHostContext }

export interface SceneRendererPluginDefinition {
  readonly name: string
  setup: (context: SceneRendererPluginContext) => void | Promise<void>
  destroy?: () => void | Promise<void>
}

export type SceneRendererPlugin = RendererPlugin

export interface ResolvedSceneAsset {
  asset: AssetData
  resource: SceneHostResource
}
