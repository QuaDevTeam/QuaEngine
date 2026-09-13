import type { BackgroundIntent, EngineContext, QuaEngineInterface } from '@quajs/engine'
import type { AnimationTimeline } from '@quajs/plugin-animation'
import type {
  AnimationTimingFunction,
  TransitionIntent,
  ViewBackgroundLayerProjection,
  ViewBackgroundProjection,
  ViewVideoBackgroundProjection,
} from '@quajs/render-core'
import { BaseEnginePlugin } from '@quajs/engine'
import { backgroundDecoratorMappings } from './decorators'

export const BACKGROUND_WEB_RENDERER_ENTRY = '@quajs/renderer-web/plugins/background' as const
export const BACKGROUND_VUE_RENDERER_ENTRY = '@quajs/renderer-vue/plugins/background' as const
export const BACKGROUND_COCOS_RENDERER_ENTRY = '@quajs/renderer-cocos/plugins/background' as const
export const BACKGROUND_RENDERER_ENTRY = BACKGROUND_WEB_RENDERER_ENTRY

export type BackgroundLayerInput = Omit<ViewBackgroundLayerProjection, 'id' | 'assetName'> & {
  id: string
  assetName: string
}

export interface BackgroundOptions extends Omit<ViewBackgroundProjection, 'mode' | 'assetName' | 'video' | 'layers'> {}

export interface VideoBackgroundOptions extends Omit<ViewVideoBackgroundProjection, 'assetName'>, BackgroundOptions {}

export interface LayeredBackgroundOptions extends Omit<ViewBackgroundProjection, 'mode' | 'assetName' | 'video' | 'layers'> {}

export type BackgroundLayerPatch = Partial<Omit<ViewBackgroundLayerProjection, 'id'>>

export interface CgOverlayOptions extends Omit<BackgroundLayerInput, 'id' | 'assetName' | 'assetType' | 'opacity' | 'zIndex'> {
  id?: string
  duration?: number
  easing?: AnimationTimingFunction
  zIndex?: number
}

export class BackgroundPlugin extends BaseEnginePlugin {
  readonly name = '@quajs/plugin-background'
  readonly id = 'background'
  readonly version = '0.1.0'
  readonly description = 'Background image, video, layered background, and transition APIs'

  setBackground(assetName: string, options?: BackgroundOptions): Promise<void> {
    return setBackgroundWithEngine(this.getEngine(), assetName, options)
  }

  clearBackground(): Promise<void> {
    return clearBackgroundWithEngine(this.getEngine())
  }

  clearRuntimePackage(packageId: string): Promise<void> {
    return clearRuntimePackageBackgroundWithEngine(this.getEngine(), packageId)
  }

  setVideoBackground(assetName: string, options?: VideoBackgroundOptions): Promise<void> {
    return setVideoBackgroundWithEngine(this.getEngine(), assetName, options)
  }

  setLayeredBackground(
    layers: readonly BackgroundLayerInput[] = [],
    options?: LayeredBackgroundOptions,
  ): Promise<void> {
    return setLayeredBackgroundWithEngine(this.getEngine(), layers, options)
  }

  addLayer(layer: BackgroundLayerInput): Promise<void> {
    return addBackgroundLayerWithEngine(this.getEngine(), layer)
  }

  updateLayer(layerId: string, patch: BackgroundLayerPatch): Promise<void> {
    return updateBackgroundLayerWithEngine(this.getEngine(), layerId, patch)
  }

  removeLayer(layerId: string): Promise<void> {
    return removeBackgroundLayerWithEngine(this.getEngine(), layerId)
  }

  clearLayers(): Promise<void> {
    return clearBackgroundLayersWithEngine(this.getEngine())
  }

  showCgOverlay(assetName: string, options?: CgOverlayOptions): Promise<void> {
    return showCgOverlayWithEngine(this.getEngine(), assetName, options)
  }

  hideCgOverlay(options?: { id?: string, duration?: number, easing?: AnimationTimingFunction }): Promise<void> {
    return hideCgOverlayWithEngine(this.getEngine(), options)
  }

