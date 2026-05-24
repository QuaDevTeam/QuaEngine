import type { AssetType } from '@quajs/assets'
import type {
  SpriteManifest,
  SpriteReference,
  SpriteResolvedLayer,
  ResolvedSpriteSkinProjection,
  SpriteInsets,
  SpriteSkinManifest,
  SpriteSkinStateName,
} from '@quajs/plugin-sprite/contracts'
import type { ActiveAnimationProjection, RendererPlugin, ViewCharacterProjection } from '@quajs/render-core'
import type { QuaWebDomLayerContext } from './core'
import {
  resolveSpriteProjection,
  resolveSpriteReference,
  resolveSpriteSkinProjection,
} from '@quajs/plugin-sprite/contracts'
import { applyTrackValues, collectTrackValues } from '../animation'

export function createSpriteWebRendererPlugin(): RendererPlugin {
  return {
    name: '@quajs/renderer-web/sprite',
    setup() {},
  }
}

export const spriteWebRendererPlugin = createSpriteWebRendererPlugin()

export interface SpriteSkinStyleOptions {
  assetUrl?: string
  assetUrls?: Partial<Record<SpriteSkinStateName, string>>
  state?: SpriteSkinStateName
}

export function resolveSpriteSkin(
  manifest: SpriteSkinManifest | undefined,
  skin?: string,
  state: SpriteSkinStateName = 'default',
): ResolvedSpriteSkinProjection | undefined {
  return resolveSpriteSkinProjection(manifest, skin, state)
}

export function spriteSkinStyle(
  projection: ResolvedSpriteSkinProjection | undefined,
  options: SpriteSkinStyleOptions = {},
): Record<string, string | number | undefined> {
  if (!projection) {
    return {}
  }

  const slice = projection.definition.slice
  const padding = projection.definition.contentInsets || zeroInsets()
  const assetUrls = createSpriteSkinAssetUrls(projection, options)
  const currentState = options.state || projection.state
  const currentAssetUrl = resolveSpriteSkinAssetUrl(assetUrls, currentState)
    || resolveSpriteSkinAssetUrl(assetUrls, 'default')
  if (!currentAssetUrl) {
    return {}
  }

  return {
    position: 'relative',
    boxSizing: 'border-box',
    borderStyle: 'solid',
    borderWidth: insetsToCss(slice),
    borderImageSource: 'var(--qua-skin-source-current, var(--qua-skin-source-default))',
    borderImageSlice: `${slice.top} ${slice.right} ${slice.bottom} ${slice.left}${projection.definition.fill ? ' fill' : ''}`,
    borderImageWidth: insetsToCss(slice),
    borderImageRepeat: projection.definition.mode === 'tiled' ? 'repeat' : 'stretch',
    padding: insetsToCss(padding),
    backgroundClip: 'padding-box',
    '--qua-skin-source-current': `url(${JSON.stringify(currentAssetUrl)})`,
    '--qua-skin-source-default': assetUrls.default ? `url(${JSON.stringify(assetUrls.default)})` : undefined,
    '--qua-skin-source-hover': assetUrls.hover ? `url(${JSON.stringify(assetUrls.hover)})` : undefined,
    '--qua-skin-source-pressed': assetUrls.pressed ? `url(${JSON.stringify(assetUrls.pressed)})` : undefined,
    '--qua-skin-source-disabled': assetUrls.disabled ? `url(${JSON.stringify(assetUrls.disabled)})` : undefined,
    '--qua-skin-source-selected': assetUrls.selected ? `url(${JSON.stringify(assetUrls.selected)})` : undefined,
  }
}

export function applySpriteSkinStyle(
  element: HTMLElement,
  projection: ResolvedSpriteSkinProjection | undefined,
  options: SpriteSkinStyleOptions = {},
): void {
  if (!projection || (!options.assetUrl && !options.assetUrls)) {
    applyElementStyle(element, {
      position: undefined,
      boxSizing: undefined,
      borderStyle: undefined,
      borderWidth: undefined,
      borderImageSource: undefined,
      borderImageSlice: undefined,
      borderImageWidth: undefined,
      borderImageRepeat: undefined,
      padding: undefined,
      backgroundClip: undefined,
      '--qua-skin-source-current': undefined,
      '--qua-skin-source-default': undefined,
      '--qua-skin-source-hover': undefined,
      '--qua-skin-source-pressed': undefined,
      '--qua-skin-source-disabled': undefined,
      '--qua-skin-source-selected': undefined,
    })
    delete element.dataset.skinFamily
    delete element.dataset.skinId
    delete element.dataset.skinState
    delete element.dataset.skinFallbackUsed
    return
  }

  applyElementStyle(element, spriteSkinStyle(projection, options))
  element.dataset.skinFamily = projection.family
  element.dataset.skinId = projection.skin
  element.dataset.skinState = projection.state
  element.dataset.skinFallbackUsed = projection.fallbackUsed ? 'true' : 'false'
}

