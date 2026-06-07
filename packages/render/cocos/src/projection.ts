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
  ViewUiOverlayProjection,
  ViewUiOverlaySurfaceProjection,
} from '@quajs/render-core'
import type { CocosDialogueTypewriterProjectResult } from './dialogue-typewriter'
import type { CocosRendererHostContext } from './types'
import { resolveSpriteProjection, resolveSpriteReference } from '@quajs/plugin-sprite/contracts'
import {
  applyTrackValues,
  collectTrackValues,
  getUiOverlaySurfaceProjection,
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
  resolveActiveUiSceneProjection,
  uiOverlayIsInteractive,
  uiOverlayIsRenderOnly,
  viewAllowsDialogueChrome,
} from '@quajs/render-core'
import { applyCocosUiControlSkin } from './ui-skin'
import {
  compareCocosUiOverlayEntries,
  defaultCocosUiOverlayPlacement,
  resolveCocosUiOverlayPlacement,
  resolveCocosUiOverlayZIndex,
} from './overlay-placement'
import {
  choiceText,
  normalizeBackgroundAssetType,
  positionTransform,
  richTextToPlainText,
  getJSONWithTargetPackages,
  resolveAssetWithTargetPackages,
  runtimePackageCandidatesFromMetadata,
} from './utils'

export interface RenderCocosDialogueOptions {
  typewriter?: CocosDialogueTypewriterProjectResult
}

const activeDialogueRenderKeys = new WeakMap<CocosRendererHostContext, string>()
let dialogueRenderSerial = 0

export interface RenderCocosAudioOptions {
  busAutomationStarts?: Map<string, { signature?: string, startedAt: number }>
}

export interface RenderCocosCharactersOptions {
  characters?: readonly ViewCharacterProjection[]
  presencePhases?: ReadonlyMap<string, string>
}

export interface RenderCocosUiOptions {
  handledElementIds?: readonly string[]
  renderOnlySurfaces?: Readonly<Record<string, CocosRenderOnlyOverlaySurfaceFactory>>
}

export interface CocosRenderOnlyOverlaySurfaceContext {
  elementId: string
  overlay: Readonly<ViewUiOverlayProjection>
  surface: Readonly<ViewUiOverlaySurfaceProjection>
  projected: Readonly<Record<string, unknown>>
  context: CocosRendererHostContext
  parentNode: CocosHostNode
}

export type CocosRenderOnlyOverlaySurfaceFactory = (
  context: CocosRenderOnlyOverlaySurfaceContext,
) => void | Promise<void>

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
    const resource = await resolveAssetWithTargetPackages(
      context,
      'video',
      background.video.assetName,
      runtimePackageCandidatesFromMetadata(background.video.metadata || background.metadata),
    )
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
  const resource = await resolveAssetWithTargetPackages(
    context,
    'images',
    background.assetName,
    runtimePackageCandidatesFromMetadata(background.metadata),
  )
  context.host.nodes.setNodeSprite(node, resource, await backgroundSpriteOptions(context, background, 'main'))
  context.setLayerResource('background', 'image:main', resource)
  applyBackgroundTransform(context, node, background)
}

export async function renderCocosCharacters(context: CocosRendererHostContext, options: RenderCocosCharactersOptions = {}): Promise<void> {
  const layer = context.getLayerNode('characters', 'character-layer', 30)
  context.host.nodes.clearChildren(layer)
  context.releaseLayerResources('characters')
  const characters = options.characters || projectCharacters(context.getViewState().characters, context.getViewState().animations, context.host.runtime.now())
  for (const character of characters) {
    await renderCharacter(context, layer, character, options.presencePhases?.get(character.id))
  }
}

export async function renderCocosDialogue(context: CocosRendererHostContext, options: RenderCocosDialogueOptions = {}): Promise<void> {
  const layer = context.getLayerNode('dialogue', 'dialogue-layer', 50)
  context.host.nodes.clearChildren(layer)
  context.setLayerResource('dialogue', 'avatar', undefined)
  const renderKey = nextDialogueRenderKey(context)
  if (!viewAllowsDialogueChrome(context.getViewState()))
    return
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
    avatar: dialogue.avatar,
    renderKey,
    mode: dialogue.mode,
    typewriter: options.typewriter
      ? {
          revealing: options.typewriter.revealing,
          visibleCharacters: options.typewriter.visibleCharacters,
        }
      : undefined,
  })
  context.host.nodes.setNodeTransform(box, motionTransform(dialogue as unknown as Record<string, unknown>))
  void setDialogueAvatarNode(context, box, dialogue, renderKey)
}