  transitionBackground(transition: TransitionIntent): Promise<void> {
    return transitionBackgroundWithEngine(this.getEngine(), transition)
  }

  transitionLayer(layerId: string, transition: TransitionIntent): Promise<void> {
    return transitionBackgroundLayerWithEngine(this.getEngine(), layerId, transition)
  }

  override async onRuntimePackageUnload(ctx: EngineContext): Promise<void> {
    const packageId = ctx.runtimePackage?.package.id
    if (packageId) {
      await clearRuntimePackageBackgroundWithEngine(ctx.engine, packageId)
    }
  }

  registerAPIs() {
    return {
      pluginName: this.name,
      apis: [
        { name: 'setBackground', fn: this.setBackground.bind(this), module: this.name },
        { name: 'clearBackground', fn: this.clearBackground.bind(this), module: this.name },
        { name: 'clearRuntimePackage', fn: this.clearRuntimePackage.bind(this), module: this.name },
        { name: 'setVideoBackground', fn: this.setVideoBackground.bind(this), module: this.name },
        { name: 'setLayeredBackground', fn: this.setLayeredBackground.bind(this), module: this.name },
        { name: 'addLayer', fn: this.addLayer.bind(this), module: this.name },
        { name: 'updateLayer', fn: this.updateLayer.bind(this), module: this.name },
        { name: 'removeLayer', fn: this.removeLayer.bind(this), module: this.name },
        { name: 'clearLayers', fn: this.clearLayers.bind(this), module: this.name },
        { name: 'showCgOverlay', fn: this.showCgOverlay.bind(this), module: this.name },
        { name: 'hideCgOverlay', fn: this.hideCgOverlay.bind(this), module: this.name },
        { name: 'transitionBackground', fn: this.transitionBackground.bind(this), module: this.name },
        { name: 'transitionLayer', fn: this.transitionLayer.bind(this), module: this.name },
      ],
      decorators: backgroundDecoratorMappings,
    }
  }
}

export async function setBackgroundWithEngine(
  engine: QuaEngineInterface,
  assetName: string,
  options: BackgroundOptions = {},
): Promise<void> {
  await setBackgroundProjectionWithTransition(engine, normalizeBackground({
    mode: 'image',
    assetName,
    ...options,
  }))
}

export async function clearBackgroundWithEngine(engine: QuaEngineInterface): Promise<void> {
  await engine.setBackgroundProjection(undefined)
}

export async function clearRuntimePackageBackgroundWithEngine(
  engine: QuaEngineInterface,
  packageId: string,
): Promise<void> {
  const current = engine.getViewState().background
  if (!current) {
    return
  }
  if (metadataOwnedByPackage(current.metadata, packageId) || metadataRequiresPackage(current.video?.metadata, packageId)) {
    await engine.setBackgroundProjection(undefined)
    return
  }
  if (current.mode === 'layered' && current.layers?.length) {
    const layers = current.layers.filter(layer => !backgroundLayerRequiresPackage(layer, packageId))
    if (layers.length !== current.layers.length) {
      await engine.setBackgroundProjection({
        ...cloneBackground(current),
        layers,
        metadata: removeRuntimePackageFromMetadata(current.metadata, packageId),
      })
      return
    }
  }
  if (metadataRequiresPackage(current.metadata, packageId)) {
    await engine.setBackgroundProjection(undefined)
  }
}

export async function setVideoBackgroundWithEngine(
  engine: QuaEngineInterface,
  assetName: string,
  options: VideoBackgroundOptions = {},
): Promise<void> {
  const {
    loop,
    muted,
    volume,
    playbackRate,
    poster,
    transition,
    metadata,
    ...backgroundOptions
  } = options
  await setBackgroundProjectionWithTransition(engine, normalizeBackground({
    mode: 'video',
    assetName,
    ...backgroundOptions,
    transition,
    video: {
      assetName,
      loop,
      muted,
      volume,
      playbackRate,
      poster,
      transition,
      metadata,
    },
    metadata,
  }))
}

