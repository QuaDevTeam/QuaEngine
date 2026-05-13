import type { AssetType } from '@quajs/assets'
import type {
  ActiveAnimationProjection,
  BackgroundCompositionProjection,
  BackgroundFilterProjection,
  BackgroundMaskProjection,
  QuaViewProjection,
  ViewBackgroundLayerProjection,
  ViewBackgroundProjection,
  ViewCharacterProjection,
  ViewChoiceProjection,
  ViewDialogueProjection,
  ViewEffectProjection,
} from '@quajs/render-core'
import { applyTrackValues, cloneBackground, cloneBackgroundLayer, cloneCharacter, cloneUnknownRecord, collectTrackValues } from './animation'

export type MotionProjection = Readonly<Record<string, unknown>>

export function projectBackground(
  background: Readonly<ViewBackgroundProjection> | undefined,
  animations: readonly Readonly<ActiveAnimationProjection>[],
  now: number,
): ViewBackgroundProjection | undefined {
  if (!background)
    return undefined

  const mainTracks = collectTrackValues(animations, 'background:main', now)
  const next = cloneBackground(background)
  if (mainTracks.length > 0) {
    applyTrackValues(next as unknown as Record<string, unknown>, mainTracks)
  }

  if (next.layers?.length) {
    next.layers = next.layers.map((layer) => {
      const layerTracks = collectTrackValues(animations, `backgroundLayer:${layer.id}`, now)
      if (layerTracks.length === 0)
        return layer
      const projected = cloneBackgroundLayer(layer)
      applyTrackValues(projected as unknown as Record<string, unknown>, layerTracks)
      return projected
    })
  }

  return next
}

export function projectCharacter(
  character: Readonly<ViewCharacterProjection>,
  animations: readonly Readonly<ActiveAnimationProjection>[],
  now: number,
): ViewCharacterProjection {
  const tracks = collectTrackValues(animations, `character:${character.id}`, now)
  if (tracks.length === 0)
    return character as ViewCharacterProjection

  const next = cloneCharacter(character)
  applyTrackValues(next as unknown as Record<string, unknown>, tracks)
  return next
}

export function projectCharacters(
  characters: readonly Readonly<ViewCharacterProjection>[],
  animations: readonly Readonly<ActiveAnimationProjection>[],
  now: number,
): ViewCharacterProjection[] {
  return characters.map(character => projectCharacter(character, animations, now))
}

export function projectStageMotion(
  view: Readonly<QuaViewProjection>,
  now: number,
): { stage: MotionProjection, camera: MotionProjection } {
  return {
    stage: projectMotionTarget(view.plugins.stage as MotionProjection | undefined, view.animations, 'stage:main', now),
    camera: projectMotionTarget(view.plugins.camera as MotionProjection | undefined, view.animations, 'camera:main', now),
  }
}

export function projectDialogue(
  dialogue: Readonly<ViewDialogueProjection>,
  animations: readonly Readonly<ActiveAnimationProjection>[],
  now: number,
  base?: MotionProjection,
): ViewDialogueProjection {
  const projection = {
    ...(base ? cloneUnknownRecord(base) : {}),
    ...(dialogue as unknown as Record<string, unknown>),
  }
  return projectMotionTarget(projection, animations, 'dialogue:box', now) as unknown as ViewDialogueProjection
}

export function projectChoices(
  choices: readonly Readonly<ViewChoiceProjection>[],
  animations: readonly Readonly<ActiveAnimationProjection>[],
  now: number,
  base?: MotionProjection,
): { panel: MotionProjection, choices: ViewChoiceProjection[] } {
  const choiceBaseMap = base?.choices && typeof base.choices === 'object' && !Array.isArray(base.choices)
    ? base.choices as Readonly<Record<string, unknown>>
    : undefined
  return {
    panel: projectMotionTarget(base, animations, 'choices:panel', now),
    choices: choices.map((choice) => {
      const choiceBase = choiceBaseMap?.[choice.id]
      const projection = {
        ...(choiceBase && typeof choiceBase === 'object' && !Array.isArray(choiceBase)
          ? cloneUnknownRecord(choiceBase as Readonly<Record<string, unknown>>)
          : {}),
        ...(choice as unknown as Record<string, unknown>),
      }
      return projectMotionTarget(projection, animations, `choice:${choice.id}`, now) as unknown as ViewChoiceProjection
    }),
  }
}

