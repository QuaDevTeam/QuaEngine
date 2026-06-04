import type {
  ChoiceIntent,
  EngineCheckpoint,
  EngineContext,
  QuaEngineInterface,
  StoryPoint,
} from '@quajs/engine'
import type { EventListener, Pipeline } from '@quajs/pipeline'
import type {
  BacklogEntry,
  BacklogOpenRequestPayload,
  BacklogPolicy,
  BacklogProjection,
  BacklogRetentionScope,
  BacklogUiProjection,
  BacklogVoiceReference,
} from './contracts'
import { BaseEnginePlugin, LogicToRenderEvents, richTextToPlainText } from '@quajs/engine'
import {
  BACKLOG_COCOS_RENDERER_ENTRY,
  BACKLOG_PLUGIN_ID,
  BACKLOG_VUE_RENDERER_ENTRY,
  BACKLOG_WEB_RENDERER_ENTRY,
  BacklogRenderToLogicEvents,
} from './contracts'
import { backlogDecoratorMappings } from './decorators'

const BACKLOG_SETTINGS_SCOPE = '@quajs/plugin-backlog' as const
let backlogEntryIdSeed = 0

export {
  BACKLOG_COCOS_RENDERER_ENTRY,
  BACKLOG_PLUGIN_ID,
  BACKLOG_VUE_RENDERER_ENTRY,
  BACKLOG_WEB_RENDERER_ENTRY,
  BacklogRenderToLogicEvents,
}
export { BACKLOG_SETTINGS_SCOPE }
export type {
  BacklogEntry,
  BacklogEntryKind,
  BacklogOpenRequestPayload,
  BacklogPolicy,
  BacklogProjection,
  BacklogRetentionScope,
  BacklogUiProjection,
  BacklogUiSceneOverlayProjection,
  BacklogUiScenePresentation,
  BacklogUiSceneProjection,
  BacklogVoiceReference,
} from './contracts'

export interface BacklogFilterContext {
  engine: QuaEngineInterface
  checkpoint?: EngineCheckpoint
}

export interface BacklogPluginOptions {
  retention?: Partial<BacklogProjection['retention']>
  defaultPolicy?: BacklogPolicy
  filter?: (entry: BacklogEntry, ctx: BacklogFilterContext) => boolean
}

interface BacklogDeveloperSettings {
  retentionScope: BacklogRetentionScope
  maxEntries: number
  includeByDefault: boolean
  rewindableByDefault: boolean
  voiceReplayByDefault: boolean
}

export class BacklogPlugin extends BaseEnginePlugin {
  readonly name = '@quajs/plugin-backlog'
  readonly id = BACKLOG_PLUGIN_ID
  readonly version = '0.1.0'
  readonly description = 'Backlog recording, retention, rewind, and voice replay projection'
  private disposers: Array<() => void> = []
  private projectionBeforeBacklogJump?: BacklogProjection
  private projectionBeforeRollback?: BacklogProjection

  getProjection(): BacklogProjection {
    return getBacklogProjection(this.getEngine())
  }

  setPolicy(policy: BacklogPolicy): Promise<void> {
    return setBacklogPolicyWithEngine(this.getEngine(), policy)
  }

  setVisible(visible: boolean, ui?: BacklogUiProjection): Promise<void> {
    return setBacklogVisibleWithEngine(this.getEngine(), visible, ui)
  }

  clearRuntimePackage(packageId: string): Promise<void> {
    return removeRuntimePackageBacklogEntriesWithEngine(this.getEngine(), packageId)
  }

