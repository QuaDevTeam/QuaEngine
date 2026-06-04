import type {
  AssetChange,
  AssetData,
  AssetPipelineDomain,
  AssetType,
  BundleManifest,
  LoadAssetOptions,
  QuaAssets,
} from '@quajs/assets'
import type { CocosHost, CocosHostAudioHandle, CocosHostNode, CocosHostResource, CocosHostResourceKind } from '@quajs/cocos-host'
import type { Pipeline } from '@quajs/pipeline'
import type { AudioTrackEventPayload } from '@quajs/plugin-audio/contracts'
import type {
  LogicToRenderPayload,
  QuaViewProjection,
  RendererAdvanceInterceptor,
  RendererPlugin,
  RendererPluginContext,
  RenderErrorPayload,
} from '@quajs/render-core'
import type {
  CocosRendererAnimationSync,
  CocosRendererHostContext,
  CocosRendererPlugin,
  CocosRendererSnapshot,
  CocosRendererSnapshotListener,
} from './types'
import { AudioRenderToLogicEvents, emitAudioRenderToLogic } from '@quajs/plugin-audio/contracts'
import {
  clientPointToStageLogical,
  createQuaErrorPayload,
  createRendererActions,
  emitRenderToLogic,
  LogicToRenderEvents,
  onLogicToRender,
  onRenderToLogic,
  projectStageMotion,
  RendererPluginHost,
  RenderToLogicEvents,
  resolveStageLayout,
} from '@quajs/render-core'
import { emptyCocosView } from './defaults'

const COCOS_NATIVE_ASSET_DOMAINS = new Set<AssetPipelineDomain>(['images', 'characters', 'audio', 'video', 'fonts'])

export interface QuaCocosRendererOptions {
  host: CocosHost
  pipeline: Pipeline
  assets?: QuaAssets
  initialView?: QuaViewProjection
  plugins?: readonly (RendererPlugin | CocosRendererPlugin)[]
  autoReady?: boolean
  rendererId?: string
}

export class QuaCocosRendererController {
  readonly actions: ReturnType<typeof createRendererActions>

  private readonly host: CocosHost
  private pipeline: Pipeline
  private assets?: QuaAssets
  private projection: QuaViewProjection
  private revision = 0
  private assetRevision = 0
  private snapshot: CocosRendererSnapshot
  private readonly plugins: readonly (RendererPlugin | CocosRendererPlugin)[]
  private readonly autoReady: boolean
  private readonly rendererId?: string
  private readonly listeners = new Set<CocosRendererSnapshotListener>()
  private readonly advanceInterceptors = new Set<RendererAdvanceInterceptor>()
  private readonly animationSyncs = new Set<CocosRendererAnimationSync>()
  private readonly pipelineUnsubscribers: Array<() => void> = []
  private pluginHost?: RendererPluginHost
  private subscribedAssets?: QuaAssets
  private started = false
  private stageRoot?: CocosHostNode
  private sceneRoot?: CocosHostNode
  private cameraRoot?: CocosHostNode
  private readonly layers = new Map<string, CocosHostNode>()
  private readonly layerResources = new Map<string, Map<string, CocosHostResource>>()
  private readonly materializedResources = new Map<string, { resource: CocosHostResource, refs: number }>()
  private readonly audioHandles = new Map<string, Map<string, CocosAudioRuntimeHandle>>()
  private readonly warnedAudioCapabilities = new Set<string>()
  private animationFrame: number | undefined
  private audioFrame: number | undefined

  private readonly refreshAssets = (_change?: AssetChange) => {
    this.assetRevision += 1
    this.refresh()
  }

  constructor(options: QuaCocosRendererOptions) {
    this.host = options.host
    this.pipeline = options.pipeline
    this.assets = options.assets
    this.projection = options.initialView || emptyCocosView()
    this.plugins = options.plugins || []
    this.autoReady = options.autoReady !== false
    this.rendererId = options.rendererId
    this.actions = createRendererActions(
      () => this.requirePipeline(),
      { handleAdvance: source => this.handleAdvanceInterceptors(source) },
    )
    this.snapshot = this.createSnapshot()
  }

