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
  BacklogPolicy,
  BacklogProjection,
  BacklogRetentionScope,
  BacklogVoiceReference,
} from './contracts'
import { BaseEnginePlugin, LogicToRenderEvents, richTextToPlainText } from '@quajs/engine'
import { BACKLOG_PLUGIN_ID, BacklogRenderToLogicEvents } from './contracts'
import { backlogDecoratorMappings } from './script-compiler'

export { BACKLOG_PLUGIN_ID, BacklogRenderToLogicEvents } from './contracts'
export type {
  BacklogEntry,
  BacklogEntryKind,
  BacklogPolicy,
  BacklogProjection,
  BacklogRetentionScope,
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

export class BacklogPlugin extends BaseEnginePlugin {
  readonly name = '@quajs/plugin-backlog'
  readonly id = BACKLOG_PLUGIN_ID
  readonly version = '0.1.0'
  readonly description = 'Backlog recording, retention, rewind, and voice replay projection'
  private disposers: Array<() => void> = []
  private projectionBeforeBacklogJump?: BacklogProjection

  protected setup(ctx: EngineContext): void {
    this.ensureProjection(ctx)
    this.disposers.push(onPipeline(ctx.pipeline, LogicToRenderEvents.DIALOGUE_SHOW, async () => {
      await this.recordDialogue(ctx)
    }))
    this.disposers.push(onPipeline(ctx.pipeline, LogicToRenderEvents.DIALOGUE_CHOICE, async (payload) => {
      await this.recordChoice(ctx, payload as { choices: ChoiceIntent[] })
    }))
    this.disposers.push(onPipeline(ctx.pipeline, BacklogRenderToLogicEvents.OPEN_REQUEST, async () => {
      await setBacklogVisibleWithEngine(ctx.engine, true)
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
  }

  override async destroy(): Promise<void> {
    while (this.disposers.length > 0) {
      this.disposers.pop()?.()
    }
    this.projectionBeforeBacklogJump = undefined
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

    await ctx.engine.setPluginProjection(BACKLOG_PLUGIN_ID, {
      ...this.projectionBeforeBacklogJump,
      revision: this.projectionBeforeBacklogJump.revision + 1,
      visible: false,
    })
    this.projectionBeforeBacklogJump = undefined
  }

  private ensureProjection(ctx: EngineContext): void {
    if (ctx.engine.getPluginProjection(BACKLOG_PLUGIN_ID)) {
      return
    }
    ctx.store.commit('setPluginProjection', {
      pluginId: BACKLOG_PLUGIN_ID,
      projection: createInitialBacklogProjection(this.getOptions()),
    })
  }

  registerAPIs() {
    return {
      pluginName: this.name,
      apis: [
        { name: 'setBacklogPolicyWithEngine', fn: setBacklogPolicyWithEngine, module: this.name },
        { name: 'setBacklogVisibleWithEngine', fn: setBacklogVisibleWithEngine, module: this.name },
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
    const checkpoint = await engine.createCheckpoint({ kind: 'line' })
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
    const checkpoint = await engine.createCheckpoint({ kind: 'choice' })
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
      const audio = await import('@quajs/plugin-audio')
      await audio.playVoiceWithEngine(engine, entry.voice.assetKey, {
        chapterId: entry.voice.chapterId,
        lineId: entry.voice.lineId,
        characterId: entry.voice.characterId,
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
  await engine.setPluginProjection(BACKLOG_PLUGIN_ID, {
    ...projection,
    revision: projection.revision + 1,
    pendingPolicy: { ...policy },
  })
}

export async function setBacklogVisibleWithEngine(
  engine: QuaEngineInterface,
  visible: boolean,
): Promise<void> {
  const projection = getBacklogProjection(engine)
  await engine.setPluginProjection(BACKLOG_PLUGIN_ID, {
    ...projection,
    revision: projection.revision + 1,
    visible,
  })
}

export function getBacklogProjection(engine: QuaEngineInterface): BacklogProjection {
  return engine.getPluginProjection<BacklogProjection>(BACKLOG_PLUGIN_ID) || createInitialBacklogProjection()
}

export function createInitialBacklogProjection(options: BacklogPluginOptions = {}): BacklogProjection {
  return {
    revision: 0,
    visible: false,
    entries: [],
    retention: {
      scope: options.retention?.scope || 'chapter',
      maxEntries: options.retention?.maxEntries || 200,
    },
    defaultPolicy: {
      include: options.defaultPolicy?.include !== false,
      rewindable: options.defaultPolicy?.rewindable !== false,
      voiceReplay: options.defaultPolicy?.voiceReplay !== false,
    },
  }
}

async function appendBacklogEntry(
  engine: QuaEngineInterface,
  entry: BacklogEntry,
  options: BacklogPluginOptions,
  checkpoint?: EngineCheckpoint,
  audioAvailable = true,
): Promise<void> {
  const projection = getBacklogProjection(engine)
  const policy = {
    ...projection.defaultPolicy,
    ...(projection.pendingPolicy || {}),
  }
  const nextEntry = {
    ...entry,
    rewindable: policy.rewindable !== false && Boolean(entry.checkpointId),
    voiceReplay: policy.voiceReplay !== false && Boolean(entry.voice) && audioAvailable,
    tags: policy.tags ? [...policy.tags] : entry.tags,
  }

  if (policy.include === false || options.filter?.(nextEntry, { engine, checkpoint }) === false) {
    await engine.setPluginProjection(BACKLOG_PLUGIN_ID, {
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
  await engine.setPluginProjection(BACKLOG_PLUGIN_ID, {
    ...projection,
    revision: projection.revision + 1,
    entries: retained,
    pendingPolicy: undefined,
  })
}

function createBacklogEntry(
  engine: QuaEngineInterface,
  checkpoint: EngineCheckpoint,
  entry: Omit<BacklogEntry, 'id' | 'point' | 'checkpointId' | 'rewindable' | 'voiceReplay' | 'timestamp'>,
): BacklogEntry {
  return {
    ...entry,
    id: `${entry.kind}:${checkpoint.id}:${Date.now()}`,
    point: engine.getStoryPoint(),
    checkpointId: checkpoint.id,
    rewindable: true,
    voiceReplay: Boolean(entry.voice),
    timestamp: Date.now(),
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
    }>
  }>('audio')
  if (!audio?.voices?.length) {
    return undefined
  }
  const voice = audio.currentLineId
    ? [...audio.voices].reverse().find(item => item.lineId === audio.currentLineId)
    : audio.voices[audio.voices.length - 1]
  return voice
    ? {
        assetKey: voice.assetKey,
        chapterId: voice.chapterId,
        lineId: voice.lineId,
        characterId: voice.characterId,
      }
    : undefined
}

function isAudioPluginInstalled(ctx: EngineContext): boolean {
  return ctx.plugins.hasPlugin('@quajs/plugin-audio') || Boolean(ctx.plugins.getPluginById('audio'))
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

export { backlogDecoratorMappings, decorators, scriptCompiler } from './script-compiler'