  protected async setup(ctx: EngineContext): Promise<void> {
    this.ensureProjection(ctx)
    this.disposers.push(onPipeline(ctx.pipeline, LogicToRenderEvents.DIALOGUE_SHOW, async () => {
      await this.recordDialogue(ctx)
    }))
    this.disposers.push(onPipeline(ctx.pipeline, LogicToRenderEvents.DIALOGUE_CHOICE, async (payload) => {
      await this.recordChoice(ctx, payload as { choices: ChoiceIntent[] })
    }))
    this.disposers.push(onPipeline<BacklogOpenRequestPayload>(ctx.pipeline, BacklogRenderToLogicEvents.OPEN_REQUEST, async (payload = {}) => {
      await setBacklogVisibleWithEngine(ctx.engine, true, payload)
    }))
    this.disposers.push(onPipeline(ctx.pipeline, BacklogRenderToLogicEvents.CLOSE_REQUEST, async () => {
      await setBacklogVisibleWithEngine(ctx.engine, false)
    }))
    this.disposers.push(onPipeline(ctx.pipeline, BacklogRenderToLogicEvents.JUMP_REQUEST, async (payload) => {
      await this.jumpToEntry(ctx.engine, payload as { entryId?: string })
    }))
    this.disposers.push(onPipeline(ctx.pipeline, BacklogRenderToLogicEvents.REPLAY_VOICE_REQUEST, async (payload) => {
      await this.replayVoice(ctx.engine, payload as { entryId?: string })
    }))
    const settingsDisposer = await registerBacklogSettingsScope(ctx, this.getOptions())
    if (settingsDisposer) {
      this.disposers.push(settingsDisposer)
    }
  }

  override async destroy(): Promise<void> {
    while (this.disposers.length > 0) {
      this.disposers.pop()?.()
    }
    this.projectionBeforeBacklogJump = undefined
    this.projectionBeforeRollback = undefined
    await super.destroy?.()
  }

  override async onBeforeJump(ctx: EngineContext): Promise<void> {
    this.projectionBeforeBacklogJump = ctx.jump?.options.reason === 'backlog'
      ? getBacklogProjection(ctx.engine)
      : undefined
  }

  override async onAfterJump(ctx: EngineContext): Promise<void> {
    if (ctx.jump?.options.reason !== 'backlog' || !this.projectionBeforeBacklogJump) {
      this.ensureProjection(ctx)
      return
    }

    await setBacklogProjection(ctx.engine, {
      ...this.projectionBeforeBacklogJump,
      revision: this.projectionBeforeBacklogJump.revision + 1,
      visible: false,
    })
    this.projectionBeforeBacklogJump = undefined
  }

  override async onBeforeRollback(ctx: EngineContext): Promise<void> {
    this.projectionBeforeRollback = getBacklogProjection(ctx.engine)
  }

  override async onAfterRollback(ctx: EngineContext): Promise<void> {
    if (!this.projectionBeforeRollback) {
      this.ensureProjection(ctx)
      return
    }
    await setBacklogProjection(ctx.engine, {
      ...this.projectionBeforeRollback,
      revision: this.projectionBeforeRollback.revision + 1,
    })
    this.projectionBeforeRollback = undefined
  }

  override async onRuntimePackageUnload(ctx: EngineContext): Promise<void> {
    const packageId = ctx.runtimePackage?.package.id
    if (!packageId) {
      return
    }
    await removeRuntimePackageBacklogEntriesWithEngine(ctx.engine, packageId)
  }

  private ensureProjection(ctx: EngineContext): void {
    if (ctx.engine.getPluginProjection(BACKLOG_PLUGIN_ID)) {
      return
    }
    ctx.store.commit('setPluginProjection', {
      pluginId: BACKLOG_PLUGIN_ID,
      projection: withBacklogRequiredRuntimePackages(createInitialBacklogProjection(this.getOptions())),
    })
  }

  registerAPIs() {
    return {
      pluginName: this.name,
      apis: [
        { name: 'getProjection', fn: this.getProjection.bind(this), module: this.name },
        { name: 'setPolicy', fn: this.setPolicy.bind(this), module: this.name },
        { name: 'setVisible', fn: this.setVisible.bind(this), module: this.name },
        { name: 'clearRuntimePackage', fn: this.clearRuntimePackage.bind(this), module: this.name },
      ],
      decorators: backlogDecoratorMappings,
    }
  }

