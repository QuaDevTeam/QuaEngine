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
  choices?: readonly unknown[]
  ui?: unknown
  plugins?: unknown
}>

export interface CreateNativeRendererJsonFrameInputOptions {
  container?: NativeRendererStageContainerInput
  layout?: unknown
}

export function createNativeRendererJsonFrameInput(
  view: NativeRendererEngineViewProjection,
  options: CreateNativeRendererJsonFrameInputOptions = {},
): NativeRendererJsonFrameInput {
  const frame: NativeRendererJsonFrameInput = {
    view: createNativeRendererViewProjection(view),
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

export function createNativeRendererViewProjection(view: NativeRendererEngineViewProjection): JsonRecord {
  return omitUndefined({
    background: createNativeBackgroundProjection(view.background),
    characters: Array.isArray(view.characters)
      ? view.characters.map(createNativeCharacterProjection).filter(isJsonRecord)
      : undefined,
    dialogue: createNativeDialogueProjection(view.dialogue),
    choices: createNativeChoiceSetProjection(view.choices),
    ui: createNativeUiProjection(view.ui),
    audio: createNativeAudioProjection(asRecord(view.plugins)?.audio),
    plugins: createNativePluginProjection(view.plugins),
  })
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
  const provenance = createPackageProvenance(record)

  return omitUndefined({
    id,
    kind,
    assetName,
    assetType: stringValue(record.assetType) || kind,
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
    provenance,
  })
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
  return Math.min(1, Math.max(0, 10 ** (totalGainDb / 20)))
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
    visible: record.visible !== false,
    characterId: stringValue(record.characterId),
    characterName: stringValue(record.characterName),
    avatar: createNativeDialogueAvatarProjection(record.avatar),
    speaker: record.speaker !== undefined ? createNativeRichTextContent(record.speaker) : undefined,
    speakerStyle: createNativeRichTextStyle(record.speakerStyle),
    text,
    mode: record.mode === 'narration' ? 'narration' : 'say',
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
    zIndex: integerValue(record.zIndex),
    provenance: createPackageProvenance(record),
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

function createNativeFontFamily(fontFamily: unknown): JsonRecord | undefined {
  if (typeof fontFamily !== 'string' || !fontFamily.trim()) {
    return undefined
  }
  return {
    families: [fontFamily.trim()],
  }
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
