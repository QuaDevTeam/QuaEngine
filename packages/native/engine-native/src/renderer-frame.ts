import type {
  ActiveAnimationProjection,
  QuaViewProjection,
  ViewBackgroundProjection,
  ViewCharacterProjection,
  ViewChoiceProjection,
  ViewDialogueProjection,
  ViewEffectProjection,
} from '@quajs/render-core'
import {
  projectAudioProjection,
  projectBackground,
  projectCharacters,
  projectChoices,
  projectDialogue,
  projectEffect,
  projectUiOverlay,
} from '@quajs/render-core'
import type { NativeRendererFeatureSurfaceEntry } from './feature-surfaces'
import { createNativeRendererFeatureSurfaceOverlays } from './feature-surfaces'

type JsonRecord = Record<string, unknown>

export interface NativeRendererSafeAreaInsetsInput {
  top?: number
  right?: number
  bottom?: number
  left?: number
}

export interface NativeRendererStageContainerInput {
  width: number
  height: number
  devicePixelRatio?: number
  safeAreaInsets?: NativeRendererSafeAreaInsetsInput
}

export interface NativeRendererJsonFrameInput {
  layout?: unknown
  container?: NativeRendererStageContainerInput
  view: JsonRecord
}

export type NativeRendererEngineViewProjection = Readonly<JsonRecord & {
  layout?: unknown
  background?: unknown
  characters?: readonly unknown[]
  dialogue?: unknown
  effects?: readonly unknown[]
  choices?: readonly unknown[]
  ui?: unknown
  plugins?: unknown
  animations?: readonly unknown[]
  sceneTransition?: unknown
  renderer?: unknown
}>

export interface CreateNativeRendererJsonFrameInputOptions {
  container?: NativeRendererStageContainerInput
  featureSurfaces?: readonly NativeRendererFeatureSurfaceEntry[]
  layout?: unknown
  now?: number
}

export function createNativeRendererJsonFrameInput(
  view: NativeRendererEngineViewProjection,
  options: CreateNativeRendererJsonFrameInputOptions = {},
): NativeRendererJsonFrameInput {
  const frame: NativeRendererJsonFrameInput = {
    view: createNativeRendererViewProjection(view, {
      featureSurfaces: options.featureSurfaces,
      now: options.now,
    }),
  }
  const layout = cloneJsonValue(options.layout ?? view.layout)
  const container = cloneJsonValue(options.container)
  if (layout !== undefined) {
    frame.layout = layout
  }
  if (container !== undefined) {
    frame.container = container
  }
  return frame
}

export interface CreateNativeRendererViewProjectionOptions {
  featureSurfaces?: readonly NativeRendererFeatureSurfaceEntry[]
  projectAnimations?: boolean
  now?: number
}

export function createNativeRendererViewProjection(
  view: NativeRendererEngineViewProjection,
  options: CreateNativeRendererViewProjectionOptions = {},
): JsonRecord {
  const animations = options.projectAnimations === false
    ? []
    : nativeAnimationProjections(view.animations)
  const now = options.now ?? Date.now()
  const plugins = asRecord(view.plugins)
  const background = projectNativeBackground(view.background, animations, now)
  const characters = projectNativeCharacters(view.characters, animations, now)
  const dialogue = projectNativeDialogue(view.dialogue, plugins?.dialogue, animations, now)
  const effects = projectNativeEffects(view.effects, animations, now)
  const choices = projectNativeChoices(view.choices, plugins?.choices, animations, now)
  const ui = projectNativeUi(view.ui, animations, now)
  const featureOverlays = createNativeRendererFeatureSurfaceOverlays(view, options.featureSurfaces)
  const audio = animations.length > 0
    ? projectAudioProjection<Record<string, unknown>>(view as unknown as Readonly<QuaViewProjection>, now)
    : plugins?.audio

  return omitUndefined({
    sceneTransition: cloneJsonValue(view.sceneTransition),
    background: createNativeBackgroundProjection(background),
    characters: Array.isArray(characters)
      ? characters.map(createNativeCharacterProjection).filter(isJsonRecord)
      : undefined,
    dialogue: createNativeDialogueProjection(dialogue),
    effects: effects.length > 0
      ? effects.map(createNativeEffectProjection).filter(isJsonRecord)
      : undefined,
    choices: createNativeChoiceSetProjection(choices),
    ui: mergeNativeUiProjection(createNativeUiProjection(ui), featureOverlays),
    audio: createNativeAudioProjection(audio),
    plugins: createNativePluginProjection(view.plugins),
    animations: cloneJsonValue(view.animations),
    renderer: createNativeRendererOptionsProjection(view.renderer),
  })
}

