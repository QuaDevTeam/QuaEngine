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

export type BackgroundMotionTarget = 'background:main' | `backgroundLayer:${string}`

export interface BackgroundMotionKeyframe {
  at: AnimationTime
  x?: number
  y?: number
  scale?: number
  rotation?: number
  opacity?: number
  blur?: number
  brightness?: number
  contrast?: number
  saturate?: number
  hueRotate?: number
  grayscale?: number
  sepia?: number
  easing?: AnimationTimingFunction
}

export interface BackgroundMotionTimelineOptions {
  id?: string
  duration: number
  playbackRate?: number
  loop?: boolean | number
  fill?: AnimationFillMode
  commit?: AnimationTimeline['commit']
  metadata?: Readonly<Record<string, unknown>>
}

export interface BackgroundMotionPresetOptions extends Omit<BackgroundMotionTimelineOptions, 'duration'> {
  target?: BackgroundMotionTarget
  duration?: number
  from?: number
  to?: number
  x?: number
  y?: number
  fromX?: number
  toX?: number
  fromY?: number
  toY?: number
  opacityFrom?: number
  opacityTo?: number
}

export function createBackgroundMotionTimeline(
  target: BackgroundMotionTarget,
  keyframes: readonly BackgroundMotionKeyframe[],
  options: BackgroundMotionTimelineOptions,
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

export async function playBackgroundMotionWithEngine(
  engine: QuaEngineInterface,
  motion: AnimationTimeline,
  options: PlayAnimationOptions = {},
) {
  return playTimelineWithEngine(engine, motion, options)
}

export function zoomIn(options: BackgroundMotionPresetOptions = {}): AnimationTimeline {
  const from = options.from ?? 1
  const to = options.to ?? 1.12
  return createBackgroundMotionTimeline(options.target || 'background:main', [
    { at: 0, scale: from },
    { at: options.duration ?? 1000, scale: to },
  ], normalizePresetOptions(options))
}

export function zoomOut(options: BackgroundMotionPresetOptions = {}): AnimationTimeline {
  const from = options.from ?? 1.12
  const to = options.to ?? 1
  return createBackgroundMotionTimeline(options.target || 'background:main', [
    { at: 0, scale: from },
    { at: options.duration ?? 1000, scale: to },
  ], normalizePresetOptions(options))
}

export function pan(options: BackgroundMotionPresetOptions = {}): AnimationTimeline {
  return createBackgroundMotionTimeline(options.target || 'background:main', [
    { at: 0, x: options.fromX ?? 0, y: options.fromY ?? 0 },
    { at: options.duration ?? 1000, x: options.toX ?? options.x ?? 0, y: options.toY ?? options.y ?? 0 },
  ], normalizePresetOptions(options))
}

export function kenBurns(options: BackgroundMotionPresetOptions = {}): AnimationTimeline {
  return createBackgroundMotionTimeline(options.target || 'background:main', [
    {
      at: 0,
      x: options.fromX ?? 0,
      y: options.fromY ?? 0,
      scale: options.from ?? 1,
    },
    {
      at: options.duration ?? 4000,
      x: options.toX ?? options.x ?? 0,
      y: options.toY ?? options.y ?? 0,
      scale: options.to ?? 1.12,
    },
  ], normalizePresetOptions(options))
}

export function layerDrift(options: BackgroundMotionPresetOptions = {}): AnimationTimeline {
  return pan({
    ...options,
    target: options.target || 'backgroundLayer:layer',
    duration: options.duration ?? 3000,
    toX: options.toX ?? options.x ?? 40,
    toY: options.toY ?? options.y ?? 0,
  })
}

export function fadeZoom(options: BackgroundMotionPresetOptions = {}): AnimationTimeline {
  return createBackgroundMotionTimeline(options.target || 'background:main', [
    {
      at: 0,
      scale: options.from ?? 1,
      opacity: options.opacityFrom ?? 0,
    },
    {
      at: options.duration ?? 1000,
      scale: options.to ?? 1.08,
      opacity: options.opacityTo ?? 1,
    },
  ], normalizePresetOptions(options))
}

export const backgroundMotionPresets = {
  zoomIn,
  zoomOut,
  pan,
  kenBurns,
  layerDrift,
  fadeZoom,
} as const

function normalizePresetOptions(options: BackgroundMotionPresetOptions): BackgroundMotionTimelineOptions {
  return {
    id: options.id,
    duration: options.duration ?? 1000,
    playbackRate: options.playbackRate,
    loop: options.loop,
    fill: options.fill,
    commit: options.commit,
    metadata: options.metadata,
  }
}

function createTracks(
  target: BackgroundMotionTarget,
  keyframes: readonly BackgroundMotionKeyframe[],
): AnimationTimeline['tracks'] {
  return [
    createTrack(target, 'x', keyframes),
    createTrack(target, 'y', keyframes),
    createTrack(target, 'scale', keyframes),
    createTrack(target, 'rotation', keyframes),
    createTrack(target, 'opacity', keyframes),
    createTrack(target, 'composition.filter.blur', keyframes, 'blur'),
    createTrack(target, 'composition.filter.brightness', keyframes, 'brightness'),
    createTrack(target, 'composition.filter.contrast', keyframes, 'contrast'),
    createTrack(target, 'composition.filter.saturate', keyframes, 'saturate'),
    createTrack(target, 'composition.filter.hueRotate', keyframes, 'hueRotate'),
    createTrack(target, 'composition.filter.grayscale', keyframes, 'grayscale'),
    createTrack(target, 'composition.filter.sepia', keyframes, 'sepia'),
  ].filter((track): track is NonNullable<typeof track> => Boolean(track))
}

function createTrack(
  target: BackgroundMotionTarget,
  property: string,
  keyframes: readonly BackgroundMotionKeyframe[],
  key: keyof BackgroundMotionKeyframe = property as keyof BackgroundMotionKeyframe,
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
