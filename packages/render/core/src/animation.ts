import type {
  ActiveAnimationProjection,
  AnimationTime,
  ResolvedAnimationTrackProjection,
  ViewBackgroundLayerProjection,
  ViewBackgroundProjection,
  ViewCharacterProjection,
} from './index'

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
    const elapsed = resolveAnimationLocalTime(animation, now)
    if (elapsed === undefined)
      continue
    for (const track of animation.resolvedTracks) {
      if (track.target !== target)
        continue
      const value = resolveTrackValue(track, elapsed, animation.duration)
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
    composition: background.composition ? cloneUnknownRecord(background.composition) : undefined,
    metadata: background.metadata ? { ...background.metadata } : undefined,
  }
}

export function cloneBackgroundLayer(layer: Readonly<ViewBackgroundLayerProjection>): ViewBackgroundLayerProjection {
  return {
    ...layer,
    composition: layer.composition ? cloneUnknownRecord(layer.composition) : undefined,
    transition: layer.transition ? { ...layer.transition } : undefined,
    metadata: layer.metadata ? { ...layer.metadata } : undefined,
  }
}

function resolveAnimationLocalTime(animation: Readonly<ActiveAnimationProjection>, now: number): number | undefined {
  if (animation.state === 'stopped' && animation.endedAt === undefined) {
    return undefined
  }
  const playbackRate = Number.isFinite(animation.playbackRate) && animation.playbackRate > 0 ? animation.playbackRate : 1
  const delay = Math.max(0, animation.delay ?? 0)
  const duration = Math.max(0, animation.duration)
  const fill = animation.fill ?? 'forwards'
  const wallElapsed = (animation.state === 'paused' && animation.pausedAt !== undefined)
    ? animation.pausedAt - animation.startedAt
    : (animation.state === 'stopped' && animation.endedAt !== undefined)
        ? animation.endedAt - animation.startedAt
        : now - animation.startedAt
  const timelineElapsed = Math.max(0, wallElapsed * playbackRate)
  if (timelineElapsed < delay) {
    return fill === 'backwards' || fill === 'both'
      ? applyAnimationDirection(0, duration, 0, animation.direction)
      : undefined
  }

  if (duration === 0) {
    return 0
  }

  const activeElapsed = timelineElapsed - delay
  const loopCount = animation.loop === true
    ? Infinity
    : typeof animation.loop === 'number'
      ? Math.max(1, animation.loop)
      : 1
  const totalDuration = duration * loopCount

  if (activeElapsed >= totalDuration) {
    if (animation.loop === true) {
      const local = activeElapsed % duration
      const iteration = Math.floor(activeElapsed / duration)
      return applyAnimationDirection(local, duration, iteration, animation.direction)
    }

    if (fill === 'forwards' || fill === 'both') {
      return applyAnimationDirection(duration, duration, loopCount - 1, animation.direction)
    }
    return undefined
  }

  const iteration = Math.floor(activeElapsed / duration)
  const local = activeElapsed - iteration * duration
  return applyAnimationDirection(local, duration, iteration, animation.direction)
}

function applyAnimationDirection(
  local: number,
  duration: number,
  iteration: number,
  direction: Readonly<ActiveAnimationProjection>['direction'],
): number {
  const normalized = direction ?? 'normal'
  const reversed = normalized === 'reverse'
    || (normalized === 'alternate' && iteration % 2 === 1)
    || (normalized === 'alternate-reverse' && iteration % 2 === 0)
  return reversed ? duration - local : local
}

function resolveTrackValue(
  track: Readonly<ResolvedAnimationTrackProjection>,
  elapsed: number,
  duration: number,
): unknown {
  const keyframes = [...track.keyframes].sort((left, right) => resolveAt(left.at, duration) - resolveAt(right.at, duration))
  if (keyframes.length === 0)
    return undefined
  if (keyframes.length === 1)
    return keyframes[0].value

  const first = keyframes[0]
  const firstAt = resolveAt(first.at, duration)
  if (elapsed <= firstAt)
    return first.value

  for (let index = 1; index < keyframes.length; index++) {
    const previous = keyframes[index - 1]
    const next = keyframes[index]
    const previousAt = resolveAt(previous.at, duration)
    const nextAt = resolveAt(next.at, duration)
    if (elapsed <= nextAt) {
      if (elapsed === nextAt)
        return next.value
      if (track.interpolation === 'step' || track.interpolation === 'discrete')
        return previous.value
      const progress = nextAt === previousAt ? 1 : (elapsed - previousAt) / (nextAt - previousAt)
      return interpolateTrackValue(previous.value, next.value, easeProgress(progress, next.easing ?? previous.easing), track.interpolation)
    }
  }

  return keyframes[keyframes.length - 1].value
}

function interpolateTrackValue(
  from: unknown,
  to: unknown,
  progress: number,
  interpolation: Readonly<ResolvedAnimationTrackProjection>['interpolation'],
): unknown {
  if (typeof from === 'number' && typeof to === 'number') {
    return from + (to - from) * progress
  }

  if ((interpolation === 'array' || interpolation === 'vector') && Array.isArray(from) && Array.isArray(to)) {
    return interpolateArray(from, to, progress)
  }

  if ((interpolation === 'vector' || interpolation === 'array') && isNumericRecord(from) && isNumericRecord(to)) {
    return interpolateNumericRecord(from, to, progress)
  }

  if (interpolation === 'color' && typeof from === 'string' && typeof to === 'string') {
    return interpolateColor(from, to, progress) ?? to
  }

  return to
}