function nextDialogueRenderKey(context: CocosRendererHostContext): string {
  const key = `dialogue:${++dialogueRenderSerial}`
  activeDialogueRenderKeys.set(context, key)
  return key
}

export async function renderCocosChoices(context: CocosRendererHostContext): Promise<void> {
  const layer = context.getLayerNode('choices', 'choice-layer', 60)
  context.host.nodes.clearChildren(layer)
  context.releaseLayerResources('choices')
  if (!viewAllowsDialogueChrome(context.getViewState()))
    return
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
    const resource = await resolveAssetWithTargetPackages(context, 'audio', assetName, audioTrackPackageIds(track))
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
      crossfadeMs: numberValue(track.crossfadeMs, undefined),
      seekMs: numberValue(track.seekMs, undefined),
      offsetMs: numberValue(track.offsetMs, undefined),
      eq: arrayRecords(track.eq),
      automation: arrayRecords(track.automation),
      interruptible: booleanValue(track.interruptible, kind === 'voice' || kind === 'sfx'),
      endedPayload: audioTrackEndedPayload(track, kind, id, assetName),
    })
  }
  context.releaseAudioHandles('audio', activeKeys)
}

export async function renderCocosUi(context: CocosRendererHostContext, options: RenderCocosUiOptions = {}): Promise<void> {
  const allOverlays = context.getViewState().ui.overlays || {}
  const handled = new Set(options.handledElementIds || [])
  const overlayEntries = Object.entries(allOverlays)
    .filter(([elementId]) => !handled.has(elementId))
    .sort(compareCocosUiOverlayEntries)
  const topEntry = overlayEntries[overlayEntries.length - 1]
  const layer = context.getLayerNode(
    'ui',
    'ui-layer',
    resolveCocosUiOverlayZIndex(topEntry?.[1], defaultCocosUiOverlayPlacement(topEntry?.[0])),
  )
  context.host.nodes.clearChildren(layer)
  context.releaseLayerResources('ui')
  const activeScene = resolveActiveUiSceneProjection(Object.fromEntries(overlayEntries), defaultCocosUiOverlayPlacement)
  const layerPlacement = resolveCocosUiOverlayPlacement(topEntry?.[1], defaultCocosUiOverlayPlacement(topEntry?.[0]))
  context.host.nodes.setNodeMetadata?.(layer, {
    overlayPlacement: layerPlacement,
    uiScene: activeScene,
    defaultChrome: activeScene?.overlay?.defaultChrome,
    hideHud: activeScene?.overlay?.hideHud,
    hideDialogue: activeScene?.overlay?.hideDialogue,
  })
  for (const [elementId, overlay] of overlayEntries) {
    const projected = projectUiOverlay(
      overlay as unknown as Record<string, unknown>,
      elementId,
      context.getViewState().animations,
      context.host.runtime.now(),
    )
    if (uiOverlayIsRenderOnly(overlay)) {
      await renderCocosRenderOnlyOverlay(context, options, layer, elementId, overlay, projected)
      continue
    }
    const node = context.host.nodes.createNode('ui-overlay', { parent: layer, name: elementId })
    context.host.nodes.setNodeVisible(node, projected.visible !== false)
    context.host.nodes.setNodeTransform(node, {
      ...overlayTransform(context, projected),
      zIndex: resolveCocosUiOverlayZIndex(overlay, defaultCocosUiOverlayPlacement(elementId)),
    })
    context.host.nodes.setNodeControl?.(node, {
      kind: 'panel',
      label: stringValue(projected.title, titleFromField(elementId)),
    })
    context.host.nodes.setNodeMetadata?.(node, {
      elementId,
      overlay: projected,
      overlayPlacement: resolveCocosUiOverlayPlacement(overlay, defaultCocosUiOverlayPlacement(elementId)),
      uiAction: 'panel',
    })
    await applyCocosUiControlSkin(context, node, {
      layerId: 'ui',
      resourceKey: `overlay:${elementId}`,
      kind: 'panel',
      skinId: resolveUiOverlaySkinReference(context.getViewState(), overlay),
    })
    await renderUiOverlayContent(context, node, elementId, projected, overlay)
  }
}

