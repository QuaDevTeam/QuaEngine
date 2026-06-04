import type { CocosHostNode, CocosHostSpriteMask, CocosHostSpriteOptions, CocosHostTransform } from '@quajs/cocos-host'
import type { SpriteManifest, SpriteResolvedLayer } from '@quajs/plugin-sprite/contracts'
import type {
  ActiveAnimationProjection,
  BackgroundMaskProjection,
  QuaViewProjection,
  RichTextBlockProjection,
  RichTextContent,
  RichTextSpanProjection,
  ViewBackgroundLayerProjection,
  ViewBackgroundProjection,
  ViewCharacterProjection,
  ViewDialogueProjection,
  ViewEffectProjection,
} from '@quajs/render-core'
import type { CocosDialogueTypewriterProjectResult } from './dialogue-typewriter'
import type { CocosRendererHostContext } from './types'
import { resolveSpriteProjection, resolveSpriteReference } from '@quajs/plugin-sprite/contracts'
import {
  applyTrackValues,
  collectTrackValues,
  isRichTextDocument,
  projectAudioProjection,
  projectBackground,
  projectCharacters,
  projectChoices,
  projectDialogue,
  projectEffect,
  projectUiOverlay,
  RenderToLogicEvents,
  resolveUiChoiceSkinReference,
  resolveUiOverlaySkinReference,
} from '@quajs/render-core'
import { applyCocosUiControlSkin } from './ui-skin'
import {
  choiceText,
  metadataTargetPackageId,
  normalizeBackgroundAssetType,
  positionTransform,
  richTextToPlainText,
} from './utils'

export interface RenderCocosDialogueOptions {
  typewriter?: CocosDialogueTypewriterProjectResult
}

export interface RenderCocosAudioOptions {
  busAutomationStarts?: Map<string, { signature?: string, startedAt: number }>
}

export async function renderCocosBackground(context: CocosRendererHostContext): Promise<void> {
  const layer = context.getLayerNode('background', 'background-layer', 10)
  context.host.nodes.clearChildren(layer)
  const background = projectBackground(context.getViewState().background, context.getViewState().animations, context.host.runtime.now())
  if (!background) {
    context.releaseLayerResources('background')
    return
  }
  if (background.mode === 'layered') {
    await renderLayeredBackground(context, layer, background.layers || [])
    return
  }
  if (background.mode === 'video' && background.video) {
    const node = context.host.nodes.createNode('video-background', { parent: layer })
    const resource = await context.resolveAsset('video', background.video.assetName, {
      targetPackageId: metadataTargetPackageId(background.video.metadata || background.metadata),
    })
    context.host.nodes.setNodeSprite(node, resource, await backgroundSpriteOptions(context, background, 'main', { mode: 'video' }))
    context.setLayerResource('background', 'video:main', resource)
    applyBackgroundTransform(context, node, background)
    return
  }
  if (!background.assetName) {
    context.releaseLayerResources('background')
    return
  }
  const node = context.host.nodes.createNode('background', { parent: layer })
  const resource = await context.resolveAsset('images', background.assetName, {
    targetPackageId: metadataTargetPackageId(background.metadata),
  })
  context.host.nodes.setNodeSprite(node, resource, await backgroundSpriteOptions(context, background, 'main'))
  context.setLayerResource('background', 'image:main', resource)
  applyBackgroundTransform(context, node, background)
}

export async function renderCocosCharacters(context: CocosRendererHostContext): Promise<void> {
  const layer = context.getLayerNode('characters', 'character-layer', 30)
  context.host.nodes.clearChildren(layer)
  context.releaseLayerResources('characters')
  const characters = projectCharacters(context.getViewState().characters, context.getViewState().animations, context.host.runtime.now())
  for (const character of characters) {
    await renderCharacter(context, layer, character)
  }
}

export function renderCocosDialogue(context: CocosRendererHostContext, options: RenderCocosDialogueOptions = {}): void {
  const layer = context.getLayerNode('dialogue', 'dialogue-layer', 50)
  context.host.nodes.clearChildren(layer)
  const dialogue = options.typewriter?.dialogue || projectDialogue(
    context.getViewState().dialogue,
    context.getViewState().animations,
    context.host.runtime.now(),
    context.getViewState().plugins.dialogue as Record<string, unknown> | undefined,
  )
  if (!dialogue.visible)
    return
  const box = context.host.nodes.createNode('dialogue-box', { parent: layer })
  setDialogueNodeText(context, box, dialogue)
  context.host.nodes.setNodeMetadata?.(box, {
    characterId: dialogue.characterId,
    mode: dialogue.mode,
    typewriter: options.typewriter
      ? {
          revealing: options.typewriter.revealing,
          visibleCharacters: options.typewriter.visibleCharacters,
        }
      : undefined,
  })
  context.host.nodes.setNodeTransform(box, motionTransform(dialogue as unknown as Record<string, unknown>))
}

