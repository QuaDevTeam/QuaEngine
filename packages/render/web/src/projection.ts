import type { AssetType } from '@quajs/assets'
import type {
  ActiveAnimationProjection,
  ViewBackgroundProjection,
  ViewCharacterProjection,
} from '@quajs/render-core'
import { applyTrackValues, cloneBackground, cloneBackgroundLayer, cloneCharacter, collectTrackValues } from './animation'

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

export function backgroundProjectionVars(background: {
  x?: unknown
  y?: unknown
  scale?: unknown
  rotation?: unknown
  opacity?: unknown
} | undefined): Record<string, string | number> | undefined {
  const vars: Record<string, string | number> = {}
  assignVar(vars, '--qua-background-x', background?.x)
  assignVar(vars, '--qua-background-y', background?.y)
  assignVar(vars, '--qua-background-scale', background?.scale)
  assignVar(vars, '--qua-background-rotation', background?.rotation)
  assignVar(vars, '--qua-background-opacity', background?.opacity)
  return Object.keys(vars).length ? vars : undefined
}

export function backgroundLayerProjectionVars(layer: {
  x?: unknown
  y?: unknown
  scale?: unknown
  rotation?: unknown
  opacity?: unknown
  zIndex?: unknown
  blendMode?: unknown
}): Record<string, string | number> | undefined {
  const vars: Record<string, string | number> = {}
  assignVar(vars, '--qua-background-layer-x', layer.x)
  assignVar(vars, '--qua-background-layer-y', layer.y)
  assignVar(vars, '--qua-background-layer-scale', layer.scale)
  assignVar(vars, '--qua-background-layer-rotation', layer.rotation)
  assignVar(vars, '--qua-background-layer-opacity', layer.opacity)
  assignVar(vars, '--qua-background-layer-z-index', layer.zIndex)
  assignVar(vars, '--qua-background-layer-blend-mode', layer.blendMode)
  return Object.keys(vars).length ? vars : undefined
}

export function characterProjectionVars(character: Readonly<ViewCharacterProjection>): Record<string, string | number> | undefined {
  const position = character.position || {}
  const vars: Record<string, string | number> = {}
  assignVar(vars, '--qua-character-x', position.x)
  assignVar(vars, '--qua-character-y', position.y)
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

function assignVar(vars: Record<string, string | number>, name: string, value: unknown): void {
  if (typeof value === 'string' || typeof value === 'number') {
    vars[name] = value
  }
}