async function renderCocosRenderOnlyOverlay(
  context: CocosRendererHostContext,
  options: RenderCocosUiOptions,
  parent: CocosHostNode,
  elementId: string,
  overlay: ViewUiOverlayProjection,
  projected: Record<string, unknown>,
): Promise<void> {
  const node = context.host.nodes.createNode('ui-render-only-overlay', { parent, name: elementId })
  context.host.nodes.setNodeVisible(node, projected.visible !== false)
  context.host.nodes.setNodeTransform(node, {
    ...renderOnlyOverlayTransform(context, projected),
    zIndex: resolveCocosUiOverlayZIndex(overlay, defaultCocosUiOverlayPlacement(elementId)),
  })
  const surface = getUiOverlaySurfaceProjection(overlay)
  const surfaceKey = surface?.key.trim()
  context.host.nodes.setNodeMetadata?.(node, {
    elementId,
    overlay: projected,
    overlayPlacement: resolveCocosUiOverlayPlacement(overlay, defaultCocosUiOverlayPlacement(elementId)),
    renderMode: 'render-only',
    interactive: uiOverlayIsInteractive(overlay),
    surface,
  })

  const renderSurface = surfaceKey ? options.renderOnlySurfaces?.[surfaceKey] : undefined
  if (!surface || !surfaceKey || !renderSurface) {
    context.reportWarning(surfaceKey
      ? `Render-only overlay surface "${surfaceKey}" is not registered for Cocos.`
      : `Render-only overlay "${elementId}" is missing surface.key.`, {
      elementId,
      surfaceKey,
    })
    return
  }

  await renderSurface({
    elementId,
    overlay,
    surface,
    projected,
    context,
    parentNode: node,
  })
}

function renderOnlyOverlayTransform(context: CocosRendererHostContext, projected: Record<string, unknown>): CocosHostTransform {
  const layout = context.getStageLayout()
  return {
    x: numberValue(projected.x, 0),
    y: numberValue(projected.y, 0),
    width: numericDimension(projected.width as number | string | undefined) ?? layout.logicalWidth,
    height: numericDimension(projected.height as number | string | undefined) ?? layout.logicalHeight,
    scaleX: numberValue(projected.scaleX, numberValue(projected.scale, undefined)),
    scaleY: numberValue(projected.scaleY, numberValue(projected.scale, undefined)),
    rotation: numberValue(projected.rotation, undefined),
    opacity: numberValue(projected.opacity, 1),
    zIndex: numberValue(projected.zIndex, 0),
  }
}

export async function captureCocosSavePreview(context: CocosRendererHostContext, view: Readonly<QuaViewProjection>, payload: {
  requestId: string
  saveOpId: string
  slotId: string
  policy: {
    uiMode?: string
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
  }, payload.policy)
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
  if (isRichTextDocument(dialogue.text) || isRichTextDocument(dialogue.speaker)) {
    context.host.nodes.setNodeRichText(node, dialogueMarkup(dialogue), style)
    return
  }
  const speaker = dialogue.speaker !== undefined
    ? richTextToPlainText(dialogue.speaker)
    : dialogue.characterName
  const text = [speaker, richTextToPlainText(dialogue.text)].filter(Boolean).join('\n')
  context.host.nodes.setNodeText(node, text, style)
}

function dialogueMarkup(dialogue: ViewDialogueProjection): string {
  const parts: string[] = []
  if (dialogue.speaker !== undefined) {
    parts.push(wrapRichTextStyle(
      richTextContentToCocosMarkup(dialogue.speaker),
      (dialogue.speakerStyle as Readonly<Record<string, unknown>> | undefined) || {},
    ))
  }
  else if (dialogue.characterName) {
    parts.push(`<b>${escapeRichTextMarkup(dialogue.characterName)}</b>`)
  }
  parts.push(richTextContentToCocosMarkup(dialogue.text))
  return parts.filter(Boolean).join('\n')
}