export async function renderCocosChoices(context: CocosRendererHostContext): Promise<void> {
  const layer = context.getLayerNode('choices', 'choice-layer', 60)
  context.host.nodes.clearChildren(layer)
  context.releaseLayerResources('choices')
  const projection = projectChoices(
    context.getViewState().choices,
    context.getViewState().animations,
    context.host.runtime.now(),
    context.getViewState().plugins.choices as Record<string, unknown> | undefined,
  )
  context.host.nodes.setNodeTransform(layer, {
    zIndex: 60,
    ...motionTransform(projection.panel),
  })
  context.host.nodes.setNodeMetadata?.(layer, {
    panel: projection.panel,
  })
  await applyCocosUiControlSkin(context, layer, {
    layerId: 'choices',
    resourceKey: 'panel',
    kind: 'panel',
  })
  const safeArea = context.getStageLayout().safeArea
  let index = 0
  for (const choice of projection.choices) {
    const node = context.host.nodes.createNode('choice', { parent: layer, name: `choice:${choice.id}` })
    const choiceMotion = motionTransform(choice as unknown as Record<string, unknown>)
    context.host.nodes.setNodeText(node, choiceText(choice), { fontSize: 28 })
    context.host.nodes.setNodeControl?.(node, {
      kind: 'button',
      value: choice.id,
      disabled: choice.enabled === false,
      label: choiceText(choice),
    })
    context.host.nodes.setNodeTransform(node, {
      x: safeArea.x + (choiceMotion.x ?? 0),
      y: safeArea.y + index * 72 + (choiceMotion.y ?? 0),
      width: choiceMotion.width ?? safeArea.width,
      height: choiceMotion.height ?? 64,
      opacity: choiceMotion.opacity ?? (choice.enabled ? 1 : 0.45),
      zIndex: choiceMotion.zIndex ?? index,
      scaleX: choiceMotion.scaleX,
      scaleY: choiceMotion.scaleY,
      rotation: choiceMotion.rotation,
    })
    context.host.nodes.setNodeMetadata?.(node, {
      choiceId: choice.id,
      enabled: choice.enabled,
      target: choice.target,
    })
    await applyCocosUiControlSkin(context, node, {
      layerId: 'choices',
      resourceKey: `choice:${choice.id}`,
      kind: 'button',
      skinId: resolveUiChoiceSkinReference(context.getViewState(), choice),
      disabled: choice.enabled === false,
    })
    index += 1
  }
}

export function renderCocosEffects(context: CocosRendererHostContext): void {
  const layer = context.getLayerNode('effects', 'effect-layer', 40)
  context.host.nodes.clearChildren(layer)
  for (const effect of context.getViewState().effects) {
    renderEffect(context, layer, projectEffect(effect, context.getViewState().animations, context.host.runtime.now()))
  }
}

export async function renderCocosAudio(context: CocosRendererHostContext, options: RenderCocosAudioOptions = {}): Promise<void> {
  const now = context.host.runtime.now()
  const projection = projectAudioProjection<Record<string, unknown>>(context.getViewState(), now)
  const tracks = collectAudioTracks(projection)
  syncAudioBuses(context, projection, options.busAutomationStarts, now)
  const activeKeys: string[] = []
  for (const track of tracks) {
    const assetName = stringValue(track.assetName || track.assetKey)
    if (!assetName)
      continue
    const kind = stringValue(track.kind, 'audio')
    const id = stringValue(track.id, assetName)
    const key = `${kind}:${id}`
    const resource = await context.resolveAsset('audio', assetName, {
      targetPackageId: audioTrackPackageId(track),
    })
    if (!resource)
      continue
    activeKeys.push(key)
    context.setLayerResource('audio', key, resource)
    const state = stringValue(track.state, 'playing')
    await context.syncAudioHandle('audio', key, resource, {
      loop: booleanValue(track.loop, kind === 'bgm' || kind === 'ambient'),
      volume: audioVolume(track),
      playbackRate: numberValue(track.playbackRate, 1),
      bus: stringValue(track.bus, kind),
      playing: state !== 'paused' && state !== 'stopped',
      playAt: numberValue(track.playAt, undefined),
      state,
      fadeInMs: numberValue(track.fadeInMs, undefined),
      fadeOutMs: numberValue(track.fadeOutMs, undefined),
      seekMs: numberValue(track.seekMs, undefined),
      offsetMs: numberValue(track.offsetMs, undefined),
      automation: arrayRecords(track.automation),
      interruptible: booleanValue(track.interruptible, kind === 'voice' || kind === 'sfx'),
      endedPayload: audioTrackEndedPayload(track, kind, id, assetName),
    })
  }
  context.releaseAudioHandles('audio', activeKeys)
}