  private async recordDialogue(ctx: EngineContext): Promise<void> {
    const { engine } = ctx
    const view = engine.getViewState()
    if (!view.dialogue.visible || !view.dialogue.text) {
      return
    }
    const policy = resolveCurrentBacklogPolicy(getBacklogProjection(engine))
    const checkpoint = policy.include !== false && policy.rewindable === true
      ? await engine.createCheckpoint({
          kind: 'line',
          metadata: {
            requiredRuntimePackages: requiredPackagesForPoint(engine.getStoryPoint()),
          },
        })
      : undefined
    const entry = createBacklogEntry(engine, checkpoint, {
      kind: 'dialogue',
      speaker: view.dialogue.characterName || view.dialogue.characterId,
      text: richTextToPlainText(view.dialogue.text),
      voice: findCurrentVoice(engine),
    })
    await appendBacklogEntry(engine, entry, this.getOptions(), checkpoint, isAudioPluginInstalled(ctx))
  }

  private async recordChoice(ctx: EngineContext, payload: { choices: ChoiceIntent[] }): Promise<void> {
    const { engine } = ctx
    if (payload.choices.length === 0) {
      return
    }
    const policy = resolveCurrentBacklogPolicy(getBacklogProjection(engine))
    const checkpoint = policy.include !== false && policy.rewindable === true
      ? await engine.createCheckpoint({
          kind: 'choice',
          metadata: {
            requiredRuntimePackages: requiredPackagesForPoint(engine.getStoryPoint()),
          },
        })
      : undefined
    const entry = createBacklogEntry(engine, checkpoint, {
      kind: 'choice',
      text: payload.choices.map(choice => choice.text).join(' / '),
      choices: payload.choices,
    })
    await appendBacklogEntry(engine, entry, this.getOptions(), checkpoint, isAudioPluginInstalled(ctx))
  }

  private async jumpToEntry(engine: QuaEngineInterface, payload: { entryId?: string }): Promise<void> {
    const projection = getBacklogProjection(engine)
    const entry = projection.entries.find(item => item.id === payload.entryId)
    if (!entry?.checkpointId || !entry.rewindable) {
      return
    }
    await engine.jumpTo(entry.checkpointId, { reason: 'backlog', resume: 'pause' })
  }

  private async replayVoice(engine: QuaEngineInterface, payload: { entryId?: string }): Promise<void> {
    const projection = getBacklogProjection(engine)
    const entry = projection.entries.find(item => item.id === payload.entryId)
    if (!entry?.voice || !entry.voiceReplay) {
      return
    }
    try {
      await engine.ensureRuntimePackages(entry.voice.requiredRuntimePackages || entry.requiredRuntimePackages || [])
      const audio = await import('@quajs/plugin-audio')
      await audio.playVoiceWithEngine(engine, entry.voice.assetKey, {
        chapterId: entry.voice.chapterId,
        lineId: entry.voice.lineId,
        characterId: entry.voice.characterId,
        contentPackageId: entry.voice.contentPackageId,
      })
    }
    catch {
      // Audio is optional for backlog. Keep the intent harmless when absent.
    }
  }

  private getOptions(): BacklogPluginOptions {
    return this.options as BacklogPluginOptions
  }
}

export async function setBacklogPolicyWithEngine(
  engine: QuaEngineInterface,
  policy: BacklogPolicy,
): Promise<void> {
  const projection = getBacklogProjection(engine)
  await setBacklogProjection(engine, {
    ...projection,
    revision: projection.revision + 1,
    pendingPolicy: { ...policy },
  })
}

export async function setBacklogVisibleWithEngine(
  engine: QuaEngineInterface,
  visible: boolean,
  ui?: BacklogUiProjection,
): Promise<void> {
  const projection = getBacklogProjection(engine)
  await setBacklogProjection(engine, {
    ...projection,
    revision: projection.revision + 1,
    visible,
    ui: visible ? createBacklogUiProjection(ui, projection.ui) : undefined,
  })
}

async function removeRuntimePackageBacklogEntriesWithEngine(
  engine: QuaEngineInterface,
  packageId: string,
): Promise<void> {
  const projection = getBacklogProjection(engine)
  const entries = projection.entries.filter(entry => !backlogEntryRequiresPackage(entry, packageId))
  if (entries.length === projection.entries.length) {
    return
  }
  await setBacklogProjection(engine, {
    ...projection,
    revision: projection.revision + 1,
    entries,
  })
}

