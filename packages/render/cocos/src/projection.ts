import type { CocosHostNode, CocosHostTransform } from '@quajs/cocos-host'
import type {
  QuaViewProjection,
  ViewBackgroundLayerProjection,
  ViewBackgroundProjection,
  ViewCharacterProjection,
  ViewEffectProjection,
} from '@quajs/render-core'
import type { CocosRendererHostContext } from './types'
import {
  projectBackground,
  projectCharacters,
  projectChoices,
  projectDialogue,
  projectEffect,
  projectAudioProjection,
  projectUiOverlay,
  RenderToLogicEvents,
} from '@quajs/render-core'
import {
  choiceText,
  metadataTargetPackageId,
  normalizeBackgroundAssetType,
  positionTransform,
  richTextToPlainText,
} from './utils'

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
    context.host.nodes.setNodeSprite(node, resource, { mode: 'video' })
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
  context.host.nodes.setNodeSprite(node, resource)
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

export function renderCocosDialogue(context: CocosRendererHostContext): void {
  const layer = context.getLayerNode('dialogue', 'dialogue-layer', 50)
  context.host.nodes.clearChildren(layer)
  const dialogue = projectDialogue(
    context.getViewState().dialogue,
    context.getViewState().animations,
    context.host.runtime.now(),
    context.getViewState().plugins.dialogue as Record<string, unknown> | undefined,
  )
  if (!dialogue.visible)
    return
  const box = context.host.nodes.createNode('dialogue-box', { parent: layer })
  const text = [dialogue.characterName, richTextToPlainText(dialogue.text)].filter(Boolean).join('\n')
  context.host.nodes.setNodeText(box, text, {
    fontSize: numberValue((dialogue as unknown as Record<string, unknown>).fontSize, 32),
    color: stringValue((dialogue as unknown as Record<string, unknown>).color, '#ffffff'),
  })
  context.host.nodes.setNodeMetadata?.(box, {
    characterId: dialogue.characterId,
    mode: dialogue.mode,
  })
  context.host.nodes.setNodeTransform(box, motionTransform(dialogue as unknown as Record<string, unknown>))
}

export function renderCocosChoices(context: CocosRendererHostContext): void {
  const layer = context.getLayerNode('choices', 'choice-layer', 60)
  context.host.nodes.clearChildren(layer)
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
  const safeArea = context.getStageLayout().safeArea
  let index = 0
  for (const choice of projection.choices) {
    const node = context.host.nodes.createNode('choice', { parent: layer, name: `choice:${choice.id}` })
    const choiceMotion = motionTransform(choice as unknown as Record<string, unknown>)
    context.host.nodes.setNodeText(node, choiceText(choice), { fontSize: 28 })
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

export async function renderCocosAudio(context: CocosRendererHostContext): Promise<void> {
  const projection = projectAudioProjection<Record<string, unknown>>(context.getViewState(), context.host.runtime.now())
  const tracks = collectAudioTracks(projection)
  syncAudioBuses(context, projection)
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
    await context.syncAudioHandle('audio', key, resource, {
      loop: booleanValue(track.loop, kind === 'bgm' || kind === 'ambient'),
      volume: audioVolume(track),
      playbackRate: numberValue(track.playbackRate, 1),
      bus: stringValue(track.bus, kind),
      playing: stringValue(track.state, 'playing') !== 'paused' && stringValue(track.state, 'playing') !== 'stopped',
    })
  }
  context.releaseAudioHandles('audio', activeKeys)
}

export function renderCocosUi(context: CocosRendererHostContext): void {
  const layer = context.getLayerNode('ui', 'ui-layer', 90)
  context.host.nodes.clearChildren(layer)
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
    context.host.nodes.setNodeTransform(node, motionTransform(projected))
    context.host.nodes.setNodeMetadata?.(node, { elementId, overlay: projected })
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
    context.host.nodes.setNodeSprite(node, resource)
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
  const resource = await context.resolveAsset('characters', character.sprite, {
    targetPackageId: metadataTargetPackageId(character.metadata),
  })
  context.host.nodes.setNodeSprite(node, resource)
  context.setLayerResource('characters', `character:${character.id}`, resource)
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

function numericDimension(value: number | string | undefined): number | undefined {
  return typeof value === 'number' ? value : undefined
}

function stringValue(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
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

function syncAudioBuses(context: CocosRendererHostContext, audio: Record<string, unknown> | undefined): void {
  const buses = audio?.buses
  if (!buses || typeof buses !== 'object' || Array.isArray(buses))
    return
  for (const [bus, value] of Object.entries(buses as Record<string, unknown>)) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      continue
    const projection = value as Record<string, unknown>
    const volume = audioVolume(projection)
    context.host.audio.setBusVolume?.(bus, volume)
    if (Array.isArray(projection.eq)) {
      if (context.host.capabilities?.audioEq) {
        context.host.audio.setBusEq?.(bus, projection.eq)
      }
    }
  }
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
