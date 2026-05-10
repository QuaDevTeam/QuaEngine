import type { Pipeline, PipelineContext } from '@quajs/pipeline'

export const AUDIO_PLUGIN_ID = 'audio' as const

export const AUDIO_RENDERER_ENTRY = '@quajs/renderer-vue/plugins/audio' as const

export type AudioBusId = 'master' | 'bgm' | 'voice'
export type AudioTrackKind = 'bgm' | 'voice'
export type AudioTrackState = 'idle' | 'queued' | 'playing' | 'paused' | 'stopping' | 'stopped'
export type AudioEqBandType =
  | 'lowpass'
  | 'highpass'
  | 'bandpass'
  | 'lowshelf'
  | 'highshelf'
  | 'peaking'
  | 'notch'
  | 'allpass'

export interface AudioAutomationPoint {
  at: number
  value: number
  easing?: string
}

export interface AudioAutomationCurve {
  points: readonly AudioAutomationPoint[]
  duration?: number
  loop?: boolean
}

export interface AudioEqBand {
  type?: AudioEqBandType
  frequency: number
  gainDb?: number
  q?: number
  detune?: number
}

export interface AudioBusProjection {
  gainDb?: number
  eq?: readonly AudioEqBand[]
  automation?: readonly AudioAutomationProjection[]
}

export interface AudioAutomationProjection {
  target: AudioBusId | string
  propertyPath: string
  curve: AudioAutomationCurve
  options?: Readonly<Record<string, unknown>>
}

export interface AudioTrackProjection {
  id: string
  kind: AudioTrackKind
  assetKey: string
  chapterId?: string
  lineId?: string
  state: AudioTrackState
  loop?: boolean
  interruptible?: boolean
  gainDb?: number
  eq?: readonly AudioEqBand[]
  automation?: readonly AudioAutomationProjection[]
  fadeInMs?: number
  fadeOutMs?: number
  crossfadeMs?: number
  seekMs?: number
  offsetMs?: number
  metadata?: Readonly<Record<string, unknown>>
}

export interface AudioDefaultsProjection {
  master?: AudioBusProjection
  bgm?: Partial<AudioTrackProjection>
  voice?: Partial<AudioTrackProjection>
}

export interface AudioChapterProjection {
  chapterId: string
  voiceMap?: Readonly<Record<string, string>>
  bgm?: string
  defaults?: AudioDefaultsProjection
  metadata?: Readonly<Record<string, unknown>>
}

export interface AudioViewProjection {
  revision: number
  unlocked: boolean
  chapter?: AudioChapterProjection
  currentLineId?: string
  buses: {
    master: AudioBusProjection
    bgm: AudioBusProjection
    voice: AudioBusProjection
  }
  bgm?: AudioTrackProjection
  voices: readonly AudioTrackProjection[]
}

export interface AudioChapterDirectiveOptions {
  voiceMap?: Readonly<Record<string, string>>
  bgm?: string
  defaults?: AudioDefaultsProjection
  metadata?: Readonly<Record<string, unknown>>
}

export interface AudioPlayVoiceOptions {
  id?: string
  chapterId?: string
  lineId?: string
  characterId?: string
  interruptible?: boolean
  loop?: boolean
  gainDb?: number
  fadeInMs?: number
  fadeOutMs?: number
  crossfadeMs?: number
  seekMs?: number
  eq?: readonly AudioEqBand[]
  automation?: readonly AudioAutomationProjection[]
  metadata?: Readonly<Record<string, unknown>>
}

export interface AudioPlayBgmOptions {
  id?: string
  chapterId?: string
  gainDb?: number
  loop?: boolean
  fadeInMs?: number
  fadeOutMs?: number
  crossfadeMs?: number
  seekMs?: number
  eq?: readonly AudioEqBand[]
  automation?: readonly AudioAutomationProjection[]
  metadata?: Readonly<Record<string, unknown>>
}

export interface AudioGainOptions {
  fadeInMs?: number
  fadeOutMs?: number
  automation?: readonly AudioAutomationProjection[]
  metadata?: Readonly<Record<string, unknown>>
}

export interface AudioEqOptions {
  automation?: readonly AudioAutomationProjection[]
  metadata?: Readonly<Record<string, unknown>>
}

export interface AudioAutomationOptions {
  metadata?: Readonly<Record<string, unknown>>
}

export interface AudioStopOptions {
  fadeOutMs?: number
  reason?: string
  metadata?: Readonly<Record<string, unknown>>
}

export interface AudioPauseOptions {
  metadata?: Readonly<Record<string, unknown>>
}

export interface AudioResumeOptions {
  metadata?: Readonly<Record<string, unknown>>
}

export interface AudioSeekOptions {
  metadata?: Readonly<Record<string, unknown>>
}