function projectNativeEffects(
  effects: readonly unknown[] | undefined,
  animations: readonly Readonly<ActiveAnimationProjection>[],
  now: number,
): readonly unknown[] {
  if (!Array.isArray(effects))
    return []
  const records = effects.filter(isJsonRecord)
  return animations.length > 0
    ? records.map(effect => projectEffect(
        effect as unknown as Readonly<ViewEffectProjection>,
        animations,
        now,
      ))
    : records
}

function createNativeEffectProjection(effect: unknown): JsonRecord | undefined {
  const record = asRecord(effect)
  const id = stringValue(record?.id)
  const type = stringValue(record?.type)
  if (!record || !id || !type)
    return undefined
  const options = asRecord(record.options)
  return omitUndefined({
    id,
    type,
    target: stringValue(record.target),
    duration: finiteNumber(record.duration),
    intensity: finiteNumber(record.intensity),
    x: finiteNumber(record.x) ?? finiteNumber(options?.x),
    y: finiteNumber(record.y) ?? finiteNumber(options?.y),
    scale: finiteNumber(record.scale) ?? finiteNumber(options?.scale),
    rotation: finiteNumber(record.rotation) ?? finiteNumber(options?.rotation),
    opacity: finiteNumber(record.opacity) ?? finiteNumber(options?.opacity),
    color: stringValue(record.color) || stringValue(options?.color),
    provenance: createPackageProvenance(options),
  })
}

function nativeAnimationProjections(value: readonly unknown[] | undefined): readonly Readonly<ActiveAnimationProjection>[] {
  return Array.isArray(value)
    ? value.filter(isJsonRecord) as unknown as readonly Readonly<ActiveAnimationProjection>[]
    : []
}

function projectNativeBackground(
  background: unknown,
  animations: readonly Readonly<ActiveAnimationProjection>[],
  now: number,
): unknown {
  const record = asRecord(background)
  return record && animations.length > 0
    ? projectBackground(record as unknown as Readonly<ViewBackgroundProjection>, animations, now)
    : background
}

function projectNativeCharacters(
  characters: readonly unknown[] | undefined,
  animations: readonly Readonly<ActiveAnimationProjection>[],
  now: number,
): readonly unknown[] | undefined {
  return Array.isArray(characters) && animations.length > 0
    ? projectCharacters(characters.filter(isJsonRecord) as unknown as readonly Readonly<ViewCharacterProjection>[], animations, now)
    : characters
}

function projectNativeDialogue(
  dialogue: unknown,
  base: unknown,
  animations: readonly Readonly<ActiveAnimationProjection>[],
  now: number,
): unknown {
  const record = asRecord(dialogue)
  return record && animations.length > 0
    ? projectDialogue(
        record as unknown as Readonly<ViewDialogueProjection>,
        animations,
        now,
        asRecord(base),
      )
    : dialogue
}

function projectNativeChoices(
  choices: readonly unknown[] | undefined,
  base: unknown,
  animations: readonly Readonly<ActiveAnimationProjection>[],
  now: number,
): readonly unknown[] | undefined {
  return Array.isArray(choices) && animations.length > 0
    ? projectChoices(
        choices.filter(isJsonRecord) as unknown as readonly Readonly<ViewChoiceProjection>[],
        animations,
        now,
        asRecord(base),
      ).choices
    : choices
}

