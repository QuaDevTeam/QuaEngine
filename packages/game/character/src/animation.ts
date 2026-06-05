import type { QuaEngineInterface } from '@quajs/engine'
import type {
  AnimationTimeline,
  PlayAnimationOptions,
} from '@quajs/plugin-animation'
import type {
  AnimationFillMode,
  AnimationInterpolation,
  AnimationTimingFunction,
  AnimationTime,
} from '@quajs/render-core'
import { playTimelineWithEngine } from '@quajs/plugin-animation'

export type CharacterMotionTarget = `character:${string}`
export type CharacterMotionDirection = 'left' | 'right' | 'top' | 'bottom'
export type CharacterMotionRef = string | { id: string }

export interface CharacterMotionKeyframe {
  at: AnimationTime
  x?: number
  y?: number
  scale?: number
  rotation?: number
  opacity?: number
  visible?: boolean
  easing?: AnimationTimingFunction
}

export interface CharacterMotionTimelineOptions {
  id?: string
  duration: number
  playbackRate?: number
  loop?: boolean | number
  fill?: AnimationFillMode
  commit?: AnimationTimeline['commit']
  metadata?: Readonly<Record<string, unknown>>
}

export interface CharacterMotionPresetOptions extends Partial<Omit<CharacterMotionTimelineOptions, 'duration'>> {
  target?: CharacterMotionTarget
  duration?: number
  x?: number
  y?: number
  fromX?: number
  toX?: number
  fromY?: number
  toY?: number
  fromScale?: number
  toScale?: number
  fromRotation?: number
  toRotation?: number
  opacityFrom?: number
  opacityTo?: number
  easing?: AnimationTimingFunction
  offset?: number
}

export interface CharacterMotionPlayOptions extends Omit<PlayAnimationOptions, 'defaultTarget'> {
  wait?: boolean
  easing?: AnimationTimingFunction
}

export function createCharacterMotionTimeline(
  target: CharacterMotionTarget,
  keyframes: readonly CharacterMotionKeyframe[],
  options: CharacterMotionTimelineOptions,
): AnimationTimeline {
  return {
    id: options.id,
    duration: options.duration,
    playbackRate: options.playbackRate,
    loop: options.loop,
    fill: options.fill,
    commit: options.commit,
    metadata: options.metadata,
    tracks: createTracks(target, keyframes),
  }
}

export async function playCharacterMotionWithEngine(
  engine: QuaEngineInterface,
  motion: AnimationTimeline,
  options: CharacterMotionPlayOptions = {},
) {
  return playTimelineWithEngine(engine, motion, options)
}

export function fadeInCharacter(options: CharacterMotionPresetOptions = {}): AnimationTimeline {
  const duration = options.duration ?? 300
  return createCharacterMotionTimeline(requireTarget(options), [
    { at: 0, opacity: options.opacityFrom ?? 0, visible: true },
    { at: duration, opacity: options.opacityTo ?? 1, visible: true, easing: options.easing },
  ], normalizePresetOptions(options, duration))
}

export function fadeOutCharacter(options: CharacterMotionPresetOptions = {}): AnimationTimeline {
  const duration = options.duration ?? 300
  return createCharacterMotionTimeline(requireTarget(options), [
    { at: 0, opacity: options.opacityFrom ?? 1, visible: true },
    { at: duration, opacity: options.opacityTo ?? 0, visible: false, easing: options.easing },
  ], normalizePresetOptions(options, duration))
}

export function enterCharacter(direction: CharacterMotionDirection, options: CharacterMotionPresetOptions = {}): AnimationTimeline {
  const duration = options.duration ?? 450
  const [fromX, toX] = resolveAxisValues(direction, 'x', options, true)
  const [fromY, toY] = resolveAxisValues(direction, 'y', options, true)
  return createCharacterMotionTimeline(requireTarget(options), [
    {
      at: 0,
      x: fromX,
      y: fromY,
      scale: options.fromScale,
      rotation: options.fromRotation,
      opacity: options.opacityFrom ?? 0,
      visible: true,
    },
    {
      at: duration,
      x: toX,
      y: toY,
      scale: options.toScale,
      rotation: options.toRotation,
      opacity: options.opacityTo ?? 1,
      visible: true,
      easing: options.easing,
    },
  ], normalizePresetOptions(options, duration))
}

