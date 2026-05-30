import type { EngineContext, QuaEngineInterface } from '@quajs/engine'
import type {
  AudioAutomationCurve,
  AudioAutomationOptions,
  AudioAutomationProjection,
  AudioBusId,
  AudioBusProjection,
  AudioChapterDirectiveOptions,
  AudioDefaultsProjection,
  AudioEqBand,
  AudioEqOptions,
  AudioGainOptions,
  AudioPauseOptions,
  AudioPlayAmbientOptions,
  AudioPlayBgmOptions,
  AudioPlaySfxOptions,
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

const AUDIO_SETTINGS_SCOPE = '@quajs/plugin-audio' as const
const DEFAULT_AUDIO_GAIN_DB = 0

export {
  AUDIO_PLUGIN_ID,
  AUDIO_RENDERER_ENTRY,
  AUDIO_VUE_RENDERER_ENTRY,
  AUDIO_WEB_RENDERER_ENTRY,
  AudioRenderToLogicEvents,
  cloneAudioProjection,
  createInitialAudioProjection,
  dbToGain,
  emitAudioRenderToLogic,
  onAudioRenderToLogic,
} from './contracts'
export { AUDIO_SETTINGS_SCOPE }

export type {
  AudioAutomationCurve,
  AudioAutomationOptions,
  AudioAutomationProjection,
  AudioBusId,
  AudioChapterDirectiveOptions,
  AudioEqBand,
  AudioEqOptions,
  AudioGainOptions,
  AudioPauseOptions,
  AudioPlayAmbientOptions,
  AudioPlayBgmOptions,
  AudioPlaySfxOptions,
  AudioPlayVoiceOptions,
  AudioResumeOptions,
  AudioSeekOptions,
  AudioStopOptions,
  AudioTrackEventPayload,
  AudioTrackProjection,
  AudioTrackState,
  AudioViewProjection,
} from './contracts'

export { audioDecoratorMappings, createAudioDecoratorCompiler, scriptCompiler } from './script-compiler'

export interface AudioPluginOptions {
  defaultProjection?: Partial<AudioViewProjection>
}

interface AudioDeveloperSettings {
  defaultMasterGainDb: number
  defaultBgmGainDb: number
  defaultVoiceGainDb: number
  defaultSfxGainDb: number
  defaultAmbientGainDb: number
}

interface AudioPlayerSettings {
  masterGainDb: number
  bgmGainDb: number
  voiceGainDb: number
  sfxGainDb: number
  ambientGainDb: number
}

export class AudioPlugin extends BaseEnginePlugin {
  readonly name = '@quajs/plugin-audio'
  readonly id = AUDIO_PLUGIN_ID
  readonly version = '0.1.0'
  readonly description = 'Audio playback, gain, EQ, automation, SFX, ambient, and chapter-aware voice playback'
  private disposers: Array<() => void> = []
  private projectionBeforeJump?: AudioViewProjection

  protected async setup(ctx: EngineContext): Promise<void> {
    const engine = ctx.engine
    const pipeline = ctx.pipeline
    ensureAudioProjection(engine, this.getOptions())
    this.disposers.push(
      onAudioRenderToLogic(pipeline, AudioEvents.ENDED, (payload) => {
        return handleTrackEnded(engine, payload)
      }),
    )
    this.disposers.push(
      onAudioRenderToLogic(pipeline, AudioEvents.INTERRUPTED, (payload) => {
        return handleTrackInterrupted(engine, payload)
      }),
    )
    this.disposers.push(
      onAudioRenderToLogic(pipeline, AudioEvents.UNLOCKED, async () => {
        await markAudioUnlocked(engine)
      }),
    )
    this.disposers.push(
      onAudioRenderToLogic(pipeline, AudioEvents.ERROR, async (payload) => {
        const current = getAudioProjection(engine)
        await setAudioProjection(engine, {
          ...current,
          revision: current.revision + 1,
        })
        void payload
      }),
    )
    const settingsDisposer = await registerAudioSettingsScope(ctx, this.getOptions())
    if (settingsDisposer) {
      this.disposers.push(settingsDisposer)
    }
  }

  override async destroy(): Promise<void> {
    while (this.disposers.length > 0) {
      this.disposers.pop()?.()
    }
    this.projectionBeforeJump = undefined
    await super.destroy?.()
  }

  override async onBeforeJump(ctx: EngineContext): Promise<void> {
    this.projectionBeforeJump = ctx.jump?.options.audio === 'keep'
      ? cloneAudioProjection(getAudioProjection(ctx.engine))
      : undefined
  }

  override async onAfterJump(ctx: EngineContext): Promise<void> {
    if (ctx.jump?.options.audio === 'keep' && this.projectionBeforeJump) {
      await setAudioProjection(ctx.engine, {
        ...this.projectionBeforeJump,
        revision: this.projectionBeforeJump.revision + 1,
      })
    }
    else if (ctx.jump?.options.audio === 'stop') {
      await stopAudioWithEngine(ctx.engine, 'master')
    }
    this.projectionBeforeJump = undefined
  }

  override async onBeforeRollback(): Promise<void> {
    this.projectionBeforeJump = undefined
  }

  override async onAfterRollback(): Promise<void> {
    this.projectionBeforeJump = undefined
  }

  override async onRuntimePackageUnload(ctx: EngineContext): Promise<void> {
    const packageId = ctx.runtimePackage?.package.id
    if (packageId) {
      await clearRuntimePackageAudioWithEngine(ctx.engine, packageId)
    }
  }

  registerAPIs() {
    return {
      pluginName: this.name,
      apis: [
        { name: 'configureAudioChapterWithEngine', fn: configureAudioChapterWithEngine, module: this.name },
        { name: 'playVoiceWithEngine', fn: playVoiceWithEngine, module: this.name },
        { name: 'playBGMWithEngine', fn: playBGMWithEngine, module: this.name },
        { name: 'playSFXWithEngine', fn: playSFXWithEngine, module: this.name },
        { name: 'playAmbientWithEngine', fn: playAmbientWithEngine, module: this.name },
        { name: 'setAudioGainWithEngine', fn: setAudioGainWithEngine, module: this.name },
        { name: 'setAudioEqWithEngine', fn: setAudioEqWithEngine, module: this.name },
        { name: 'setAudioAutomationWithEngine', fn: setAudioAutomationWithEngine, module: this.name },
        { name: 'stopAudioWithEngine', fn: stopAudioWithEngine, module: this.name },
        { name: 'pauseAudioWithEngine', fn: pauseAudioWithEngine, module: this.name },
        { name: 'resumeAudioWithEngine', fn: resumeAudioWithEngine, module: this.name },
        { name: 'seekAudioWithEngine', fn: seekAudioWithEngine, module: this.name },
        { name: 'stopVoiceWithEngine', fn: stopVoiceWithEngine, module: this.name },
        { name: 'stopBGMWithEngine', fn: stopBGMWithEngine, module: this.name },
        { name: 'stopSFXWithEngine', fn: stopSFXWithEngine, module: this.name },
        { name: 'stopAmbientWithEngine', fn: stopAmbientWithEngine, module: this.name },
        { name: 'stopRuntimePackageAudioWithEngine', fn: stopRuntimePackageAudioWithEngine, module: this.name },
        { name: 'clearRuntimePackageAudioWithEngine', fn: clearRuntimePackageAudioWithEngine, module: this.name },
      ],
      decorators: audioDecoratorMappings,
    }
  }

  private getOptions(): AudioPluginOptions {
    return this.options as AudioPluginOptions
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
    metadata: withCurrentRuntimeAudioMetadata(engine, options.metadata),
  }
  next.currentLineId = undefined
  next.revision += 1

  if (options.bgm) {
    const bgmOptions = withCurrentRuntimeAudioPackage(engine, mergeBgmOptions(options.defaults?.bgm, {
      id: next.bgm?.id || 'bgm',
      chapterId,
    }))
    next.bgm = createBgmProjection(options.bgm, bgmOptions, next)
  }

  await setAudioProjection(engine, next)
}

export async function playVoiceWithEngine(
  engine: QuaEngineInterface,
  assetKey: string,
  options: AudioPlayVoiceOptions = {},
): Promise<void> {
  const projection = getAudioProjection(engine)
  const nextVoice = createVoiceProjection(assetKey, withCurrentRuntimeAudioPackage(engine, mergeVoiceOptions(projection, options)), projection)
  await setAudioProjection(engine, {
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
  const next = createBgmProjection(assetKey, withCurrentRuntimeAudioPackage(engine, mergeBgmOptions(projection.chapter?.defaults?.bgm, options, projection)), projection)
  await setAudioProjection(engine, {
    ...projection,
    revision: projection.revision + 1,
    chapter: mergeChapterProjection(projection.chapter, options.chapterId),
    bgm: next,
  })
}

export async function playSFXWithEngine(
  engine: QuaEngineInterface,
  assetKey: string,
  options: AudioPlaySfxOptions = {},
): Promise<void> {
  const projection = getAudioProjection(engine)
  const next = createSfxProjection(assetKey, withCurrentRuntimeAudioPackage(engine, mergeSfxOptions(projection, options)), projection)
  await setAudioProjection(engine, {
    ...projection,
    revision: projection.revision + 1,
    chapter: mergeChapterProjection(projection.chapter, options.chapterId),
    sfx: updateTrackList(projection.sfx, next),
  })
}

export async function playAmbientWithEngine(
  engine: QuaEngineInterface,
  assetKey: string,
  options: AudioPlayAmbientOptions = {},
): Promise<void> {
  const projection = getAudioProjection(engine)
  const next = createAmbientProjection(assetKey, withCurrentRuntimeAudioPackage(engine, mergeAmbientOptions(projection, options)), projection)
  await setAudioProjection(engine, {
    ...projection,
    revision: projection.revision + 1,
    chapter: mergeChapterProjection(projection.chapter, options.chapterId),
    ambients: updateTrackList(projection.ambients, next),
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
  await setAudioProjection(engine, next)
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
  await setAudioProjection(engine, next)
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
  await setAudioProjection(engine, next)
}

export async function stopAudioWithEngine(
  engine: QuaEngineInterface,
  target: AudioBusId | string = 'voice',
  options: AudioStopOptions = {},
): Promise<void> {
  const projection = getAudioProjection(engine)
  const next = cloneAudioProjection(projection)
  mutateTracks(next, target, track => ({ ...track, state: 'stopping', fadeOutMs: options.fadeOutMs ?? track.fadeOutMs }))
  next.revision += 1
  await setAudioProjection(engine, next)
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
  await setAudioProjection(engine, next)
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
  await setAudioProjection(engine, next)
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
  await setAudioProjection(engine, next)
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

export async function stopSFXWithEngine(
  engine: QuaEngineInterface,
  target: AudioBusId | string = 'sfx',
  options: AudioStopOptions = {},
): Promise<void> {
  await stopAudioWithEngine(engine, target, options)
}

export async function stopAmbientWithEngine(
  engine: QuaEngineInterface,
  target: AudioBusId | string = 'ambient',
  options: AudioStopOptions = {},
): Promise<void> {
  await stopAudioWithEngine(engine, target, options)
}

export async function stopRuntimePackageAudioWithEngine(
  engine: QuaEngineInterface,
  packageId: string,
  options: AudioStopOptions = {},
): Promise<void> {
  const projection = getAudioProjection(engine)
  const next = cloneAudioProjection(projection)
  let changed = false
  const stopTrack = (track: AudioTrackProjection): AudioTrackProjection => {
    if (!trackRequiresPackage(track, packageId)) {
      return track
    }
    changed = true
    return {
      ...track,
      state: 'stopping',
      fadeOutMs: options.fadeOutMs ?? track.fadeOutMs,
    }
  }

  next.voices = next.voices.map(stopTrack)
  next.sfx = next.sfx.map(stopTrack)
  next.ambients = next.ambients.map(stopTrack)
  if (next.bgm) {
    next.bgm = stopTrack(next.bgm)
  }
  if (metadataRequiresPackage(next.chapter?.metadata, packageId)) {
    next.chapter = undefined
    next.currentLineId = undefined
    changed = true
  }
  if (!changed) {
    return
  }
  next.revision += 1
  await setAudioProjection(engine, next)
}

export async function clearRuntimePackageAudioWithEngine(
  engine: QuaEngineInterface,
  packageId: string,
): Promise<void> {
  const projection = getAudioProjection(engine)
  const next = cloneAudioProjection(projection)
  let changed = false
  next.voices = next.voices.filter(track => !trackRequiresPackage(track, packageId))
  next.sfx = next.sfx.filter(track => !trackRequiresPackage(track, packageId))
  next.ambients = next.ambients.filter(track => !trackRequiresPackage(track, packageId))
  changed ||= next.voices.length !== projection.voices.length
    || next.sfx.length !== projection.sfx.length
    || next.ambients.length !== projection.ambients.length
  if (next.bgm && trackRequiresPackage(next.bgm, packageId)) {
    next.bgm = undefined
    changed = true
  }
  if (metadataRequiresPackage(next.chapter?.metadata, packageId)) {
    next.chapter = undefined
    next.currentLineId = undefined
    changed = true
  }
  if (!changed) {
    return
  }
  next.revision += 1
  await setAudioProjection(engine, next)
}

export function getAudioProjection(engine: QuaEngineInterface): AudioViewProjection {
  return engine.getPluginProjection<AudioViewProjection>(AUDIO_PLUGIN_ID) || createInitialAudioProjection()
}

function ensureAudioProjection(engine: QuaEngineInterface, options: AudioPluginOptions): AudioViewProjection {
  const existing = engine.getPluginProjection<AudioViewProjection>(AUDIO_PLUGIN_ID)
  if (existing) {
    return existing
  }
  const projection = withAudioRequiredRuntimePackages(mergeAudioProjectionDefaults(createInitialAudioProjection(), options.defaultProjection))
  engine.getStore().commit('setPluginProjection', {
    pluginId: AUDIO_PLUGIN_ID,
    projection,
  })
  return projection
}

function setAudioProjection(engine: QuaEngineInterface, projection: AudioViewProjection): Promise<void> {
  return engine.setPluginProjection(AUDIO_PLUGIN_ID, withAudioRequiredRuntimePackages(projection))
}

function withAudioRequiredRuntimePackages(projection: AudioViewProjection): AudioViewProjection {
  const requiredRuntimePackages = collectActiveAudioRequiredRuntimePackages(projection)
  return {
    ...projection,
    requiredRuntimePackages,
  }
}

function collectActiveAudioRequiredRuntimePackages(projection: AudioViewProjection): string[] {
  return uniqueStrings([
    ...runtimePackagesFromMetadata(projection.chapter?.metadata),
    ...(projection.bgm ? requiredRuntimePackagesFromActiveTrack(projection.bgm) : []),
    ...projection.voices.flatMap(requiredRuntimePackagesFromActiveTrack),
    ...projection.sfx.flatMap(requiredRuntimePackagesFromActiveTrack),
    ...projection.ambients.flatMap(requiredRuntimePackagesFromActiveTrack),
  ])
}

function requiredRuntimePackagesFromActiveTrack(track: AudioTrackProjection): string[] {
  if (track.state === 'stopping' || track.state === 'stopped') {
    return []
  }
  return uniqueStrings([
    ...(track.contentPackageId ? [track.contentPackageId] : []),
    ...runtimePackagesFromMetadata(track.metadata),
  ])
}

async function registerAudioSettingsScope(
  ctx: EngineContext,
  options: AudioPluginOptions,
): Promise<(() => void) | undefined> {
  try {
    const settings = await import('@quajs/plugin-settings')
    const defaultProjection = mergeAudioProjectionDefaults(createInitialAudioProjection(), options.defaultProjection)
    const developerValues = createAudioDeveloperSettings(defaultProjection.buses)
    const unregister = settings.registerSettingsScope(ctx.engine, {
      scope: AUDIO_SETTINGS_SCOPE,
      version: 1,
      title: 'Audio',
      description: 'Audio bus defaults and player volume preferences.',
      developer: {
        schema: createAudioDeveloperSettingsSchema(),
        defaults: createAudioDeveloperSettings(createInitialAudioProjection().buses),
        values: developerValues,
      },
      player: {
        schema: createAudioPlayerSettingsSchema(),
        defaults: {
          masterGainDb: developerValues.defaultMasterGainDb,
          bgmGainDb: developerValues.defaultBgmGainDb,
          voiceGainDb: developerValues.defaultVoiceGainDb,
          sfxGainDb: developerValues.defaultSfxGainDb,
          ambientGainDb: developerValues.defaultAmbientGainDb,
        } satisfies AudioPlayerSettings,
        expose: true,
        ui: {
          label: 'Audio',
          order: 10,
          groups: {
            volume: {
              label: 'Volume',
              order: 0,
            },
          },
          controls: {
            masterGainDb: createAudioGainControl('Master', 0),
            bgmGainDb: createAudioGainControl('BGM', 1),
            voiceGainDb: createAudioGainControl('Voice', 2),
            sfxGainDb: createAudioGainControl('SFX', 3),
            ambientGainDb: createAudioGainControl('Ambient', 4),
          },
        },
      },
      apply: async ({ player }) => {
        await applyAudioPlayerSettings(ctx.engine, player)
      },
    })
    await settings.getSettingsBridge(ctx.engine)?.rebuildProjection({ reason: 'rebuild', apply: true, persist: false })
    return unregister
  }
  catch (error) {
    if (isOptionalPluginUnavailableError(error, '@quajs/plugin-settings')) {
      return undefined
    }
    throw error
  }
}

function createAudioDeveloperSettingsSchema() {
  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      defaultMasterGainDb: createAudioGainSetting('Default Master Gain'),
      defaultBgmGainDb: createAudioGainSetting('Default BGM Gain'),
      defaultVoiceGainDb: createAudioGainSetting('Default Voice Gain'),
      defaultSfxGainDb: createAudioGainSetting('Default SFX Gain'),
      defaultAmbientGainDb: createAudioGainSetting('Default Ambient Gain'),
    },
  } as const
}

function createAudioPlayerSettingsSchema() {
  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      masterGainDb: createAudioGainSetting('Master Gain'),
      bgmGainDb: createAudioGainSetting('BGM Gain'),
      voiceGainDb: createAudioGainSetting('Voice Gain'),
      sfxGainDb: createAudioGainSetting('SFX Gain'),
      ambientGainDb: createAudioGainSetting('Ambient Gain'),
    },
  } as const
}

function createAudioGainSetting(title: string) {
  return {
    type: 'number',
    title,
    minimum: -80,
    maximum: 12,
    multipleOf: 1,
    default: DEFAULT_AUDIO_GAIN_DB,
  } as const
}

function createAudioGainControl(label: string, order: number) {
  return {
    control: 'slider',
    label,
    group: 'volume',
    order,
    min: -80,
    max: 12,
    step: 1,
  } as const
}

function createAudioDeveloperSettings(buses: AudioViewProjection['buses']): AudioDeveloperSettings {
  return {
    defaultMasterGainDb: normalizeGainDb(buses.master.gainDb, DEFAULT_AUDIO_GAIN_DB),
    defaultBgmGainDb: normalizeGainDb(buses.bgm.gainDb, DEFAULT_AUDIO_GAIN_DB),
    defaultVoiceGainDb: normalizeGainDb(buses.voice.gainDb, DEFAULT_AUDIO_GAIN_DB),
    defaultSfxGainDb: normalizeGainDb(buses.sfx.gainDb, DEFAULT_AUDIO_GAIN_DB),
    defaultAmbientGainDb: normalizeGainDb(buses.ambient.gainDb, DEFAULT_AUDIO_GAIN_DB),
  }
}

async function applyAudioPlayerSettings(
  engine: QuaEngineInterface,
  player: Readonly<AudioPlayerSettings>,
): Promise<void> {
  const projection = getAudioProjection(engine)
  const next = cloneAudioProjection(projection)
  next.buses.master.gainDb = normalizeGainDb(player.masterGainDb, DEFAULT_AUDIO_GAIN_DB)
  next.buses.bgm.gainDb = normalizeGainDb(player.bgmGainDb, DEFAULT_AUDIO_GAIN_DB)
  next.buses.voice.gainDb = normalizeGainDb(player.voiceGainDb, DEFAULT_AUDIO_GAIN_DB)
  next.buses.sfx.gainDb = normalizeGainDb(player.sfxGainDb, DEFAULT_AUDIO_GAIN_DB)
  next.buses.ambient.gainDb = normalizeGainDb(player.ambientGainDb, DEFAULT_AUDIO_GAIN_DB)
  next.revision += 1
  await setAudioProjection(engine, next)
}

function mergeAudioProjectionDefaults(
  base: AudioViewProjection,
  patch?: Partial<AudioViewProjection>,
): AudioViewProjection {
  if (!patch) {
    return base
  }
  return {
    ...base,
    ...patch,
    revision: patch.revision ?? base.revision,
    unlocked: patch.unlocked ?? base.unlocked,
    buses: {
      master: mergeAudioBusProjection(base.buses.master, patch.buses?.master),
      bgm: mergeAudioBusProjection(base.buses.bgm, patch.buses?.bgm),
      voice: mergeAudioBusProjection(base.buses.voice, patch.buses?.voice),
      sfx: mergeAudioBusProjection(base.buses.sfx, patch.buses?.sfx),
      ambient: mergeAudioBusProjection(base.buses.ambient, patch.buses?.ambient),
    },
    voices: patch.voices ? patch.voices.map(track => ({ ...track })) : base.voices,
    sfx: patch.sfx ? patch.sfx.map(track => ({ ...track })) : base.sfx,
    ambients: patch.ambients ? patch.ambients.map(track => ({ ...track })) : base.ambients,
  }
}

function mergeAudioBusProjection(base: AudioBusProjection, patch?: AudioBusProjection): AudioBusProjection {
  return patch ? cloneAudioBusProjection({ ...base, ...patch }) : cloneAudioBusProjection(base)
}

function normalizeGainDb(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(12, Math.max(-80, value))
    : fallback
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
    sfx: defaults.sfx ? cloneAudioBusProjection(defaults.sfx) : undefined,
    ambient: defaults.ambient ? cloneAudioBusProjection(defaults.ambient) : undefined,
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

function mergeSfxOptions(
  projection: AudioViewProjection,
  options: AudioPlaySfxOptions = {},
): AudioPlaySfxOptions {
  const defaults = projection.chapter?.defaults?.sfx
  return {
    ...options,
    chapterId: options.chapterId || projection.chapter?.chapterId,
    lineId: options.lineId,
    loop: options.loop ?? defaults?.loop ?? false,
    interruptible: options.interruptible ?? defaults?.interruptible ?? true,
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

function mergeAmbientOptions(
  projection: AudioViewProjection,
  options: AudioPlayAmbientOptions = {},
): AudioPlayAmbientOptions {
  const defaults = projection.chapter?.defaults?.ambient
  return {
    ...options,
    chapterId: options.chapterId || projection.chapter?.chapterId,
    lineId: options.lineId,
    loop: options.loop ?? defaults?.loop ?? true,
    interruptible: options.interruptible ?? defaults?.interruptible ?? false,
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
    contentPackageId: options.contentPackageId || contentPackageIdFromMetadata(options.metadata),
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
    contentPackageId: options.contentPackageId || contentPackageIdFromMetadata(options.metadata),
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

function createSfxProjection(
  assetKey: string,
  options: AudioPlaySfxOptions,
  projection: AudioViewProjection,
): AudioTrackProjection {
  return {
    id: options.id || nextAudioTrackId('sfx'),
    kind: 'sfx',
    contentPackageId: options.contentPackageId || contentPackageIdFromMetadata(options.metadata),
    assetKey,
    chapterId: options.chapterId || projection.chapter?.chapterId,
    lineId: options.lineId,
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

function createAmbientProjection(
  assetKey: string,
  options: AudioPlayAmbientOptions,
  projection: AudioViewProjection,
): AudioTrackProjection {
  return {
    id: options.id || 'ambient',
    kind: 'ambient',
    contentPackageId: options.contentPackageId || contentPackageIdFromMetadata(options.metadata),
    assetKey,
    chapterId: options.chapterId || projection.chapter?.chapterId,
    lineId: options.lineId,
    state: 'playing',
    loop: options.loop ?? true,
    interruptible: options.interruptible ?? false,
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
    ...tracks.filter((track) => {
      const sameId = track.id === nextTrack.id
      const sameLine = track.lineId !== undefined && nextTrack.lineId !== undefined && track.lineId === nextTrack.lineId
      return !sameId && !sameLine
    }),
    nextTrack,
  ]
}

function trackRequiresPackage(track: AudioTrackProjection, packageId: string): boolean {
  return track.contentPackageId === packageId || metadataRequiresPackage(track.metadata, packageId)
}

function withCurrentRuntimeAudioPackage<
  TOptions extends { contentPackageId?: string, metadata?: Readonly<Record<string, unknown>> },
>(engine: QuaEngineInterface, options: TOptions): TOptions {
  const packageId = currentRuntimePackageId(engine)
  if (!packageId) {
    return options
  }
  const metadataContentPackageId = contentPackageIdFromMetadata(options.metadata)
  if (!options.contentPackageId && !metadataContentPackageId) {
    return {
      ...options,
      contentPackageId: packageId,
    }
  }
  if (options.contentPackageId && !metadataContentPackageId) {
    return options
  }
  const metadata = mergeRuntimePackageMetadata(options.metadata, packageId, metadataContentPackageId)
  if (metadata === options.metadata) {
    return options
  }
  return {
    ...options,
    metadata,
  }
}

function withCurrentRuntimeAudioMetadata(
  engine: QuaEngineInterface,
  metadata?: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> | undefined {
  const packageId = currentRuntimePackageId(engine)
  if (!packageId) {
    return metadata ? { ...metadata } : metadata
  }
  return mergeRuntimePackageMetadata(metadata, packageId)
}

function contentPackageIdFromMetadata(metadata?: Readonly<Record<string, unknown>>): string | undefined {
  return typeof metadata?.contentPackageId === 'string' ? metadata.contentPackageId : undefined
}

function requiredRuntimePackagesFromMetadata(metadata?: Readonly<Record<string, unknown>>): string[] {
  const value = metadata?.requiredRuntimePackages
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.length > 0)
    : []
}

function runtimePackagesFromMetadata(metadata?: Readonly<Record<string, unknown>>): string[] {
  const contentPackageId = contentPackageIdFromMetadata(metadata)
  return uniqueStrings([
    ...(contentPackageId ? [contentPackageId] : []),
    ...requiredRuntimePackagesFromMetadata(metadata),
  ])
}

function metadataRequiresPackage(metadata: Readonly<Record<string, unknown>> | undefined, packageId: string): boolean {
  return contentPackageIdFromMetadata(metadata) === packageId
    || requiredRuntimePackagesFromMetadata(metadata).includes(packageId)
}

function mergeRuntimePackageMetadata(
  metadata: Readonly<Record<string, unknown>> | undefined,
  packageId: string,
  inheritedContentPackageId?: string,
): Readonly<Record<string, unknown>> | undefined {
  const currentPackageId = contentPackageIdFromMetadata(metadata) || inheritedContentPackageId
  if (!currentPackageId) {
    return {
      ...(metadata || {}),
      contentPackageId: packageId,
    }
  }
  const requiredRuntimePackages = uniqueStrings([
    currentPackageId,
    ...requiredRuntimePackagesFromMetadata(metadata),
    packageId,
  ])
  if (currentPackageId === packageId && requiredRuntimePackagesFromMetadata(metadata).length === 0) {
    return metadata ? { ...metadata } : metadata
  }
  return {
    ...(metadata || {}),
    requiredRuntimePackages,
  }
}

function uniqueStrings(values: readonly string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)))
}

function currentRuntimePackageId(engine: QuaEngineInterface): string | undefined {
  return (engine as Partial<QuaEngineInterface>).getCurrentRuntimePackageId?.()
    || (engine as Partial<QuaEngineInterface>).getStoryPoint?.()?.contentPackageId
}

function mutateTracks(
  projection: AudioViewProjection,
  target: AudioBusId | string,
  mapper: (track: AudioTrackProjection) => AudioTrackProjection,
): void {
  if (target === 'master') {
    projection.voices = projection.voices.map(mapper)
    projection.sfx = projection.sfx.map(mapper)
    projection.ambients = projection.ambients.map(mapper)
    if (projection.bgm) {
      projection.bgm = mapper(projection.bgm)
    }
    return
  }
  if (target === 'voice') {
    projection.voices = projection.voices.map(mapper)
    return
  }
  if (target === 'sfx') {
    projection.sfx = projection.sfx.map(mapper)
    return
  }
  if (target === 'ambient') {
    projection.ambients = projection.ambients.map(mapper)
    return
  }
  if (target === 'bgm') {
    projection.bgm = projection.bgm ? mapper(projection.bgm) : projection.bgm
    return
  }
  projection.voices = projection.voices.map(track => track.id === target || track.lineId === target ? mapper(track) : track)
  projection.sfx = projection.sfx.map(track => track.id === target || track.lineId === target ? mapper(track) : track)
  projection.ambients = projection.ambients.map(track => track.id === target || track.lineId === target ? mapper(track) : track)
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

  if (isAudioBusTarget(target)) {
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
  if (isAudioBusTarget(target)) {
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
  if (isAudioBusTarget(target)) {
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
  let changed = false
  if (payload.channel === 'bgm') {
    if (next.bgm && next.bgm.id === payload.id) {
      next.bgm = undefined
      changed = true
    }
  }
  else if (payload.channel === 'voice') {
    next.voices = next.voices.filter(track => track.id !== payload.id)
    changed = next.voices.length !== projection.voices.length
  }
  else if (payload.channel === 'sfx') {
    next.sfx = next.sfx.filter(track => track.id !== payload.id)
    changed = next.sfx.length !== projection.sfx.length
  }
  else if (payload.channel === 'ambient') {
    next.ambients = next.ambients.filter(track => track.id !== payload.id)
    changed = next.ambients.length !== projection.ambients.length
  }
  if (!changed) {
    return Promise.resolve()
  }
  next.revision += 1
  return setAudioProjection(engine, next)
}

function handleTrackInterrupted(engine: QuaEngineInterface, payload: AudioTrackEventPayload): Promise<void> {
  return handleTrackEnded(engine, payload)
}

function markAudioUnlocked(engine: QuaEngineInterface): Promise<void> {
  const projection = getAudioProjection(engine)
  return setAudioProjection(engine, {
    ...projection,
    unlocked: true,
    revision: projection.revision + 1,
  })
}

function isCurve(value: number | AudioAutomationCurve): value is AudioAutomationCurve {
  return typeof value === 'object' && value !== null && 'points' in value
}

const AUDIO_BUS_IDS: readonly AudioBusId[] = ['master', 'bgm', 'voice', 'sfx', 'ambient']

let audioTrackSequence = 0

function isAudioBusTarget(target: AudioBusId | string): target is AudioBusId {
  return AUDIO_BUS_IDS.includes(target as AudioBusId)
}

function nextAudioTrackId(kind: AudioTrackProjection['kind']): string {
  audioTrackSequence += 1
  return `${kind}:${Date.now()}:${audioTrackSequence}`
}

function isOptionalPluginUnavailableError(error: unknown, packageName: string): boolean {
  if (!(error instanceof Error)) {
    return false
  }
  return error.message.includes(packageName)
    && (
      error.message.includes('Cannot find package')
      || error.message.includes('Cannot find module')
      || error.message.includes('Failed to resolve')
    )
}