function setDialogueAvatarNode(
  context: CocosRendererHostContext,
  box: CocosHostNode,
  dialogue: ViewDialogueProjection,
  renderKey: string,
): void {
  if (!dialogue.avatar) {
    return
  }
  const avatar = context.host.nodes.createNode('dialogue-avatar', { parent: box })
  context.host.nodes.setNodeMetadata?.(avatar, {
    avatar: dialogue.avatar,
    characterId: dialogue.characterId,
    renderKey,
  })
  void resolveAssetWithTargetPackages(
    context,
    dialogue.avatar.type || 'images',
    dialogue.avatar.name,
    runtimePackageCandidatesFromMetadata({
      ...(dialogue.avatar.metadata || {}),
      ...(dialogue.avatar.runtimePackageId ? { contentPackageId: dialogue.avatar.runtimePackageId } : {}),
    }),
  ).then((resource) => {
    if (activeDialogueRenderKeys.get(context) !== renderKey) {
      return
    }
    context.host.nodes.setNodeSprite(avatar, resource)
    context.setLayerResource('dialogue', 'avatar', resource)
  }).catch((error) => {
    if (activeDialogueRenderKeys.get(context) !== renderKey) {
      return
    }
    return context.reportError(error, {
      message: 'Cocos dialogue avatar projection failed.',
      phase: 'renderer-cocos:dialogue-avatar',
      metadata: {
        name: dialogue.avatar?.name,
        type: dialogue.avatar?.type || 'images',
      },
    })
  })
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
    const resource = await resolveAssetWithTargetPackages(context, assetType, item.assetName, runtimePackageCandidatesFromMetadata(item.metadata))
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
  presencePhase?: string,
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
    presencePhase,
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
  const targetPackageIds = runtimePackageCandidatesFromMetadata(character.metadata)
  const manifest = await loadSpriteManifest(context, character.sprite, targetPackageIds)
  if (!manifest) {
    await renderFallbackCharacterSprite(context, root, character, targetPackageIds)
    return
  }
  const projection = resolveSpriteProjection(manifest, character.sprite, character.expression)
  if (!projection) {
    await renderFallbackCharacterSprite(context, root, character, targetPackageIds)
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
      targetPackageIds,
    })
  }
}

async function renderFallbackCharacterSprite(
  context: CocosRendererHostContext,
  root: CocosHostNode,
  character: ViewCharacterProjection,
  targetPackageIds?: readonly string[],
): Promise<void> {
  const resource = await resolveAssetWithTargetPackages(context, 'characters', character.sprite, targetPackageIds)
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
    targetPackageIds?: readonly string[]
  },
): Promise<void> {
  const { character, layer, index, targetPackageIds } = options
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
  const resource = await resolveSpriteLayerResource(context, projectedLayer, targetPackageIds)
  const maskResource = projectedLayer.mask
    ? await resolveAssetWithTargetPackages(context, 'characters', projectedLayer.mask, targetPackageIds)
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
  targetPackageIds?: readonly string[],
) {
  try {
    const resource = await resolveAssetWithTargetPackages(context, 'characters', layer.asset, targetPackageIds)
    if (resource || !layer.fallback)
      return resource
  }
  catch (error) {
    if (!layer.fallback)
      throw error
  }
  return await resolveAssetWithTargetPackages(context, 'characters', layer.fallback, targetPackageIds)
}