export async function setLayeredBackgroundWithEngine(
  engine: QuaEngineInterface,
  layers: readonly BackgroundLayerInput[] = [],
  options: LayeredBackgroundOptions = {},
): Promise<void> {
  await setBackgroundProjectionWithTransition(engine, normalizeBackground({
    mode: 'layered',
    layers: normalizeLayers(layers),
    ...options,
  }))
}

export async function addBackgroundLayerWithEngine(
  engine: QuaEngineInterface,
  layer: BackgroundLayerInput,
): Promise<void> {
  const current = getLayeredBackground(engine)
  const layers = normalizeLayers([
    ...current.layers.filter(existing => existing.id !== layer.id),
    normalizeLayer(layer),
  ])
  await engine.setBackgroundProjection({
    ...current,
    layers,
  })
}

export async function updateBackgroundLayerWithEngine(
  engine: QuaEngineInterface,
  layerId: string,
  patch: BackgroundLayerPatch,
): Promise<void> {
  const current = getLayeredBackground(engine)
  const layers = normalizeLayers(current.layers.map(layer =>
    layer.id === layerId
      ? withCurrentRuntimeLayerMetadata(engine, normalizeLayer(mergeLayerPatch(layer, patch, layerId)))
      : layer,
  ))
  await engine.setBackgroundProjection({
    ...current,
    layers,
  })
}

function mergeLayerPatch(
  layer: Readonly<ViewBackgroundLayerProjection>,
  patch: BackgroundLayerPatch,
  layerId: string,
): ViewBackgroundLayerProjection {
  return {
    ...layer,
    ...patch,
    id: layerId,
    assetName: patch.assetName ?? layer.assetName,
    composition: patch.composition
      ? mergeUnknownRecord(layer.composition || {}, patch.composition)
      : layer.composition,
  }
}

export async function removeBackgroundLayerWithEngine(
  engine: QuaEngineInterface,
  layerId: string,
): Promise<void> {
  const current = getLayeredBackground(engine)
  await engine.setBackgroundProjection({
    ...current,
    layers: current.layers.filter(layer => layer.id !== layerId),
  })
}

export async function clearBackgroundLayersWithEngine(engine: QuaEngineInterface): Promise<void> {
  const current = getLayeredBackground(engine)
  await engine.setBackgroundProjection({
    ...current,
    layers: [],
  })
}

export async function showCgOverlayWithEngine(
  engine: QuaEngineInterface,
  assetName: string,
  options: CgOverlayOptions = {},
): Promise<void> {
  const layerId = options.id || 'cg-overlay'
  const { duration = 420, easing = 'ease-out', zIndex = 900, ...layerOptions } = options
  await addBackgroundLayerWithEngine(engine, {
    ...layerOptions,
    id: layerId,
    assetName,
    assetType: 'images',
    fit: layerOptions.fit || 'cover',
    opacity: 0,
    zIndex,
    metadata: {
      ...layerOptions.metadata,
      role: 'cg-overlay',
    },
  })
  await transitionBackgroundLayerWithEngine(engine, layerId, {
    type: 'fade-in',
    duration,
    easing,
  })
}

export async function hideCgOverlayWithEngine(
  engine: QuaEngineInterface,
  options: { id?: string, duration?: number, easing?: AnimationTimingFunction } = {},
): Promise<void> {
  const layerId = options.id || 'cg-overlay'
  const current = engine.getViewState().background
  const layer = current?.layers?.find(item => item.id === layerId)
  if (!layer) {
    return
  }
  await transitionBackgroundLayerWithEngine(engine, layerId, {
    type: 'fade-out',
    duration: options.duration ?? 360,
    easing: options.easing ?? 'ease-in',
  })
  await removeBackgroundLayerWithEngine(engine, layerId)
}

export async function transitionBackgroundWithEngine(
  engine: QuaEngineInterface,
  transition: TransitionIntent,
): Promise<void> {
  const current = engine.getViewState().background
  if (!current) {
    await engine.setBackgroundProjection({
      mode: 'layered',
      layers: [],
    })
    return
  }

  if (isAnimatedTransition(transition)) {
    await playBackgroundVisibilityTransitionWithEngine(engine, current, transition)
    return
  }

  await engine.setBackgroundProjection(stripBackgroundTransitions(current))
}