export function getBacklogProjection(engine: QuaEngineInterface): BacklogProjection {
  return engine.getPluginProjection<BacklogProjection>(BACKLOG_PLUGIN_ID) || createInitialBacklogProjection()
}

function setBacklogProjection(engine: QuaEngineInterface, projection: BacklogProjection): Promise<void> {
  return engine.setPluginProjection(BACKLOG_PLUGIN_ID, withBacklogRequiredRuntimePackages(projection))
}

function withBacklogRequiredRuntimePackages(projection: BacklogProjection): BacklogProjection {
  return {
    ...projection,
    requiredRuntimePackages: collectBacklogRequiredRuntimePackages(projection.entries),
  }
}

export function createInitialBacklogProjection(options: BacklogPluginOptions = {}): BacklogProjection {
  const developerSettings = createBacklogDeveloperSettings(options)
  return {
    revision: 0,
    visible: false,
    ui: undefined,
    requiredRuntimePackages: [],
    entries: [],
    retention: {
      scope: developerSettings.retentionScope,
      maxEntries: developerSettings.maxEntries,
    },
    defaultPolicy: {
      include: developerSettings.includeByDefault,
      rewindable: developerSettings.rewindableByDefault,
      voiceReplay: developerSettings.voiceReplayByDefault,
    },
  }
}

function createBacklogUiProjection(
  next?: BacklogUiProjection,
  current?: Readonly<BacklogUiProjection>,
): BacklogUiProjection {
  const source = next?.source || current?.source
  return {
    ...(source ? { source } : {}),
    scene: next?.scene || current?.scene || createDefaultBacklogScene(),
  }
}

function createDefaultBacklogScene() {
  return {
    id: 'plugin:backlog',
    presentation: 'overlay' as const,
    overlay: {
      variant: 'backlog',
      hideHud: true,
      hideDialogue: true,
    },
  }
}

