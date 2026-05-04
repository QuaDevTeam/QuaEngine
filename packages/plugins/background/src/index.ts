import type { BackgroundIntent, QuaEngineInterface } from '@quajs/engine'
import type {
  TransitionIntent,
  ViewBackgroundLayerProjection,
  ViewVideoBackgroundProjection,
} from '@quajs/render-core'
import { BaseEnginePlugin } from '@quajs/engine'

export type BackgroundLayerInput = Omit<ViewBackgroundLayerProjection, 'id' | 'assetName'> & {
  id: string
  assetName: string
}

export interface VideoBackgroundOptions extends Omit<ViewVideoBackgroundProjection, 'assetName'> {}

export interface LayeredBackgroundOptions {
  transition?: TransitionIntent
  metadata?: Record<string, unknown>
}

export type BackgroundLayerPatch = Partial<Omit<ViewBackgroundLayerProjection, 'id'>>

export const backgroundDecoratorMappings = {
  SetBackground: {
    function: 'setBackgroundWithEngine',
    module: '@quajs/plugin-background',
  },
  ClearBackground: {
    function: 'clearBackgroundWithEngine',
    module: '@quajs/plugin-background',
  },
  VideoBackground: {
    function: 'setVideoBackgroundWithEngine',
    module: '@quajs/plugin-background',
  },
  SetLayeredBackground: {
    function: 'setLayeredBackgroundWithEngine',
    module: '@quajs/plugin-background',
  },
  BackgroundLayer: {
    function: 'addBackgroundLayerWithEngine',
    module: '@quajs/plugin-background',
  },
  RemoveBackgroundLayer: {
    function: 'removeBackgroundLayerWithEngine',
    module: '@quajs/plugin-background',
  },
  ClearBackgroundLayers: {
    function: 'clearBackgroundLayersWithEngine',
    module: '@quajs/plugin-background',
  },
  BackgroundTransition: {
    function: 'transitionBackgroundWithEngine',
    module: '@quajs/plugin-background',
  },
  BackgroundLayerTransition: {
    function: 'transitionBackgroundLayerWithEngine',
    module: '@quajs/plugin-background',
  },
} as const

export class BackgroundPlugin extends BaseEnginePlugin {
  readonly name = '@quajs/plugin-background'
  readonly id = 'background'
  readonly version = '0.1.0'
  readonly description = 'Background image, video, layered background, and transition APIs'

  registerAPIs() {
    return {
      pluginName: this.name,
      apis: [
        { name: 'setBackgroundWithEngine', fn: setBackgroundWithEngine, module: this.name },
        { name: 'clearBackgroundWithEngine', fn: clearBackgroundWithEngine, module: this.name },
        { name: 'setVideoBackgroundWithEngine', fn: setVideoBackgroundWithEngine, module: this.name },
        { name: 'setLayeredBackgroundWithEngine', fn: setLayeredBackgroundWithEngine, module: this.name },
        { name: 'addBackgroundLayerWithEngine', fn: addBackgroundLayerWithEngine, module: this.name },
        { name: 'removeBackgroundLayerWithEngine', fn: removeBackgroundLayerWithEngine, module: this.name },
        { name: 'updateBackgroundLayerWithEngine', fn: updateBackgroundLayerWithEngine, module: this.name },
        { name: 'clearBackgroundLayersWithEngine', fn: clearBackgroundLayersWithEngine, module: this.name },
        { name: 'transitionBackgroundWithEngine', fn: transitionBackgroundWithEngine, module: this.name },
        { name: 'transitionBackgroundLayerWithEngine', fn: transitionBackgroundLayerWithEngine, module: this.name },
      ],
      decorators: backgroundDecoratorMappings,
    }
  }
}

export async function setBackgroundWithEngine(
  engine: QuaEngineInterface,
  assetName: string,
  transition?: TransitionIntent,
): Promise<void> {
  await engine.setBackgroundProjection({
    mode: 'image',
    assetName,
    transition,
  })
}

export async function clearBackgroundWithEngine(engine: QuaEngineInterface): Promise<void> {
  await engine.setBackgroundProjection(undefined)
}

export async function setVideoBackgroundWithEngine(
  engine: QuaEngineInterface,
  assetName: string,
  options: VideoBackgroundOptions = {},
): Promise<void> {
  const { transition, metadata, ...videoOptions } = options
  await engine.setBackgroundProjection({
    mode: 'video',
    assetName,
    transition,
    video: {
      assetName,
      ...videoOptions,
      transition,
      metadata,
    },
    metadata,
  })
}

export async function setLayeredBackgroundWithEngine(
  engine: QuaEngineInterface,
  layers: readonly BackgroundLayerInput[] = [],
  options: LayeredBackgroundOptions = {},
): Promise<void> {
  await engine.setBackgroundProjection({
    mode: 'layered',
    layers: normalizeLayers(layers),
    transition: options.transition,
    metadata: options.metadata,
  })
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
      ? normalizeLayer({ ...layer, ...patch, id: layerId, assetName: patch.assetName ?? layer.assetName })
      : layer,
  ))
  await engine.setBackgroundProjection({
    ...current,
    layers,
  })
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

export async function transitionBackgroundWithEngine(
  engine: QuaEngineInterface,
  transition: TransitionIntent,
): Promise<void> {
  const current = engine.getViewState().background
  if (!current) {
    await engine.setBackgroundProjection({
      mode: 'layered',
      layers: [],
      transition,
    })
    return
  }

  await engine.setBackgroundProjection({
    ...cloneBackground(current),
    transition,
    video: current.video
      ? {
          ...current.video,
          transition,
        }
      : undefined,
  })
}

export async function transitionBackgroundLayerWithEngine(
  engine: QuaEngineInterface,
  layerId: string,
  transition: TransitionIntent,
): Promise<void> {
  await updateBackgroundLayerWithEngine(engine, layerId, { transition })
}

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
    metadata: layer.metadata ? { ...layer.metadata } : undefined,
    transition: layer.transition ? { ...layer.transition } : undefined,
  }
}

function cloneBackground(background: Readonly<BackgroundIntent>): BackgroundIntent {
  return {
    ...background,
    transition: background.transition ? { ...background.transition } : undefined,
    video: background.video
      ? {
          ...background.video,
          transition: background.video.transition ? { ...background.video.transition } : undefined,
          metadata: background.video.metadata ? { ...background.video.metadata } : undefined,
        }
      : undefined,
    layers: background.layers?.map(layer => normalizeLayer(layer)),
    metadata: background.metadata ? { ...background.metadata } : undefined,
  }
}

export const metadata = {
  name: '@quajs/plugin-background',
  version: '0.1.0',
  description: 'Background image, video, layered background, and transition APIs',
  category: 'visual',
} as const

export const decorators = backgroundDecoratorMappings
export const Plugin = BackgroundPlugin