export function exitCharacter(direction: CharacterMotionDirection, options: CharacterMotionPresetOptions = {}): AnimationTimeline {
  const duration = options.duration ?? 350
  const [fromX, toX] = resolveAxisValues(direction, 'x', options, false)
  const [fromY, toY] = resolveAxisValues(direction, 'y', options, false)
  return createCharacterMotionTimeline(requireTarget(options), [
    {
      at: 0,
      x: fromX,
      y: fromY,
      scale: options.fromScale,
      rotation: options.fromRotation,
      opacity: options.opacityFrom ?? 1,
      visible: true,
    },
    {
      at: duration,
      x: toX,
      y: toY,
      scale: options.toScale,
      rotation: options.toRotation,
      opacity: options.opacityTo ?? 0,
      visible: false,
      easing: options.easing,
    },
  ], normalizePresetOptions(options, duration))
}

export function enterCharacterFromLeft(options: CharacterMotionPresetOptions = {}): AnimationTimeline {
  return enterCharacter('left', options)
}

export function enterCharacterFromRight(options: CharacterMotionPresetOptions = {}): AnimationTimeline {
  return enterCharacter('right', options)
}

export function enterCharacterFromTop(options: CharacterMotionPresetOptions = {}): AnimationTimeline {
  return enterCharacter('top', options)
}

export function enterCharacterFromBottom(options: CharacterMotionPresetOptions = {}): AnimationTimeline {
  return enterCharacter('bottom', options)
}

export function exitCharacterToLeft(options: CharacterMotionPresetOptions = {}): AnimationTimeline {
  return exitCharacter('left', options)
}

export function exitCharacterToRight(options: CharacterMotionPresetOptions = {}): AnimationTimeline {
  return exitCharacter('right', options)
}

export function exitCharacterToTop(options: CharacterMotionPresetOptions = {}): AnimationTimeline {
  return exitCharacter('top', options)
}

export function exitCharacterToBottom(options: CharacterMotionPresetOptions = {}): AnimationTimeline {
  return exitCharacter('bottom', options)
}

export async function playCharacterFadeWithEngine(
  engine: QuaEngineInterface,
  character: CharacterMotionRef,
  from: number,
  to: number,
  duration = 300,
  options: CharacterMotionPlayOptions = {},
) {
  const motion = createCharacterMotionTimeline(characterTarget(character), [
    { at: 0, opacity: from, visible: true },
    { at: duration, opacity: to, visible: to > 0, easing: options.easing },
  ], {
    duration,
    commit: options.commit,
    fill: options.fill,
    id: options.id,
    loop: options.loop,
    playbackRate: options.playbackRate,
  })
  return playCharacterMotionWithEngine(engine, motion, options)
}

export async function playCharacterEnterWithEngine(
  engine: QuaEngineInterface,
  character: CharacterMotionRef,
  direction: CharacterMotionDirection,
  options: CharacterMotionPresetOptions & CharacterMotionPlayOptions = {},
) {
  return playCharacterMotionWithEngine(engine, enterCharacter(direction, {
    ...options,
    target: characterTarget(character),
  }), options)
}

export async function playCharacterExitWithEngine(
  engine: QuaEngineInterface,
  character: CharacterMotionRef,
  direction: CharacterMotionDirection,
  options: CharacterMotionPresetOptions & CharacterMotionPlayOptions = {},
) {
  return playCharacterMotionWithEngine(engine, exitCharacter(direction, {
    ...options,
    target: characterTarget(character),
  }), options)
}