export interface AudioTrackEventPayload {
  channel: AudioTrackKind
  id: string
  assetKey: string
  chapterId?: string
  lineId?: string
  reason?: string
  metadata?: Readonly<Record<string, unknown>>
}

export interface AudioUnlockedPayload {
  timestamp: number
}

export interface AudioErrorPayload {
  message: string
  error?: unknown
  trackId?: string
}

export const AudioRenderToLogicEvents = {
  ENDED: 'audio/ended',
  INTERRUPTED: 'audio/interrupted',
  UNLOCKED: 'audio/unlocked',
  ERROR: 'audio/error',
} as const

export type AudioRenderToLogicEvent = typeof AudioRenderToLogicEvents[keyof typeof AudioRenderToLogicEvents]

export interface AudioRenderToLogicEventPayloadMap {
  [AudioRenderToLogicEvents.ENDED]: AudioTrackEventPayload
  [AudioRenderToLogicEvents.INTERRUPTED]: AudioTrackEventPayload
  [AudioRenderToLogicEvents.UNLOCKED]: AudioUnlockedPayload
  [AudioRenderToLogicEvents.ERROR]: AudioErrorPayload
}

export function createInitialAudioProjection(): AudioViewProjection {
  return {
    revision: 0,
    unlocked: false,
    buses: {
      master: { gainDb: 0 },
      bgm: { gainDb: 0 },
      voice: { gainDb: 0 },
    },
    voices: [],
  }
}

export function cloneAudioProjection(projection: AudioViewProjection): AudioViewProjection {
  return {
    revision: projection.revision,
    unlocked: projection.unlocked,
    chapter: projection.chapter
      ? {
          ...projection.chapter,
          voiceMap: projection.chapter.voiceMap ? { ...projection.chapter.voiceMap } : undefined,
          defaults: projection.chapter.defaults
            ? {
                master: projection.chapter.defaults.master ? cloneAudioBusProjection(projection.chapter.defaults.master) : undefined,
                bgm: projection.chapter.defaults.bgm ? cloneAudioBusProjection(projection.chapter.defaults.bgm) : undefined,
                voice: projection.chapter.defaults.voice ? cloneAudioBusProjection(projection.chapter.defaults.voice) : undefined,
              }
            : undefined,
          metadata: projection.chapter.metadata ? { ...projection.chapter.metadata } : undefined,
        }
      : undefined,
    currentLineId: projection.currentLineId,
    buses: {
      master: cloneAudioBusProjection(projection.buses.master),
      bgm: cloneAudioBusProjection(projection.buses.bgm),
      voice: cloneAudioBusProjection(projection.buses.voice),
    },
    bgm: projection.bgm ? cloneAudioTrackProjection(projection.bgm) : undefined,
    voices: projection.voices.map(track => cloneAudioTrackProjection(track)),
  }
}

export function cloneAudioTrackProjection(track: AudioTrackProjection): AudioTrackProjection {
  return {
    ...track,
    eq: track.eq?.map(band => ({ ...band })),
    automation: track.automation?.map(automation => cloneAudioAutomationProjection(automation)),
    metadata: track.metadata ? { ...track.metadata } : undefined,
  }
}

export function cloneAudioBusProjection(bus: AudioBusProjection): AudioBusProjection {
  return {
    ...bus,
    eq: bus.eq?.map(band => ({ ...band })),
    automation: bus.automation?.map(automation => cloneAudioAutomationProjection(automation)),
  }
}

export function cloneAudioAutomationProjection(automation: AudioAutomationProjection): AudioAutomationProjection {
  return {
    ...automation,
    curve: {
      ...automation.curve,
      points: automation.curve.points.map(point => ({ ...point })),
    },
    options: automation.options ? { ...automation.options } : undefined,
  }
}

export function dbToGain(db: number): number {
  if (!Number.isFinite(db)) {
    return db < 0 ? 0 : 1
  }
  return Math.pow(10, db / 20)
}

export function isAudioTrackKind(value: string): value is AudioTrackKind {
  return value === 'bgm' || value === 'voice'
}

export function emitAudioRenderToLogic<T extends AudioRenderToLogicEvent>(
  pipeline: Pipeline,
  type: T,
  payload: AudioRenderToLogicEventPayloadMap[T],
): Promise<void> {
  return pipeline.emit(type, payload)
}

export function onAudioRenderToLogic<T extends AudioRenderToLogicEvent>(
  pipeline: Pipeline,
  type: T,
  handler: (payload: AudioRenderToLogicEventPayloadMap[T], context: PipelineContext<AudioRenderToLogicEventPayloadMap[T]>) => void | Promise<void>,
): () => void {
  const listener = async (context: PipelineContext<AudioRenderToLogicEventPayloadMap[T]>) => {
    await handler(context.event.payload, context)
  }
  pipeline.on(type, listener)
  return () => pipeline.off(type, listener)
}