export async function transitionBackgroundLayerWithEngine(
  engine: QuaEngineInterface,
  layerId: string,
  transition: TransitionIntent,
): Promise<void> {
  if (!isAnimatedTransition(transition)) {
    await updateBackgroundLayerWithEngine(engine, layerId, { transition: undefined })
    return
  }

  const current = engine.getViewState().background
  const layer = current?.layers?.find(item => item.id === layerId)
  if (!layer) {
    return
  }

  await playTransitionTimeline(engine, createLayerVisibilityTimeline(layer, transition))
}

export { backgroundDecoratorMappings } from './decorators'

function getLayeredBackground(engine: QuaEngineInterface): BackgroundIntent & { mode: 'layered', layers: ViewBackgroundLayerProjection[] } {
  const current = engine.getViewState().background
  if (current?.mode === 'layered') {
    return {
      ...cloneBackground(current),
      mode: 'layered',
      layers: normalizeLayers(current.layers || []),
    }
  }
  return {
    mode: 'layered',
    layers: [],
  }
}

function normalizeLayers(layers: readonly BackgroundLayerInput[] | readonly Readonly<ViewBackgroundLayerProjection>[]): ViewBackgroundLayerProjection[] {
  return layers
    .map(layer => normalizeLayer(layer))
    .sort((left, right) => (left.zIndex ?? 0) - (right.zIndex ?? 0))
}

function normalizeLayer(layer: BackgroundLayerInput | Readonly<ViewBackgroundLayerProjection>): ViewBackgroundLayerProjection {
  return {
    ...layer,
    assetType: layer.assetType || 'images',
    visible: layer.visible !== false,
    composition: layer.composition ? normalizeComposition(layer.composition) : undefined,
    metadata: layer.metadata ? cloneUnknownRecord(layer.metadata) : undefined,
    transition: layer.transition ? { ...layer.transition } : undefined,
  }
}

function normalizeBackground(background: Readonly<ViewBackgroundProjection>): ViewBackgroundProjection {
  return {
    ...background,
    ...(background.characterLighting ? { characterLighting: cloneUnknownValue(background.characterLighting) as typeof background.characterLighting } : {}),
    transition: background.transition ? { ...background.transition } : undefined,
    video: background.video
      ? {
          ...background.video,
          transition: background.video.transition ? { ...background.video.transition } : undefined,
          metadata: background.video.metadata ? cloneUnknownRecord(background.video.metadata) : undefined,
        }
      : undefined,
    layers: background.layers?.map(layer => normalizeLayer(layer)),
    composition: background.composition ? normalizeComposition(background.composition) : undefined,
    metadata: background.metadata ? cloneUnknownRecord(background.metadata) : undefined,
  }
}

function cloneBackground(background: Readonly<BackgroundIntent>): BackgroundIntent {
  return normalizeBackground(background)
}

function backgroundLayerRequiresPackage(layer: Readonly<ViewBackgroundLayerProjection>, packageId: string): boolean {
  return metadataRequiresPackage(layer.metadata, packageId)
}

function metadataOwnedByPackage(metadata: Readonly<Record<string, unknown>> | undefined, packageId: string): boolean {
  return metadata?.contentPackageId === packageId
}

function metadataRequiresPackage(metadata: Readonly<Record<string, unknown>> | undefined, packageId: string): boolean {
  return metadata?.contentPackageId === packageId
    || getRequiredRuntimePackages(metadata).includes(packageId)
}

function removeRuntimePackageFromMetadata(
  metadata: Readonly<Record<string, unknown>> | undefined,
  packageId: string,
): Record<string, unknown> | undefined {
  if (!metadata) {
    return undefined
  }
  if (metadata.contentPackageId === packageId) {
    return undefined
  }
  const next = cloneUnknownRecord(metadata)
  const requiredRuntimePackages = getRequiredRuntimePackages(next).filter(id => id !== packageId)
  if (requiredRuntimePackages.length > 0) {
    next.requiredRuntimePackages = requiredRuntimePackages
  }
  else {
    delete next.requiredRuntimePackages
  }
  return Object.keys(next).length > 0 ? next : undefined
}