export const characterMotionPresets = {
  fadeIn: fadeInCharacter,
  fadeOut: fadeOutCharacter,
  enter: enterCharacter,
  exit: exitCharacter,
  enterFromLeft: enterCharacterFromLeft,
  enterFromRight: enterCharacterFromRight,
  enterFromTop: enterCharacterFromTop,
  enterFromBottom: enterCharacterFromBottom,
  exitToLeft: exitCharacterToLeft,
  exitToRight: exitCharacterToRight,
  exitToTop: exitCharacterToTop,
  exitToBottom: exitCharacterToBottom,
} as const

function characterTarget(character: CharacterMotionRef): CharacterMotionTarget {
  const id = typeof character === 'string' ? character : character.id
  return `character:${id}`
}

function requireTarget(options: CharacterMotionPresetOptions): CharacterMotionTarget {
  if (!options.target) {
    throw new Error('Character motion presets require a target such as "character:Alice".')
  }
  return options.target
}

function normalizePresetOptions(
  options: CharacterMotionPresetOptions,
  duration: number,
): CharacterMotionTimelineOptions {
  return {
    id: options.id,
    duration,
    playbackRate: options.playbackRate,
    loop: options.loop,
    fill: options.fill,
    commit: options.commit,
    metadata: options.metadata,
  }
}

function resolveAxisValues(
  direction: CharacterMotionDirection,
  axis: 'x' | 'y',
  options: CharacterMotionPresetOptions,
  entering: boolean,
): [number | undefined, number | undefined] {
  const offset = options.offset ?? 240
  const fromKey = axis === 'x' ? 'fromX' : 'fromY'
  const toKey = axis === 'x' ? 'toX' : 'toY'
  const base = axis === 'x' ? options.x : options.y
  const isPositiveDirection = direction === 'right' || direction === 'bottom'
  const affectsAxis = axis === 'x'
    ? direction === 'left' || direction === 'right'
    : direction === 'top' || direction === 'bottom'

  if (!affectsAxis) {
    return [
      options[fromKey] ?? base,
      options[toKey] ?? base,
    ]
  }

  const signedOffset = isPositiveDirection ? offset : -offset
  if (entering) {
    const to = options[toKey] ?? base ?? 0
    return [
      options[fromKey] ?? to + signedOffset,
      to,
    ]
  }

  const from = options[fromKey] ?? base ?? 0
  return [
    from,
    options[toKey] ?? from + signedOffset,
  ]
}

function createTracks(
  target: CharacterMotionTarget,
  keyframes: readonly CharacterMotionKeyframe[],
): AnimationTimeline['tracks'] {
  return [
    createNumberTrack(target, 'position.x', keyframes, 'x'),
    createNumberTrack(target, 'position.y', keyframes, 'y'),
    createNumberTrack(target, 'position.scale', keyframes, 'scale'),
    createNumberTrack(target, 'position.rotation', keyframes, 'rotation'),
    createNumberTrack(target, 'opacity', keyframes, 'opacity'),
    createDiscreteTrack(target, 'visible', keyframes, 'visible'),
  ].filter((track): track is NonNullable<typeof track> => Boolean(track))
}

function createNumberTrack(
  target: CharacterMotionTarget,
  property: string,
  keyframes: readonly CharacterMotionKeyframe[],
  key: keyof CharacterMotionKeyframe,
): AnimationTimeline['tracks'][number] | undefined {
  const values = keyframes
    .filter(frame => typeof frame[key] === 'number')
    .map(frame => ({
      at: frame.at,
      value: frame[key],
      easing: frame.easing,
    }))
  if (values.length === 0) {
    return undefined
  }
  return {
    target,
    property,
    interpolation: 'number' satisfies AnimationInterpolation,
    keyframes: values,
  }
}

function createDiscreteTrack(
  target: CharacterMotionTarget,
  property: string,
  keyframes: readonly CharacterMotionKeyframe[],
  key: keyof CharacterMotionKeyframe,
): AnimationTimeline['tracks'][number] | undefined {
  const values = keyframes
    .filter(frame => frame[key] !== undefined)
    .map(frame => ({
      at: frame.at,
      value: frame[key],
      easing: frame.easing,
    }))
  if (values.length === 0) {
    return undefined
  }
  return {
    target,
    property,
    interpolation: 'discrete',
    keyframes: values,
  }
}