function projectNativeUi(
  ui: unknown,
  animations: readonly Readonly<ActiveAnimationProjection>[],
  now: number,
): unknown {
  const record = asRecord(ui)
  const overlays = asRecord(record?.overlays)
  if (!record || !overlays || animations.length === 0) {
    return ui
  }
  return {
    ...record,
    overlays: Object.fromEntries(Object.entries(overlays).map(([elementId, overlay]) => [
      elementId,
      projectUiOverlay(asRecord(overlay) || {}, elementId, animations, now),
    ])),
  }
}

function createNativeRendererOptionsProjection(renderer: unknown): JsonRecord | undefined {
  const record = asRecord(renderer)
  if (!record) {
    return undefined
  }
  // Only forward targetFrameRate in the range [30, 240]. Other fields are
  // ignored here so unknown web-only fields do not reach the Rust validator.
  const fps = finiteNumber(record.targetFrameRate)
  if (fps == null || fps < 30 || fps > 240) {
    return undefined
  }
  return { targetFrameRate: Math.round(fps) }
}

function createNativePluginProjection(plugins: unknown): JsonRecord | undefined {
  const record = asRecord(plugins)
  if (!record) {
    return undefined
  }
  return omitUndefined({
    fonts: createNativeFontsProjection(record.fonts),
  })
}

function createNativeAudioProjection(audio: unknown): JsonRecord | undefined {
  const record = asRecord(audio)
  if (!record) {
    return undefined
  }
  const requiredRuntimePackages = stringArray(record.requiredRuntimePackages)
  const tracks = [
    createNativeAudioTrack(record.bgm, 'bgm', record),
    ...nativeAudioTrackList(record.bgmOutgoing, 'bgm', record),
    ...nativeAudioTrackList(record.voices, 'voice', record),
    ...nativeAudioTrackList(record.sfx, 'sfx', record),
    ...nativeAudioTrackList(record.ambients, 'ambient', record),
  ].filter(isJsonRecord)

  if (tracks.length === 0) {
    return undefined
  }

  return omitUndefined({
    tracks: tracks.map(track => mergeAudioRequiredPackages(track, requiredRuntimePackages)),
  })
}

function nativeAudioTrackList(value: unknown, kind: string, audio: JsonRecord): JsonRecord[] {
  return Array.isArray(value)
    ? value.map(track => createNativeAudioTrack(track, kind, audio)).filter(isJsonRecord)
    : []
}

function createNativeAudioTrack(track: unknown, kind: string, audio: JsonRecord): JsonRecord | undefined {
  const record = asRecord(track)
  if (!record) {
    return undefined
  }
  const id = stringValue(record.id)
  const assetName = stringValue(record.assetKey) || stringValue(record.assetName)
  if (!id || !assetName) {
    return undefined
  }
  const state = nativeAudioPlaybackState(record.state)
  const volume = nativeAudioTrackVolume(record, audio, kind)
  const stages = [
    createNativeAudioProcessingStage(`track:${id}`, record),
    createNativeAudioProcessingStage(`bus:${kind}`, asRecord(asRecord(audio.buses)?.[kind])),
    createNativeAudioProcessingStage('bus:master', asRecord(asRecord(audio.buses)?.master)),
  ]
  const provenance = createPackageProvenance(record)

  return omitUndefined({
    id,
    kind,
    assetName,
    assetType: stringValue(record.assetType) || 'audio',
    loadMode: nativeAudioLoadMode(record.loadMode) || 'buffered',
    playbackState: state,
    looped: booleanValue(record.loop),
    volume,
    durationMs: finiteNumber(record.durationMs),
    fadeInMs: finiteNumber(record.fadeInMs),
    fadeOutMs: finiteNumber(record.fadeOutMs),
    crossfadeMs: finiteNumber(record.crossfadeMs),
    playAt: finiteNumber(record.playAt),
    delayMs: finiteNumber(record.delayMs),
    seekMs: finiteNumber(record.seekMs),
    offsetMs: finiteNumber(record.offsetMs),
    processing: stages,
    provenance,
  })
}

