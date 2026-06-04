import type { EventListener, PipelineContext } from '@quajs/pipeline'
import type {
  EngineCheckpoint,
  JsonSerializableRecord,
  QuaEngineInterface,
  SceneEnterContext,
  ViewUiSceneHostProjection,
} from '../core/types'
import type { SceneTransitionIntent } from '../events/events'
import type { EngineContext } from './core/types'
import { Scene } from '../core/types'
import { RenderToLogicEvents } from '../events/events'
import { BaseEnginePlugin } from './core/types'

export const UI_OVERLAY_HOST_SCENE_ID = '@quajs/engine/ui-overlay-host' as const

const UI_OVERLAY_SOURCE_PREFIX = 'ui:' as const

export interface UiOverlayPluginOptions {
  openEvents?: ReadonlyArray<RenderToLogicEvents>
  closeEvents?: ReadonlyArray<RenderToLogicEvents>
  updateEvents?: ReadonlyArray<RenderToLogicEvents>
}

export interface UiOverlayHostRetainOptions {
  reason?: string
  transition?: SceneTransitionIntent
}

export interface UiOverlayHostReleaseOptions {
  reason?: string
}

interface UiOverlayHostRuntimeState {
  activeSources: Set<string>
  unregisterScene?: () => void
  originalShowUI?: QuaEngineInterface['showUI']
  originalHideUI?: QuaEngineInterface['hideUI']
  originalUpdateUI?: QuaEngineInterface['updateUI']
}

interface UiOverlayHostSceneState extends Record<string, unknown> {
  sceneId?: string
  sources?: string[]
  returnCheckpointId?: string
  reason?: string
}

const uiOverlayHostState = new WeakMap<object, UiOverlayHostRuntimeState>()

class UiOverlayHostSceneShell extends Scene {
  readonly name = UI_OVERLAY_HOST_SCENE_ID

  constructor(
    private readonly engine: QuaEngineInterface,
    private readonly runtimeState: UiOverlayHostRuntimeState,
  ) {
    super()
  }

  override async init(ctx?: SceneEnterContext): Promise<void> {
    await applyUiOverlaySceneEnterState(this.engine, this.runtimeState, ctx)
  }

  override async run(_ctx?: SceneEnterContext): Promise<void> {}
}

export class UiOverlayPlugin extends BaseEnginePlugin {
  readonly name = 'ui-overlay'
  readonly version = '0.2.0'
  readonly description = 'Maps renderer UI overlay requests to engine-owned overlay state through a reserved overlay host scene'

  private disposers: Array<() => void> = []
  private readonly openEvents: ReadonlyArray<RenderToLogicEvents>
  private readonly closeEvents: ReadonlyArray<RenderToLogicEvents>
  private readonly updateEvents: ReadonlyArray<RenderToLogicEvents>

  constructor(options: UiOverlayPluginOptions = {}) {
    super({ ...options })
    this.openEvents = options.openEvents || [RenderToLogicEvents.UI_REQUEST_OPEN]
    this.closeEvents = options.closeEvents || [RenderToLogicEvents.UI_REQUEST_CLOSE]
    this.updateEvents = options.updateEvents || [RenderToLogicEvents.UI_REQUEST_UPDATE]
  }

  protected override setup(ctx: EngineContext): void {
    const { engine, pipeline } = ctx
    const runtimeState = getOrCreateUiOverlayHostRuntimeState(engine)
    syncUiOverlayHostRuntimeSources(engine, runtimeState)

    if (engine.hasScene(UI_OVERLAY_HOST_SCENE_ID)) {
      throw new Error(`UI overlay host scene "${UI_OVERLAY_HOST_SCENE_ID}" is already registered.`)
    }

    runtimeState.unregisterScene = engine.registerScene(
      UI_OVERLAY_HOST_SCENE_ID,
      async () => new UiOverlayHostSceneShell(engine, runtimeState),
    )

    wrapEngineUiMethods(engine, runtimeState)

    for (const event of this.openEvents) {
      const listener: EventListener<{ elementId: string, config?: Record<string, unknown> }> = (
        context: PipelineContext<{ elementId: string, config?: Record<string, unknown> }>,
      ) => {
        const payload = context.event.payload
        return engine.showUI(payload.elementId, payload.config || {})
      }
      pipeline.on(event, listener)
      this.disposers.push(() => pipeline.off(event, listener))
    }

    for (const event of this.closeEvents) {
      const listener: EventListener<{ elementId: string }> = (
        context: PipelineContext<{ elementId: string }>,
      ) => {
        const payload = context.event.payload
        return engine.hideUI(payload.elementId)
      }
      pipeline.on(event, listener)
      this.disposers.push(() => pipeline.off(event, listener))
    }

    for (const event of this.updateEvents) {
      const listener: EventListener<{ elementId: string, config: Record<string, unknown> }> = (
        context: PipelineContext<{ elementId: string, config: Record<string, unknown> }>,
      ) => {
        const payload = context.event.payload
        return engine.updateUI(payload.elementId, payload.config)
      }
      pipeline.on(event, listener)
      this.disposers.push(() => pipeline.off(event, listener))
    }
  }