export function projectUiOverlay(
  overlay: Readonly<Record<string, unknown>>,
  elementId: string,
  animations: readonly Readonly<ActiveAnimationProjection>[],
  now: number,
): Record<string, unknown> {
  return projectMotionTarget(overlay, animations, `ui:${elementId}`, now) as Record<string, unknown>
}

export function projectEffect(
  effect: Readonly<ViewEffectProjection>,
  animations: readonly Readonly<ActiveAnimationProjection>[],
  now: number,
): ViewEffectProjection {
  return projectMotionTarget(effect as unknown as MotionProjection, animations, `effect:${effect.id}`, now) as unknown as ViewEffectProjection
}

export function projectAudioProjection<T = unknown>(
  view: Readonly<QuaViewProjection>,
  now: number,
): T | undefined {
  const audio = view.plugins.audio as Readonly<Record<string, unknown>> | undefined
  if (!audio)
    return undefined

  const projected = cloneUnknownRecord(audio)
  const buses = projected.buses
  if (buses && typeof buses === 'object' && !Array.isArray(buses)) {
    const busMap = buses as Record<string, unknown>
    for (const busId of Object.keys(buses)) {
      const bus = busMap[busId]
      if (bus && typeof bus === 'object' && !Array.isArray(bus)) {
        busMap[busId] = projectMotionTarget(bus as MotionProjection, view.animations, `audioBus:${busId}`, now)
      }
    }
  }

  if (projected.bgm && typeof projected.bgm === 'object' && !Array.isArray(projected.bgm)) {
    const id = (projected.bgm as Record<string, unknown>).id
    if (typeof id === 'string') {
      projected.bgm = projectMotionTarget(projected.bgm as MotionProjection, view.animations, `audioTrack:${id}`, now)
    }
  }

  for (const collection of ['voices', 'sfx', 'ambients']) {
    const tracks = projected[collection]
    if (!Array.isArray(tracks))
      continue
    projected[collection] = tracks.map((track) => {
      if (!track || typeof track !== 'object' || Array.isArray(track))
        return track
      const id = (track as Record<string, unknown>).id
      return typeof id === 'string'
        ? projectMotionTarget(track as MotionProjection, view.animations, `audioTrack:${id}`, now)
        : track
    })
  }

  return projected as T
}

export function projectMotionTarget(
  base: MotionProjection | undefined,
  animations: readonly Readonly<ActiveAnimationProjection>[],
  target: string,
  now: number,
): Record<string, unknown> {
  const next = base ? cloneUnknownRecord(base) : {}
  const tracks = collectTrackValues(animations, target, now)
  if (tracks.length > 0) {
    applyTrackValues(next, tracks)
  }
  return next
}

