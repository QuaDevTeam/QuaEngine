import type { BackgroundMaskProjection, ViewBackgroundProjection } from '@quajs/render-core'
import type { QuaWebDomLayerContext, QuaWebDomRendererPlugin } from './core'
import {
  backgroundLayerProjectionVars,
  backgroundMaskImageVars,
  backgroundProjectionVars,
  normalizeBackgroundLayerAssetType,
  projectBackground,
} from '../projection'
import { defineWebRendererPlugin } from './core'
import { applyStyleVars } from './shared'

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
    bindBackgroundMask(context, video, background.composition?.mask)
    context.bindAssetUrl(video, 'video', background.video.assetName)
    context.bindAssetUrl(video, 'images', background.video.poster, 'poster')
    return video
  }

  if (background.mode === 'layered') {
    const root = context.document.createElement('div')
    root.className = 'qua-layered-background'
    applyStyleVars(root, backgroundProjectionVars(background))
    bindBackgroundMask(context, root, background.composition?.mask)
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
      bindBackgroundMask(context, element, item.composition?.mask)
      context.bindAssetUrl(element, assetType, item.assetName)
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
  bindBackgroundMask(context, image, background.composition?.mask)
  context.bindAssetUrl(image, 'images', background.assetName)
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
    for (const item of background.layers || []) {
      const element = findBackgroundLayerElement(projection, item.id)
      if (element instanceof HTMLElement) {
        element.classList.toggle('is-hidden', item.visible === false)
        applyStyleVars(element, backgroundLayerProjectionVars(item))
      }
    }
    return
  }
  applyStyleVars(projection, backgroundProjectionVars(background))
}

function bindBackgroundMask(
  context: QuaWebDomLayerContext,
  element: HTMLElement,
  mask: Readonly<BackgroundMaskProjection> | undefined,
): void {
  if (!mask?.assetName) {
    return
  }
  context.watchAssetUrl(normalizeBackgroundLayerAssetType(mask.assetType), mask.assetName, (state) => {
    applyStyleVars(element, backgroundMaskImageVars(state.url))
  })
}

function findBackgroundLayerElement(root: HTMLElement, layerId: string): HTMLElement | undefined {
  for (const element of root.querySelectorAll('[data-background-layer-id]')) {
    if (element instanceof HTMLElement && element.dataset.backgroundLayerId === layerId) {
      return element
    }
  }
  return undefined
}