function interpolateArray(from: readonly unknown[], to: readonly unknown[], progress: number): unknown[] {
  if (from.length !== to.length) {
    return [...to]
  }
  return from.map((value, index) => typeof value === 'number' && typeof to[index] === 'number'
    ? value + ((to[index] as number) - value) * progress
    : to[index])
}

function interpolateNumericRecord(from: unknown, to: unknown, progress: number): Record<string, unknown> {
  const left = from as Readonly<Record<string, unknown>>
  const right = to as Readonly<Record<string, unknown>>
  const result: Record<string, unknown> = { ...right }
  for (const key of Object.keys(right)) {
    const leftValue = left[key]
    const rightValue = right[key]
    result[key] = typeof leftValue === 'number' && typeof rightValue === 'number'
      ? leftValue + (rightValue - leftValue) * progress
      : rightValue
  }
  return result
}

function isNumericRecord(value: unknown): value is Readonly<Record<string, number>> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

export function easeProgress(progress: number, easing: string | undefined): number {
  const clamped = Math.max(0, Math.min(1, progress))
  switch (easing) {
    case 'linear':
      return clamped
    case 'ease':
      return cubicBezier(clamped, 0.25, 0.1, 0.25, 1)
    case 'ease-in':
    case 'easeIn':
      return clamped * clamped
    case 'ease-out':
    case 'easeOut':
      return 1 - (1 - clamped) * (1 - clamped)
    case 'ease-in-out':
    case 'easeInOut':
      return clamped < 0.5
        ? 2 * clamped * clamped
        : 1 - ((-2 * clamped + 2) ** 2) / 2
    case 'quad-in':
    case 'quadIn':
      return clamped * clamped
    case 'quad-out':
    case 'quadOut':
      return 1 - (1 - clamped) * (1 - clamped)
    case 'quad-in-out':
    case 'quadInOut':
      return clamped < 0.5 ? 2 * clamped * clamped : 1 - ((-2 * clamped + 2) ** 2) / 2
    case 'cubic-in':
    case 'cubicIn':
    case 'easeInCubic':
      return clamped ** 3
    case 'cubic-out':
    case 'cubicOut':
    case 'easeOutCubic':
      return 1 - (1 - clamped) ** 3
    case 'cubic-in-out':
    case 'cubicInOut':
    case 'easeInOutCubic':
      return clamped < 0.5 ? 4 * clamped ** 3 : 1 - ((-2 * clamped + 2) ** 3) / 2
    default:
      return parseCubicBezier(easing, clamped) ?? clamped
  }
}

function parseCubicBezier(easing: string | undefined, progress: number): number | undefined {
  const match = easing?.match(/^cubic-bezier\(([-\d.]+),\s*([-\d.]+),\s*([-\d.]+),\s*([-\d.]+)\)$/)
  if (!match)
    return undefined
  return cubicBezier(progress, Number(match[1]), Number(match[2]), Number(match[3]), Number(match[4]))
}

function cubicBezier(progress: number, _x1: number, y1: number, _x2: number, y2: number): number {
  const inverse = 1 - progress
  return 3 * inverse * inverse * progress * y1
    + 3 * inverse * progress * progress * y2
    + progress * progress * progress
}

function interpolateColor(from: string, to: string, progress: number): string | undefined {
  const left = parseColor(from)
  const right = parseColor(to)
  if (!left || !right)
    return undefined
  const rgba = left.map((value, index) => value + (right[index] - value) * progress)
  return rgba[3] >= 1
    ? `rgb(${Math.round(rgba[0])}, ${Math.round(rgba[1])}, ${Math.round(rgba[2])})`
    : `rgba(${Math.round(rgba[0])}, ${Math.round(rgba[1])}, ${Math.round(rgba[2])}, ${roundAlpha(rgba[3])})`
}

function parseColor(value: string): [number, number, number, number] | undefined {
  const hex = value.trim().match(/^#([\da-f]{3,8})$/i)
  if (hex) {
    return parseHexColor(hex[1])
  }
  const rgb = value.trim().match(/^rgba?\(([^)]+)\)$/i)
  if (!rgb)
    return undefined
  const parts = rgb[1].split(',').map(part => part.trim())
  if (parts.length < 3)
    return undefined
  return [
    Number(parts[0]),
    Number(parts[1]),
    Number(parts[2]),
    parts[3] === undefined ? 1 : Number(parts[3]),
  ]
}

function parseHexColor(hex: string): [number, number, number, number] | undefined {
  const normalized = hex.length === 3 || hex.length === 4
    ? hex.split('').map(char => `${char}${char}`).join('')
    : hex
  if (normalized.length !== 6 && normalized.length !== 8)
    return undefined
  return [
    Number.parseInt(normalized.slice(0, 2), 16),
    Number.parseInt(normalized.slice(2, 4), 16),
    Number.parseInt(normalized.slice(4, 6), 16),
    normalized.length === 8 ? Number.parseInt(normalized.slice(6, 8), 16) / 255 : 1,
  ]
}

function roundAlpha(value: number): number {
  return Math.round(value * 1000) / 1000
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

export function cloneUnknownRecord<T extends Readonly<Record<string, unknown>>>(value: T): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cloneUnknownValue(item)]))
}

function cloneUnknownValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(cloneUnknownValue)
  }
  if (value && typeof value === 'object') {
    return cloneUnknownRecord(value as Readonly<Record<string, unknown>>)
  }
  return value
}