function normalizeComposition(composition: NonNullable<ViewBackgroundProjection['composition']>) {
  return cloneUnknownRecord(composition) as NonNullable<ViewBackgroundProjection['composition']>
}

function cloneUnknownRecord<T extends Readonly<Record<string, unknown>>>(value: T): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cloneUnknownValue(item)]))
}

function cloneUnknownValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(cloneUnknownValue)
  }
  if (value && typeof value === 'object') {
    return cloneUnknownRecord(value as Readonly<Record<string, unknown>>)
  }
  return value
}

function mergeUnknownRecord(
  base: Readonly<Record<string, unknown>>,
  patch: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  const next = cloneUnknownRecord(base)
  for (const [key, value] of Object.entries(patch)) {
    const current = next[key]
    if (
      current
      && typeof current === 'object'
      && !Array.isArray(current)
      && value
      && typeof value === 'object'
      && !Array.isArray(value)
    ) {
      next[key] = mergeUnknownRecord(current as Readonly<Record<string, unknown>>, value as Readonly<Record<string, unknown>>)
    }
    else {
      next[key] = cloneUnknownValue(value)
    }
  }
  return next
}

function withCurrentRuntimeLayerMetadata(
  engine: QuaEngineInterface,
  layer: ViewBackgroundLayerProjection,
): ViewBackgroundLayerProjection {
  const packageId = currentRuntimePackageId(engine)
  if (!packageId) {
    return layer
  }
  return {
    ...layer,
    metadata: mergeRuntimePackageMetadata(layer.metadata, packageId),
  }
}

function currentRuntimePackageId(engine: QuaEngineInterface): string | undefined {
  return (engine as Partial<QuaEngineInterface>).getCurrentRuntimePackageId?.()
    || (engine as Partial<QuaEngineInterface>).getStoryPoint?.()?.contentPackageId
}

function mergeRuntimePackageMetadata(
  metadata: Readonly<Record<string, unknown>> | undefined,
  packageId: string,
): Record<string, unknown> {
  const next = metadata ? cloneUnknownRecord(metadata) : {}
  const currentPackageId = typeof next.contentPackageId === 'string' ? next.contentPackageId : undefined
  const requiredRuntimePackages = mergeRequiredRuntimePackages(
    currentPackageId ? [currentPackageId] : [],
    getRequiredRuntimePackages(next),
    [packageId],
  )

  if (!currentPackageId) {
    next.contentPackageId = packageId
  }
  else if (currentPackageId !== packageId) {
    next.requiredRuntimePackages = requiredRuntimePackages
  }
  else if (getRequiredRuntimePackages(next).length > 0) {
    next.requiredRuntimePackages = requiredRuntimePackages
  }

  return next
}

function getRequiredRuntimePackages(metadata?: Readonly<Record<string, unknown>>): string[] {
  const value = metadata?.requiredRuntimePackages
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.length > 0)
    : []
}

function mergeRequiredRuntimePackages(...groups: Array<readonly string[] | undefined>): string[] {
  return Array.from(new Set(groups.flatMap(group => group || []).filter(Boolean)))
}

async function setBackgroundProjectionWithTransition(
  engine: QuaEngineInterface,
  background: ViewBackgroundProjection,
): Promise<void> {
  if (!isAnimatedTransition(background.transition)) {
    await engine.setBackgroundProjection(background)
    return
  }

  await replaceBackgroundWithTransition(engine, background, background.transition)
}