export function motionProjectionVars(
  projection: MotionProjection | undefined,
  prefix = '--qua-motion',
): Record<string, string | number> | undefined {
  if (!projection) {
    return undefined
  }
  const vars: Record<string, string | number> = {}
  assignVar(vars, `${prefix}-x`, projection.x)
  assignVar(vars, `${prefix}-y`, projection.y)
  assignVar(vars, `${prefix}-scale`, projection.scale)
  assignVar(vars, `${prefix}-rotation`, projection.rotation)
  assignVar(vars, `${prefix}-opacity`, projection.opacity)
  assignVar(vars, `${prefix}-z-index`, projection.zIndex)
  assignVar(vars, `${prefix}-color`, projection.color)
  assignVar(vars, `${prefix}-background-color`, projection.backgroundColor)
  vars.transform = `translate(calc(var(${prefix}-x, 0) * 1px), calc(var(${prefix}-y, 0) * 1px)) scale(var(${prefix}-scale, 1)) rotate(calc(var(${prefix}-rotation, 0) * 1deg))`
  vars.opacity = `var(${prefix}-opacity, 1)`
  vars['z-index'] = `var(${prefix}-z-index, auto)`
  if (projection.width !== undefined) {
    vars.width = toCssLength(projection.width, 'auto')
  }
  if (projection.height !== undefined) {
    vars.height = toCssLength(projection.height, 'auto')
  }
  if (projection.color !== undefined) {
    vars.color = `var(${prefix}-color, inherit)`
  }
  if (projection.backgroundColor !== undefined) {
    vars['background-color'] = `var(${prefix}-background-color, transparent)`
  }
  if (projection.composition) {
    Object.assign(vars, backgroundCompositionVars(projection.composition as Readonly<BackgroundCompositionProjection>, prefix))
  }
  return vars
}

export function stageMotionVars(stage: {
  stage?: MotionProjection
  camera?: MotionProjection
}): Record<string, string | number> {
  const vars: Record<string, string | number> = {}
  assignMotionVars(vars, '--qua-stage', stage.stage)
  assignMotionVars(vars, '--qua-camera', stage.camera)
  return vars
}

export function backgroundProjectionVars(background: {
  fit?: unknown
  origin?: unknown
  width?: unknown
  height?: unknown
  x?: unknown
  y?: unknown
  scale?: unknown
  rotation?: unknown
  opacity?: unknown
  composition?: Readonly<BackgroundCompositionProjection>
} | undefined): Record<string, string | number> | undefined {
  const vars: Record<string, string | number> = {}
  vars.position = 'absolute'
  vars.inset = '0'
  vars.top = '0'
  vars.right = '0'
  vars.bottom = '0'
  vars.left = '0'
  vars.display = 'block'
  vars.width = toCssLength(background?.width, '100%')
  vars.height = toCssLength(background?.height, '100%')
  vars['object-fit'] = typeof background?.fit === 'string' ? background.fit : 'cover'
  vars['transform-origin'] = typeof background?.origin === 'string' ? background.origin : 'center center'
  assignVar(vars, '--qua-background-x', background?.x)
  assignVar(vars, '--qua-background-y', background?.y)
  assignVar(vars, '--qua-background-scale', background?.scale)
  assignVar(vars, '--qua-background-rotation', background?.rotation)
  assignVar(vars, '--qua-background-opacity', background?.opacity)
  vars.transform = 'translate(calc(var(--qua-background-x, 0) * 1px), calc(var(--qua-background-y, 0) * 1px)) scale(var(--qua-background-scale, 1)) rotate(calc(var(--qua-background-rotation, 0) * 1deg))'
  vars.opacity = 'var(--qua-background-opacity, 1)'
  Object.assign(vars, backgroundCompositionVars(background?.composition, '--qua-background'))
  return Object.keys(vars).length ? vars : undefined
}