async function loadSpriteManifest(
  context: CocosRendererHostContext,
  sprite: string | undefined,
  targetPackageIds?: readonly string[],
): Promise<SpriteManifest | undefined> {
  const reference = resolveSpriteReference(sprite)
  if (!reference)
    return undefined
  try {
    return await getJSONWithTargetPackages<SpriteManifest>(context, 'characters', reference.manifestPath, targetPackageIds)
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
  const mask = await resolveBackgroundSpriteMask(
    context,
    composition.mask,
    `${resourceKey}:mask`,
    runtimePackageCandidatesFromMetadata(projection.metadata),
  )
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
  targetPackageIds?: readonly string[],
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
  const resource = await resolveAssetWithTargetPackages(context, assetType, mask.assetName, targetPackageIds)
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
  const width = transform.width ?? context.getStageLayout().safeArea.width
  const height = transform.height ?? 480
  const padding = 32

  const title = stringValue(projected.title, titleFromField(elementId))
  const titleNode = context.host.nodes.createNode('ui-title', { parent, name: `${elementId}:title` })
  context.host.nodes.setNodeText(titleNode, title, { fontSize: 32, color: '#ffffff' })
  context.host.nodes.setNodeTransform(titleNode, {
    x: padding,
    y: 24,
    width: Math.max(0, width - padding * 2 - 160),
    height: 48,
    zIndex: 1,
  })

  const subtitle = stringValue(projected.subtitle)
  if (subtitle) {
    const subtitleNode = context.host.nodes.createNode('ui-subtitle', { parent, name: `${elementId}:subtitle` })
    context.host.nodes.setNodeText(subtitleNode, subtitle, { fontSize: 22, color: '#d8d8d8' })
    context.host.nodes.setNodeTransform(subtitleNode, {
      x: padding,
      y: 74,
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
      x: padding,
      y: subtitle ? 118 : 84,
      width: Math.max(0, width - padding * 2),
      height: 96,
      zIndex: 1,
    })
  }

  await renderUiButton(context, parent, {
    elementId,
    index: -1,
    label: 'Close',
    x: Math.max(0, width - 144),
    y: 24,
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
      x: padding,
      y: height - padding - (actions.length - index) * 58,
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
    const automation = arrayRecords(projection.automation)
    const automationStartedAt = syncAudioAutomationStart(projection, `audioBus:${bus}`, automationStarts, now)
    const volume = audioBusVolume(projection, automation, automationStartedAt, now)
    context.host.audio.setBusVolume?.(bus, volume)
    if (Array.isArray(projection.eq)) {
      if (context.host.audio.setBusEq) {
        context.host.audio.setBusEq?.(bus, projectEqBands(arrayRecords(projection.eq), automation, now, automationStartedAt))
      }
    }
  }
}

function audioBusVolume(
  projection: Record<string, unknown>,
  automation: readonly Record<string, unknown>[],
  automationStartedAt: number,
  now: number,
): number {
  const automatedGainDb = projectGainAutomation(automation, now, automationStartedAt)
  return automatedGainDb === undefined ? audioVolume(projection) : 10 ** (automatedGainDb / 20)
}

function syncAudioAutomationStart(
  projection: Record<string, unknown>,
  key: string,
  automationStarts: Map<string, { signature?: string, startedAt: number }> | undefined,
  now: number,
): number {
  const automation = arrayRecords(projection.automation)
  const signature = automation.length > 0 ? JSON.stringify(automation) : undefined
  const current = automationStarts?.get(key)
  if (automationStarts && current?.signature !== signature) {
    automationStarts.set(key, { signature, startedAt: now })
  }
  return automationStarts?.get(key)?.startedAt ?? now
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

function audioTrackPackageIds(track: Record<string, unknown>): readonly string[] | undefined {
  const contentPackageId = stringValue(track.contentPackageId)
  return runtimePackageCandidatesFromMetadata({
    ...(isRecord(track.metadata) ? track.metadata : {}),
    ...(contentPackageId ? { contentPackageId } : {}),
  })
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
  return projectAutomationProperty(automation, 'gainDb', now, startedAt)
}

function projectEqBands(
  eq: readonly Record<string, unknown>[],
  automation: readonly Record<string, unknown>[],
  now: number,
  startedAt: number,
): readonly Record<string, unknown>[] {
  return eq.map((band, index) => {
    const next = { ...band }
    for (const property of ['gainDb', 'frequency', 'q', 'detune']) {
      const value = projectAutomationProperty(automation, `eq[${index}].${property}`, now, startedAt)
      if (value !== undefined)
        next[property] = value
    }
    return next
  })
}

function projectAutomationProperty(
  automation: readonly Record<string, unknown>[],
  propertyPath: string,
  now: number,
  startedAt: number,
): number | undefined {
  const item = automation.find(entry => entry.propertyPath === propertyPath)
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