function createNativeAudioProcessingStage(id: string, record: JsonRecord | undefined): JsonRecord {
  return {
    id,
    gainDb: finiteNumber(record?.gainDb) ?? 0,
    eq: Array.isArray(record?.eq) ? record.eq.map(createNativeAudioEqBand).filter(isJsonRecord) : [],
    automation: Array.isArray(record?.automation)
      ? record.automation.map(createNativeAudioAutomation).filter(isJsonRecord) : [],
  }
}

function createNativeAudioEqBand(band: unknown): JsonRecord | undefined {
  const record = asRecord(band)
  if (!record) return undefined
  const frequency = finiteNumber(record.frequency)
  if (frequency === undefined) return undefined
  return omitUndefined({
    type: stringValue(record.type) || 'peaking',
    frequency,
    gainDb: finiteNumber(record.gainDb),
    q: finiteNumber(record.q),
    detune: finiteNumber(record.detune),
  })
}

function createNativeAudioAutomation(value: unknown): JsonRecord | undefined {
  const record = asRecord(value)
  const curve = asRecord(record?.curve)
  if (!record || !curve || !Array.isArray(curve.points)) return undefined
  const points = curve.points.map(point => {
    const item = asRecord(point)
    const at = finiteNumber(item?.at)
    const pointValue = finiteNumber(item?.value)
    return item && at !== undefined && pointValue !== undefined
      ? omitUndefined({ at, value: pointValue, easing: stringValue(item.easing) })
      : undefined
  }).filter(isJsonRecord)
  const target = stringValue(record.target)
  const propertyPath = stringValue(record.propertyPath)
  if (!target || !propertyPath || points.length === 0) return undefined
  return {
    target,
    propertyPath,
    curve: omitUndefined({
      points,
      duration: finiteNumber(curve.duration),
      loop: booleanValue(curve.loop),
    }),
  }
}

function mergeAudioRequiredPackages(track: JsonRecord, requiredRuntimePackages: string[]): JsonRecord {
  if (requiredRuntimePackages.length === 0) {
    return track
  }
  const provenance = asRecord(track.provenance)
  track.provenance = omitUndefined({
    ...(provenance || {}),
    requiredRuntimePackages: uniqueStrings([
      ...stringArray(provenance?.requiredRuntimePackages),
      ...requiredRuntimePackages,
    ]),
  })
  return track
}

function nativeAudioPlaybackState(state: unknown): 'playing' | 'paused' | 'stopping' | 'stopped' {
  if (state === 'paused') {
    return 'paused'
  }
  if (state === 'stopping') {
    return 'stopping'
  }
  if (state === 'idle' || state === 'stopped') {
    return 'stopped'
  }
  return 'playing'
}

function nativeAudioLoadMode(value: unknown): 'buffered' | 'streamed' | undefined {
  return value === 'streamed' || value === 'buffered' ? value : undefined
}

function nativeAudioTrackVolume(track: JsonRecord, audio: JsonRecord, kind: string): number {
  const masterBus = asRecord(asRecord(audio.buses)?.master)
  const kindBus = asRecord(asRecord(audio.buses)?.[kind])
  return normalizedLinearGain([
    finiteNumber(masterBus?.gainDb),
    finiteNumber(kindBus?.gainDb),
    finiteNumber(track.gainDb),
  ])
}

function normalizedLinearGain(gainDbValues: Array<number | undefined>): number {
  let totalGainDb = 0
  for (const value of gainDbValues) {
    totalGainDb += value ?? 0
  }
  if (!Number.isFinite(totalGainDb)) {
    return 1
  }
  return Math.min(16, Math.max(0, 10 ** (totalGainDb / 20)))
}

function createNativeFontsProjection(fonts: unknown): JsonRecord | undefined {
  const record = asRecord(fonts)
  if (!record) {
    return undefined
  }
  const faces = Array.isArray(record.faces)
    ? record.faces.map(createNativeFontFaceProjection).filter(isJsonRecord)
    : []
  return omitUndefined({
    revision: integerValue(record.revision) ?? 0,
    requiredRuntimePackages: uniqueStrings(stringArray(record.requiredRuntimePackages)),
    faces,
  })
}

