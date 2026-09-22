import type { Pipeline } from '@quajs/pipeline'
import type { RendererPluginContext, ViewBackgroundLayerProjection, ViewBackgroundProjection } from '@quajs/render-core'
import type { QuaWebRendererPluginContext } from '../../controller'
import { LogicToRenderEvents, RenderToLogicEvents, resolveBackgroundLayers } from '@quajs/render-core'
import { runtimePackageCandidatesFromMetadata, WebAssetUrlHandle } from '../../assets'
import { BackgroundShaderCanvas } from './shader'

interface PreparedBackground {
  id: string
  handles: WebAssetUrlHandle[]
  media: Array<HTMLImageElement | HTMLVideoElement>
  shader?: BackgroundShaderCanvas
  shaderReady?: boolean
  updateVideo?: () => void
  disposed: boolean
}
const prepared = new WeakMap<Pipeline, PreparedBackground>()

function release(entry: PreparedBackground): void {
  entry.disposed = true
  entry.shader?.dispose()
  for (const media of entry.media) {
    if (media instanceof HTMLVideoElement) {
      media.pause()
      media.removeAttribute('src')
      media.load()
    }
  }
  for (const handle of entry.handles) handle.dispose({ defer: true })
}

export function setupBackgroundPreparation(context: RendererPluginContext): void {
  const web = context as QuaWebRendererPluginContext
  const pipeline = context.getPipeline()
  context.addDisposer(context.onLogicToRender(LogicToRenderEvents.BACKGROUND_PREPARE, async ({ id, background }) => {
    const previous = prepared.get(pipeline)
    if (previous)
      release(previous)
    const entry: PreparedBackground = { id, handles: [], media: [], disposed: false }
    prepared.set(pipeline, entry)
    try {
      const layers = resolveBackgroundLayers(background)
      const load = async (type: 'images' | 'video', name: string, metadata?: Readonly<Record<string, unknown>>) => {
        const handle = new WebAssetUrlHandle({ getAssets: web.getAssets, getType: () => type, getName: () => name, getTargetPackageId: () => runtimePackageCandidatesFromMetadata(metadata) })
        entry.handles.push(handle)
        await handle.load()
        if (entry.disposed)
          throw new Error('Background preparation cancelled')
        const state = handle.getState()
        if (!state.url)
          throw state.error ?? new Error(`Background asset not found: ${name}`)
        if (type === 'video') {
          const video = document.createElement('video')
          entry.media.push(video)
          video.muted = true
          video.playsInline = true
          video.preload = 'auto'
          await new Promise<void>((resolve, reject) => {
            video.onloadeddata = () => resolve()
            video.onerror = () => reject(new Error(`Background video failed: ${name}`))
            video.src = state.url!
          })
          return video
        }
        const image = new Image()
        entry.media.push(image)
        image.src = state.url
        await image.decode()
        return image
      }
      const images = await Promise.all(layers.map(layer => load(layer.assetType === 'video' ? 'video' : 'images', layer.assetName, layer.metadata)))
      const masks = await Promise.all(layers.map(layer => layer.composition?.mask?.assetName ? load('images', layer.composition.mask.assetName, layer.metadata) : undefined))
      if (entry.disposed)
        return
      if (background.shaderTransition) {
        const layout = context.getViewState().layout
        const height = layout?.height ?? 1080
        const width = layout?.width ?? 1920
        const shader = new BackgroundShaderCanvas(document, background.shaderTransition.shader, width, height)
        entry.shader = shader
        await shader.ready
        if (entry.disposed)
          return
        const sides = [document.createElement('canvas'), document.createElement('canvas')]
        const incoming = new Set(background.shaderTransition.incomingLayerIds)
        const paint = () => {
          for (const [side, canvas] of sides.entries()) {
            canvas.width = width
            canvas.height = height
            const ctx = canvas.getContext('2d')!
            const sorted = layers.map((layer, index) => ({ layer, index })).sort((a, b) => (a.layer.zIndex ?? 0) - (b.layer.zIndex ?? 0))
            for (const { layer, index } of sorted) {
              if (incoming.has(layer.id) !== Boolean(side) || layer.visible === false)
                continue
              paintLayer(ctx, images[index]!, masks[index], layer, width, height)
            }
          }
          shader.upload(sides[0]!, sides[1]!)
        }
        paint()
        if (images.some(image => image instanceof HTMLVideoElement)) {
          entry.updateVideo = paint
          for (const image of images) {
            if (image instanceof HTMLVideoElement)
              void image.play().catch(() => {})
          }
        }
        shader.draw(0)
        entry.shaderReady = true
      }
      context.refresh()
      await context.emitRenderToLogic(RenderToLogicEvents.BACKGROUND_READY, { id })
    }
    catch (error) {
      if (!entry.disposed)
        await context.emitRenderToLogic(RenderToLogicEvents.BACKGROUND_READY, { id, error: error instanceof Error ? error.message : String(error) })
      release(entry)
    }
  }))
  context.addDisposer(context.onLogicToRender(LogicToRenderEvents.VIEW_UPDATE, () => {
    const entry = prepared.get(pipeline)
    if (entry && context.getViewState().background?.preparationId !== entry.id) {
      prepared.delete(pipeline)
      release(entry)
    }
  }))
  context.addDisposer(() => {
    const entry = prepared.get(pipeline)
    if (entry)
      release(entry)
    prepared.delete(pipeline)
  })
}

