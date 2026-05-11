import type { AssetChange, QuaAssets } from '@quajs/assets'
import type { Pipeline } from '@quajs/pipeline'
import type { QuaViewProjection, RendererPlugin, RendererPluginContext } from '@quajs/render-core'
import type { RendererActions } from './actions'
import {
  emitRenderToLogic,
  LogicToRenderEvents,
  onLogicToRender,
  onRenderToLogic,
  RendererPluginHost,
  RenderToLogicEvents,
} from '@quajs/render-core'
import { createRendererActions } from './actions'
import { emptyView } from './defaults'

export interface QuaWebRendererOptions {
  pipeline: Pipeline
  assets?: QuaAssets
  initialView?: QuaViewProjection
  plugins?: readonly RendererPlugin[]
  autoReady?: boolean
}

export interface QuaWebRendererSnapshot {
  pipeline: Pipeline
  assets?: QuaAssets
  view: Readonly<QuaViewProjection>
  revision: number
  assetRevision: number
  actions: RendererActions
}

export type QuaWebRendererSnapshotListener = (snapshot: QuaWebRendererSnapshot) => void

export interface QuaWebRendererPluginContext extends RendererPluginContext {
  getAssets: () => QuaAssets | undefined
}

export class QuaWebRendererController {
  readonly actions: RendererActions

  private pipeline: Pipeline
  private assets?: QuaAssets
  private projection: QuaViewProjection
  private revision = 0
  private assetRevision = 0
  private snapshot: QuaWebRendererSnapshot
  private readonly plugins: readonly RendererPlugin[]
  private readonly autoReady: boolean
  private readonly listeners = new Set<QuaWebRendererSnapshotListener>()
  private readonly pipelineUnsubscribers: Array<() => void> = []
  private pluginHost?: RendererPluginHost
  private subscribedAssets?: QuaAssets
  private started = false

  private readonly refreshAssets = (_change?: AssetChange) => {
    this.assetRevision += 1
    this.refresh()
  }

  constructor(options: QuaWebRendererOptions) {
    this.pipeline = options.pipeline
    this.assets = options.assets
    this.projection = options.initialView || emptyView()
    this.plugins = options.plugins || []
    this.autoReady = options.autoReady !== false
    this.actions = createRendererActions(() => this.requirePipeline())
    this.snapshot = this.createSnapshot()
  }

  getSnapshot(): QuaWebRendererSnapshot {
    return this.snapshot
  }

  getPipeline(): Pipeline {
    return this.pipeline
  }

  getAssets(): QuaAssets | undefined {
    return this.assets
  }

  getViewState(): Readonly<QuaViewProjection> {
    return this.projection
  }

  subscribe(listener: QuaWebRendererSnapshotListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  async start(): Promise<void> {
    if (this.started) {
      return
    }

    this.started = true
    this.subscribePipeline()
    this.subscribeAssets()
    this.pluginHost = new RendererPluginHost(this.plugins)
    const pluginContext: Omit<QuaWebRendererPluginContext, 'addDisposer'> = {
      getPipeline: () => this.requirePipeline(),
      getViewState: () => this.projection,
      getAssets: () => this.assets,
      refresh: () => this.refresh(),
      emitRenderToLogic: (type, payload) => emitRenderToLogic(this.requirePipeline(), type as any, payload as any),
      onLogicToRender: (type, handler) => onLogicToRender(this.requirePipeline(), type as any, handler as any),
      onRenderToLogic: (type, handler) => onRenderToLogic(this.requirePipeline(), type as any, handler as any),
    }
    await this.pluginHost.init(pluginContext)

    if (this.autoReady) {
      await this.actions.ready()
    }
  }

  async destroy(): Promise<void> {
    const wasStarted = this.started
    this.started = false
    this.cleanupPipelineSubscriptions()
    this.cleanupAssetSubscription()
    await this.pluginHost?.destroy()
    this.pluginHost = undefined

    if (wasStarted) {
      await emitRenderToLogic(this.pipeline, RenderToLogicEvents.RENDER_DESTROYED, { timestamp: Date.now() })
    }
  }

  setPipeline(pipeline: Pipeline): void {
    if (pipeline === this.pipeline) {
      return
    }

    this.cleanupPipelineSubscriptions()
    this.pipeline = pipeline
    if (this.started) {
      this.subscribePipeline()
    }
    this.publish()
  }

  setAssets(assets: QuaAssets | undefined): void {
    if (assets === this.assets) {
      return
    }

    this.cleanupAssetSubscription()
    this.assets = assets
    if (this.started) {
      this.subscribeAssets()
    }
    this.assetRevision += 1
    this.publish()
  }

  setView(view: QuaViewProjection): void {
    this.projection = view
    this.refresh()
  }

  refresh(): void {
    this.revision += 1
    this.publish()
  }

  private subscribePipeline(): void {
    this.cleanupPipelineSubscriptions()
    this.pipelineUnsubscribers.push(onLogicToRender(this.pipeline, LogicToRenderEvents.VIEW_UPDATE, (payload) => {
      this.projection = payload.view
      this.refresh()
    }))
    this.pipelineUnsubscribers.push(onLogicToRender(this.pipeline, LogicToRenderEvents.ASSET_CHANGED, () => {
      this.assetRevision += 1
      this.refresh()
    }))
  }

  private subscribeAssets(): void {
    this.cleanupAssetSubscription()
    if (!this.assets) {
      return
    }

    this.assets.on('asset:changed', this.refreshAssets)
    this.subscribedAssets = this.assets
  }

  private cleanupPipelineSubscriptions(): void {
    while (this.pipelineUnsubscribers.length > 0) {
      this.pipelineUnsubscribers.pop()?.()
    }
  }

  private cleanupAssetSubscription(): void {
    this.subscribedAssets?.off('asset:changed', this.refreshAssets)
    this.subscribedAssets = undefined
  }

  private publish(): void {
    this.snapshot = this.createSnapshot()
    for (const listener of this.listeners) {
      listener(this.snapshot)
    }
  }

  private createSnapshot(): QuaWebRendererSnapshot {
    return {
      pipeline: this.pipeline,
      assets: this.assets,
      view: this.projection,
      revision: this.revision,
      assetRevision: this.assetRevision,
      actions: this.actions,
    }
  }

  private requirePipeline(): Pipeline {
    if (!this.pipeline) {
      throw new Error('QuaWebRendererController requires a pipeline')
    }
    return this.pipeline
  }
}

export function createQuaWebRendererController(options: QuaWebRendererOptions): QuaWebRendererController {
  return new QuaWebRendererController(options)
}