  getSnapshot(): CocosRendererSnapshot {
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

  subscribe(listener: CocosRendererSnapshotListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  registerAdvanceInterceptor(interceptor: RendererAdvanceInterceptor): () => void {
    this.advanceInterceptors.add(interceptor)
    return () => this.advanceInterceptors.delete(interceptor)
  }

  async start(): Promise<void> {
    if (this.started)
      return

    this.started = true
    this.getRootNode()
    this.subscribePipeline()
    this.subscribeAssets()
    this.pluginHost = new RendererPluginHost(this.plugins)
    try {
      await this.pluginHost.init(this.createPluginContext())
    }
    catch (error) {
      await this.reportError(error, {
        message: 'Cocos renderer plugin initialization failed.',
        phase: 'renderer-cocos:start',
      })
      throw error
    }

    this.refresh()
    if (this.autoReady) {
      await this.actions.ready()
    }
  }

  async destroy(): Promise<void> {
    const wasStarted = this.started
    this.started = false
    this.cleanupPipelineSubscriptions()
    this.cleanupAssetSubscription()
    this.cancelAnimationFrameLoop()
    this.cancelAudioFrameLoop()
    await this.pluginHost?.destroy()
    this.pluginHost = undefined
    this.advanceInterceptors.clear()
    this.animationSyncs.clear()
    for (const layerId of [...this.layers.keys()]) {
      this.clearLayer(layerId)
    }
    for (const layerId of [...this.audioHandles.keys()]) {
      this.releaseAudioHandles(layerId)
    }
    for (const key of [...this.materializedResources.keys()]) {
      this.releaseMaterializedResource(key)
    }
    if (this.stageRoot) {
      this.host.nodes.destroyNode(this.stageRoot)
      this.stageRoot = undefined
    }
    this.sceneRoot = undefined
    this.cameraRoot = undefined

    if (wasStarted) {
      await emitRenderToLogic(this.pipeline, RenderToLogicEvents.RENDER_DESTROYED, { timestamp: Date.now() })
    }
  }

  setView(view: QuaViewProjection): void {
    this.projection = view
    this.refresh()
  }

  setAssets(assets: QuaAssets | undefined): void {
    if (assets === this.assets)
      return
    this.cleanupAssetSubscription()
    this.assets = assets
    if (this.started) {
      this.subscribeAssets()
    }
    this.assetRevision += 1
    this.refresh()
  }

  refresh(): void {
    this.revision += 1
    this.applyStageLayout()
    this.publish()
    this.scheduleAnimationFrameLoop()
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
      this.host.runtime.warn?.('[quajs:renderer-cocos] Failed to emit renderer error.', { error: String(emitError) })
    })
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
      this.host.runtime.warn?.('Cocos renderer ignores dynamic runtime renderer plugin manifests.', {
        packageId: payload.packageId,
      })
    }))
  }

  private subscribeAssets(): void {
    this.cleanupAssetSubscription()
    if (!this.assets)
      return
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
          message: 'Cocos renderer snapshot listener failed.',
          phase: 'renderer-cocos:snapshot',
        })
      }
    }
  }

  private createSnapshot(): CocosRendererSnapshot {
    return {
      pipeline: this.pipeline,
      assets: this.assets,
      view: this.projection,
      revision: this.revision,
      assetRevision: this.assetRevision,
      actions: this.actions,
      stageLayout: this.resolveStageLayout(),
    }
  }

  private createPluginContext(): Omit<RendererPluginContext, 'addDisposer'> {
    const base = {
      getPipeline: () => this.requirePipeline(),
      getViewState: () => this.projection,
      refresh: () => this.refresh(),
      emitRenderToLogic: (type, payload) => emitRenderToLogic(this.requirePipeline(), type as never, payload as never),
      onLogicToRender: (type, handler) => onLogicToRender(this.requirePipeline(), type as never, handler as never),
      onRenderToLogic: (type, handler) => onRenderToLogic(this.requirePipeline(), type as never, handler as never),
      reportError: (error, payload) => this.reportError(error, payload),
    } satisfies Omit<RendererPluginContext, 'addDisposer'>
    return {
      ...base,
      cocos: this.createCocosContext(),
    } as Omit<RendererPluginContext, 'addDisposer'>
  }

  private createCocosContext(): CocosRendererHostContext {
    return {
      host: this.host,
      assets: this.assets,
      rendererId: this.rendererId,
      getViewState: () => this.projection,
      getActions: () => this.actions,
      registerAdvanceInterceptor: interceptor => this.registerAdvanceInterceptor(interceptor),
      registerAnimationSync: sync => this.registerAnimationSync(sync),
      getStageLayout: () => this.resolveStageLayout(),
      getRootNode: () => this.getRootNode(),
      getLayerNode: (id, kind, order) => this.getLayerNode(id, kind, order),
      clearLayer: id => this.clearLayer(id),
      resolveAsset: (type, name, options) => this.resolveAsset(type, name, options),
      releaseLayerResources: id => this.releaseLayerResources(id),
      setLayerResource: (layerId, key, resource) => this.setLayerResource(layerId, key, resource),
      syncAudioHandle: (layerId, key, resource, options) => this.syncAudioHandle(layerId, key, resource, options),
      releaseAudioHandles: (layerId, activeKeys) => this.releaseAudioHandles(layerId, activeKeys),
      interruptAudioTracks: (kind, source) => this.interruptAudioTracks(kind, source),
      captureStage: (options, policy) => this.captureStage(options, policy),
      emitRenderToLogic: (type, payload) => emitRenderToLogic(this.requirePipeline(), type as never, payload as never),
      refresh: () => this.refresh(),
      reportWarning: (message, metadata) => this.host.runtime.warn?.(message, metadata),
      reportError: (error, payload) => this.reportError(error, payload),
    }
  }

  private requirePipeline(): Pipeline {
    return this.pipeline
  }

  private async handleAdvanceInterceptors(source?: string): Promise<boolean> {
    for (const interceptor of Array.from(this.advanceInterceptors)) {
      if (await interceptor(source))
        return true
    }
    return false
  }

  private registerAnimationSync(sync: CocosRendererAnimationSync): () => void {
    this.animationSyncs.add(sync)
    this.scheduleAnimationFrameLoop()
    return () => {
      this.animationSyncs.delete(sync)
      if (this.animationSyncs.size === 0 && !this.hasRunningAnimations()) {
        this.cancelAnimationFrameLoop()
      }
    }
  }

  private scheduleAnimationFrameLoop(): void {
    this.cancelAnimationFrameLoop()
    if (!this.started || !this.hasRunningAnimations())
      return

    this.animationFrame = this.host.scheduler.requestFrame(() => {
      this.animationFrame = undefined
      if (!this.started)
        return
      this.applyStageLayout()
      this.runAnimationSyncs()
      this.scheduleAnimationFrameLoop()
    })
  }

  private cancelAnimationFrameLoop(): void {
    if (this.animationFrame !== undefined) {
      this.host.scheduler.cancelFrame(this.animationFrame)
      this.animationFrame = undefined
    }
  }

  private runAnimationSyncs(): void {
    for (const sync of Array.from(this.animationSyncs)) {
      try {
        void Promise.resolve(sync()).catch(error => this.reportError(error, {
          message: 'Cocos renderer animation sync failed.',
          phase: 'renderer-cocos:animation-sync',
        }))
      }
      catch (error) {
        void this.reportError(error, {
          message: 'Cocos renderer animation sync failed.',
          phase: 'renderer-cocos:animation-sync',
        })
      }
    }
  }

  private hasRunningAnimations(): boolean {
    return this.projection.animations.some(animation => animation.state === 'running')
  }

  private resolveStageLayout() {
    const size = this.host.nodes.getContainerSize()
    return resolveStageLayout(this.projection.layout, {
      width: size.width,
      height: size.height,
      devicePixelRatio: this.host.nodes.getDevicePixelRatio?.(),
      safeAreaInsets: this.host.nodes.getSafeAreaInsets?.(),
    })
  }

  private applyStageLayout(): void {
    const stage = this.getRootNode()
    const layout = this.resolveStageLayout()
    const { stage: stageMotion, camera } = projectStageMotion(this.projection, this.host.runtime.now())
    this.host.nodes.setNodeTransform(stage, {
      x: layout.viewportX,
      y: layout.viewportY,
      width: layout.logicalWidth,
      height: layout.logicalHeight,
      scaleX: layout.scale,
      scaleY: layout.scale,
    })
    this.host.nodes.setNodeMetadata?.(stage, {
      logicalWidth: layout.logicalWidth,
      logicalHeight: layout.logicalHeight,
      scale: layout.scale,
      safeArea: layout.safeArea,
    })
    this.host.nodes.setNodeTransform(this.getSceneRoot(), {
      ...motionTransform(stageMotion),
      width: layout.logicalWidth,
      height: layout.logicalHeight,
    })
    const cameraX = numberOrDefault(camera?.x, 0)
    const cameraY = numberOrDefault(camera?.y, 0)
    const cameraRotation = numberOrDefault(camera?.rotation, 0)
    this.host.nodes.setNodeTransform(this.getCameraRoot(), {
      ...motionTransform(camera),
      x: -cameraX,
      y: -cameraY,
      rotation: -cameraRotation,
      width: layout.logicalWidth,
      height: layout.logicalHeight,
    })
    this.host.nodes.setNodeMetadata?.(this.getSceneRoot(), {
      motion: stageMotion,
    })
    this.host.nodes.setNodeMetadata?.(this.getCameraRoot(), {
      motion: camera,
    })
  }

  private getRootNode(): CocosHostNode {
    if (!this.stageRoot) {
      this.stageRoot = this.host.nodes.createNode('stage', {
        name: 'qua-stage',
        parent: this.host.nodes.getRootNode(),
      })
    }
    return this.stageRoot
  }

  private getSceneRoot(): CocosHostNode {
    if (!this.sceneRoot) {
      this.sceneRoot = this.host.nodes.createNode('scene', {
        name: 'qua-scene',
        parent: this.getRootNode(),
      })
      this.host.nodes.setNodeTransform(this.sceneRoot, {
        width: this.resolveStageLayout().logicalWidth,
        height: this.resolveStageLayout().logicalHeight,
      })
    }
    return this.sceneRoot
  }

  private getCameraRoot(): CocosHostNode {
    if (!this.cameraRoot) {
      this.cameraRoot = this.host.nodes.createNode('camera', {
        name: 'qua-camera',
        parent: this.getSceneRoot(),
      })
      this.host.nodes.setNodeTransform(this.cameraRoot, {
        width: this.resolveStageLayout().logicalWidth,
        height: this.resolveStageLayout().logicalHeight,
      })
    }
    return this.cameraRoot
  }

  private getLayerNode(id: string, kind = 'layer', order = 0): CocosHostNode {
    const existing = this.layers.get(id)
    if (existing)
      return existing
    const node = this.host.nodes.createNode(kind, {
      name: `qua-${id}`,
      parent: this.getCameraRoot(),
    })
    this.host.nodes.setNodeTransform(node, { zIndex: order })
    this.host.nodes.setNodeMetadata?.(node, { layerId: id, order, captureRole: captureRoleForLayer(id) })
    this.layers.set(id, node)
    return node
  }

  private clearLayer(id: string): void {
    const layer = this.layers.get(id)
    if (layer) {
      this.host.nodes.destroyNode(layer)
      this.layers.delete(id)
    }
    this.releaseLayerResources(id)
  }

  private async resolveAsset(
    type: AssetType,
    name: string | undefined,
    options: { targetPackageId?: string } = {},
  ): Promise<CocosHostResource | undefined> {
    if (!name || !this.assets)
      return undefined
    const nativeResource = await this.resolveNativeAsset(type, name, options)
    if (nativeResource)
      return nativeResource

    const asset = await this.assets.getAsset(type, name, options)
    const cacheKey = `${asset.id}:${resourceKindForAsset(asset)}`
    const cached = this.materializedResources.get(cacheKey)
    if (cached) {
      cached.refs += 1
      this.host.assets.retainResource?.(cached.resource)
      return cached.resource
    }
    const resource = await this.host.assets.createResource(resourceKindForAsset(asset), asset.data, {
      id: cacheKey,
      source: asset.path || asset.name,
      mimeType: asset.mimeType,
      metadata: asset.mediaMetadata,
    })
    this.materializedResources.set(cacheKey, { resource, refs: 1 })
    return resource
  }

  private async resolveNativeAsset(
    type: AssetType,
    name: string,
    options: LoadAssetOptions = {},
  ): Promise<CocosHostResource | undefined> {
    const assets = this.assets
    if (!assets?.getAssetManifestRecord || !assets.getBundleManifest)
      return undefined
    const record = await assets.getAssetManifestRecord(type, name, options)
    if (!record)
      return undefined
    const manifest = await assets.getBundleManifest(record.bundleVersionKey || record.bundleName || record.logicalBundleName || '')
    if (!manifest || !usesCocosNativeAsset(manifest, type))
      return undefined

    if (!this.host.assets.loadResource) {
      this.host.runtime.warn?.('Cocos hybrid native asset requested but the host does not expose assets.loadResource; falling back to QPK bytes.', {
        type,
        name,
        source: record.path,
      })
      return undefined
    }

    const kind = resourceKindForAssetType(type)
    const cacheKey = `${record.id}:${kind}:native`
    const cached = this.materializedResources.get(cacheKey)
    if (cached) {
      cached.refs += 1
      this.host.assets.retainResource?.(cached.resource)
      return cached.resource
    }

    let resource: CocosHostResource | undefined
    try {
      resource = await this.host.assets.loadResource(kind, record.path, {
        id: cacheKey,
        mimeType: record.mimeType,
        metadata: record.mediaMetadata,
      })
    }
    catch (error) {
      this.host.runtime.warn?.('Cocos hybrid native asset load failed; falling back to QPK bytes.', {
        type,
        name,
        source: record.path,
        error: error instanceof Error ? error.message : String(error),
      })
      return undefined
    }
    if (!resource) {
      this.host.runtime.warn?.('Cocos hybrid native asset could not be loaded by the host; falling back to QPK bytes.', {
        type,
        name,
        source: record.path,
      })
      return undefined
    }

    this.materializedResources.set(cacheKey, { resource, refs: 1 })
    return resource
  }

  private setLayerResource(layerId: string, key: string, resource?: CocosHostResource): void {
    const resources = this.layerResources.get(layerId) || new Map<string, CocosHostResource>()
    const previous = resources.get(key)
    if (previous && previous.id === resource?.id) {
      this.releaseMaterializedResource(resource.id)
      return
    }
    if (previous && previous.id !== resource?.id) {
      this.releaseMaterializedResource(previous.id)
      resources.delete(key)
    }
    if (resource) {
      resources.set(key, resource)
    }
    if (resources.size > 0) {
      this.layerResources.set(layerId, resources)
    }
    else {
      this.layerResources.delete(layerId)
    }
  }

  private releaseLayerResources(layerId: string): void {
    const resources = this.layerResources.get(layerId)
    if (!resources)
      return
    for (const resource of resources.values()) {
      this.releaseMaterializedResource(resource.id)
    }
    this.layerResources.delete(layerId)
  }

  private releaseMaterializedResource(resourceId: string): void {
    const ref = this.materializedResources.get(resourceId)
    if (!ref)
      return
    ref.refs -= 1
    if (ref.refs <= 0) {
      this.materializedResources.delete(resourceId)
      this.host.assets.releaseResource(ref.resource)
    }
  }

  private async syncAudioHandle(
    layerId: string,
    key: string,
    resource: CocosHostResource,
    options: {
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
    },
  ): Promise<CocosHostAudioHandle> {
    const handles = this.audioHandles.get(layerId) || new Map<string, CocosAudioRuntimeHandle>()
    const existing = handles.get(key)
    const volume = options.volume ?? 1
    const loop = options.loop ?? false
    if (existing && existing.resource.id === resource.id) {
      const nextSignature = audioRuntimeSignature(resource, options)
      if (existing.signature !== nextSignature) {
        existing.interrupted = false
        existing.signature = nextSignature
      }
      this.updateAudioRuntimeState(existing, options, volume, loop)
      existing.handle.setLoop(loop)
      this.applyAudioPlaybackRate(existing.handle, options.playbackRate ?? 1, key)
      existing.endedPayload = options.endedPayload
      await this.applyAudioSeek(existing, key)
      this.applyAudioRuntimeVolume(existing)
      await this.applyAudioPlayback(existing, key)
      this.scheduleAudioFrameLoop()
      return existing.handle
    }
    if (existing) {
      existing.endedDisposer?.()
      this.clearAudioStartTimer(existing)
      await existing.handle.stop()
      await existing.handle.dispose()
    }
    const handle = await this.host.audio.createAudioHandle(resource, {
      id: key,
      loop,
      volume,
      playbackRate: options.playbackRate,
      bus: options.bus,
    })
    const record: CocosAudioRuntimeHandle = {
      handle,
      resource,
      options: { ...options, volume, loop },
      signature: audioRuntimeSignature(resource, options),
      createdAt: this.host.runtime.now(),
      endedPayload: options.endedPayload,
    }
    this.updateAudioRuntimeState(record, options, volume, loop, { created: true })
    record.endedDisposer = handle.onEnded?.(() => {
      const payload = record.endedPayload
      if (!payload)
        return
      void emitAudioRenderToLogic(this.requirePipeline(), AudioRenderToLogicEvents.ENDED, payload).catch(error => this.reportError(error, {
        message: 'Cocos audio ended event dispatch failed.',
        phase: 'renderer-cocos:audio-ended',
        metadata: {
          channel: payload.channel,
          id: payload.id,
        },
      }))
    })
    handles.set(key, record)
    this.audioHandles.set(layerId, handles)
    this.applyAudioPlaybackRate(handle, options.playbackRate ?? 1, key)
    await this.applyAudioSeek(record, key)
    this.applyAudioRuntimeVolume(record)
    await this.applyAudioPlayback(record, key)
    this.scheduleAudioFrameLoop()
    return handle
  }

  private releaseAudioHandles(layerId: string, activeKeys?: readonly string[]): void {
    const handles = this.audioHandles.get(layerId)
    if (!handles)
      return
    const active = activeKeys ? new Set(activeKeys) : undefined
    for (const [key, record] of [...handles.entries()]) {
      if (active?.has(key))
        continue
      record.endedDisposer?.()
      this.clearAudioStartTimer(record)
      void record.handle.stop()
      void record.handle.dispose()
      this.setLayerResource(layerId, key, undefined)
      handles.delete(key)
    }
    if (handles.size === 0) {
      this.audioHandles.delete(layerId)
    }
    this.scheduleAudioFrameLoop()
  }

  private applyAudioPlaybackRate(handle: CocosHostAudioHandle, playbackRate: number, key: string): void {
    if (playbackRate === 1 || playbackRate === undefined) {
      handle.setPlaybackRate?.(1)
      return
    }
    if (this.host.capabilities?.audioPlaybackRate && handle.setPlaybackRate) {
      handle.setPlaybackRate(playbackRate)
      return
    }
    const warningKey = `playbackRate:${key}`
    if (this.warnedAudioCapabilities.has(warningKey))
      return
    this.warnedAudioCapabilities.add(warningKey)
    this.host.runtime.warn?.('Cocos host does not expose audio playbackRate capability; playback rate intent was ignored.', {
      key,
      playbackRate,
    })
  }

  private async applyAudioPlayback(record: CocosAudioRuntimeHandle, key: string): Promise<void> {
    this.clearAudioStartTimer(record)
    if (record.interrupted) {
      await record.handle.stop()
      return
    }
    if (record.options.playing === false) {
      record.pausedPositionMs = record.handle.getPosition?.()
      await record.handle.pause()
      return
    }
    const playAt = record.options.playAt
    const now = this.host.runtime.now()
    if (typeof playAt === 'number' && Number.isFinite(playAt) && playAt > now) {
      await record.handle.pause()
      record.startTimer = this.host.scheduler.setTimeout(() => {
        record.startTimer = undefined
        void Promise.resolve(record.handle.play()).catch((error: unknown) => {
          void this.reportError(error, {
            message: 'Cocos delayed audio playback failed.',
            phase: 'renderer-cocos:audio-play-at',
            metadata: { key, playAt },
          })
        })
      }, playAt - now)
      record.pendingPlayAt = playAt
      return
    }
    if (record.pausedPositionMs !== undefined && record.handle.seek && record.options.seekMs === undefined && record.options.offsetMs === undefined) {
      await record.handle.seek(record.pausedPositionMs)
      record.lastSeekMs = record.pausedPositionMs
      record.pausedPositionMs = undefined
    }
    await record.handle.play()
  }

  private clearAudioStartTimer(record: CocosAudioRuntimeHandle): void {
    if (record.startTimer !== undefined) {
      this.host.scheduler.clearTimeout(record.startTimer)
      record.startTimer = undefined
    }
    record.pendingPlayAt = undefined
  }

  private updateAudioRuntimeState(
    record: CocosAudioRuntimeHandle,
    options: CocosAudioRuntimeHandle['options'],
    volume: number,
    loop: boolean,
    lifecycle: { created?: boolean } = {},
  ): void {
    const now = this.host.runtime.now()
    const previousState = record.options.state
    const automationSignature = audioAutomationSignature(options.automation)
    record.options = { ...options, volume, loop }
    if (lifecycle.created && (options.fadeInMs ?? 0) > 0) {
      record.fadeInStartedAt = now
    }
    if (automationSignature !== record.automationSignature) {
      record.automationSignature = automationSignature
      record.automationStartedAt = now
    }
    const state = options.state
    if (state === 'stopping' && (options.fadeOutMs ?? 0) > 0) {
      if (previousState !== 'stopping' || record.fadeOutStartedAt === undefined) {
        record.fadeOutStartedAt = now
        record.fadeOutStopped = false
      }
    }
    else {
      record.fadeOutStartedAt = undefined
      record.fadeOutStopped = false
    }
  }

  private async applyAudioSeek(record: CocosAudioRuntimeHandle, key: string): Promise<void> {
    const desired = finiteNumber(record.options.seekMs)
      ?? finiteNumber(record.options.offsetMs)
    if (desired === undefined || desired === record.lastSeekMs)
      return
    if (!record.handle.seek) {
      const warningKey = `seek:${key}`
      if (!this.warnedAudioCapabilities.has(warningKey)) {
        this.warnedAudioCapabilities.add(warningKey)
        this.host.runtime.warn?.('Cocos host audio handle does not expose seek capability; seek/offset intent was ignored.', {
          key,
          positionMs: desired,
        })
      }
      return
    }
    await record.handle.seek(Math.max(0, desired))
    record.lastSeekMs = desired
    record.pausedPositionMs = undefined
  }

  private applyAudioRuntimeVolume(record: CocosAudioRuntimeHandle): void {
    const now = this.host.runtime.now()
    const automationGainDb = projectGainAutomation(record.options.automation, now, record.automationStartedAt ?? record.createdAt)
    let volume = automationGainDb === undefined
      ? record.options.volume ?? 1
      : 10 ** (automationGainDb / 20)
    const fadeInMs = record.options.fadeInMs ?? 0
    if (fadeInMs > 0 && record.fadeInStartedAt !== undefined) {
      volume *= clamp((now - record.fadeInStartedAt) / fadeInMs, 0, 1)
    }
    const fadeOutMs = record.options.fadeOutMs ?? 0
    if (fadeOutMs > 0 && record.fadeOutStartedAt !== undefined) {
      const progress = clamp((now - record.fadeOutStartedAt) / fadeOutMs, 0, 1)
      volume *= 1 - progress
      if (progress >= 1 && record.options.state === 'stopping' && !record.fadeOutStopped) {
        record.fadeOutStopped = true
        void Promise.resolve(record.handle.stop()).catch(error => this.reportError(error, {
          message: 'Cocos audio fade-out stop failed.',
          phase: 'renderer-cocos:audio-fade-out',
        }))
      }
    }
    const nextVolume = clamp(volume, 0, 1)
    record.appliedVolume = nextVolume
    record.handle.setVolume(nextVolume)
  }

  private scheduleAudioFrameLoop(): void {
    this.cancelAudioFrameLoop()
    if (!this.started || !this.hasActiveAudioRuntimeUpdates())
      return
    this.audioFrame = this.host.scheduler.requestFrame(() => {
      this.audioFrame = undefined
      if (!this.started)
        return
      for (const handles of this.audioHandles.values()) {
        for (const record of handles.values()) {
          this.applyAudioRuntimeVolume(record)
        }
      }
      this.scheduleAudioFrameLoop()
    })
  }

  private cancelAudioFrameLoop(): void {
    if (this.audioFrame !== undefined) {
      this.host.scheduler.cancelFrame(this.audioFrame)
      this.audioFrame = undefined
    }
  }

  private hasActiveAudioRuntimeUpdates(): boolean {
    const now = this.host.runtime.now()
    for (const handles of this.audioHandles.values()) {
      for (const record of handles.values()) {
        if (hasGainAutomation(record.options.automation))
          return true
        if ((record.options.fadeInMs ?? 0) > 0 && record.fadeInStartedAt !== undefined && now - record.fadeInStartedAt < record.options.fadeInMs!)
          return true
        if ((record.options.fadeOutMs ?? 0) > 0 && record.fadeOutStartedAt !== undefined && !record.fadeOutStopped)
          return true
      }
    }
    return false
  }

  private async interruptAudioTracks(kind: string, source?: string): Promise<void> {
    for (const handles of this.audioHandles.values()) {
      for (const [key, record] of handles) {
        if (!key.startsWith(`${kind}:`) || record.options.interruptible === false || record.interrupted)
          continue
        record.interrupted = true
        this.clearAudioStartTimer(record)
        await record.handle.stop()
        if (record.endedPayload) {
          await emitAudioRenderToLogic(this.requirePipeline(), AudioRenderToLogicEvents.INTERRUPTED, {
            ...record.endedPayload,
            metadata: {
              ...(record.endedPayload.metadata || {}),
              source,
            },
          })
        }
      }
    }
    this.scheduleAudioFrameLoop()
  }

  private async captureStage(
    options?: { mimeType?: string, quality?: number, maxWidth?: number, maxHeight?: number },
    policy?: { uiMode?: string },
  ) {
    if (!this.host.capture) {
      throw new Error('Cocos host does not provide capture support.')
    }
    const hiddenLayers = this.hideLayersForCapture(policy)
    try {
      return await this.host.capture.captureNode(this.getRootNode(), options)
    }
    finally {
      for (const node of hiddenLayers) {
        this.host.nodes.setNodeVisible(node, true)
      }
    }
  }

  private hideLayersForCapture(policy?: { uiMode?: string }): CocosHostNode[] {
    const hiddenRoles = hiddenCaptureRoles(policy?.uiMode)
    if (hiddenRoles.size === 0)
      return []
    const hidden: CocosHostNode[] = []
    for (const [layerId, node] of this.layers) {
      if (!hiddenRoles.has(captureRoleForLayer(layerId)))
        continue
      this.host.nodes.setNodeVisible(node, false)
      hidden.push(node)
    }
    return hidden
  }
}

