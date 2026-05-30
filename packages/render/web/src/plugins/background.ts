import type { BackgroundMaskProjection, ViewBackgroundProjection } from '@quajs/render-core'
import type { WebAssetTargetPackageId } from '../assets'
import type { QuaWebDomLayerContext, QuaWebDomRendererPlugin } from './core'
import { runtimePackageCandidatesFromMetadata } from '../assets'
import {
  backgroundLayerProjectionVars,
  backgroundMaskImageVars,
  backgroundProjectionVars,
  normalizeBackgroundLayerAssetType,
  projectBackground,
} from '../projection'
import { defineWebRendererPlugin } from './core'
import { applyStyleVars } from './shared'

const backgroundMaskDisposers = new WeakMap<HTMLElement, () => void>()

export function createBackgroundWebRendererPlugin(): QuaWebDomRendererPlugin {
  return defineWebRendererPlugin({
    name: '@quajs/renderer-web/background',
    setup() {},
    layers: [{
      id: 'background',
      order: 10,
      plane: 'scene',
      render: renderBackgroundLayer,
      update: updateBackgroundLayer,
    }],
  })
}

export const backgroundWebRendererPlugin = createBackgroundWebRendererPlugin()

function renderBackgroundLayer(context: QuaWebDomLayerContext): Node {
  const layer = context.document.createElement('div')
  layer.className = 'qua-background-layer'
  const background = projectBackground(context.view.background, context.view.animations, Date.now())
  const projection = background ? renderBackgroundProjection(context, background) : undefined
  if (projection) {
    layer.append(projection)
  }
  return layer
}

function renderBackgroundProjection(context: QuaWebDomLayerContext, background: ViewBackgroundProjection): Node | undefined {
  if (background.mode === 'video' && background.video) {
    const video = context.document.createElement('video')
    video.className = 'qua-background qua-background--video'
    video.autoplay = true
    video.playsInline = true
    video.loop = background.video.loop !== false
    video.muted = background.video.muted !== false
    if (background.video.volume !== undefined) {
      video.volume = background.video.volume
    }
    if (background.video.playbackRate !== undefined) {
      video.playbackRate = background.video.playbackRate
    }
    video.setAttribute('aria-hidden', 'true')
    applyStyleVars(video, backgroundProjectionVars(background))
    const targetPackageIds = runtimePackageCandidatesFromMetadata(background.video.metadata || background.metadata)
    syncBackgroundMask(context, video, background.composition?.mask, targetPackageIds)
    context.bindAssetUrl(video, 'video', background.video.assetName, 'src', targetPackageIds)
    context.bindAssetUrl(video, 'images', background.video.poster, 'poster', targetPackageIds)
    return video
  }

  if (background.mode === 'layered') {
    const root = context.document.createElement('div')
    root.className = 'qua-layered-background'
    applyStyleVars(root, backgroundProjectionVars(background))
    syncBackgroundMask(context, root, background.composition?.mask, runtimePackageCandidatesFromMetadata(background.metadata))
    for (const item of background.layers || []) {
      const assetType = normalizeBackgroundLayerAssetType(item.assetType)
      const element = item.assetType === 'video'
        ? context.document.createElement('video')
        : context.document.createElement('img')
      element.className = [
        'qua-background-layer-item',
        item.assetType === 'video' ? 'qua-background-layer-item--video' : '',
        item.visible === false ? 'is-hidden' : '',
      ].filter(Boolean).join(' ')
      element.setAttribute('data-background-layer-id', item.id)
      element.setAttribute('data-background-layer-type', item.assetType || 'images')
      element.setAttribute('aria-hidden', 'true')
      if (element instanceof HTMLImageElement) {
        element.alt = ''
      }
      else {
        element.autoplay = true
        element.playsInline = true
        element.loop = true
        element.muted = true
      }
      applyStyleVars(element, backgroundLayerProjectionVars(item))
      const targetPackageIds = runtimePackageCandidatesFromMetadata(item.metadata)
      syncBackgroundMask(context, element, item.composition?.mask, targetPackageIds)
      context.bindAssetUrl(element, assetType, item.assetName, 'src', targetPackageIds)
      root.append(element)
    }
    return root
  }

  if (!background.assetName) {
    return undefined
  }

  const image = context.document.createElement('img')
  image.className = 'qua-background'
  image.alt = ''
  image.setAttribute('aria-hidden', 'true')
  applyStyleVars(image, backgroundProjectionVars(background))
  const targetPackageIds = runtimePackageCandidatesFromMetadata(background.metadata)
  syncBackgroundMask(context, image, background.composition?.mask, targetPackageIds)
  context.bindAssetUrl(image, 'images', background.assetName, 'src', targetPackageIds)
  return image
}

function updateBackgroundLayer(context: QuaWebDomLayerContext, node: Node): void {
  if (!(node instanceof HTMLElement)) {
    return
  }
  const background = projectBackground(context.view.background, context.view.animations, Date.now())
  const projection = node.firstElementChild
  if (!background || !(projection instanceof HTMLElement)) {
    return
  }
  if (background.mode === 'layered') {
    applyStyleVars(projection, backgroundProjectionVars(background))
    syncBackgroundMask(context, projection, background.composition?.mask, runtimePackageCandidatesFromMetadata(background.metadata))
    for (const item of background.layers || []) {
      const element = findBackgroundLayerElement(projection, item.id)
      if (element instanceof HTMLElement) {
        element.classList.toggle('is-hidden', item.visible === false)
        applyStyleVars(element, backgroundLayerProjectionVars(item))
        syncBackgroundMask(context, element, item.composition?.mask, runtimePackageCandidatesFromMetadata(item.metadata))
      }
    }
    return
  }
  applyStyleVars(projection, backgroundProjectionVars(background))
  syncBackgroundMask(context, projection, background.composition?.mask, runtimePackageCandidatesFromMetadata(background.metadata))
}

function syncBackgroundMask(
  context: QuaWebDomLayerContext,
  element: HTMLElement,
  mask: Readonly<BackgroundMaskProjection> | undefined,
  targetPackageId?: WebAssetTargetPackageId,
): void {
  const key = mask?.assetName
    ? `${normalizeBackgroundLayerAssetType(mask.assetType)}:${mask.assetName}`
    : ''
  if (element.dataset.backgroundMaskKey === key) {
    return
  }

  backgroundMaskDisposers.get(element)?.()
  backgroundMaskDisposers.delete(element)
  element.dataset.backgroundMaskKey = key
  applyStyleVars(element, backgroundMaskImageVars(undefined))

  if (!mask?.assetName) {
    return
  }

  const assetType = normalizeBackgroundLayerAssetType(mask.assetType)
  const dispose = context.watchAssetUrl(assetType, mask.assetName, (state) => {
    if (element.dataset.backgroundMaskKey !== key) {
      return
    }
    applyStyleVars(element, backgroundMaskImageVars(state.url))
  }, targetPackageId)
  backgroundMaskDisposers.set(element, dispose)
}

function findBackgroundLayerElement(root: HTMLElement, layerId: string): HTMLElement | undefined {
  for (const element of root.querySelectorAll('[data-background-layer-id]')) {
    if (element instanceof HTMLElement && element.dataset.backgroundLayerId === layerId) {
      return element
    }
  }
  return undefined
}