async function replaceBackgroundWithTransition(
  engine: QuaEngineInterface,
  next: Readonly<ViewBackgroundProjection>,
  transition: TransitionIntent,
): Promise<void> {
  const current = engine.getViewState().background
  const oldLayers = current ? flattenBackgroundForTransition(current, 'old', 0, 0) : []
  const newLayers = flattenBackgroundForTransition(next, 'new', 1000, 0)
  const kind = resolveTransitionKind(transition)
  const slide = kind === 'slide' ? resolveSlideDeltas(engine, transition.type) : undefined

  const tempLayers = [
    ...oldLayers.map(record => record.layer),
    ...newLayers.map((record) => {
      if (!slide) {
        return {
          ...record.layer,
          opacity: 0,
        }
      }
      return {
        ...record.layer,
        x: (record.layer.x ?? 0) + slide.newX,
        y: (record.layer.y ?? 0) + slide.newY,
      }
    }),
  ]

  await engine.setBackgroundProjection(normalizeBackground({
    mode: 'layered',
    layers: tempLayers,
    characterLighting: next.characterLighting,
    metadata: {
      transition: {
        type: transition.type,
        phase: 'running',
      },
    },
  }))

  await playTransitionTimeline(engine, createReplacementTimeline(oldLayers, newLayers, transition, slide))
  await engine.setBackgroundProjection(stripBackgroundTransitions(next))
}

async function playBackgroundVisibilityTransitionWithEngine(
  engine: QuaEngineInterface,
  current: Readonly<ViewBackgroundProjection>,
  transition: TransitionIntent,
): Promise<void> {
  await playTransitionTimeline(engine, createVisibilityTimeline(current, transition))
}

async function playTransitionTimeline(
  engine: QuaEngineInterface,
  timeline: AnimationTimeline,
): Promise<void> {
  if (timeline.tracks.length === 0 || timeline.duration <= 0) {
    return
  }

  const { playTimelineWithEngine } = await import('@quajs/plugin-animation')
  await playTimelineWithEngine(engine, timeline, { wait: true })
}

function createReplacementTimeline(
  oldLayers: readonly TransitionLayerRecord[],
  newLayers: readonly TransitionLayerRecord[],
  transition: TransitionIntent,
  slide: SlideTransitionDeltas | undefined,
): AnimationTimeline {
  const duration = transition.duration ?? 300
  const easing = transition.easing
  const tracks: Array<AnimationTimeline['tracks'][number]> = []

  for (const record of oldLayers) {
    if (slide) {
      tracks.push(createNumberTrack(record.target, 'x', record.layer.x ?? 0, (record.layer.x ?? 0) + slide.oldX, duration, easing))
      tracks.push(createNumberTrack(record.target, 'y', record.layer.y ?? 0, (record.layer.y ?? 0) + slide.oldY, duration, easing))
    }
    else {
      tracks.push(createNumberTrack(record.target, 'opacity', record.targetOpacity, 0, duration, easing))
    }
  }

  for (const record of newLayers) {
    if (slide) {
      tracks.push(createNumberTrack(record.target, 'x', (record.layer.x ?? 0) + slide.newX, record.layer.x ?? 0, duration, easing))
      tracks.push(createNumberTrack(record.target, 'y', (record.layer.y ?? 0) + slide.newY, record.layer.y ?? 0, duration, easing))
    }
    else {
      tracks.push(createNumberTrack(record.target, 'opacity', 0, record.targetOpacity, duration, easing))
    }
  }

  return {
    id: `background.transition:${Date.now()}`,
    duration,
    commit: 'final',
    tracks: tracks.filter(track => track.keyframes[0]?.value !== track.keyframes[1]?.value),
  }
}

function createVisibilityTimeline(
  background: Readonly<ViewBackgroundProjection>,
  transition: TransitionIntent,
): AnimationTimeline {
  const duration = transition.duration ?? 300
  return {
    id: `background.visibility:${Date.now()}`,
    duration,
    commit: 'final',
    tracks: [createNumberTrack(
      'background:main',
      'opacity',
      background.opacity ?? 1,
      transition.type === 'fade-in' ? 1 : 0,
      duration,
      transition.easing,
    )],
  }
}

function createLayerVisibilityTimeline(
  layer: Readonly<ViewBackgroundLayerProjection>,
  transition: TransitionIntent,
): AnimationTimeline {
  const duration = transition.duration ?? 300
  return {
    id: `background-layer.transition:${layer.id}:${Date.now()}`,
    duration,
    commit: 'final',
    tracks: [createNumberTrack(
      `backgroundLayer:${layer.id}`,
      'opacity',
      layer.opacity ?? 1,
      transition.type === 'fade-in' ? 1 : 0,
      duration,
      transition.easing,
    )],
  }
}

