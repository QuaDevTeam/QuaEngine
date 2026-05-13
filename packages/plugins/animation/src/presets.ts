import type { AnimationInterpolation, AnimationTime } from '@quajs/render-core'
import type { AnimationKeyframe, AnimationTimeline } from './index'

export interface VisualNovelMotionOptions {
  id?: string
  target?: string
  duration?: number
  delay?: number
  from?: number
  to?: number
  fromX?: number
  toX?: number
  fromY?: number
  toY?: number
  intensity?: number
  opacityFrom?: number
  opacityTo?: number
  easing?: string
}

export interface ChoicesStaggerOptions extends VisualNovelMotionOptions {
  choiceIds: readonly string[]
  stagger?: number
}

export interface BackgroundCrossfadeOptions extends VisualNovelMotionOptions {
  fromLayerId: string
  toLayerId: string
}

export function characterEnter(options: VisualNovelMotionOptions = {}): AnimationTimeline {
  const duration = options.duration ?? 360
  const target = options.target || 'self'
  return timeline(options, duration, [
    track(target, 'position.x', [
      key(0, options.fromX ?? -180, options.easing ?? 'ease-out'),
      key(duration, options.toX ?? 0),
    ]),
    track(target, 'opacity', [
      key(0, options.opacityFrom ?? 0),
      key(duration, options.opacityTo ?? 1, options.easing ?? 'ease-out'),
    ]),
  ], { commit: 'final', fill: 'forwards' })
}

export function characterExit(options: VisualNovelMotionOptions = {}): AnimationTimeline {
  const duration = options.duration ?? 300
  const target = options.target || 'self'
  return timeline(options, duration, [
    track(target, 'position.x', [
      key(0, options.fromX ?? 0, options.easing ?? 'ease-in'),
      key(duration, options.toX ?? -180),
    ]),
    track(target, 'opacity', [
      key(0, options.opacityFrom ?? 1),
      key(duration, options.opacityTo ?? 0, options.easing ?? 'ease-in'),
    ]),
  ], { commit: 'final', fill: 'forwards' })
}

export function characterHop(options: VisualNovelMotionOptions = {}): AnimationTimeline {
  const duration = options.duration ?? 260
  const target = options.target || 'self'
  const baseY = options.fromY ?? 0
  const lift = options.intensity ?? 48
  return timeline(options, duration, [
    track(target, 'position.y', [
      key(0, baseY, 'ease-out'),
      key(duration / 2, options.toY ?? baseY - lift, 'ease-in-out'),
      key(duration, baseY, 'ease-in'),
    ]),
  ], { commit: 'final', fill: 'forwards' })
}

export function characterBreath(options: VisualNovelMotionOptions = {}): AnimationTimeline {
  const duration = options.duration ?? 1800
  const target = options.target || 'self'
  return timeline(options, duration, [
    track(target, 'position.scale', [
      key(0, options.from ?? 1, 'ease-in-out'),
      key(duration / 2, options.to ?? 1.025, 'ease-in-out'),
      key(duration, options.from ?? 1, 'ease-in-out'),
    ]),
  ], { commit: 'none', fill: 'none', loop: true })
}

export function characterBlink(options: VisualNovelMotionOptions = {}): AnimationTimeline {
  const duration = options.duration ?? 220
  const target = options.target || 'self'
  return timeline(options, duration, [
    track(target, 'opacity', [
      key(0, options.opacityTo ?? 1),
      key(duration * 0.45, options.opacityFrom ?? 0.35, 'ease-in'),
      key(duration, options.opacityTo ?? 1, 'ease-out'),
    ]),
  ], { commit: 'none', fill: 'forwards' })
}

export function stageShake(options: VisualNovelMotionOptions = {}): AnimationTimeline {
  const duration = options.duration ?? 360
  const target = options.target || 'stage:main'
  const intensity = options.intensity ?? 18
  return timeline(options, duration, [
    track(target, 'x', [
      key(0, 0),
      key(duration * 0.18, -intensity),
      key(duration * 0.36, intensity),
      key(duration * 0.54, -intensity * 0.65),
      key(duration * 0.72, intensity * 0.45),
      key(duration, 0),
    ]),
    track(target, 'y', [
      key(0, 0),
      key(duration * 0.18, intensity * 0.45),
      key(duration * 0.36, -intensity * 0.35),
      key(duration * 0.54, intensity * 0.28),
      key(duration, 0),
    ]),
  ], { commit: 'none', fill: 'none' })
}