  override async onAfterJump(ctx: EngineContext): Promise<void> {
    syncUiOverlayHostRuntimeSources(ctx.engine, getOrCreateUiOverlayHostRuntimeState(ctx.engine))
  }

  override async onAfterRollback(ctx: EngineContext): Promise<void> {
    syncUiOverlayHostRuntimeSources(ctx.engine, getOrCreateUiOverlayHostRuntimeState(ctx.engine))
  }

  override async destroy(): Promise<void> {
    while (this.disposers.length > 0) {
      this.disposers.pop()?.()
    }

    if (this.ctx) {
      const runtimeState = getUiOverlayHostRuntimeState(this.ctx.engine)
      if (runtimeState) {
        restoreEngineUiMethods(this.ctx.engine, runtimeState)
        runtimeState.unregisterScene?.()
        runtimeState.unregisterScene = undefined
        runtimeState.activeSources.clear()
        uiOverlayHostState.delete(getUiOverlayHostRuntimeKey(this.ctx.engine))
      }
      await setUiOverlayHostProjection(this.ctx.engine, undefined)
    }

    await super.destroy?.()
  }

  getProjection(): ViewUiSceneHostProjection | undefined {
    return getUiOverlayHostProjection(this.getEngine())
  }

  retainHost(source: string, options?: UiOverlayHostRetainOptions): Promise<ViewUiSceneHostProjection> {
    return retainUiOverlayHostWithEngine(this.getEngine(), source, options)
  }

  releaseHost(
    source: string,
    options?: UiOverlayHostReleaseOptions,
  ): Promise<ViewUiSceneHostProjection | undefined> {
    return releaseUiOverlayHostWithEngine(this.getEngine(), source, options)
  }

  registerAPIs() {
    return {
      pluginName: this.name,
      apis: [
        { name: 'getProjection', fn: this.getProjection.bind(this), module: '@quajs/engine' },
        { name: 'retainHost', fn: this.retainHost.bind(this), module: '@quajs/engine' },
        { name: 'releaseHost', fn: this.releaseHost.bind(this), module: '@quajs/engine' },
      ],
      decorators: {},
    }
  }
}

export function getUiOverlayHostProjection(engine: QuaEngineInterface): ViewUiSceneHostProjection | undefined {
  const host = engine.getViewState().ui.host
  return host ? cloneUiOverlayHostProjection(host) : undefined
}

export async function retainUiOverlayHostWithEngine(
  engine: QuaEngineInterface,
  source: string,
  options: UiOverlayHostRetainOptions = {},
): Promise<ViewUiSceneHostProjection> {
  const resolvedSource = normalizeUiOverlaySource(source)
  const runtimeState = getRequiredUiOverlayHostRuntimeState(engine)
  syncUiOverlayHostRuntimeSources(engine, runtimeState)
  runtimeState.activeSources.add(resolvedSource)

  const current = getUiOverlayHostProjection(engine)
  if (current?.sceneActive || engine.getCurrentSceneName() === UI_OVERLAY_HOST_SCENE_ID) {
    return await rebuildUiOverlayHostProjection(engine, runtimeState, {
      sceneActive: true,
      returnCheckpointId: current?.returnCheckpointId,
      reason: options.reason,
    })
  }

  const checkpoint = await createUiOverlayReturnCheckpoint(engine)
  const projection = await rebuildUiOverlayHostProjection(engine, runtimeState, {
    sceneActive: true,
    returnCheckpointId: checkpoint.id,
    reason: options.reason,
  })

  const enterContext: SceneEnterContext = {
    sceneId: UI_OVERLAY_HOST_SCENE_ID,
    initialState: createUiOverlaySceneState(projection),
    reason: options.reason || 'ui-overlay-open',
    fromScene: engine.getCurrentSceneName(),
    fromPoint: engine.getStoryPoint(),
    transition: options.transition,
  }

  await getSceneLoader(engine).loadScene(
    new UiOverlayHostSceneShell(engine, runtimeState),
    options.transition,
    enterContext,
  )
  return getUiOverlayHostProjection(engine) || projection
}