export function backgroundLayerProjectionVars(layer: Readonly<ViewBackgroundLayerProjection>): Record<string, string | number> | undefined {
  const vars: Record<string, string | number> = {}
  vars.position = 'absolute'
  vars.inset = '0'
  vars.top = '0'
  vars.right = '0'
  vars.bottom = '0'
  vars.left = '0'
  vars.display = 'block'
  vars.width = toCssLength(layer.width, '100%')
  vars.height = toCssLength(layer.height, '100%')
  vars['object-fit'] = layer.fit || 'cover'
  vars['transform-origin'] = layer.origin || 'center center'
  vars.visibility = layer.visible === false ? 'hidden' : 'visible'
  assignVar(vars, '--qua-background-layer-x', layer.x)
  assignVar(vars, '--qua-background-layer-y', layer.y)
  assignVar(vars, '--qua-background-layer-scale', layer.scale)
  assignVar(vars, '--qua-background-layer-rotation', layer.rotation)
  assignVar(vars, '--qua-background-layer-opacity', layer.opacity)
  assignVar(vars, '--qua-background-layer-z-index', layer.zIndex)
  assignVar(vars, '--qua-background-layer-blend-mode', layer.composition?.blendMode)
  vars.transform = 'translate(calc(var(--qua-background-layer-x, 0) * 1px), calc(var(--qua-background-layer-y, 0) * 1px)) scale(var(--qua-background-layer-scale, 1)) rotate(calc(var(--qua-background-layer-rotation, 0) * 1deg))'
  vars.opacity = 'var(--qua-background-layer-opacity, 1)'
  vars['z-index'] = 'var(--qua-background-layer-z-index, 0)'
  vars['mix-blend-mode'] = 'var(--qua-background-layer-blend-mode, normal)'
  vars['will-change'] = 'transform, opacity, filter'
  Object.assign(vars, backgroundCompositionVars(layer.composition, '--qua-background-layer'))
  return Object.keys(vars).length ? vars : undefined
}

export function backgroundCompositionVars(
  composition: Readonly<BackgroundCompositionProjection> | undefined,
  prefix = '--qua-background',
): Record<string, string | number> {
  const vars: Record<string, string | number> = {}
  if (!composition) {
    vars.filter = 'none'
    return vars
  }

  assignVar(vars, `${prefix}-blend-mode`, composition.blendMode)
  vars['mix-blend-mode'] = `var(${prefix}-blend-mode, normal)`
  if (composition.isolation !== undefined) {
    vars.isolation = composition.isolation ? 'isolate' : 'auto'
  }

  Object.assign(vars, backgroundFilterVars(composition.filter, prefix))
  Object.assign(vars, backgroundMaskVars(composition.mask, prefix))
  return vars
}

export function backgroundFilterVars(
  filter: Readonly<BackgroundFilterProjection> | undefined,
  prefix = '--qua-background',
): Record<string, string | number> {
  const vars: Record<string, string | number> = {}
  assignVar(vars, `${prefix}-filter-blur`, filter?.blur)
  assignVar(vars, `${prefix}-filter-brightness`, filter?.brightness)
  assignVar(vars, `${prefix}-filter-contrast`, filter?.contrast)
  assignVar(vars, `${prefix}-filter-saturate`, filter?.saturate)
  assignVar(vars, `${prefix}-filter-hue-rotate`, filter?.hueRotate)
  assignVar(vars, `${prefix}-filter-grayscale`, filter?.grayscale)
  assignVar(vars, `${prefix}-filter-sepia`, filter?.sepia)
  assignVar(vars, `${prefix}-filter-drop-shadow`, filter?.dropShadow)
  vars.filter = backgroundFilterValue(filter)
  return vars
}

export function backgroundMaskVars(
  mask: Readonly<BackgroundMaskProjection> | undefined,
  prefix = '--qua-background',
): Record<string, string | number> {
  const vars: Record<string, string | number> = {}
  if (!mask) {
    return vars
  }
  assignVar(vars, `${prefix}-mask-mode`, mask.mode)
  vars['mask-mode'] = `var(${prefix}-mask-mode, match-source)`
  vars['-webkit-mask-position'] = mask.position || 'center'
  vars['mask-position'] = mask.position || 'center'
  vars['-webkit-mask-size'] = mask.size || 'cover'
  vars['mask-size'] = mask.size || 'cover'
  vars['-webkit-mask-repeat'] = mask.repeat || 'no-repeat'
  vars['mask-repeat'] = mask.repeat || 'no-repeat'
  return vars
}