export function projectBackgroundShaderCanvas(pipeline: Pipeline, background: Readonly<ViewBackgroundProjection>): HTMLCanvasElement | undefined {
  const entry = prepared.get(pipeline)
  if (!entry || entry.id !== background.preparationId || entry.disposed || !entry.shaderReady || !background.shaderTransition)
    return
  entry.updateVideo?.()
  entry.shader?.draw(background.shaderTransition.progress)
  return entry.shader?.canvas
}

function paintLayer(ctx: CanvasRenderingContext2D, image: HTMLImageElement | HTMLVideoElement, mask: HTMLImageElement | HTMLVideoElement | undefined, layer: Readonly<ViewBackgroundLayerProjection>, width: number, height: number): void {
  const w = typeof layer.width === 'number' ? layer.width : width
  const h = typeof layer.height === 'number' ? layer.height : height
  const iw = image instanceof HTMLVideoElement ? image.videoWidth : image.naturalWidth
  const ih = image instanceof HTMLVideoElement ? image.videoHeight : image.naturalHeight
  const fit = layer.fit ?? 'cover'
  const ratio = fit === 'contain' || fit === 'scale-down' ? Math.min(w / iw, h / ih, fit === 'scale-down' ? 1 : Infinity) : fit === 'none' ? 1 : Math.max(w / iw, h / ih)
  const dw = fit === 'fill' ? w : iw * ratio
  const dh = fit === 'fill' ? h : ih * ratio
  // Render each layer in isolation so masks and filters affect that layer only.
  const canvas = ctx.canvas.ownerDocument.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const local = canvas.getContext('2d')!
  local.drawImage(image, (w - dw) / 2, (h - dh) / 2, dw, dh)
  if (mask) {
    local.globalCompositeOperation = 'destination-in'
    local.drawImage(mask, 0, 0, w, h)
  }
  ctx.save()
  ctx.translate((layer.x ?? 0) + w / 2, (layer.y ?? 0) + h / 2)
  ctx.rotate((layer.rotation ?? 0) * Math.PI / 180)
  ctx.scale(layer.scale ?? 1, layer.scale ?? 1)
  ctx.globalAlpha = layer.opacity ?? 1
  const filter = layer.composition?.filter
  if (filter)
    ctx.filter = `blur(${filter.blur ?? 0}px) brightness(${filter.brightness ?? 1}) contrast(${filter.contrast ?? 1}) saturate(${filter.saturate ?? 1}) hue-rotate(${filter.hueRotate ?? 0}deg) grayscale(${filter.grayscale ?? 0}) sepia(${filter.sepia ?? 0}) invert(${filter.invert ?? 0})`
  if (layer.composition?.blendMode && layer.composition.blendMode !== 'normal')
    ctx.globalCompositeOperation = layer.composition.blendMode as GlobalCompositeOperation
  ctx.drawImage(canvas, -w / 2, -h / 2)
  ctx.restore()
}
