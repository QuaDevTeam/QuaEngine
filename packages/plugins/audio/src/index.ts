import type { QuaEngineInterface } from '@quajs/engine'
import type {
  AudioAutomationCurve,
  AudioAutomationOptions,
  AudioAutomationProjection,
  AudioBusId,
  AudioChapterDirectiveOptions,
  AudioDefaultsProjection,
  AudioEqBand,
  AudioEqOptions,
  AudioGainOptions,
  AudioPauseOptions,
  AudioPlayBgmOptions,
  AudioPlayVoiceOptions,
  AudioResumeOptions,
  AudioSeekOptions,
  AudioStopOptions,
  AudioTrackEventPayload,
  AudioTrackProjection,
  AudioViewProjection,
} from './contracts'
import { BaseEnginePlugin } from '@quajs/engine'
import {
  AUDIO_PLUGIN_ID,
  AudioRenderToLogicEvents as AudioEvents,
  cloneAudioBusProjection,
  cloneAudioProjection,
  createInitialAudioProjection,
  onAudioRenderToLogic,
} from './contracts'
import { audioDecoratorMappings } from './script-compiler'

export {
  AUDIO_PLUGIN_ID,
  AUDIO_RENDERER_ENTRY,
  AudioRenderToLogicEvents,
  cloneAudioProjection,
  createInitialAudioProjection,
  dbToGain,
  emitAudioRenderToLogic,
  onAudioRenderToLogic,
} from './contracts'

export { audioDecoratorMappings, createAudioDecoratorCompiler, scriptCompiler } from './script-compiler'

export type {
  AudioAutomationCurve,
  AudioAutomationOptions,
  AudioAutomationProjection,
  AudioBusId,
  AudioEqBand,
  AudioEqOptions,
  AudioGainOptions,
  AudioPauseOptions,
  AudioPlayBgmOptions,
  AudioPlayVoiceOptions,
  AudioResumeOptions,
  AudioSeekOptions,
  AudioStopOptions,
  AudioTrackEventPayload,
  AudioTrackProjection,
  AudioTrackState,
  AudioViewProjection,
  AudioChapterDirectiveOptions,
} from './contracts'

export interface AudioPluginOptions {
  defaultProjection?: Partial<AudioViewProjection>
}

export class AudioPlugin extends BaseEnginePlugin {
  readonly name = '@quajs/plugin-audio'
  readonly id = AUDIO_PLUGIN_ID
  readonly version = '0.1.0'
  readonly description = 'Audio playback, gain, EQ, automation, and chapter-aware voice playback'
  private disposers: Array<() => void> = []

  protected setup(): void {
    const engine = this.ctx!.engine
    const pipeline = this.ctx!.pipeline
    this.disposers.push(
      onAudioRenderToLogic(pipeline, AudioEvents.ENDED, payload => {
        return handleTrackEnded(engine, payload)
      }),
    )
    this.disposers.push(
      onAudioRenderToLogic(pipeline, AudioEvents.INTERRUPTED, payload => {
        return handleTrackInterrupted(engine, payload)
      }),
    )
    this.disposers.push(
      onAudioRenderToLogic(pipeline, AudioEvents.UNLOCKED, async () => {
        await markAudioUnlocked(engine)
      }),
    )
    this.disposers.push(
      onAudioRenderToLogic(pipeline, AudioEvents.ERROR, async payload => {
        const current = getAudioProjection(engine)
        await engine.setPluginProjection(AUDIO_PLUGIN_ID, {
          ...current,
          revision: current.revision + 1,
        })
        void payload
      }),
    )
  }

  override async destroy(): Promise<void> {
    while (this.disposers.length > 0) {
      this.disposers.pop()?.()
    }
    await super.destroy?.()
  }