function createNativeFontFaceProjection(face: unknown): JsonRecord | undefined {
  const record = asRecord(face)
  if (!record) {
    return undefined
  }
  const family = stringValue(record.family)
  const assetName = stringValue(record.assetName)
  if (!family || !assetName) {
    return undefined
  }
  return omitUndefined({
    id: stringValue(record.id),
    family,
    assetName,
    assetType: stringValue(record.assetType) || stringValue(record.type) || 'fonts',
    locale: stringValue(record.locale),
    style: stringValue(record.style),
    weight: typeof record.weight === 'string' || typeof record.weight === 'number'
      ? record.weight
      : undefined,
    stretch: stringValue(record.stretch),
    display: stringValue(record.display),
    unicodeRange: stringValue(record.unicodeRange),
    featureSettings: stringValue(record.featureSettings),
    variationSettings: stringValue(record.variationSettings),
    ascentOverride: stringValue(record.ascentOverride),
    descentOverride: stringValue(record.descentOverride),
    lineGapOverride: stringValue(record.lineGapOverride),
    provenance: createPackageProvenance(record),
  })
}

function createNativeDialogueProjection(dialogue: unknown): JsonRecord | undefined {
  const record = asRecord(dialogue)
  if (!record) {
    return undefined
  }
  const text = createNativeRichTextContent(record.text ?? '')
  return omitUndefined({
    revision: integerValue(record.revision),
    visible: record.visible !== false,
    characterId: stringValue(record.characterId),
    characterName: stringValue(record.characterName),
    avatar: createNativeDialogueAvatarProjection(record.avatar),
    speaker: record.speaker !== undefined ? createNativeRichTextContent(record.speaker) : undefined,
    speakerStyle: createNativeRichTextStyle(record.speakerStyle),
    text,
    mode: record.mode === 'narration' ? 'narration' : 'say',
    typewriter: cloneJsonValue(record.typewriter),
    provenance: createPackageProvenance(record),
  })
}

function createNativeDialogueAvatarProjection(avatar: unknown): JsonRecord | undefined {
  const record = asRecord(avatar)
  if (!record) {
    return undefined
  }
  const assetName = stringValue(record.assetName) || stringValue(record.name)
  if (!assetName) {
    return undefined
  }
  return omitUndefined({
    assetType: stringValue(record.assetType) || stringValue(record.type) || 'images',
    assetName,
    provenance: createPackageProvenance({
      ...record,
      contentPackageId: stringValue(record.contentPackageId) || stringValue(record.runtimePackageId),
    }),
  })
}

function createNativeChoiceSetProjection(choices: readonly unknown[] | undefined): JsonRecord | undefined {
  if (!Array.isArray(choices)) {
    return undefined
  }
  return omitUndefined({
    visible: choices.length > 0,
    choices: choices.map(createNativeChoiceProjection).filter(isJsonRecord),
    provenance: mergePackageProvenance(choices.map(createPackageProvenance)),
  })
}

function createNativeChoiceProjection(choice: unknown): JsonRecord | undefined {
  const record = asRecord(choice)
  if (!record) {
    return undefined
  }
  const id = stringValue(record.id)
  const text = stringValue(record.text)
  if (!id || text === undefined) {
    return undefined
  }
  return omitUndefined({
    id,
    text,
    enabled: record.enabled !== false,
    provenance: createPackageProvenance(record),
  })
}

function createNativeUiProjection(ui: unknown): JsonRecord | undefined {
  const record = asRecord(ui)
  if (!record) {
    return {
      visible: true,
      overlays: [],
    }
  }
  const overlays = asRecord(record.overlays)
  return omitUndefined({
    visible: record.visible !== false,
    overlays: overlays
      ? Object.entries(overlays).map(([elementId, overlay]) => createNativeUiOverlayProjection(elementId, overlay)).filter(isJsonRecord)
      : [],
    provenance: createPackageProvenance(record),
  })
}