function createNumberTrack(
  target: string,
  property: string,
  from: number,
  to: number,
  duration: number,
  easing?: AnimationTimingFunction,
): AnimationTimeline['tracks'][number] {
  return {
    target,
    property,
    interpolation: 'number',
    keyframes: [
      { at: 0, value: from, easing },
      { at: duration, value: to, easing },
    ],
  }
}

interface TransitionLayerRecord {
  target: `backgroundLayer:${string}`
  layer: ViewBackgroundLayerProjection
  targetOpacity: number
}

interface SlideTransitionDeltas {
  oldX: number
  oldY: number
  newX: number
  newY: number
}

function flattenBackgroundForTransition(
  background: Readonly<ViewBackgroundProjection>,
  scope: string,
  zIndexOffset: number,
  initialOpacity: number | undefined,
): TransitionLayerRecord[] {
  if (background.mode === 'layered') {
    return (background.layers || []).map((layer, index) => {
      const targetOpacity = layer.opacity ?? 1
      const id = `__qua_transition_${scope}_${sanitizeLayerId(layer.id || String(index))}`
      return {
        target: `backgroundLayer:${id}`,
        targetOpacity,
        layer: normalizeLayer({
          ...layer,
          id,
          opacity: initialOpacity ?? targetOpacity,
          transition: undefined,
          zIndex: (layer.zIndex ?? index) + zIndexOffset,
        }),
      }
    })
  }

  const assetName = background.mode === 'video'
    ? background.video?.assetName || background.assetName
    : background.assetName
  if (!assetName) {
    return []
  }

  const targetOpacity = background.opacity ?? 1
  const id = `__qua_transition_${scope}_main`
  return [{
    target: `backgroundLayer:${id}`,
    targetOpacity,
    layer: normalizeLayer({
      id,
      assetName,
      assetType: background.mode === 'video' ? 'video' : 'images',
      visible: true,
      fit: background.fit,
      origin: background.origin,
      width: background.width,
      height: background.height,
      x: background.x,
      y: background.y,
      scale: background.scale,
      rotation: background.rotation,
      opacity: initialOpacity ?? targetOpacity,
      composition: background.composition,
      zIndex: zIndexOffset,
      metadata: background.metadata,
    }),
  }]
}

function stripBackgroundTransitions(background: Readonly<ViewBackgroundProjection>): ViewBackgroundProjection {
  const next = normalizeBackground(background)
  next.transition = undefined
  if (next.video) {
    next.video = {
      ...next.video,
      transition: undefined,
    }
  }
  if (next.layers) {
    next.layers = next.layers.map(layer => ({
      ...layer,
      transition: undefined,
    }))
  }
  return next
}

function isAnimatedTransition(transition: TransitionIntent | undefined): transition is TransitionIntent {
  return Boolean(transition && transition.type !== 'instant' && (transition.duration ?? 300) > 0)
}

function resolveTransitionKind(transition: TransitionIntent): 'fade' | 'slide' {
  return transition.type.startsWith('slide') ? 'slide' : 'fade'
}

function resolveSlideDeltas(engine: QuaEngineInterface, type: string): SlideTransitionDeltas {
  const layout = engine.getViewState().layout
  const width = layout?.width ?? 1920
  const height = layout?.height ?? 1080
  switch (type) {
    case 'slide-right':
      return { oldX: width, oldY: 0, newX: -width, newY: 0 }
    case 'slide-up':
      return { oldX: 0, oldY: -height, newX: 0, newY: height }
    case 'slide-down':
      return { oldX: 0, oldY: height, newX: 0, newY: -height }
    case 'slide':
    case 'slide-left':
    default:
      return { oldX: -width, oldY: 0, newX: width, newY: 0 }
  }
}

function sanitizeLayerId(value: string): string {
  return value.replace(/[^\w-]/g, '_')
}

export const metadata = {
  name: '@quajs/plugin-background',
  version: '0.1.0',
  description: 'Background image, video, layered background, and transition APIs',
  category: 'visual',
} as const

export { decorators } from './decorators'
export const Plugin = BackgroundPlugin
