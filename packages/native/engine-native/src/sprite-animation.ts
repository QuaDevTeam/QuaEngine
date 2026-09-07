import type { ActiveAnimationProjection } from '@quajs/render-core'
import { collectTrackValues } from '@quajs/render-core'

// Keep aligned with native projection/character/animation.rs. Resource fields
// are intentionally absent: Web sprite animation updates presentation styles.
const properties = new Set(['offsetX', 'offsetY', 'scale', 'rotation', 'opacity', 'zIndex', 'visible', 'blendMode'])
const maxSamples = 1024

/** Sample before QPK manifest resolution, then apply to resolved layers in Rust. */
export function sampleNativeSpriteLayerAnimations(
  characterId: string,
  animations: readonly Readonly<ActiveAnimationProjection>[],
  now: number,
): Array<{ target: string, property: string, value: unknown }> | undefined {
  const prefix = `spriteLayer:${characterId}:`
  const targets = new Set<string>()
  for (const animation of animations) {
    for (const track of animation.resolvedTracks || []) {
      if (track.target.startsWith(prefix)
        && /^(?:(?:base|expression)(?::(?:0|[1-9]\d*))?|0|[1-9]\d*)$/.test(track.target.slice(prefix.length))
        && properties.has(track.property)) targets.add(track.target)
    }
  }
  const values: Array<{ target: string, property: string, value: unknown }> = []
  for (const target of targets) {
    for (const track of collectTrackValues(animations, target, now)) {
      if (!properties.has(track.property)) continue
      values.push({ target, ...track })
      if (values.length === maxSamples) return values
    }
  }
  return values.length ? values : undefined
}