  registerAPIs() {
    return {
      pluginName: this.name,
      apis: [
        { name: 'configureAudioChapterWithEngine', fn: configureAudioChapterWithEngine, module: this.name },
        { name: 'playVoiceWithEngine', fn: playVoiceWithEngine, module: this.name },
        { name: 'playBGMWithEngine', fn: playBGMWithEngine, module: this.name },
        { name: 'setAudioGainWithEngine', fn: setAudioGainWithEngine, module: this.name },
        { name: 'setAudioEqWithEngine', fn: setAudioEqWithEngine, module: this.name },
        { name: 'setAudioAutomationWithEngine', fn: setAudioAutomationWithEngine, module: this.name },
        { name: 'stopAudioWithEngine', fn: stopAudioWithEngine, module: this.name },
        { name: 'pauseAudioWithEngine', fn: pauseAudioWithEngine, module: this.name },
        { name: 'resumeAudioWithEngine', fn: resumeAudioWithEngine, module: this.name },
        { name: 'seekAudioWithEngine', fn: seekAudioWithEngine, module: this.name },
        { name: 'stopVoiceWithEngine', fn: stopVoiceWithEngine, module: this.name },
        { name: 'stopBGMWithEngine', fn: stopBGMWithEngine, module: this.name },
      ],
      decorators: audioDecoratorMappings,
    }
  }
}

export function audioChapterDirective(): void {
  // Intentionally compile-time only. The script compiler consumes this decorator.
}

export function lineIdDirective(): void {
  // Intentionally compile-time only. The script compiler consumes this decorator.
}

export async function configureAudioChapterWithEngine(
  engine: QuaEngineInterface,
  chapterId: string,
  options: AudioChapterDirectiveOptions = {},
): Promise<void> {
  const projection = getAudioProjection(engine)
  const next = cloneAudioProjection(projection)
  next.chapter = {
    chapterId,
    voiceMap: options.voiceMap ? { ...options.voiceMap } : undefined,
    bgm: options.bgm,
    defaults: cloneAudioDefaultsProjection(options.defaults),
    metadata: options.metadata ? { ...options.metadata } : undefined,
  }
  next.currentLineId = undefined
  next.revision += 1

  if (options.bgm) {
    const bgmOptions = mergeBgmOptions(options.defaults?.bgm, {
      id: next.bgm?.id || 'bgm',
      chapterId,
    })
    next.bgm = createBgmProjection(options.bgm, bgmOptions, next)
  }

  await engine.setPluginProjection(AUDIO_PLUGIN_ID, next)
}

export async function playVoiceWithEngine(
  engine: QuaEngineInterface,
  assetKey: string,
  options: AudioPlayVoiceOptions = {},
): Promise<void> {
  const projection = getAudioProjection(engine)
  const nextVoice = createVoiceProjection(assetKey, mergeVoiceOptions(projection, options), projection)
  await engine.setPluginProjection(AUDIO_PLUGIN_ID, {
    ...projection,
    revision: projection.revision + 1,
    chapter: mergeChapterProjection(projection.chapter, options.chapterId),
    currentLineId: options.lineId || projection.currentLineId,
    voices: updateTrackList(projection.voices, nextVoice),
  })
}

export async function playBGMWithEngine(
  engine: QuaEngineInterface,
  assetKey: string,
  options: AudioPlayBgmOptions = {},
): Promise<void> {
  const projection = getAudioProjection(engine)
  const next = createBgmProjection(assetKey, mergeBgmOptions(projection.chapter?.defaults?.bgm, options, projection), projection)
  await engine.setPluginProjection(AUDIO_PLUGIN_ID, {
    ...projection,
    revision: projection.revision + 1,
    chapter: mergeChapterProjection(projection.chapter, options.chapterId),
    bgm: next,
  })
}

export async function setAudioGainWithEngine(
  engine: QuaEngineInterface,
  target: AudioBusId | string,
  gainDbOrCurve: number | AudioAutomationCurve,
  options: AudioGainOptions = {},
): Promise<void> {
  const projection = getAudioProjection(engine)
  const next = cloneAudioProjection(projection)
  applyGain(next, target, gainDbOrCurve, options)
  await engine.setPluginProjection(AUDIO_PLUGIN_ID, next)
}

export async function setAudioEqWithEngine(
  engine: QuaEngineInterface,
  target: AudioBusId | string,
  bands: readonly AudioEqBand[],
  options: AudioEqOptions = {},
): Promise<void> {
  const projection = getAudioProjection(engine)
  const next = cloneAudioProjection(projection)
  applyEq(next, target, bands, options)
  await engine.setPluginProjection(AUDIO_PLUGIN_ID, next)
}

