import type { AssetChange, QuaAssets } from '@quajs/assets'
import type { Pipeline } from '@quajs/pipeline'
import type { QuaViewProjection, RendererPlugin, RendererPluginContext, RenderErrorPayload } from '@quajs/render-core'
import type { RendererActions } from './actions'
import {
  createQuaErrorPayload,
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
  runtimePluginLoader?: (pluginManifest: unknown, context: { packageId: string }) => Promise<RendererPlugin | undefined> | RendererPlugin | undefined
  autoReady?: boolean
  rendererId?: string
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
  getActions: () => RendererActions
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
  private readonly runtimePluginLoader?: QuaWebRendererOptions['runtimePluginLoader']
  private readonly autoReady: boolean
  private readonly rendererId?: string
  private readonly listeners = new Set<QuaWebRendererSnapshotListener>()
  private readonly pipelineUnsubscribers: Array<() => void> = []
  private pluginHost?: RendererPluginHost
  private readonly runtimePluginHosts = new Map<string, RendererPluginHost[]>()
  private readonly runtimePluginEpochs = new Map<string, number>()
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
    this.runtimePluginLoader = options.runtimePluginLoader
    this.autoReady = options.autoReady !== false
    this.rendererId = options.rendererId
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
    try {
      await this.pluginHost.init(this.createPluginContext())
    }
    catch (error) {
      await this.reportError(error, {
        message: 'Renderer plugin initialization failed.',
        phase: 'renderer:start',
      })
      throw error
    }

    if (this.autoReady) {
      await this.actions.ready()
    }
  }

  async destroy(): Promise<void> {
    const wasStarted = this.started
    this.started = false
    this.cleanupPipelineSubscriptions()
    this.cleanupAssetSubscription()
    await this.destroyRuntimePluginHosts()
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
    this.pipelineUnsubscribers.push(onLogicToRender(this.pipeline, LogicToRenderEvents.RUNTIME_PACKAGE_PLUGIN, (payload) => {
      void this.loadRuntimeRendererPlugins(payload.packageId, payload.plugins).catch((error) => {
        void this.reportError(error, {
          message: `Failed to load runtime renderer plugins for package "${payload.packageId}".`,
          phase: 'runtime-renderer-plugin:load',
          metadata: { packageId: payload.packageId },
        })
      })
    }))
    this.pipelineUnsubscribers.push(onLogicToRender(this.pipeline, LogicToRenderEvents.RUNTIME_PACKAGE_UNLOAD, async (payload) => {
      await this.unloadRuntimeRendererPlugins(payload.packageId).catch((error) => {
        void this.reportError(error, {
          message: `Failed to unload runtime renderer plugins for package "${payload.packageId}".`,
          phase: 'runtime-renderer-plugin:unload',
          metadata: { packageId: payload.packageId },
        })
      })
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
      try {
        listener(this.snapshot)
      }
      catch (error) {
        void this.reportError(error, {
          message: 'Renderer snapshot listener failed.',
          phase: 'renderer:snapshot',
        })
      }
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

  private createPluginContext(): Omit<QuaWebRendererPluginContext, 'addDisposer'> {
    return {
      getPipeline: () => this.requirePipeline(),
      getViewState: () => this.projection,
      getAssets: () => this.assets,
      getActions: () => this.actions,
      refresh: () => this.refresh(),
      emitRenderToLogic: (type, payload) => emitRenderToLogic(this.requirePipeline(), type as any, payload as any),
      onLogicToRender: (type, handler) => onLogicToRender(this.requirePipeline(), type as any, handler as any),
      onRenderToLogic: (type, handler) => onRenderToLogic(this.requirePipeline(), type as any, handler as any),
      reportError: (error, payload) => this.reportError(error, payload),
    }
  }

  async reportError(error: unknown, payload: Partial<RenderErrorPayload> = {}): Promise<void> {
    const next = createQuaErrorPayload(error, {
      source: 'renderer',
      severity: 'error',
      recoverable: true,
      ...payload,
      metadata: {
        ...(payload.metadata || {}),
        rendererId: payload.rendererId || this.rendererId,
      },
    }) as RenderErrorPayload
    if (payload.rendererId || this.rendererId) {
      next.rendererId = payload.rendererId || this.rendererId
    }
    if (payload.pluginName) {
      next.pluginName = payload.pluginName
    }
    await emitRenderToLogic(this.requirePipeline(), RenderToLogicEvents.RENDER_ERROR, next).catch((emitError) => {
      console.warn('[quajs:renderer-web] Failed to emit renderer error.', emitError)
    })
  }

  private async loadRuntimeRendererPlugins(packageId: string, pluginManifests: readonly unknown[]): Promise<void> {
    if (!this.runtimePluginLoader || pluginManifests.length === 0) {
      return
    }

    const epoch = this.bumpRuntimePluginEpoch(packageId)
    await this.destroyRuntimePluginHostsForPackage(packageId)
    const hosts: RendererPluginHost[] = []
    try {
      for (const pluginManifest of pluginManifests) {
        const plugin = await this.runtimePluginLoader(pluginManifest, { packageId })
        if (!this.isRuntimePluginEpochCurrent(packageId, epoch)) {
          break
        }
        if (!plugin) {
          continue
        }
        const host = new RendererPluginHost([plugin])
        hosts.push(host)
        await host.init(this.createPluginContext())
        if (!this.isRuntimePluginEpochCurrent(packageId, epoch)) {
          hosts.pop()
          await host.destroy()
          break
        }
      }
    }
    catch (error) {
      await Promise.all(hosts.map(host => host.destroy()))
      throw error
    }

    if (hosts.length === 0) {
      return
    }
    if (!this.isRuntimePluginEpochCurrent(packageId, epoch)) {
      await Promise.all(hosts.map(host => host.destroy()))
      return
    }
    this.runtimePluginHosts.set(packageId, [
      ...(this.runtimePluginHosts.get(packageId) || []),
      ...hosts,
    ])
    this.refresh()
  }

  private async unloadRuntimeRendererPlugins(packageId: string): Promise<void> {
    this.bumpRuntimePluginEpoch(packageId)
    const hosts = await this.destroyRuntimePluginHostsForPackage(packageId)
    if (hosts.length > 0) {
      this.refresh()
    }
  }

  private async destroyRuntimePluginHosts(): Promise<void> {
    const hosts = Array.from(this.runtimePluginHosts.values()).flat()
    this.runtimePluginHosts.clear()
    this.runtimePluginEpochs.clear()
    await Promise.all(hosts.map(host => host.destroy()))
  }

  private async destroyRuntimePluginHostsForPackage(packageId: string): Promise<RendererPluginHost[]> {
    const hosts = this.runtimePluginHosts.get(packageId) || []
    this.runtimePluginHosts.delete(packageId)
    await Promise.all(hosts.map(host => host.destroy()))
    return hosts
  }

  private bumpRuntimePluginEpoch(packageId: string): number {
    const epoch = (this.runtimePluginEpochs.get(packageId) || 0) + 1
    this.runtimePluginEpochs.set(packageId, epoch)
    return epoch
  }

  private isRuntimePluginEpochCurrent(packageId: string, epoch: number): boolean {
    return this.started && this.runtimePluginEpochs.get(packageId) === epoch
  }
}

export function createQuaWebRendererController(options: QuaWebRendererOptions): QuaWebRendererController {
  return new QuaWebRendererController(options)
}