function createSpriteSkinAssetUrls(
  projection: ResolvedSpriteSkinProjection,
  options: SpriteSkinStyleOptions,
): Partial<Record<SpriteSkinStateName, string>> {
  const assetUrls: Partial<Record<SpriteSkinStateName, string>> = {}
  if (options.assetUrls) {
    for (const state of ['default', 'hover', 'pressed', 'disabled', 'selected'] as const) {
      const assetUrl = options.assetUrls[state]
      if (assetUrl) {
        assetUrls[state] = assetUrl
      }
    }
    return assetUrls
  }

  if (options.assetUrl) {
    assetUrls[projection.state] = options.assetUrl
    assetUrls.default = options.assetUrl
  }
  return assetUrls
}

function resolveSpriteSkinAssetUrl(
  assetUrls: Partial<Record<SpriteSkinStateName, string>>,
  state: SpriteSkinStateName,
): string | undefined {
  return assetUrls[state] || assetUrls.default
}

export interface SpriteWebRenderOptions {
  sprite: string
  expression?: string
  alt?: string
  animationTargetPrefix?: string
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
      root.append(renderSpriteLayerItem(context, layer, index === 0, options.alt || '', {
        animationTargetPrefix: options.animationTargetPrefix,
        layerIndex: index,
      }))
    })
    updateSpriteLayerAnimations(root, context.view.animations, Date.now())
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
      animationTargetPrefix: character.id,
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
  options: {
    animationTargetPrefix?: string
    layerIndex: number
  },
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
    bindSpriteLayerAnimationData(frame, layer, isBase, options)
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
  bindSpriteLayerAnimationData(image, layer, isBase, options)
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

export function updateSpriteLayerAnimations(root: ParentNode, animations: readonly Readonly<ActiveAnimationProjection>[], now: number): void {
  for (const element of root.querySelectorAll('[data-sprite-layer-animation]')) {
    if (!(element instanceof HTMLElement))
      continue
    const base = readSpriteLayerAnimationData(element)
    if (!base)
      continue
    const projected = projectSpriteLayerForAnimation(base.layer, base.animationTargetPrefix, base.layerKind, base.layerIndex, animations, now)
    applyElementStyle(element, spriteLayerStyle(projected, base.isBase))
  }
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

function bindSpriteLayerAnimationData(
  element: HTMLElement,
  layer: SpriteResolvedLayer,
  isBase: boolean,
  options: {
    animationTargetPrefix?: string
    layerIndex: number
  },
): void {
  if (!options.animationTargetPrefix)
    return
  element.setAttribute('data-sprite-layer-animation', 'true')
  element.setAttribute('data-sprite-layer-target-prefix', options.animationTargetPrefix)
  element.setAttribute('data-sprite-layer-index', String(options.layerIndex))
  element.setAttribute('data-sprite-layer-is-base', isBase ? 'true' : 'false')
  element.setAttribute('data-sprite-layer-base', JSON.stringify(createSpriteLayerAnimationBase(layer)))
}

function readSpriteLayerAnimationData(element: HTMLElement): {
  animationTargetPrefix: string
  layerKind: string
  layerIndex: number
  isBase: boolean
  layer: SpriteResolvedLayer
} | undefined {
  const animationTargetPrefix = element.dataset.spriteLayerTargetPrefix
  const base = element.dataset.spriteLayerBase
  if (!animationTargetPrefix || !base)
    return undefined
  try {
    const layer = JSON.parse(base) as SpriteResolvedLayer
    return {
      animationTargetPrefix,
      layerKind: element.dataset.spriteLayerKind || layer.kind,
      layerIndex: Number(element.dataset.spriteLayerIndex || 0),
      isBase: element.dataset.spriteLayerIsBase === 'true',
      layer,
    }
  }
  catch {
    return undefined
  }
}

function createSpriteLayerAnimationBase(layer: SpriteResolvedLayer): SpriteResolvedLayer {
  return {
    ...layer,
    frame: layer.frame ? { ...layer.frame } : undefined,
  }
}

function zeroInsets(): SpriteInsets {
  return { top: 0, right: 0, bottom: 0, left: 0 }
}

function projectSpriteLayerForAnimation(
  layer: SpriteResolvedLayer,
  animationTargetPrefix: string,
  layerKind: string,
  layerIndex: number,
  animations: readonly Readonly<ActiveAnimationProjection>[],
  now: number,
): SpriteResolvedLayer {
  const tracks = [
    ...collectTrackValues(animations, `spriteLayer:${animationTargetPrefix}:${layerKind}:${layerIndex}`, now),
    ...collectTrackValues(animations, `spriteLayer:${animationTargetPrefix}:${layerKind}`, now),
    ...collectTrackValues(animations, `spriteLayer:${animationTargetPrefix}:${layerIndex}`, now),
  ]
  if (tracks.length === 0)
    return layer
  const projected = createSpriteLayerAnimationBase(layer)
  applyTrackValues(projected as unknown as Record<string, unknown>, tracks)
  return projected
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

function insetsToCss(insets: SpriteInsets): string {
  return `${insets.top}px ${insets.right}px ${insets.bottom}px ${insets.left}px`
}