export async function setAudioAutomationWithEngine(
  engine: QuaEngineInterface,
  target: AudioBusId | string,
  propertyPath: string,
  curve: AudioAutomationCurve,
  options: AudioAutomationOptions = {},
): Promise<void> {
  const projection = getAudioProjection(engine)
  const next = cloneAudioProjection(projection)
  applyAutomation(next, target, propertyPath, curve, options)
  await engine.setPluginProjection(AUDIO_PLUGIN_ID, next)
}

export async function stopAudioWithEngine(
  engine: QuaEngineInterface,
  target: AudioBusId | string = 'voice',
  options: AudioStopOptions = {},
): Promise<void> {
  const projection = getAudioProjection(engine)
  const next = cloneAudioProjection(projection)
  if (target === 'master') {
    next.bgm = next.bgm ? { ...next.bgm, state: 'stopping', fadeOutMs: options.fadeOutMs ?? next.bgm.fadeOutMs } : undefined
    next.voices = next.voices.map(track => ({ ...track, state: 'stopping', fadeOutMs: options.fadeOutMs ?? track.fadeOutMs }))
  }
  else if (target === 'bgm') {
    next.bgm = next.bgm ? { ...next.bgm, state: 'stopping', fadeOutMs: options.fadeOutMs ?? next.bgm.fadeOutMs } : undefined
  }
  else if (target === 'voice') {
    next.voices = next.voices.map(track => ({ ...track, state: 'stopping', fadeOutMs: options.fadeOutMs ?? track.fadeOutMs }))
  }
  else {
    next.voices = next.voices.map(track =>
      track.id === target || track.lineId === target
        ? { ...track, state: 'stopping', fadeOutMs: options.fadeOutMs ?? track.fadeOutMs }
        : track,
    )
    if (next.bgm && (next.bgm.id === target || next.bgm.lineId === target)) {
      next.bgm = { ...next.bgm, state: 'stopping', fadeOutMs: options.fadeOutMs ?? next.bgm.fadeOutMs }
    }
  }
  next.revision += 1
  await engine.setPluginProjection(AUDIO_PLUGIN_ID, next)
}

export async function pauseAudioWithEngine(
  engine: QuaEngineInterface,
  target: AudioBusId | string = 'voice',
  _options: AudioPauseOptions = {},
): Promise<void> {
  const projection = getAudioProjection(engine)
  const next = cloneAudioProjection(projection)
  mutateTracks(next, target, track => ({ ...track, state: 'paused' }))
  next.revision += 1
  await engine.setPluginProjection(AUDIO_PLUGIN_ID, next)
}

export async function resumeAudioWithEngine(
  engine: QuaEngineInterface,
  target: AudioBusId | string = 'voice',
  _options: AudioResumeOptions = {},
): Promise<void> {
  const projection = getAudioProjection(engine)
  const next = cloneAudioProjection(projection)
  mutateTracks(next, target, track => ({ ...track, state: 'playing' }))
  next.revision += 1
  await engine.setPluginProjection(AUDIO_PLUGIN_ID, next)
}

export async function seekAudioWithEngine(
  engine: QuaEngineInterface,
  target: AudioBusId | string = 'voice',
  positionMs = 0,
  _options: AudioSeekOptions = {},
): Promise<void> {
  const projection = getAudioProjection(engine)
  const next = cloneAudioProjection(projection)
  mutateTracks(next, target, track => ({ ...track, seekMs: positionMs, state: 'playing' }))
  next.revision += 1
  await engine.setPluginProjection(AUDIO_PLUGIN_ID, next)
}

export async function stopVoiceWithEngine(
  engine: QuaEngineInterface,
  target: AudioBusId | string = 'voice',
  options: AudioStopOptions = {},
): Promise<void> {
  await stopAudioWithEngine(engine, target, options)
}

export async function stopBGMWithEngine(
  engine: QuaEngineInterface,
  target: AudioBusId | string = 'bgm',
  options: AudioStopOptions = {},
): Promise<void> {
  await stopAudioWithEngine(engine, target, options)
}

export function getAudioProjection(engine: QuaEngineInterface): AudioViewProjection {
  return engine.getPluginProjection<AudioViewProjection>(AUDIO_PLUGIN_ID) || createInitialAudioProjection()
}