function mergeNativeUiProjection(
  ui: JsonRecord | undefined,
  featureOverlays: readonly unknown[],
): JsonRecord | undefined {
  if (featureOverlays.length === 0) {
    return ui
  }
  const overlays = new Map<string, JsonRecord>()
  for (const overlay of Array.isArray(ui?.overlays) ? ui.overlays : []) {
    const record = asRecord(overlay)
    const elementId = stringValue(record?.elementId)
    if (record && elementId) {
      overlays.set(elementId, record)
    }
  }
  for (const overlay of featureOverlays) {
    const record = asRecord(overlay)
    const elementId = stringValue(record?.elementId)
    const projected = elementId ? createNativeUiOverlayProjection(elementId, record) : undefined
    if (projected && elementId) {
      overlays.set(elementId, projected)
    }
  }
  return omitUndefined({
    ...(ui || {}),
    visible: ui?.visible !== false,
    overlays: [...overlays.values()],
  })
}

function createNativeUiOverlayProjection(elementId: string, overlay: unknown): JsonRecord | undefined {
  const record = asRecord(overlay)
  if (!record) {
    return undefined
  }
  const scene = createNativeUiSceneProjection(record.scene)
  return omitUndefined({
    elementId,
    visible: record.visible !== false,
    renderMode: nativeUiRenderMode(record.renderMode, scene?.renderMode),
    interactive: booleanValue(record.interactive),
    overlayStack: stringValue(record.overlayStack),
    stackPriority: integerValue(record.stackPriority),
    zIndex: integerValue(record.zIndex),
    surface: createNativeUiSurfaceProjection(record.surface),
    scene,
    provenance: createPackageProvenance(record),
  })
}

function createNativeUiSceneProjection(scene: unknown): JsonRecord | undefined {
  const record = asRecord(scene)
  if (!record) {
    return undefined
  }
  const id = stringValue(record.id)
  if (!id) {
    return undefined
  }
  return omitUndefined({
    id,
    renderMode: nativeUiRenderMode(record.renderMode),
    interactive: booleanValue(record.interactive),
    surface: createNativeUiSurfaceProjection(record.surface),
    overlay: createNativeUiSceneShellProjection(record.overlay),
  })
}

function createNativeUiSceneShellProjection(overlay: unknown): JsonRecord | undefined {
  const record = asRecord(overlay)
  if (!record) {
    return undefined
  }
  return omitUndefined({
    overlayStack: stringValue(record.overlayStack),
    stackPriority: integerValue(record.stackPriority),
    zIndex: integerValue(record.zIndex),
  })
}

function createNativeUiSurfaceProjection(surface: unknown): JsonRecord | undefined {
  const record = asRecord(surface)
  if (!record) {
    return undefined
  }
  const key = stringValue(record.key)
  if (!key) {
    return undefined
  }
  return omitUndefined({
    key,
    root: cloneJsonValue(record.root),
  })
}

function createNativeBackgroundProjection(background: unknown): JsonRecord | undefined {
  const record = asRecord(background)
  if (!record) {
    return undefined
  }
  const mode = stringValue(record.mode)
  if (!mode) {
    return undefined
  }
  return omitUndefined({
    mode,
    assetName: stringValue(record.assetName),
    assetType: stringValue(record.assetType),
    fit: stringValue(record.fit),
    origin: stringValue(record.origin),
    width: finiteNumber(record.width),
    height: finiteNumber(record.height),
    x: finiteNumber(record.x),
    y: finiteNumber(record.y),
    scale: finiteNumber(record.scale),
    rotation: finiteNumber(record.rotation),
    opacity: finiteNumber(record.opacity),
    composition: createNativeBackgroundCompositionProjection(record.composition),
    layers: Array.isArray(record.layers)
      ? record.layers.map(createNativeBackgroundLayerProjection).filter(isJsonRecord)
      : [],
    video: createNativeBackgroundVideoProjection(record.video),
    provenance: createPackageProvenance(record),
  })
}