export async function renderCocosUi(context: CocosRendererHostContext): Promise<void> {
  const layer = context.getLayerNode('ui', 'ui-layer', 90)
  context.host.nodes.clearChildren(layer)
  context.releaseLayerResources('ui')
  const overlays = context.getViewState().ui.overlays || {}
  for (const [elementId, overlay] of Object.entries(overlays)) {
    const projected = projectUiOverlay(
      overlay as unknown as Record<string, unknown>,
      elementId,
      context.getViewState().animations,
      context.host.runtime.now(),
    )
    const node = context.host.nodes.createNode('ui-overlay', { parent: layer, name: elementId })
    context.host.nodes.setNodeVisible(node, projected.visible !== false)
    context.host.nodes.setNodeTransform(node, overlayTransform(context, projected))
    context.host.nodes.setNodeControl?.(node, {
      kind: 'panel',
      label: stringValue(projected.title, titleFromField(elementId)),
    })
    context.host.nodes.setNodeMetadata?.(node, { elementId, overlay: projected, uiAction: 'panel' })
    await applyCocosUiControlSkin(context, node, {
      layerId: 'ui',
      resourceKey: `overlay:${elementId}`,
      kind: 'panel',
      skinId: resolveUiOverlaySkinReference(context.getViewState(), overlay),
    })
    await renderUiOverlayContent(context, node, elementId, projected, overlay)
  }
}

export async function captureCocosSavePreview(context: CocosRendererHostContext, view: Readonly<QuaViewProjection>, payload: {
  requestId: string
  saveOpId: string
  slotId: string
  policy: {
    format?: string
    quality?: number
    maxWidth?: number
    maxHeight?: number
  }
}): Promise<void> {
  const capture = await context.captureStage({
    mimeType: payload.policy.format,
    quality: payload.policy.quality,
    maxWidth: payload.policy.maxWidth,
    maxHeight: payload.policy.maxHeight,
  })
  await context.getActions().requestPluginEvent('save-preview:cocos-captured', {
    requestId: payload.requestId,
    slotId: payload.slotId,
    viewRevision: view.flowControl.revision,
  })
  await context.emitRenderToLogic(RenderToLogicEvents.SAVE_PREVIEW_CAPTURE_RESULT, {
    requestId: payload.requestId,
    saveOpId: payload.saveOpId,
    slotId: payload.slotId,
    timestamp: context.host.runtime.now(),
    mimeType: capture.mimeType,
    image: {
      kind: 'bytes',
      bytes: capture.bytes,
    },
    width: capture.width,
    height: capture.height,
    capturedAt: capture.capturedAt,
  })
}

function setDialogueNodeText(
  context: CocosRendererHostContext,
  node: CocosHostNode,
  dialogue: ViewDialogueProjection,
): void {
  const style = {
    fontSize: numberValue((dialogue as unknown as Record<string, unknown>).fontSize, 32),
    color: stringValue((dialogue as unknown as Record<string, unknown>).color, '#ffffff'),
  }
  if (isRichTextDocument(dialogue.text)) {
    context.host.nodes.setNodeRichText(node, dialogueMarkup(dialogue), style)
    return
  }
  const text = [dialogue.characterName, richTextToPlainText(dialogue.text)].filter(Boolean).join('\n')
  context.host.nodes.setNodeText(node, text, style)
}

function dialogueMarkup(dialogue: ViewDialogueProjection): string {
  const parts: string[] = []
  if (dialogue.characterName) {
    parts.push(`<b>${escapeRichTextMarkup(dialogue.characterName)}</b>`)
  }
  parts.push(richTextContentToCocosMarkup(dialogue.text))
  return parts.filter(Boolean).join('\n')
}

function richTextContentToCocosMarkup(content: RichTextContent): string {
  if (!isRichTextDocument(content))
    return escapeRichTextMarkup(content)
  return content.blocks.map(block => richTextBlockToCocosMarkup(block)).join('\n')
}

function richTextBlockToCocosMarkup(block: Readonly<RichTextBlockProjection>): string {
  return wrapRichTextStyle(
    block.spans.map(span => richTextSpanToCocosMarkup(span)).join(''),
    block,
  )
}

function richTextSpanToCocosMarkup(span: Readonly<RichTextSpanProjection>): string {
  const text = span.ruby
    ? `${span.text}(${span.ruby})`
    : span.text
  return wrapRichTextStyle(escapeRichTextMarkup(text), span)
}

function wrapRichTextStyle(markup: string, style: Readonly<Record<string, unknown>>): string {
  let next = markup
  const color = stringValue(style.color)
  const fontSize = numericDimension(style.fontSize as number | string | undefined)
  if (style.fontWeight === 'bold' || Number(style.fontWeight) >= 600)
    next = `<b>${next}</b>`
  if (style.fontStyle === 'italic' || style.fontStyle === 'oblique')
    next = `<i>${next}</i>`
  if (fontSize !== undefined)
    next = `<size=${Math.round(fontSize)}>${next}</size>`
  if (color)
    next = `<color=${color}>${next}</color>`
  return next
}