async function registerBacklogSettingsScope(
  ctx: EngineContext,
  options: BacklogPluginOptions,
): Promise<(() => void) | undefined> {
  try {
    const settings = await import('@quajs/plugin-settings')
    const developerValues = createBacklogDeveloperSettings(options)
    const unregister = settings.registerSettingsScope(ctx.engine, {
      scope: BACKLOG_SETTINGS_SCOPE,
      version: 1,
      title: 'Backlog',
      description: 'Backlog retention and default recording policy.',
      developer: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            retentionScope: {
              type: 'string',
              title: 'Retention Scope',
              enum: ['chapter', 'route', 'timeline', 'global'],
              default: 'chapter',
            },
            maxEntries: {
              type: 'integer',
              title: 'Maximum Entries',
              minimum: 1,
              maximum: 10000,
              default: 200,
            },
            includeByDefault: {
              type: 'boolean',
              title: 'Record By Default',
              default: true,
            },
            rewindableByDefault: {
              type: 'boolean',
              title: 'Rewindable By Default',
              default: false,
            },
            voiceReplayByDefault: {
              type: 'boolean',
              title: 'Voice Replay By Default',
              default: true,
            },
          },
        },
        defaults: createBacklogDeveloperSettings(),
        values: developerValues,
      },
      apply: async ({ developer }) => {
        const normalized = normalizeBacklogDeveloperSettings(developer)
        const projection = getBacklogProjection(ctx.engine)
        await setBacklogProjection(ctx.engine, {
          ...projection,
          revision: projection.revision + 1,
          entries: retainEntries(
            projection.entries,
            {
              scope: normalized.retentionScope,
              maxEntries: normalized.maxEntries,
            },
            ctx.engine.getStoryPoint(),
          ),
          retention: {
            scope: normalized.retentionScope,
            maxEntries: normalized.maxEntries,
          },
          defaultPolicy: {
            include: normalized.includeByDefault,
            rewindable: normalized.rewindableByDefault,
            voiceReplay: normalized.voiceReplayByDefault,
          },
        })
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

function createBacklogDeveloperSettings(options: BacklogPluginOptions = {}): BacklogDeveloperSettings {
  return normalizeBacklogDeveloperSettings({
    retentionScope: options.retention?.scope || 'chapter',
    maxEntries: options.retention?.maxEntries || 200,
    includeByDefault: options.defaultPolicy?.include !== false,
    rewindableByDefault: options.defaultPolicy?.rewindable === true,
    voiceReplayByDefault: options.defaultPolicy?.voiceReplay !== false,
  })
}

function normalizeBacklogDeveloperSettings(input: Partial<BacklogDeveloperSettings>): BacklogDeveloperSettings {
  return {
    retentionScope: isBacklogRetentionScope(input.retentionScope) ? input.retentionScope : 'chapter',
    maxEntries: typeof input.maxEntries === 'number' && Number.isFinite(input.maxEntries)
      ? Math.max(1, Math.floor(input.maxEntries))
      : 200,
    includeByDefault: input.includeByDefault !== false,
    rewindableByDefault: input.rewindableByDefault === true,
    voiceReplayByDefault: input.voiceReplayByDefault !== false,
  }
}

function isBacklogRetentionScope(value: unknown): value is BacklogRetentionScope {
  return value === 'chapter' || value === 'route' || value === 'timeline' || value === 'global'
}

async function appendBacklogEntry(
  engine: QuaEngineInterface,
  entry: BacklogEntry,
  options: BacklogPluginOptions,
  checkpoint?: EngineCheckpoint,
  audioAvailable = true,
): Promise<void> {
  const projection = getBacklogProjection(engine)
  const policy = resolveCurrentBacklogPolicy(projection)
  const nextEntry = {
    ...entry,
    rewindable: policy.rewindable === true && Boolean(entry.checkpointId),
    voiceReplay: policy.voiceReplay !== false && Boolean(entry.voice) && audioAvailable,
    tags: policy.tags ? [...policy.tags] : entry.tags,
  }

  if (policy.include === false || options.filter?.(nextEntry, { engine, checkpoint }) === false) {
    await setBacklogProjection(engine, {
      ...projection,
      revision: projection.revision + 1,
      pendingPolicy: undefined,
    })
    return
  }

  const retained = retainEntries(
    [...projection.entries, nextEntry],
    projection.retention,
    engine.getStoryPoint(),
  )
  await setBacklogProjection(engine, {
    ...projection,
    revision: projection.revision + 1,
    entries: retained,
    pendingPolicy: undefined,
  })
}

function createBacklogEntry(
  engine: QuaEngineInterface,
  checkpoint: EngineCheckpoint | undefined,
  entry: Omit<BacklogEntry, 'id' | 'point' | 'checkpointId' | 'rewindable' | 'voiceReplay' | 'timestamp'>,
): BacklogEntry {
  const point = engine.getStoryPoint()
  const timestamp = Date.now()
  const idSource = checkpoint?.id || `${point?.stepId || point?.lineId || entry.kind}:${timestamp}:${++backlogEntryIdSeed}`
  const requiredRuntimePackages = mergeRequiredPackages(
    requiredPackagesForPoint(point),
    requiredPackagesFromMetadata(checkpoint?.metadata),
    entry.voice?.requiredRuntimePackages,
    entry.voice?.contentPackageId ? [entry.voice.contentPackageId] : undefined,
  )
  return {
    ...entry,
    id: `${entry.kind}:${idSource}`,
    point,
    checkpointId: checkpoint?.id,
    requiredRuntimePackages,
    rewindable: Boolean(checkpoint?.id),
    voiceReplay: Boolean(entry.voice),
    timestamp,
  }
}

function resolveCurrentBacklogPolicy(projection: BacklogProjection): Required<Pick<BacklogPolicy, 'include' | 'rewindable' | 'voiceReplay'>> & Pick<BacklogPolicy, 'tags'> {
  const pending = projection.pendingPolicy || {}
  return {
    include: pending.include ?? projection.defaultPolicy.include,
    rewindable: pending.rewindable ?? projection.defaultPolicy.rewindable,
    voiceReplay: pending.voiceReplay ?? projection.defaultPolicy.voiceReplay,
    tags: pending.tags,
  }
}

function retainEntries(
  entries: readonly BacklogEntry[],
  retention: BacklogProjection['retention'],
  point?: StoryPoint,
): BacklogEntry[] {
  const scoped = entries.filter(entry => isEntryInRetentionScope(entry, retention.scope, point))
  return scoped.slice(-retention.maxEntries)
}

function isEntryInRetentionScope(entry: BacklogEntry, scope: BacklogRetentionScope, point?: StoryPoint): boolean {
  switch (scope) {
    case 'chapter':
      return point?.chapterId ? entry.point?.chapterId === point.chapterId : true
    case 'route':
      return point?.routeId ? entry.point?.routeId === point.routeId : true
    case 'timeline':
      return point?.timelineId ? entry.point?.timelineId === point.timelineId : true
    case 'global':
    default:
      return true
  }
}

function findCurrentVoice(engine: QuaEngineInterface): BacklogVoiceReference | undefined {
  const audio = engine.getPluginProjection<{
    currentLineId?: string
    voices?: Array<{
      assetKey: string
      chapterId?: string
      lineId?: string
      characterId?: string
      contentPackageId?: string
      requiredRuntimePackages?: readonly string[]
    }>
  }>('audio')
  if (!audio?.voices?.length) {
    return undefined
  }
  const voice = audio.currentLineId
    ? [...audio.voices].reverse().find(item => item.lineId === audio.currentLineId)
    : audio.voices[audio.voices.length - 1]
  const contentPackageId = typeof voice?.contentPackageId === 'string' ? voice.contentPackageId : undefined
  const requiredRuntimePackages = mergeRequiredPackages(
    Array.isArray(voice?.requiredRuntimePackages)
      ? voice.requiredRuntimePackages.filter((item): item is string => typeof item === 'string')
      : undefined,
    contentPackageId ? [contentPackageId] : undefined,
  )
  return voice
    ? {
        assetKey: voice.assetKey,
        chapterId: voice.chapterId,
        lineId: voice.lineId,
        characterId: voice.characterId,
        contentPackageId,
        requiredRuntimePackages,
      }
    : undefined
}

function collectBacklogRequiredRuntimePackages(entries: readonly BacklogEntry[]): string[] {
  return mergeRequiredPackages(
    ...entries.map(entry => mergeRequiredPackages(
      entry.requiredRuntimePackages,
      entry.voice?.requiredRuntimePackages,
      entry.voice?.contentPackageId ? [entry.voice.contentPackageId] : undefined,
    )),
  )
}

function backlogEntryRequiresPackage(entry: BacklogEntry, packageId: string): boolean {
  return mergeRequiredPackages(
    entry.requiredRuntimePackages,
    entry.voice?.requiredRuntimePackages,
    entry.voice?.contentPackageId ? [entry.voice.contentPackageId] : undefined,
  ).includes(packageId)
}

function requiredPackagesForPoint(point?: StoryPoint): string[] {
  return mergeRequiredPackages(
    point?.contentPackageId ? [point.contentPackageId] : undefined,
    point?.requiredRuntimePackages,
  )
}

function requiredPackagesFromMetadata(metadata?: Record<string, unknown>): string[] {
  const value = metadata?.requiredRuntimePackages
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.length > 0)
    : []
}

function mergeRequiredPackages(...groups: Array<readonly string[] | undefined>): string[] {
  return Array.from(new Set(groups.flatMap(group => group || []).filter(Boolean)))
}

function isAudioPluginInstalled(ctx: EngineContext): boolean {
  return ctx.plugins.hasPlugin('@quajs/plugin-audio') || Boolean(ctx.plugins.getPluginById('audio'))
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

function onPipeline<T>(
  pipeline: Pipeline,
  type: string,
  handler: (payload: T) => void | Promise<void>,
): () => void {
  const listener: EventListener<T> = async (context) => {
    await handler(context.event.payload)
  }
  pipeline.on(type, listener)
  return () => pipeline.off(type, listener)
}

export { backlogDecoratorMappings, decorators } from './decorators'