function createNativeBackgroundLayerProjection(layer: unknown): JsonRecord | undefined {
  const record = asRecord(layer)
  if (!record) {
    return undefined
  }
  const id = stringValue(record.id)
  const assetName = stringValue(record.assetName)
  if (!id || !assetName) {
    return undefined
  }
  return omitUndefined({
    id,
    assetName,
    assetType: stringValue(record.assetType),
    visible: record.visible !== false,
    fit: stringValue(record.fit),
    origin: stringValue(record.origin),
    width: finiteNumber(record.width),
    height: finiteNumber(record.height),
    x: finiteNumber(record.x),
    y: finiteNumber(record.y),
    scale: finiteNumber(record.scale),
    rotation: finiteNumber(record.rotation),
    opacity: finiteNumber(record.opacity),
    composition: createNativeBackgroundCompositionProjection(record.composition),
    zIndex: integerValue(record.zIndex),
    provenance: createPackageProvenance(record),
  })
}

function createNativeBackgroundCompositionProjection(composition: unknown): JsonRecord | undefined {
  const record = asRecord(composition)
  if (!record) return undefined
  const filter = asRecord(record.filter)
  const mask = asRecord(record.mask)
  return omitUndefined({
    blendMode: stringValue(record.blendMode),
    isolation: booleanValue(record.isolation),
    filter: filter ? omitUndefined({
      blur: finiteNumber(filter.blur), brightness: finiteNumber(filter.brightness),
      contrast: finiteNumber(filter.contrast), saturate: finiteNumber(filter.saturate),
      hueRotate: finiteNumber(filter.hueRotate), grayscale: finiteNumber(filter.grayscale),
      sepia: finiteNumber(filter.sepia), invert: finiteNumber(filter.invert),
      dropShadow: stringValue(filter.dropShadow),
    }) : undefined,
    mask: mask ? omitUndefined({
      assetName: stringValue(mask.assetName), assetType: stringValue(mask.assetType), mode: stringValue(mask.mode),
      position: stringValue(mask.position), size: stringValue(mask.size), repeat: stringValue(mask.repeat),
    }) : undefined,
  })
}

function createNativeBackgroundVideoProjection(video: unknown): JsonRecord | undefined {
  const record = asRecord(video)
  if (!record) {
    return undefined
  }
  const assetName = stringValue(record.assetName)
  if (!assetName) {
    return undefined
  }
  return omitUndefined({
    assetName,
    loop: booleanValue(record.loop),
    muted: booleanValue(record.muted),
    volume: finiteNumber(record.volume),
    playbackRate: finiteNumber(record.playbackRate),
    seekMs: finiteNumber(record.seekMs),
    offsetMs: finiteNumber(record.offsetMs),
    poster: stringValue(record.poster),
    fit: stringValue(record.fit),
    origin: stringValue(record.origin),
    opacity: finiteNumber(record.opacity),
    provenance: createPackageProvenance(record),
  })
}

function createNativeCharacterProjection(character: unknown): JsonRecord | undefined {
  const record = asRecord(character)
  if (!record) {
    return undefined
  }
  const id = stringValue(record.id)
  const name = stringValue(record.name)
  if (!id || !name) {
    return undefined
  }
  return omitUndefined({
    id,
    name,
    visible: record.visible !== false,
    sprite: stringValue(record.sprite),
    expression: stringValue(record.expression),
    position: createNativeCharacterPosition(record.position),
    opacity: finiteNumber(record.opacity),
    layer: integerValue(record.layer),
    provenance: createPackageProvenance(record),
  })
}

function createNativeCharacterPosition(position: unknown): JsonRecord | undefined {
  const record = asRecord(position)
  if (!record) {
    return undefined
  }
  return omitUndefined({
    x: finiteNumber(record.x),
    y: finiteNumber(record.y),
    xPercent: finiteNumber(record.xPercent),
    yPercent: finiteNumber(record.yPercent),
    scale: finiteNumber(record.scale),
    rotation: finiteNumber(record.rotation),
    anchor: stringValue(record.anchor),
    width: finiteNumber(record.width),
    height: finiteNumber(record.height),
  })
}