export function stageFlash(options: VisualNovelMotionOptions = {}): AnimationTimeline {
  const duration = options.duration ?? 280
  const target = options.target || 'stage:main'
  return timeline(options, duration, [
    track(target, 'composition.filter.brightness', [
      key(0, options.from ?? 1),
      key(duration * 0.18, options.to ?? 2.4, 'ease-out'),
      key(duration, options.from ?? 1, 'ease-in'),
    ]),
  ], { commit: 'none', fill: 'none' })
}

export function stageFade(options: VisualNovelMotionOptions = {}): AnimationTimeline {
  const duration = options.duration ?? 400
  const target = options.target || 'stage:main'
  return timeline(options, duration, [
    track(target, 'opacity', [
      key(0, options.opacityFrom ?? 0),
      key(duration, options.opacityTo ?? 1, options.easing ?? 'ease-in-out'),
    ]),
  ], { commit: 'none', fill: 'forwards' })
}

export function dialogueTransition(options: VisualNovelMotionOptions = {}): AnimationTimeline {
  const duration = options.duration ?? 240
  const target = options.target || 'dialogue:box'
  return timeline(options, duration, [
    track(target, 'y', [
      key(0, options.fromY ?? 24),
      key(duration, options.toY ?? 0, options.easing ?? 'ease-out'),
    ]),
    track(target, 'opacity', [
      key(0, options.opacityFrom ?? 0),
      key(duration, options.opacityTo ?? 1, options.easing ?? 'ease-out'),
    ]),
  ], { commit: 'none', fill: 'none' })
}

export function choicesStagger(options: ChoicesStaggerOptions): AnimationTimeline {
  const duration = options.duration ?? 320
  const stagger = options.stagger ?? 70
  const tracks = options.choiceIds.flatMap((choiceId, index) => {
    const offset = index * stagger
    const target = `choice:${choiceId}`
    return [
      track(target, 'y', [
        key(offset, options.fromY ?? 16),
        key(offset + duration, options.toY ?? 0, options.easing ?? 'ease-out'),
      ]),
      track(target, 'opacity', [
        key(offset, options.opacityFrom ?? 0),
        key(offset + duration, options.opacityTo ?? 1, options.easing ?? 'ease-out'),
      ]),
    ]
  })
  return {
    id: options.id,
    duration: duration + Math.max(0, options.choiceIds.length - 1) * stagger,
    delay: options.delay,
    tracks,
    fill: 'none',
    commit: 'none',
  }
}

export function backgroundCrossfade(options: BackgroundCrossfadeOptions): AnimationTimeline {
  const duration = options.duration ?? 500
  return timeline(options, duration, [
    track(`backgroundLayer:${options.fromLayerId}`, 'opacity', [
      key(0, options.opacityFrom ?? 1),
      key(duration, 0, options.easing ?? 'ease-in-out'),
    ]),
    track(`backgroundLayer:${options.toLayerId}`, 'opacity', [
      key(0, 0),
      key(duration, options.opacityTo ?? 1, options.easing ?? 'ease-in-out'),
    ]),
  ], { commit: 'final', fill: 'forwards' })
}

export const visualNovelMotionPresets = {
  characterEnter,
  characterExit,
  characterHop,
  characterBreath,
  characterBlink,
  stageShake,
  stageFlash,
  stageFade,
  dialogueTransition,
  choicesStagger,
  backgroundCrossfade,
} as const

function timeline(
  options: VisualNovelMotionOptions,
  duration: number,
  tracks: AnimationTimeline['tracks'],
  defaults: Pick<AnimationTimeline, 'commit' | 'fill' | 'loop'>,
): AnimationTimeline {
  return {
    id: options.id,
    duration,
    delay: options.delay,
    tracks,
    ...defaults,
  }
}

function track(
  target: string,
  property: string,
  keyframes: readonly AnimationKeyframe[],
  interpolation: AnimationInterpolation = 'number',
): AnimationTimeline['tracks'][number] {
  return {
    target,
    property,
    interpolation,
    keyframes,
  }
}

function key(at: AnimationTime, value: unknown, easing?: string): AnimationKeyframe {
  return { at, value, easing }
}