function escapeRichTextMarkup(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

async function renderLayeredBackground(
  context: CocosRendererHostContext,
  layer: CocosHostNode,
  layers: readonly Readonly<ViewBackgroundLayerProjection>[],
): Promise<void> {
  context.releaseLayerResources('background')
  for (const item of layers) {
    if (item.visible === false)
      continue
    const node = context.host.nodes.createNode('background-layer-item', { parent: layer, name: item.id })
    const assetType = normalizeBackgroundAssetType(item.assetType)
    const resource = await context.resolveAsset(assetType, item.assetName, {
      targetPackageId: metadataTargetPackageId(item.metadata),
    })
    context.host.nodes.setNodeSprite(node, resource, await backgroundSpriteOptions(context, item, `layer:${item.id}`))
    context.setLayerResource('background', `layer:${item.id}`, resource)
    context.host.nodes.setNodeTransform(node, {
      x: item.x,
      y: item.y,
      width: numericDimension(item.width),
      height: numericDimension(item.height),
      scaleX: item.scale,
      scaleY: item.scale,
      rotation: item.rotation,
      opacity: item.opacity,
      zIndex: item.zIndex,
    })
  }
}

async function renderCharacter(
  context: CocosRendererHostContext,
  layer: CocosHostNode,
  character: ViewCharacterProjection,
): Promise<void> {
  const node = context.host.nodes.createNode('character', { parent: layer, name: character.id })
  context.host.nodes.setNodeVisible(node, character.visible !== false)
  context.host.nodes.setNodeTransform(node, {
    ...positionTransform(character.position),
    opacity: character.opacity,
    zIndex: character.layer,
  })
  context.host.nodes.setNodeMetadata?.(node, {
    characterId: character.id,
    expression: character.expression,
  })
  if (!character.sprite)
    return
  await renderCharacterSprite(context, node, character)
}

async function renderCharacterSprite(
  context: CocosRendererHostContext,
  root: CocosHostNode,
  character: ViewCharacterProjection,
): Promise<void> {
  const targetPackageId = metadataTargetPackageId(character.metadata)
  const manifest = await loadSpriteManifest(context, character.sprite, targetPackageId)
  if (!manifest) {
    await renderFallbackCharacterSprite(context, root, character, targetPackageId)
    return
  }
  const projection = resolveSpriteProjection(manifest, character.sprite, character.expression)
  if (!projection) {
    await renderFallbackCharacterSprite(context, root, character, targetPackageId)
    return
  }

  context.host.nodes.setNodeMetadata?.(root, {
    characterId: character.id,
    expression: character.expression,
    spriteFamily: projection.family,
    sprite: projection.sprite,
    spriteExpression: projection.expression,
    spriteFallbackUsed: projection.fallbackUsed,
  })

  for (const [index, layer] of projection.layers.entries()) {
    await renderSpriteLayer(context, root, {
      character,
      layer,
      index,
      targetPackageId,
    })
  }
}

async function renderFallbackCharacterSprite(
  context: CocosRendererHostContext,
  root: CocosHostNode,
  character: ViewCharacterProjection,
  targetPackageId?: string,
): Promise<void> {
  const resource = await context.resolveAsset('characters', character.sprite, { targetPackageId })
  context.host.nodes.setNodeSprite(root, resource)
  context.setLayerResource('characters', `character:${character.id}`, resource)
}

async function renderSpriteLayer(
  context: CocosRendererHostContext,
  root: CocosHostNode,
  options: {
    character: ViewCharacterProjection
    layer: SpriteResolvedLayer
    index: number
    targetPackageId?: string
  },
): Promise<void> {
  const { character, layer, index, targetPackageId } = options
  const projectedLayer = projectSpriteLayerForAnimation(
    layer,
    character.id,
    layer.kind,
    index,
    context.getViewState().animations,
    context.host.runtime.now(),
  )
  if (projectedLayer.visible === false)
    return

  const node = context.host.nodes.createNode('character-sprite-layer', {
    parent: root,
    name: `${character.id}:sprite:${projectedLayer.kind}:${index}`,
  })
  const resource = await resolveSpriteLayerResource(context, projectedLayer, targetPackageId)
  const maskResource = projectedLayer.mask
    ? await context.resolveAsset('characters', projectedLayer.mask, { targetPackageId })
    : undefined
  context.host.nodes.setNodeSprite(node, resource, {
    mode: 'sprite',
    opacity: projectedLayer.opacity,
    frame: projectedLayer.frame ? { ...projectedLayer.frame } : undefined,
    mask: projectedLayer.mask
      ? {
          assetName: projectedLayer.mask,
          assetType: 'characters',
          resource: maskResource,
          resourceId: maskResource?.id,
        }
      : undefined,
    blendMode: projectedLayer.blendMode,
    metadata: {
      spriteLayerKind: projectedLayer.kind,
      frame: projectedLayer.frame ? { ...projectedLayer.frame } : undefined,
      mask: projectedLayer.mask,
      maskResourceId: maskResource?.id,
      blendMode: projectedLayer.blendMode,
    },
  })
  context.setLayerResource('characters', `character:${character.id}:sprite:${index}`, resource)
  if (maskResource) {
    context.setLayerResource('characters', `character:${character.id}:sprite:${index}:mask`, maskResource)
  }
  context.host.nodes.setNodeTransform(node, {
    x: projectedLayer.offsetX,
    y: projectedLayer.offsetY,
    width: projectedLayer.frame?.width,
    height: projectedLayer.frame?.height,
    scaleX: projectedLayer.scale,
    scaleY: projectedLayer.scale,
    rotation: projectedLayer.rotation,
    opacity: projectedLayer.opacity,
    zIndex: projectedLayer.zIndex ?? index,
    anchorX: projectedLayer.anchor === 'left' ? 0 : projectedLayer.anchor === 'right' ? 1 : 0.5,
    anchorY: 0,
  })
  context.host.nodes.setNodeMetadata?.(node, {
    characterId: character.id,
    spriteLayerKind: projectedLayer.kind,
    spriteLayerIndex: index,
    asset: projectedLayer.asset,
    frame: projectedLayer.frame ? { ...projectedLayer.frame } : undefined,
    mask: projectedLayer.mask,
    blendMode: projectedLayer.blendMode,
  })
}

async function resolveSpriteLayerResource(
  context: CocosRendererHostContext,
  layer: SpriteResolvedLayer,
  targetPackageId?: string,
) {
  try {
    const resource = await context.resolveAsset('characters', layer.asset, { targetPackageId })
    if (resource || !layer.fallback)
      return resource
  }
  catch (error) {
    if (!layer.fallback)
      throw error
  }
  return await context.resolveAsset('characters', layer.fallback, { targetPackageId })
}

async function loadSpriteManifest(
  context: CocosRendererHostContext,
  sprite: string | undefined,
  targetPackageId?: string,
): Promise<SpriteManifest | undefined> {
  const reference = resolveSpriteReference(sprite)
  if (!reference || !context.assets)
    return undefined
  try {
    return await context.assets.getJSON<SpriteManifest>('characters', reference.manifestPath, { targetPackageId })
  }
  catch {
    return undefined
  }
}

function renderEffect(context: CocosRendererHostContext, layer: CocosHostNode, effect: ViewEffectProjection): void {
  const node = context.host.nodes.createNode('effect', { parent: layer, name: effect.id })
  context.host.nodes.setNodeTransform(node, {
    opacity: numberValue(effect.options?.opacity, undefined),
    scaleX: numberValue(effect.options?.scale, undefined),
    scaleY: numberValue(effect.options?.scale, undefined),
    ...motionTransform(effect as unknown as Record<string, unknown>),
  })
  context.host.nodes.setNodeMetadata?.(node, {
    effectId: effect.id,
    type: effect.type,
    target: effect.target,
    duration: effect.duration,
    intensity: effect.intensity,
    options: effect.options,
  })
}

function applyBackgroundTransform(
  context: CocosRendererHostContext,
  node: CocosHostNode,
  background: ViewBackgroundProjection,
): void {
  context.host.nodes.setNodeTransform(node, {
    x: background.x,
    y: background.y,
    width: numericDimension(background.width),
    height: numericDimension(background.height),
    scaleX: background.scale,
    scaleY: background.scale,
    rotation: background.rotation,
    opacity: background.opacity,
  })
}

async function backgroundSpriteOptions(
  context: CocosRendererHostContext,
  projection: Pick<ViewBackgroundProjection | ViewBackgroundLayerProjection, 'composition' | 'metadata'>,
  resourceKey: string,
  base: CocosHostSpriteOptions = {},
): Promise<CocosHostSpriteOptions> {
  const composition = projection.composition
  if (!composition) {
    context.setLayerResource('background', `${resourceKey}:mask`, undefined)
    return base
  }
  const mask = await resolveBackgroundSpriteMask(context, composition.mask, `${resourceKey}:mask`, metadataTargetPackageId(projection.metadata))
  return {
    ...base,
    blendMode: composition.blendMode,
    filter: composition.filter ? { ...composition.filter } : undefined,
    mask,
    composition: {
      blendMode: composition.blendMode,
      isolation: composition.isolation,
      filter: composition.filter ? { ...composition.filter } : undefined,
      mask,
    },
  }
}

async function resolveBackgroundSpriteMask(
  context: CocosRendererHostContext,
  mask: Readonly<BackgroundMaskProjection> | undefined,
  resourceKey: string,
  targetPackageId?: string,
): Promise<CocosHostSpriteMask | undefined> {
  if (!mask) {
    context.setLayerResource('background', resourceKey, undefined)
    return undefined
  }
  if (!mask.assetName) {
    context.setLayerResource('background', resourceKey, undefined)
    return { ...mask }
  }
  const assetType = normalizeBackgroundAssetType(mask.assetType)
  const resource = await context.resolveAsset(assetType, mask.assetName, { targetPackageId })
  context.setLayerResource('background', resourceKey, resource)
  return {
    ...mask,
    assetType,
    resource,
    resourceId: resource?.id,
  }
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
  const projected: SpriteResolvedLayer = {
    ...layer,
    frame: layer.frame ? { ...layer.frame } : undefined,
  }
  applyTrackValues(projected as unknown as Record<string, unknown>, tracks)
  return projected
}

async function renderUiOverlayContent(
  context: CocosRendererHostContext,
  parent: CocosHostNode,
  elementId: string,
  projected: Record<string, unknown>,
  overlay: Readonly<Record<string, unknown>>,
): Promise<void> {
  const transform = overlayTransform(context, projected)
  const x = transform.x ?? 0
  const y = transform.y ?? 0
  const width = transform.width ?? context.getStageLayout().safeArea.width
  const height = transform.height ?? 480
  const padding = 32

  const title = stringValue(projected.title, titleFromField(elementId))
  const titleNode = context.host.nodes.createNode('ui-title', { parent, name: `${elementId}:title` })
  context.host.nodes.setNodeText(titleNode, title, { fontSize: 32, color: '#ffffff' })
  context.host.nodes.setNodeTransform(titleNode, {
    x: x + padding,
    y: y + 24,
    width: Math.max(0, width - padding * 2 - 160),
    height: 48,
    zIndex: 1,
  })

  const subtitle = stringValue(projected.subtitle)
  if (subtitle) {
    const subtitleNode = context.host.nodes.createNode('ui-subtitle', { parent, name: `${elementId}:subtitle` })
    context.host.nodes.setNodeText(subtitleNode, subtitle, { fontSize: 22, color: '#d8d8d8' })
    context.host.nodes.setNodeTransform(subtitleNode, {
      x: x + padding,
      y: y + 74,
      width: Math.max(0, width - padding * 2),
      height: 36,
      zIndex: 1,
    })
  }

  const description = stringValue(projected.description)
  if (description) {
    const descriptionNode = context.host.nodes.createNode('ui-description', { parent, name: `${elementId}:description` })
    context.host.nodes.setNodeText(descriptionNode, description, { fontSize: 24, color: '#ffffff' })
    context.host.nodes.setNodeTransform(descriptionNode, {
      x: x + padding,
      y: y + (subtitle ? 118 : 84),
      width: Math.max(0, width - padding * 2),
      height: 96,
      zIndex: 1,
    })
  }

  await renderUiButton(context, parent, {
    elementId,
    index: -1,
    label: 'Close',
    x: x + Math.max(0, width - 144),
    y: y + 24,
    width: 112,
    height: 48,
    skinId: resolveUiOverlaySkinReference(context.getViewState(), overlay, 'button'),
    metadata: {
      uiAction: 'close',
      elementId,
    },
  })

  const actions = readUiActions(projected)
  let index = 0
  for (const action of actions) {
    const metadata = uiActionMetadata(elementId, action)
    if (!metadata)
      continue
    await renderUiButton(context, parent, {
      elementId,
      index,
      label: uiActionLabel(action, index),
      x: x + padding,
      y: y + height - padding - (actions.length - index) * 58,
      width: Math.min(360, Math.max(160, width - padding * 2)),
      height: 48,
      skinId: stringValue(recordValue(action, 'skinId')) || resolveUiOverlaySkinReference(context.getViewState(), overlay, 'button'),
      metadata,
    })
    index += 1
  }
}

async function renderUiButton(
  context: CocosRendererHostContext,
  parent: CocosHostNode,
  options: {
    elementId: string
    index: number
    label: string
    x: number
    y: number
    width: number
    height: number
    skinId?: string
    metadata: Record<string, unknown>
  },
): Promise<void> {
  const node = context.host.nodes.createNode('ui-button', {
    parent,
    name: options.index < 0 ? `${options.elementId}:close` : `${options.elementId}:action:${options.index}`,
  })
  context.host.nodes.setNodeText(node, options.label, { fontSize: 24, color: '#ffffff' })
  context.host.nodes.setNodeControl?.(node, {
    kind: 'button',
    label: options.label,
    value: options.index < 0 ? 'close' : String(options.index),
  })
  context.host.nodes.setNodeTransform(node, {
    x: options.x,
    y: options.y,
    width: options.width,
    height: options.height,
    zIndex: 2 + Math.max(0, options.index),
  })
  context.host.nodes.setNodeMetadata?.(node, options.metadata)
  await applyCocosUiControlSkin(context, node, {
    layerId: 'ui',
    resourceKey: `overlay:${options.elementId}:button:${options.index}`,
    kind: 'button',
    skinId: options.skinId,
  })
}

function overlayTransform(context: CocosRendererHostContext, projected: Record<string, unknown>): CocosHostTransform {
  const safeArea = context.getStageLayout().safeArea
  const width = numericDimension(projected.width as number | string | undefined) ?? Math.min(960, safeArea.width)
  const height = numericDimension(projected.height as number | string | undefined) ?? 480
  return {
    x: numberValue(projected.x, safeArea.x + Math.max(0, (safeArea.width - width) / 2)),
    y: numberValue(projected.y, safeArea.y + 80),
    width,
    height,
    scaleX: numberValue(projected.scaleX, numberValue(projected.scale, undefined)),
    scaleY: numberValue(projected.scaleY, numberValue(projected.scale, undefined)),
    rotation: numberValue(projected.rotation, undefined),
    opacity: numberValue(projected.opacity, 1),
    zIndex: numberValue(projected.zIndex, 0),
  }
}

function readUiActions(projected: Record<string, unknown>): readonly unknown[] {
  if (Array.isArray(projected.actions))
    return projected.actions
  if (Array.isArray(projected.buttons))
    return projected.buttons
  return []
}

function uiActionLabel(action: unknown, index: number): string {
  if (typeof action === 'string')
    return action
  const label = stringValue(recordValue(action, 'label'))
    || stringValue(recordValue(action, 'text'))
    || stringValue(recordValue(action, 'title'))
  return label || `Action ${index + 1}`
}

function uiActionMetadata(elementId: string, action: unknown): Record<string, unknown> | undefined {
  if (typeof action === 'string') {
    return {
      uiAction: 'pluginEvent',
      eventType: action,
      eventPayload: { source: elementId },
      elementId,
    }
  }
  if (!isRecord(action))
    return undefined

  const actionName = stringValue(action.action)
    || stringValue(action.type)
    || stringValue(action.kind)
  const normalized = actionName.replace(/[_-]/g, '').toLowerCase()
  const targetElementId = stringValue(action.targetElementId)
    || stringValue(action.elementId)
    || stringValue(action.target)
    || elementId

  if (normalized === 'close' || normalized === 'uiclose') {
    return {
      uiAction: 'close',
      elementId: targetElementId,
    }
  }
  if (normalized === 'open' || normalized === 'uiopen') {
    return {
      uiAction: 'open',
      elementId: targetElementId,
      config: isRecord(action.config) ? action.config : undefined,
      closeCurrent: action.closeCurrent,
      currentElementId: elementId,
    }
  }
  if (normalized === 'update' || normalized === 'uiupdate') {
    return {
      uiAction: 'update',
      elementId: targetElementId,
      config: isRecord(action.config) ? action.config : {},
    }
  }
  if (normalized === 'save') {
    return {
      uiAction: 'save',
      slotId: stringValue(action.slotId) || undefined,
    }
  }
  if (normalized === 'load') {
    return {
      uiAction: 'load',
      slotId: stringValue(action.slotId) || undefined,
    }
  }
  if (normalized === 'flow' || normalized === 'flowcontrol') {
    return {
      uiAction: 'flow',
      flowAction: stringValue(action.flowAction) || stringValue(action.mode),
      source: stringValue(action.source, elementId),
    }
  }

  const eventType = stringValue(action.eventType)
    || stringValue(action.event)
    || (normalized === 'pluginevent' || normalized === 'event' ? stringValue(action.name) : '')
  if (eventType) {
    return {
      uiAction: 'pluginEvent',
      eventType,
      eventPayload: action.payload ?? { source: elementId },
      elementId,
    }
  }
  return undefined
}

function numericDimension(value: number | string | undefined): number | undefined {
  return typeof value === 'number' ? value : undefined
}

function recordValue(value: unknown, key: string): unknown {
  return isRecord(value) ? value[key] : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function arrayRecords(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => isRecord(item))
    : []
}

function stringValue(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function titleFromField(field: string): string {
  return field
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, char => char.toUpperCase())
}

function numberValue(value: unknown, fallback: number | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function motionTransform(motion: Readonly<Record<string, unknown>>) {
  const scale = numberValue(motion.scale, undefined)
  const transform: CocosHostTransform = {}
  assignNumber(transform, 'x', numberValue(motion.x, undefined))
  assignNumber(transform, 'y', numberValue(motion.y, undefined))
  assignNumber(transform, 'width', numericDimension(motion.width as number | string | undefined))
  assignNumber(transform, 'height', numericDimension(motion.height as number | string | undefined))
  assignNumber(transform, 'scaleX', numberValue(motion.scaleX, scale))
  assignNumber(transform, 'scaleY', numberValue(motion.scaleY, scale))
  assignNumber(transform, 'rotation', numberValue(motion.rotation, undefined))
  assignNumber(transform, 'opacity', numberValue(motion.opacity, undefined))
  assignNumber(transform, 'zIndex', numberValue(motion.zIndex, undefined))
  return transform
}

function assignNumber(
  transform: CocosHostTransform,
  key: keyof CocosHostTransform,
  value: number | undefined,
): void {
  if (value !== undefined) {
    transform[key] = value
  }
}

function syncAudioBuses(
  context: CocosRendererHostContext,
  audio: Record<string, unknown> | undefined,
  automationStarts: Map<string, { signature?: string, startedAt: number }> | undefined,
  now: number,
): void {
  const buses = audio?.buses
  if (!buses || typeof buses !== 'object' || Array.isArray(buses))
    return
  for (const [bus, value] of Object.entries(buses as Record<string, unknown>)) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      continue
    const projection = value as Record<string, unknown>
    const volume = audioBusVolume(projection, bus, automationStarts, now)
    context.host.audio.setBusVolume?.(bus, volume)
    if (Array.isArray(projection.eq)) {
      if (context.host.capabilities?.audioEq) {
        context.host.audio.setBusEq?.(bus, projection.eq)
      }
    }
  }
}

function audioBusVolume(
  projection: Record<string, unknown>,
  bus: string,
  automationStarts: Map<string, { signature?: string, startedAt: number }> | undefined,
  now: number,
): number {
  const automation = arrayRecords(projection.automation)
  const signature = automation.length > 0 ? JSON.stringify(automation) : undefined
  const key = `audioBus:${bus}`
  const current = automationStarts?.get(key)
  if (automationStarts && current?.signature !== signature) {
    automationStarts.set(key, { signature, startedAt: now })
  }
  const startedAt = automationStarts?.get(key)?.startedAt ?? now
  const automatedGainDb = projectGainAutomation(automation, now, startedAt)
  return automatedGainDb === undefined ? audioVolume(projection) : 10 ** (automatedGainDb / 20)
}

function collectAudioTracks(audio: Record<string, unknown> | undefined): Array<Record<string, unknown>> {
  if (!audio)
    return []
  const tracks: Array<Record<string, unknown>> = []
  if (audio.bgm && typeof audio.bgm === 'object' && !Array.isArray(audio.bgm)) {
    tracks.push({ kind: 'bgm', ...audio.bgm as Record<string, unknown> })
  }
  for (const [kind, value] of [
    ['voice', audio.voices],
    ['sfx', audio.sfx],
    ['ambient', audio.ambients],
  ] as const) {
    if (!Array.isArray(value))
      continue
    for (const item of value) {
      if (item && typeof item === 'object' && !Array.isArray(item)) {
        tracks.push({ kind, ...item as Record<string, unknown> })
      }
    }
  }
  return tracks
}

function audioTrackPackageId(track: Record<string, unknown>): string | undefined {
  const contentPackageId = stringValue(track.contentPackageId)
  if (contentPackageId)
    return contentPackageId
  return metadataTargetPackageId(track.metadata as Record<string, unknown> | undefined)
}

function audioVolume(track: Record<string, unknown>): number {
  const direct = numberValue(track.volume, undefined)
  if (direct !== undefined)
    return direct
  const gain = numberValue(track.gain, undefined)
  if (gain !== undefined)
    return gain
  const gainDb = numberValue(track.gainDb, undefined)
  if (gainDb !== undefined)
    return 10 ** (gainDb / 20)
  return 1
}

function projectGainAutomation(
  automation: readonly Record<string, unknown>[],
  now: number,
  startedAt: number,
): number | undefined {
  const item = automation.find(entry => entry.propertyPath === 'gainDb')
  if (!item || !isRecord(item.curve))
    return undefined
  const pointsValue = item.curve.points
  if (!Array.isArray(pointsValue))
    return undefined
  const points = pointsValue
    .map(point => readAutomationPoint(point))
    .filter((point): point is { at: number, value: number } => Boolean(point))
    .sort((left, right) => left.at - right.at)
  if (points.length === 0)
    return undefined
  const duration = numberValue(item.curve.duration, undefined) ?? points[points.length - 1]!.at
  const loop = item.curve.loop === true
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
      return previous.value + (next.value - previous.value) * Math.min(1, Math.max(0, progress))
    }
  }
  return points[points.length - 1]!.value
}

