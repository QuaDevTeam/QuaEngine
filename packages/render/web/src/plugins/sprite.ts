import type { AssetType } from '@quajs/assets'
import type {
  SpriteManifest,
  SpriteReference,
  SpriteResolvedLayer,
} from '@quajs/plugin-sprite/contracts'
import type { RendererPlugin, ViewCharacterProjection } from '@quajs/render-core'
import type { QuaWebDomLayerContext } from './core'
import {
  resolveSpriteProjection,
  resolveSpriteReference,
} from '@quajs/plugin-sprite/contracts'

export function createSpriteWebRendererPlugin(): RendererPlugin {
  return {
    name: '@quajs/renderer-web/sprite',
    setup() {},
  }
}

export const spriteWebRendererPlugin = createSpriteWebRendererPlugin()

export interface SpriteWebRenderOptions {
  sprite: string
  expression?: string
  alt?: string
}

export function renderSprite(context: QuaWebDomLayerContext, options: SpriteWebRenderOptions): HTMLElement | undefined {
  const reference = resolveSpriteReference(options.sprite)
  if (!reference) {
    return undefined
  }

  const root = context.document.createElement('div')
  root.className = ['qua-sprite', options.expression ? 'has-expression' : ''].filter(Boolean).join(' ')
  root.style.position = 'relative'
  root.style.display = 'inline-block'
  root.style.lineHeight = '0'

  const renderResolved = (manifest?: SpriteManifest) => {
    const projection = resolveSpriteProjection(manifest, options.sprite, options.expression)
    if (!projection) {
      return
    }

    root.replaceChildren()
    root.setAttribute('data-sprite-family', projection.family)
    root.setAttribute('data-sprite', projection.sprite)
    root.setAttribute('data-sprite-expression', projection.expression || '')

    projection.layers.forEach((layer, index) => {
      root.append(renderSpriteLayerItem(context, layer, index === 0, options.alt || ''))
    })
  }

  renderResolved()
  void loadSpriteManifest(context, reference).then((manifest) => {
    if (!root.isConnected) {
      return
    }
    renderResolved(manifest)
  })

  return root
}

export function createSpriteCharacterRenderer() {
  return (context: QuaWebDomLayerContext, character: Readonly<ViewCharacterProjection>) => {
    if (!character.sprite) {
      return undefined
    }

    return renderSprite(context, {
      sprite: character.sprite,
      expression: character.expression,
      alt: character.name,
    })
  }
}

async function loadSpriteManifest(
  context: QuaWebDomLayerContext,
  reference: SpriteReference,
): Promise<SpriteManifest | undefined> {
  try {
    return await context.snapshot.assets?.getJSON<SpriteManifest>('characters', reference.manifestPath)
  }
  catch {
    return undefined
  }
}

function renderSpriteLayerItem(
  context: QuaWebDomLayerContext,
  layer: SpriteResolvedLayer,
  isBase: boolean,
  alt: string,
): HTMLElement {
  const activeAsset = { value: layer.asset }
  const mask = { url: undefined as string | undefined }
  const syncMask = (element: HTMLElement) => {
    const style = spriteLayerStyle(layer, isBase, mask.url)
    applyElementStyle(element, style)
  }

  if (layer.frame) {
    const frame = context.document.createElement('div')
    frame.className = [
      'qua-sprite-layer',
      'qua-sprite-layer--atlas',
      isBase ? 'qua-sprite-layer--base' : 'qua-sprite-layer--expression',
      layer.visible === false ? 'is-hidden' : '',
    ].filter(Boolean).join(' ')
    frame.setAttribute('data-sprite-layer-kind', layer.kind)
    frame.setAttribute('aria-hidden', 'true')

    const image = context.document.createElement('img')
    image.className = 'qua-sprite-layer__atlas'
    image.alt = alt
    applyElementStyle(image, atlasImageStyle(layer.frame))
    image.addEventListener('error', () => bindFallbackAsset(context, image, layer, activeAsset))
    context.bindAssetUrl(image, 'characters' as AssetType, activeAsset.value)
    frame.append(image)

    context.watchAssetUrl('characters' as AssetType, layer.mask, (state) => {
      mask.url = state.url
      syncMask(frame)
    })
    syncMask(frame)
    return frame
  }

  const image = context.document.createElement('img')
  image.className = [
    'qua-sprite-layer',
    isBase ? 'qua-sprite-layer--base' : 'qua-sprite-layer--expression',
    layer.visible === false ? 'is-hidden' : '',
  ].filter(Boolean).join(' ')
  image.alt = alt
  image.setAttribute('data-sprite-layer-kind', layer.kind)
  image.setAttribute('aria-hidden', 'true')
  image.addEventListener('error', () => bindFallbackAsset(context, image, layer, activeAsset))
  context.bindAssetUrl(image, 'characters' as AssetType, activeAsset.value)

  context.watchAssetUrl('characters' as AssetType, layer.mask, (state) => {
    mask.url = state.url
    syncMask(image)
  })
  syncMask(image)
  return image
}

export function spriteLayerStyle(
  layer: SpriteResolvedLayer,
  isBase: boolean,
  maskUrl?: string,
): Record<string, string | number | undefined> {
  const style: Record<string, string | number | undefined> = {
    position: isBase ? 'relative' : 'absolute',
    left: isBase ? undefined : '0',
    top: isBase ? undefined : '0',
    zIndex: layer.zIndex,
    opacity: layer.opacity,
    mixBlendMode: layer.blendMode,
    pointerEvents: 'none',
    display: layer.visible === false ? 'none' : undefined,
    transform: createSpriteTransform(layer),
  }

  if (maskUrl) {
    style.maskImage = `url(${maskUrl})`
    style.WebkitMaskImage = `url(${maskUrl})`
    style.maskRepeat = 'no-repeat'
    style.WebkitMaskRepeat = 'no-repeat'
  }

  return style
}

export function atlasImageStyle(frame: NonNullable<SpriteResolvedLayer['frame']>): Record<string, string | number> {
  return {
    position: 'absolute',
    left: `${-frame.x}px`,
    top: `${-frame.y}px`,
    display: 'block',
  }
}

function bindFallbackAsset(
  context: QuaWebDomLayerContext,
  image: HTMLImageElement,
  layer: SpriteResolvedLayer,
  activeAsset: { value: string },
): void {
  if (layer.fallback && activeAsset.value !== layer.fallback) {
    activeAsset.value = layer.fallback
    context.bindAssetUrl(image, 'characters' as AssetType, activeAsset.value)
  }
}

function applyElementStyle(element: HTMLElement, style: Record<string, string | number | undefined>): void {
  for (const [property, value] of Object.entries(style)) {
    if (value === undefined) {
      element.style.removeProperty(toCssProperty(property))
      continue
    }
    element.style.setProperty(toCssProperty(property), String(value))
  }
}

function createSpriteTransform(layer: SpriteResolvedLayer): string | undefined {
  const transforms: string[] = []
  if (layer.offsetX || layer.offsetY) {
    transforms.push(`translate(${layer.offsetX || 0}px, ${layer.offsetY || 0}px)`)
  }
  if (layer.scale !== undefined) {
    transforms.push(`scale(${layer.scale})`)
  }
  if (layer.rotation !== undefined) {
    transforms.push(`rotate(${layer.rotation}deg)`)
  }
  return transforms.length > 0 ? transforms.join(' ') : undefined
}

function toCssProperty(property: string): string {
  return property.replace(/[A-Z]/g, match => `-${match.toLowerCase()}`)
}