function mergeChapterProjection(
  current: AudioViewProjection['chapter'] | undefined,
  chapterId?: string,
): AudioViewProjection['chapter'] | undefined {
  if (!current && !chapterId) {
    return current
  }
  return {
    ...(current || {}),
    chapterId: chapterId || current?.chapterId || '',
  }
}

function cloneAudioDefaultsProjection(
  defaults?: AudioDefaultsProjection,
): AudioDefaultsProjection | undefined {
  if (!defaults) {
    return undefined
  }
  return {
    master: defaults.master ? cloneAudioBusProjection(defaults.master) : undefined,
    bgm: defaults.bgm ? cloneAudioBusProjection(defaults.bgm) : undefined,
    voice: defaults.voice ? cloneAudioBusProjection(defaults.voice) : undefined,
  }
}

function mergeVoiceOptions(
  projection: AudioViewProjection,
  options: AudioPlayVoiceOptions = {},
): AudioPlayVoiceOptions {
  const defaults = projection.chapter?.defaults?.voice
  return {
    ...options,
    chapterId: options.chapterId || projection.chapter?.chapterId,
    loop: options.loop ?? defaults?.loop,
    interruptible: options.interruptible ?? defaults?.interruptible,
    gainDb: options.gainDb ?? defaults?.gainDb,
    fadeInMs: options.fadeInMs ?? defaults?.fadeInMs,
    fadeOutMs: options.fadeOutMs ?? defaults?.fadeOutMs,
    crossfadeMs: options.crossfadeMs ?? defaults?.crossfadeMs,
    seekMs: options.seekMs ?? defaults?.seekMs,
    eq: options.eq ?? defaults?.eq,
    automation: options.automation ?? defaults?.automation,
    metadata: options.metadata ?? defaults?.metadata,
  }
}

function mergeBgmOptions(
  defaults: Partial<AudioTrackProjection> | undefined,
  options: AudioPlayBgmOptions = {},
  projection?: AudioViewProjection,
): AudioPlayBgmOptions {
  return {
    ...options,
    chapterId: options.chapterId || projection?.chapter?.chapterId,
    loop: options.loop ?? defaults?.loop ?? true,
    gainDb: options.gainDb ?? defaults?.gainDb,
    fadeInMs: options.fadeInMs ?? defaults?.fadeInMs,
    fadeOutMs: options.fadeOutMs ?? defaults?.fadeOutMs,
    crossfadeMs: options.crossfadeMs ?? defaults?.crossfadeMs,
    seekMs: options.seekMs ?? defaults?.seekMs,
    eq: options.eq ?? defaults?.eq,
    automation: options.automation ?? defaults?.automation,
    metadata: options.metadata ?? defaults?.metadata,
  }
}

function createVoiceProjection(
  assetKey: string,
  options: AudioPlayVoiceOptions,
  projection: AudioViewProjection,
): AudioTrackProjection {
  return {
    id: options.id || options.lineId || `voice:${Date.now()}`,
    kind: 'voice',
    assetKey,
    chapterId: options.chapterId || projection.chapter?.chapterId,
    lineId: options.lineId || projection.currentLineId,
    state: 'playing',
    loop: options.loop ?? false,
    interruptible: options.interruptible ?? true,
    gainDb: options.gainDb ?? 0,
    eq: options.eq,
    automation: options.automation,
    fadeInMs: options.fadeInMs,
    fadeOutMs: options.fadeOutMs,
    crossfadeMs: options.crossfadeMs,
    seekMs: options.seekMs,
    metadata: options.metadata,
  }
}

function createBgmProjection(
  assetKey: string,
  options: AudioPlayBgmOptions,
  projection: AudioViewProjection,
): AudioTrackProjection {
  return {
    id: options.id || 'bgm',
    kind: 'bgm',
    assetKey,
    chapterId: options.chapterId || projection.chapter?.chapterId,
    state: 'playing',
    loop: options.loop ?? true,
    interruptible: false,
    gainDb: options.gainDb ?? 0,
    eq: options.eq,
    automation: options.automation,
    fadeInMs: options.fadeInMs,
    fadeOutMs: options.fadeOutMs,
    crossfadeMs: options.crossfadeMs,
    seekMs: options.seekMs,
    metadata: options.metadata,
  }
}