function readAutomationPoint(value: unknown): { at: number, value: number } | undefined {
  if (!isRecord(value))
    return undefined
  const at = numberValue(value.at, undefined)
  const pointValue = numberValue(value.value, undefined)
  return at === undefined || pointValue === undefined ? undefined : { at, value: pointValue }
}

function audioTrackEndedPayload(
  track: Record<string, unknown>,
  kind: string,
  id: string,
  assetKey: string,
) {
  const payload: {
    channel: 'bgm' | 'voice' | 'sfx' | 'ambient'
    id: string
    assetKey: string
    chapterId?: string
    lineId?: string
    metadata?: Readonly<Record<string, unknown>>
  } = {
    channel: isAudioChannel(kind) ? kind : 'sfx',
    id,
    assetKey,
  }
  const chapterId = stringValue(track.chapterId)
  const lineId = stringValue(track.lineId)
  if (chapterId)
    payload.chapterId = chapterId
  if (lineId)
    payload.lineId = lineId
  if (isRecord(track.metadata))
    payload.metadata = track.metadata
  return payload
}

function isAudioChannel(kind: string): kind is 'bgm' | 'voice' | 'sfx' | 'ambient' {
  return kind === 'bgm' || kind === 'voice' || kind === 'sfx' || kind === 'ambient'
}
