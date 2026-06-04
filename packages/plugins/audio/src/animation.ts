import type { QuaEngineInterface } from '@quajs/engine'
import type {
  AnimationTimeline,
  PlayAnimationOptions,
} from '@quajs/plugin-animation'
import type {
  AnimationFillMode,
  AnimationInterpolation,
  AnimationTime,
} from '@quajs/render-core'
import { playTimelineWithEngine } from '@quajs/plugin-animation'

export type AudioAnimationTarget
  = | `audioBus:${string}`
    | `audioTrack:${string}`

export interface AudioGainKeyframe {
  at: AnimationTime
  gainDb: number
  easing?: string
}

export interface AudioGainTimelineOptions {
  id?: string
  duration: number
  target?: AudioAnimationTarget
  playbackRate?: number
  delay?: number
  loop?: boolean | number
  fill?: AnimationFillMode
  commit?: AnimationTimeline['commit']
  interpolation?: AnimationInterpolation
  metadata?: Readonly<Record<string, unknown>>
}

export interface AudioFadeOptions extends Omit<AudioGainTimelineOptions, 'duration'> {
  duration?: number
  fromGainDb?: number
  toGainDb?: number
}

export function audioBusTarget(busId: string): AudioAnimationTarget {
  return `audioBus:${busId}`
}

export function audioTrackTarget(trackId: string): AudioAnimationTarget {
  return `audioTrack:${trackId}`
}

export function bgmAudioTrackTarget(trackId = 'bgm'): AudioAnimationTarget {
  return audioTrackTarget(trackId)
}

export function createAudioGainTimeline(
  keyframes: readonly AudioGainKeyframe[],
  options: AudioGainTimelineOptions,
): AnimationTimeline {
  return {
    id: options.id,
    duration: options.duration,
    playbackRate: options.playbackRate,
    delay: options.delay,
    loop: options.loop,
    fill: options.fill,
    commit: options.commit,
    metadata: options.metadata,
    tracks: [{
      target: options.target || audioBusTarget('bgm'),
      property: 'gainDb',
      interpolation: options.interpolation,
      keyframes: keyframes.map(keyframe => ({
        at: keyframe.at,
        value: keyframe.gainDb,
        easing: keyframe.easing,
      })),
    }],
  }
}

export async function playAudioGainTimelineWithEngine(
  engine: QuaEngineInterface,
  timeline: AnimationTimeline,
  options: PlayAnimationOptions = {},
) {
  return playTimelineWithEngine(engine, timeline, options)
}

export function fadeAudioGain(options: AudioFadeOptions = {}): AnimationTimeline {
  const duration = options.duration ?? 1000
  return createAudioGainTimeline([
    { at: 0, gainDb: options.fromGainDb ?? -48 },
    { at: duration, gainDb: options.toGainDb ?? 0 },
  ], {
    ...normalizeFadeOptions(options, duration),
  })
}

export function fadeBgmIn(options: AudioFadeOptions = {}): AnimationTimeline {
  return fadeAudioGain({
    target: options.target || bgmAudioTrackTarget(),
    fromGainDb: options.fromGainDb ?? -48,
    toGainDb: options.toGainDb ?? 0,
    ...options,
  })
}

export function fadeBgmOut(options: AudioFadeOptions = {}): AnimationTimeline {
  return fadeAudioGain({
    target: options.target || bgmAudioTrackTarget(),
    fromGainDb: options.fromGainDb ?? 0,
    toGainDb: options.toGainDb ?? -48,
    ...options,
  })
}

function normalizeFadeOptions(options: AudioFadeOptions, duration: number): AudioGainTimelineOptions {
  return {
    id: options.id,
    target: options.target,
    duration,
    playbackRate: options.playbackRate,
    delay: options.delay,
    loop: options.loop,
    fill: options.fill,
    commit: options.commit,
    interpolation: options.interpolation,
    metadata: options.metadata,
  }
}