export async function releaseUiOverlayHostWithEngine(
  engine: QuaEngineInterface,
  source: string,
  options: UiOverlayHostReleaseOptions = {},
): Promise<ViewUiSceneHostProjection | undefined> {
  const resolvedSource = normalizeUiOverlaySource(source)
  const runtimeState = getRequiredUiOverlayHostRuntimeState(engine)
  syncUiOverlayHostRuntimeSources(engine, runtimeState)
  runtimeState.activeSources.delete(resolvedSource)

  if (runtimeState.activeSources.size > 0) {
    return await rebuildUiOverlayHostProjection(engine, runtimeState, {
      sceneActive: true,
      reason: options.reason,
    })
  }

  const current = getUiOverlayHostProjection(engine)
  if (current?.returnCheckpointId) {
    const checkpoint = engine.getCheckpoint(current.returnCheckpointId)
    if (checkpoint) {
      await engine.jumpTo(checkpoint, { reason: options.reason || 'ui-overlay', resume: 'pause' })
      return getUiOverlayHostProjection(engine)
    }
  }

  await setUiOverlayHostProjection(engine, undefined)
  return undefined
}

function getOrCreateUiOverlayHostRuntimeState(engine: QuaEngineInterface): UiOverlayHostRuntimeState {
  const key = getUiOverlayHostRuntimeKey(engine)
  const existing = uiOverlayHostState.get(key)
  if (existing) {
    return existing
  }

  const created: UiOverlayHostRuntimeState = {
    activeSources: new Set<string>(),
  }
  uiOverlayHostState.set(key, created)
  return created
}

function getUiOverlayHostRuntimeState(engine: QuaEngineInterface): UiOverlayHostRuntimeState | undefined {
  return uiOverlayHostState.get(getUiOverlayHostRuntimeKey(engine))
}

function getRequiredUiOverlayHostRuntimeState(engine: QuaEngineInterface): UiOverlayHostRuntimeState {
  const runtimeState = getUiOverlayHostRuntimeState(engine)
  if (!runtimeState) {
    throw new Error('UiOverlayPlugin must be installed before UI overlay host APIs can be used.')
  }
  return runtimeState
}

function wrapEngineUiMethods(engine: QuaEngineInterface, runtimeState: UiOverlayHostRuntimeState): void {
  if (runtimeState.originalShowUI) {
    return
  }

  const mutableEngine = engine as QuaEngineInterface & {
    showUI: QuaEngineInterface['showUI']
    hideUI: QuaEngineInterface['hideUI']
    updateUI: QuaEngineInterface['updateUI']
  }
  runtimeState.originalShowUI = mutableEngine.showUI.bind(engine)
  runtimeState.originalHideUI = mutableEngine.hideUI.bind(engine)
  runtimeState.originalUpdateUI = mutableEngine.updateUI.bind(engine)

  mutableEngine.showUI = async (elementId, config = {}) => {
    await runtimeState.originalShowUI!(elementId, config)
    await retainUiOverlayHostWithEngine(engine, uiOverlayElementSource(elementId), {
      reason: `ui:${elementId}:open`,
    })
  }

  mutableEngine.hideUI = async (elementId) => {
    await runtimeState.originalHideUI!(elementId)
    await releaseUiOverlayHostWithEngine(engine, uiOverlayElementSource(elementId), {
      reason: `ui:${elementId}:close`,
    })
  }

  mutableEngine.updateUI = async (elementId, config) => {
    await runtimeState.originalUpdateUI!(elementId, config)
    await retainUiOverlayHostWithEngine(engine, uiOverlayElementSource(elementId), {
      reason: `ui:${elementId}:update`,
    })
  }
}

function restoreEngineUiMethods(engine: QuaEngineInterface, runtimeState: UiOverlayHostRuntimeState): void {
  const mutableEngine = engine as QuaEngineInterface & {
    showUI: QuaEngineInterface['showUI']
    hideUI: QuaEngineInterface['hideUI']
    updateUI: QuaEngineInterface['updateUI']
  }
  if (runtimeState.originalShowUI) {
    mutableEngine.showUI = runtimeState.originalShowUI
  }
  if (runtimeState.originalHideUI) {
    mutableEngine.hideUI = runtimeState.originalHideUI
  }
  if (runtimeState.originalUpdateUI) {
    mutableEngine.updateUI = runtimeState.originalUpdateUI
  }
  runtimeState.originalShowUI = undefined
  runtimeState.originalHideUI = undefined
  runtimeState.originalUpdateUI = undefined
}

function syncUiOverlayHostRuntimeSources(engine: QuaEngineInterface, runtimeState: UiOverlayHostRuntimeState): void {
  const projection = getUiOverlayHostProjection(engine)
  const overlaySources = Object.keys(engine.getViewState().ui.overlays || {}).map(uiOverlayElementSource)
  runtimeState.activeSources = new Set<string>([
    ...(projection?.sources || []),
    ...overlaySources,
  ])
}