export function createCocosRendererActions(
  getPipeline: () => Pipeline,
  options?: Parameters<typeof createRendererActions>[1],
) {
  return createRendererActions(getPipeline, options)
}

export function clientInputToStagePoint(controller: QuaCocosRendererController, event: { x?: number, y?: number }) {
  const x = event.x ?? 0
  const y = event.y ?? 0
  return clientPointToStageLogical(controller.getSnapshot().stageLayout, {
    clientX: x,
    clientY: y,
  })
}

function usesCocosNativeAsset(manifest: BundleManifest, type: AssetType): boolean {
  if (!COCOS_NATIVE_ASSET_DOMAINS.has(type as AssetPipelineDomain))
    return false
  const hybrid = manifest.assetTarget?.cocos?.hybrid
  return Boolean(hybrid?.enabled && hybrid.domains[type as AssetPipelineDomain] === 'cocos-bundle')
}

function resourceKindForAsset(asset: AssetData): CocosHostResourceKind {
  return resourceKindForAssetType(asset.type)
}

function resourceKindForAssetType(type: AssetType): CocosHostResourceKind {
  switch (type) {
    case 'images':
    case 'characters':
      return 'spriteFrame'
    case 'audio':
      return 'audio'
    case 'video':
      return 'video'
    case 'fonts':
      return 'font'
    default:
      return 'custom'
  }
}