function updateTrackList(tracks: readonly AudioTrackProjection[], nextTrack: AudioTrackProjection): AudioTrackProjection[] {
  return [
    ...tracks.filter(track => track.id !== nextTrack.id && track.lineId !== nextTrack.lineId),
    nextTrack,
  ]
}

function mutateTracks(
  projection: AudioViewProjection,
  target: AudioBusId | string,
  mapper: (track: AudioTrackProjection) => AudioTrackProjection,
): void {
  if (target === 'master') {
    projection.voices = projection.voices.map(mapper)
    if (projection.bgm) {
      projection.bgm = mapper(projection.bgm)
    }
    return
  }
  if (target === 'voice') {
    projection.voices = projection.voices.map(mapper)
    return
  }
  if (target === 'bgm') {
    projection.bgm = projection.bgm ? mapper(projection.bgm) : projection.bgm
    return
  }
  projection.voices = projection.voices.map(track => track.id === target || track.lineId === target ? mapper(track) : track)
  if (projection.bgm && (projection.bgm.id === target || projection.bgm.lineId === target)) {
    projection.bgm = mapper(projection.bgm)
  }
}

function applyGain(
  projection: AudioViewProjection,
  target: AudioBusId | string,
  gainDbOrCurve: number | AudioAutomationCurve,
  options: AudioGainOptions,
): void {
  const automation = isCurve(gainDbOrCurve)
    ? [{
        target,
        propertyPath: 'gainDb',
        curve: gainDbOrCurve,
        options: options.metadata ? { metadata: options.metadata } : undefined,
      }]
    : options.automation

  if (target === 'master' || target === 'bgm' || target === 'voice') {
    const bus = projection.buses[target]
    bus.gainDb = isCurve(gainDbOrCurve) ? bus.gainDb : gainDbOrCurve
    bus.automation = automation
    return
  }

  mutateTracks(projection, target, track => ({
    ...track,
    gainDb: isCurve(gainDbOrCurve) ? track.gainDb : gainDbOrCurve,
    automation,
  }))
}

function applyEq(
  projection: AudioViewProjection,
  target: AudioBusId | string,
  bands: readonly AudioEqBand[],
  options: AudioEqOptions,
): void {
  if (target === 'master' || target === 'bgm' || target === 'voice') {
    projection.buses[target] = {
      ...projection.buses[target],
      eq: bands,
      automation: options.automation,
    }
    return
  }
  mutateTracks(projection, target, track => ({
    ...track,
    eq: bands,
    automation: options.automation,
  }))
}

function applyAutomation(
  projection: AudioViewProjection,
  target: AudioBusId | string,
  propertyPath: string,
  curve: AudioAutomationCurve,
  options: AudioAutomationOptions,
): void {
  const automation: AudioAutomationProjection = {
    target,
    propertyPath,
    curve,
    options: options.metadata ? { metadata: options.metadata } : undefined,
  }
  if (target === 'master' || target === 'bgm' || target === 'voice') {
    const bus = projection.buses[target]
    bus.automation = [...(bus.automation || []), automation]
    return
  }
  mutateTracks(projection, target, track => ({
    ...track,
    automation: [...(track.automation || []), automation],
  }))
}

function handleTrackEnded(engine: QuaEngineInterface, payload: AudioTrackEventPayload): Promise<void> {
  const projection = getAudioProjection(engine)
  const next = cloneAudioProjection(projection)
  if (payload.channel === 'bgm') {
    if (next.bgm && next.bgm.id === payload.id) {
      next.bgm = undefined
    }
  }
  else {
    next.voices = next.voices.filter(track => track.id !== payload.id)
  }
  next.revision += 1
  return engine.setPluginProjection(AUDIO_PLUGIN_ID, next)
}

function handleTrackInterrupted(engine: QuaEngineInterface, payload: AudioTrackEventPayload): Promise<void> {
  return handleTrackEnded(engine, payload)
}

function markAudioUnlocked(engine: QuaEngineInterface): Promise<void> {
  const projection = getAudioProjection(engine)
  return engine.setPluginProjection(AUDIO_PLUGIN_ID, {
    ...projection,
    unlocked: true,
    revision: projection.revision + 1,
  })
}

function isCurve(value: number | AudioAutomationCurve): value is AudioAutomationCurve {
  return typeof value === 'object' && value !== null && 'points' in value
}