export function backgroundMaskImageVars(url: string | undefined): Record<string, string> | undefined {
  if (!url) {
    return undefined
  }
  const image = `url("${url.replace(/"/g, '\\"')}")`
  return {
    '-webkit-mask-image': image,
    'mask-image': image,
  }
}

export function characterProjectionVars(character: Readonly<ViewCharacterProjection>): Record<string, string | number> | undefined {
  const position = character.position || {}
  const vars: Record<string, string | number> = {}
  assignVar(vars, '--qua-character-x', position.x)
  assignVar(vars, '--qua-character-y', position.y)
  assignVar(vars, '--qua-character-x-percent', position.xPercent)
  assignVar(vars, '--qua-character-y-percent', position.yPercent)
  vars['--qua-character-left'] = position.xPercent !== undefined
    ? `${position.xPercent}%`
    : position.x !== undefined
      ? `${position.x}px`
      : 'var(--qua-layout-safe-center-x-px, 50%)'
  vars['--qua-character-top'] = position.yPercent !== undefined
    ? `${position.yPercent}%`
    : position.y !== undefined
      ? `${position.y}px`
      : 'var(--qua-layout-safe-center-y-px, 50%)'
  assignVar(vars, '--qua-character-scale', position.scale)
  assignVar(vars, '--qua-character-rotation', position.rotation)
  assignVar(vars, '--qua-character-layer', character.layer)
  assignVar(vars, '--qua-character-opacity', character.opacity)
  return Object.keys(vars).length ? vars : undefined
}

export function normalizeBackgroundLayerAssetType(assetType: string | undefined): AssetType {
  if (assetType === 'video' || assetType === 'characters' || assetType === 'audio' || assetType === 'scripts' || assetType === 'data') {
    return assetType
  }
  return 'images'
}

function assignMotionVars(vars: Record<string, string | number>, prefix: string, motion: MotionProjection | undefined): void {
  assignVar(vars, `${prefix}-x`, motion?.x)
  assignVar(vars, `${prefix}-y`, motion?.y)
  assignVar(vars, `${prefix}-scale`, motion?.scale)
  assignVar(vars, `${prefix}-rotation`, motion?.rotation)
  assignVar(vars, `${prefix}-opacity`, motion?.opacity)
  if (motion?.composition) {
    Object.assign(vars, backgroundCompositionVars(motion.composition as Readonly<BackgroundCompositionProjection>, prefix))
  }
}

function assignVar(vars: Record<string, string | number>, name: string, value: unknown): void {
  if (typeof value === 'string' || typeof value === 'number') {
    vars[name] = value
  }
}

function toCssLength(value: unknown, fallback: string): string {
  if (typeof value === 'number') {
    return `${value}px`
  }
  if (typeof value === 'string') {
    return value
  }
  return fallback
}

function backgroundFilterValue(filter: Readonly<BackgroundFilterProjection> | undefined): string {
  if (!filter) {
    return 'none'
  }
  const parts: string[] = []
  if (filter.blur !== undefined) {
    parts.push(`blur(${filter.blur}px)`)
  }
  if (filter.brightness !== undefined) {
    parts.push(`brightness(${filter.brightness})`)
  }
  if (filter.contrast !== undefined) {
    parts.push(`contrast(${filter.contrast})`)
  }
  if (filter.saturate !== undefined) {
    parts.push(`saturate(${filter.saturate})`)
  }
  if (filter.hueRotate !== undefined) {
    parts.push(`hue-rotate(${filter.hueRotate}deg)`)
  }
  if (filter.grayscale !== undefined) {
    parts.push(`grayscale(${filter.grayscale})`)
  }
  if (filter.sepia !== undefined) {
    parts.push(`sepia(${filter.sepia})`)
  }
  if (filter.dropShadow) {
    parts.push(`drop-shadow(${filter.dropShadow})`)
  }
  return parts.length > 0 ? parts.join(' ') : 'none'
}