async function applyUiOverlaySceneEnterState(
  engine: QuaEngineInterface,
  runtimeState: UiOverlayHostRuntimeState,
  ctx?: SceneEnterContext,
): Promise<void> {
  const initialState = isUiOverlaySceneState(ctx?.initialState) ? ctx.initialState : undefined
  if (initialState?.sources?.length) {
    runtimeState.activeSources = new Set(initialState.sources.map(normalizeUiOverlaySource))
  }
  else {
    syncUiOverlayHostRuntimeSources(engine, runtimeState)
  }

  await rebuildUiOverlayHostProjection(engine, runtimeState, {
    sceneActive: true,
    returnCheckpointId: initialState?.returnCheckpointId,
    reason: initialState?.reason || ctx?.reason,
  })
}

async function rebuildUiOverlayHostProjection(
  engine: QuaEngineInterface,
  runtimeState: UiOverlayHostRuntimeState,
  patch: {
    sceneActive?: boolean
    returnCheckpointId?: string
    reason?: string
  } = {},
): Promise<ViewUiSceneHostProjection> {
  const current = getUiOverlayHostProjection(engine)
  const next: ViewUiSceneHostProjection = {
    sceneId: UI_OVERLAY_HOST_SCENE_ID,
    sceneActive: patch.sceneActive ?? current?.sceneActive ?? (engine.getCurrentSceneName() === UI_OVERLAY_HOST_SCENE_ID),
    sources: [...runtimeState.activeSources],
    returnCheckpointId: patch.returnCheckpointId ?? current?.returnCheckpointId,
    reason: patch.reason ?? current?.reason,
  }

  await setUiOverlayHostProjection(engine, next)
  return cloneUiOverlayHostProjection(next)
}

async function setUiOverlayHostProjection(
  engine: QuaEngineInterface,
  host?: ViewUiSceneHostProjection,
): Promise<void> {
  const mutable = getUiOverlayHostMutableEngine(engine)
  mutable.getStore().commit('setUiSceneHost', host ? cloneUiOverlayHostProjection(host) : undefined)
  await mutable.emitViewUpdate()
}

async function createUiOverlayReturnCheckpoint(engine: QuaEngineInterface): Promise<EngineCheckpoint> {
  const checkpoint = await engine.createCheckpoint({ kind: 'manual' })
  engine.getStore().commit('upsertCheckpoint', checkpoint)
  return checkpoint
}

function uiOverlayElementSource(elementId: string): string {
  return normalizeUiOverlaySource(`${UI_OVERLAY_SOURCE_PREFIX}${elementId}`)
}

function normalizeUiOverlaySource(source: string): string {
  const resolved = source.trim()
  if (!resolved) {
    throw new Error('UI overlay host source must not be empty.')
  }
  return resolved
}

function cloneUiOverlayHostProjection(host: ViewUiSceneHostProjection): ViewUiSceneHostProjection {
  return {
    sceneId: host.sceneId,
    sceneActive: host.sceneActive,
    sources: [...host.sources],
    returnCheckpointId: host.returnCheckpointId,
    reason: host.reason,
  }
}

function createUiOverlaySceneState(host: ViewUiSceneHostProjection): JsonSerializableRecord {
  return {
    sceneId: host.sceneId,
    sceneActive: host.sceneActive,
    sources: [...host.sources],
    ...(host.returnCheckpointId ? { returnCheckpointId: host.returnCheckpointId } : {}),
    ...(host.reason ? { reason: host.reason } : {}),
  }
}

function isUiOverlaySceneState(value: unknown): value is UiOverlayHostSceneState {
  if (!value || typeof value !== 'object') {
    return false
  }

  const candidate = value as UiOverlayHostSceneState
  return (
    typeof candidate.sceneId === 'string'
    && Array.isArray(candidate.sources)
    && candidate.sources.every(source => typeof source === 'string')
    && (candidate.returnCheckpointId === undefined || typeof candidate.returnCheckpointId === 'string')
    && (candidate.reason === undefined || typeof candidate.reason === 'string')
  )
}

function getSceneLoader(engine: QuaEngineInterface): QuaEngineInterface & {
  loadScene: (scene: Scene, transition?: SceneTransitionIntent, enterContext?: SceneEnterContext) => Promise<void>
} {
  return engine as QuaEngineInterface & {
    loadScene: (scene: Scene, transition?: SceneTransitionIntent, enterContext?: SceneEnterContext) => Promise<void>
  }
}

function getUiOverlayHostMutableEngine(engine: QuaEngineInterface): QuaEngineInterface & {
  getStore: () => { commit: (type: string, payload?: unknown) => void }
  emitViewUpdate: () => Promise<void>
} {
  return engine as unknown as QuaEngineInterface & {
    getStore: () => { commit: (type: string, payload?: unknown) => void }
    emitViewUpdate: () => Promise<void>
  }
}

function getUiOverlayHostRuntimeKey(engine: QuaEngineInterface): object {
  return engine.getStore() as unknown as object
}