function createNativeRichTextContent(content: unknown): unknown {
  if (typeof content === 'string') {
    return content
  }
  const record = asRecord(content)
  if (!record) {
    return ''
  }
  const blocks = Array.isArray(record.blocks)
    ? record.blocks.map(createNativeRichTextBlock).filter(isJsonRecord)
    : []
  return omitUndefined({
    blocks,
    style: createNativeRichTextStyle(record),
  })
}

function createNativeRichTextBlock(block: unknown): JsonRecord | undefined {
  const record = asRecord(block)
  if (!record) {
    return undefined
  }
  return {
    spans: Array.isArray(record.spans)
      ? record.spans.map(createNativeRichTextSpan).filter(isJsonRecord)
      : [],
  }
}

function createNativeRichTextSpan(span: unknown): JsonRecord | undefined {
  const record = asRecord(span)
  if (!record) {
    return undefined
  }
  const text = stringValue(record.text)
  if (text === undefined) {
    return undefined
  }
  return omitUndefined({
    text,
    style: createNativeRichTextStyle(record),
  })
}

function createNativeRichTextStyle(style: unknown): JsonRecord | undefined {
  const record = asRecord(style)
  if (!record) {
    return undefined
  }
  return omitUndefined({
    color: stringValue(record.color),
    fontFamily: createNativeFontFamily(record.fontFamily),
    fontSize: finiteNumber(record.fontSize),
    fontWeight: typeof record.fontWeight === 'string' || typeof record.fontWeight === 'number'
      ? record.fontWeight
      : undefined,
    lineHeight: finiteNumber(record.lineHeight),
    textAlign: stringValue(record.textAlign),
  })
}

function createNativeFontFamily(fontFamily: unknown): string[] | undefined {
  if (typeof fontFamily === 'string') {
    const family = fontFamily.trim()
    return family ? [family] : undefined
  }
  const families = uniqueStrings(stringArray(fontFamily).map(family => family.trim()).filter(Boolean))
  return families.length > 0 ? families : undefined
}

function createPackageProvenance(value: unknown): JsonRecord | undefined {
  const record = asRecord(value)
  const metadata = asRecord(record?.metadata)
  const contentPackageId = stringValue(record?.contentPackageId) || stringValue(metadata?.contentPackageId)
  const requiredRuntimePackages = uniqueStrings([
    ...stringArray(record?.requiredRuntimePackages),
    ...stringArray(metadata?.requiredRuntimePackages),
  ])
  if (!contentPackageId && requiredRuntimePackages.length === 0) {
    return undefined
  }
  return omitUndefined({
    contentPackageId,
    requiredRuntimePackages: requiredRuntimePackages.length > 0 ? requiredRuntimePackages : undefined,
  })
}

function mergePackageProvenance(provenanceRecords: Array<JsonRecord | undefined>): JsonRecord | undefined {
  const contentPackageId = provenanceRecords.find(record => typeof record?.contentPackageId === 'string')?.contentPackageId
  const requiredRuntimePackages = uniqueStrings(provenanceRecords.flatMap(record => stringArray(record?.requiredRuntimePackages)))
  if (typeof contentPackageId !== 'string' && requiredRuntimePackages.length === 0) {
    return undefined
  }
  return omitUndefined({
    contentPackageId,
    requiredRuntimePackages: requiredRuntimePackages.length > 0 ? requiredRuntimePackages : undefined,
  })
}

function nativeUiRenderMode(value: unknown, fallback?: unknown): 'ui' | 'render-only' {
  return value === 'render-only' || fallback === 'render-only' ? 'render-only' : 'ui'
}

function asRecord(value: unknown): JsonRecord | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : undefined
}

function isJsonRecord(value: unknown): value is JsonRecord {
  return Boolean(asRecord(value))
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function booleanValue(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function integerValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) ? value : undefined
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.length > 0) : []
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values)]
}

function omitUndefined(record: JsonRecord): JsonRecord {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined))
}

function cloneJsonValue<T>(value: T): T | undefined {
  if (value === undefined) {
    return undefined
  }
  const serialized = JSON.stringify(value)
  return serialized === undefined ? undefined : JSON.parse(serialized) as T
}
