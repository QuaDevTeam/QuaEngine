import type {
  ActiveAnimationProjection,
  AnimationTime,
  ResolvedAnimationTrackProjection,
  ViewBackgroundLayerProjection,
  ViewBackgroundProjection,
  ViewCharacterProjection,
} from '@quajs/render-core'

export interface ProjectedTrackValue {
  property: string
  value: unknown
}

export function collectTrackValues(
  animations: readonly Readonly<ActiveAnimationProjection>[],
  target: string,
  now: number,
): ProjectedTrackValue[] {
  const collected: ProjectedTrackValue[] = []
  for (const animation of animations) {
    if (animation.state === 'stopped')
      continue
    const elapsed = animationElapsed(animation, now)
    for (const track of animation.resolvedTracks) {
      if (track.target !== target)
        continue
      const value = resolveTrackValue(track, elapsed, animation.duration, animation.loop)
      if (value !== undefined) {
        collected.push({ property: track.property, value })
      }
    }
  }
  return collected
}

export function applyTrackValues(target: Record<string, unknown>, tracks: readonly ProjectedTrackValue[]): void {
  for (const track of tracks) {
    setPath(target, track.property, track.value)
  }
}

export function cloneCharacter(character: Readonly<ViewCharacterProjection>): ViewCharacterProjection {
  return {
    ...character,
    position: character.position ? { ...character.position } : undefined,
    metadata: character.metadata ? { ...character.metadata } : undefined,
  }
}

export function cloneBackground(background: Readonly<ViewBackgroundProjection>): ViewBackgroundProjection {
  return {
    ...background,
    transition: background.transition ? { ...background.transition } : undefined,
    video: background.video
      ? {
          ...background.video,
          transition: background.video.transition ? { ...background.video.transition } : undefined,
          metadata: background.video.metadata ? { ...background.video.metadata } : undefined,
        }
      : undefined,
    layers: background.layers?.map(layer => cloneBackgroundLayer(layer)),
    metadata: background.metadata ? { ...background.metadata } : undefined,
  }
}

export function cloneBackgroundLayer(layer: Readonly<ViewBackgroundLayerProjection>): ViewBackgroundLayerProjection {
  return {
    ...layer,
    transition: layer.transition ? { ...layer.transition } : undefined,
    metadata: layer.metadata ? { ...layer.metadata } : undefined,
  }
}

function animationElapsed(animation: Readonly<ActiveAnimationProjection>, now: number): number {
  const wallElapsed = (animation.state === 'paused' && animation.pausedAt !== undefined)
    ? animation.pausedAt - animation.startedAt
    : now - animation.startedAt
  const timelineElapsed = Math.max(0, wallElapsed * animation.playbackRate)
  if (animation.loop) {
    return animation.duration === 0 ? 0 : timelineElapsed % animation.duration
  }
  return Math.min(animation.duration, timelineElapsed)
}

function resolveTrackValue(
  track: Readonly<ResolvedAnimationTrackProjection>,
  elapsed: number,
  duration: number,
  loop?: boolean | number,
): unknown {
  const keyframes = [...track.keyframes].sort((left, right) => resolveAt(left.at, duration) - resolveAt(right.at, duration))
  if (keyframes.length === 0)
    return undefined
  if (keyframes.length === 1)
    return keyframes[0].value

  const localElapsed = loop && duration > 0 ? elapsed % duration : elapsed
  const first = keyframes[0]
  const firstAt = resolveAt(first.at, duration)
  if (localElapsed <= firstAt)
    return first.value

  for (let index = 1; index < keyframes.length; index++) {
    const previous = keyframes[index - 1]
    const next = keyframes[index]
    const previousAt = resolveAt(previous.at, duration)
    const nextAt = resolveAt(next.at, duration)
    if (localElapsed <= nextAt) {
      if (track.interpolation === 'step' || track.interpolation === 'discrete')
        return previous.value
      if (typeof previous.value === 'number' && typeof next.value === 'number') {
        const progress = nextAt === previousAt ? 1 : (localElapsed - previousAt) / (nextAt - previousAt)
        return previous.value + (next.value - previous.value) * progress
      }
      return next.value
    }
  }

  return keyframes[keyframes.length - 1].value
}

function resolveAt(at: AnimationTime, duration: number): number {
  if (typeof at === 'number')
    return at
  return Number.parseFloat(at) / 100 * duration
}

function setPath(target: Record<string, unknown>, property: string, value: unknown): void {
  const keys = property.split('.').filter(Boolean)
  if (keys.length === 0)
    return

  let cursor = target
  for (const key of keys.slice(0, -1)) {
    const current = cursor[key]
    if (!current || typeof current !== 'object' || Array.isArray(current)) {
      cursor[key] = {}
    }
    cursor = cursor[key] as Record<string, unknown>
  }
  cursor[keys[keys.length - 1]] = value
}
