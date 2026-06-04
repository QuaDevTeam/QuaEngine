import type { Pipeline } from '@quajs/pipeline'
import type { RendererActions, RendererAdvanceInterceptor } from './actions'
import type { QuaViewProjection, RenderErrorPayload } from './index'

export interface RendererAssetSource {
  on?: (type: string, listener: (payload?: unknown) => void) => void
  off?: (type: string, listener: (payload?: unknown) => void) => void
}

export interface RendererControllerSnapshot {
  pipeline: Pipeline
  assets?: RendererAssetSource
  view: Readonly<QuaViewProjection>
  revision: number
  assetRevision: number
  actions: RendererActions
}

export type RendererControllerSnapshotListener<TSnapshot extends RendererControllerSnapshot = RendererControllerSnapshot> = (snapshot: TSnapshot) => void

export interface RendererController<TSnapshot extends RendererControllerSnapshot = RendererControllerSnapshot> {
  readonly actions: RendererActions
  getSnapshot: () => TSnapshot
  getPipeline: () => Pipeline
  getAssets: () => RendererAssetSource | undefined
  getViewState: () => Readonly<QuaViewProjection>
  subscribe: (listener: RendererControllerSnapshotListener<TSnapshot>) => () => void
  registerAdvanceInterceptor: (interceptor: RendererAdvanceInterceptor) => () => void
  start: () => Promise<void>
  destroy: () => Promise<void>
  refresh: () => void
  reportError: (error: unknown, payload?: Partial<RenderErrorPayload>) => Promise<void>
}