function motionTransform(motion: Readonly<Record<string, unknown>>) {
  const scale = numberValue(motion.scale, 1)
  return {
    x: numberValue(motion.x, 0),
    y: numberValue(motion.y, 0),
    scaleX: numberValue(motion.scaleX, scale),
    scaleY: numberValue(motion.scaleY, scale),
    rotation: numberValue(motion.rotation, 0),
    opacity: numberValue(motion.opacity, 1),
    zIndex: numberValue(motion.zIndex, 0),
  }
}

function numberValue(value: unknown, fallback: number | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function numberOrDefault(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

type CocosCaptureRole = 'scene' | 'safe-ui' | 'overlay'

function captureRoleForLayer(layerId: string): CocosCaptureRole {
  if (layerId === 'dialogue' || layerId === 'choices')
    return 'safe-ui'
  if (
    layerId === 'ui'
    || layerId === 'settings'
    || layerId === 'backlog'
    || layerId === 'gallery'
    || layerId === 'achievement'
  ) {
    return 'overlay'
  }
  return 'scene'
}

function hiddenCaptureRoles(uiMode: string | undefined): Set<CocosCaptureRole> {
  if (uiMode === 'hide-overlays')
    return new Set(['overlay'])
  if (uiMode === 'scene-only')
    return new Set(['overlay', 'safe-ui'])
  return new Set()
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function audioRuntimeSignature(resource: CocosHostResource, options: CocosAudioRuntimeHandle['options']): string {
  return JSON.stringify({
    resourceId: resource.id,
    state: options.state,
    playAt: options.playAt,
    seekMs: options.seekMs,
    offsetMs: options.offsetMs,
    assetKey: options.endedPayload?.assetKey,
    chapterId: options.endedPayload?.chapterId,
    lineId: options.endedPayload?.lineId,
  })
}

function audioAutomationSignature(automation: readonly Record<string, unknown>[] | undefined): string | undefined {
  return automation && automation.length > 0 ? JSON.stringify(automation) : undefined
}

function hasGainAutomation(automation: readonly Record<string, unknown>[] | undefined): boolean {
  return Boolean(automation?.some(item => item.propertyPath === 'gainDb'))
}

function projectGainAutomation(
  automation: readonly Record<string, unknown>[] | undefined,
  now: number,
  startedAt: number,
): number | undefined {
  const item = automation?.find(entry => entry.propertyPath === 'gainDb')
  const curve = item?.curve
  if (!curve || typeof curve !== 'object' || Array.isArray(curve))
    return undefined
  const pointsValue = (curve as Record<string, unknown>).points
  if (!Array.isArray(pointsValue))
    return undefined
  const points = pointsValue
    .map(point => readAutomationPoint(point))
    .filter((point): point is { at: number, value: number } => Boolean(point))
    .sort((left, right) => left.at - right.at)
  if (points.length === 0)
    return undefined
  const duration = finiteNumber((curve as Record<string, unknown>).duration) ?? points[points.length - 1]!.at
  const loop = (curve as Record<string, unknown>).loop === true
  let elapsed = Math.max(0, now - startedAt)
  if (loop && duration > 0) {
    elapsed %= duration
  }
  if (elapsed <= points[0]!.at)
    return points[0]!.value
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1]!
    const next = points[index]!
    if (elapsed <= next.at) {
      const progress = next.at === previous.at ? 1 : (elapsed - previous.at) / (next.at - previous.at)
      return previous.value + (next.value - previous.value) * clamp(progress, 0, 1)
    }
  }
  return points[points.length - 1]!.value
}

function readAutomationPoint(value: unknown): { at: number, value: number } | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return undefined
  const record = value as Record<string, unknown>
  const at = finiteNumber(record.at)
  const pointValue = finiteNumber(record.value)
  return at === undefined || pointValue === undefined ? undefined : { at, value: pointValue }
}

export type CocosRuntimePluginPayload = LogicToRenderPayload<LogicToRenderEvents.RUNTIME_PACKAGE_PLUGIN>

interface CocosAudioRuntimeHandle {
  handle: CocosHostAudioHandle
  resource: CocosHostResource
  signature: string
  createdAt: number
  options: {
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
  }
  endedPayload?: AudioTrackEventPayload
  endedDisposer?: () => void
  startTimer?: number
  pendingPlayAt?: number
  lastSeekMs?: number
  pausedPositionMs?: number
  appliedVolume?: number
  fadeInStartedAt?: number
  fadeOutStartedAt?: number
  fadeOutStopped?: boolean
  automationSignature?: string
  automationStartedAt?: number
  interrupted?: boolean
}
