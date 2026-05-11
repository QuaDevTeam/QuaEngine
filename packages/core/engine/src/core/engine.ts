import type { QuaStore } from '@quajs/store'
import type {
  ActiveAnimationProjection,
  EventPayload,
  LogicToRenderEvents,
  QuaViewProjection,
  RenderToLogicEvents,
} from '../events/events'
import type {
  EngineContext,
  EnginePlugin,
  PluginConstructor,
  PluginConstructorOptions,
} from '../plugins/core/types'
import type {
  BackgroundIntent,
  CharacterIntent,
  ChoiceIntent,
  CreateCheckpointOptions,
  DialogueIntent,
  EffectIntent,
  EngineCheckpoint,
  EngineConfig,
  GameStep,
  GameStepFactory,
  GameStepScope,
  GameStepSource,
  JumpContext,
  JumpOptions,
  JumpTarget,
  LoadSlotOptions,
  OptionalGameStepFactory,
  Scene,
  SlotMetadata,
  StepContext,
  StoryPoint,
  UiIntent,
} from './types'
import { QuaAssets } from '@quajs/assets'
import { getPackageLogger } from '@quajs/logger'
import { Pipeline } from '@quajs/pipeline'
import { createStore } from '@quajs/store'
import {
  emitLogicToRender,
  LogicToRenderEvents as L2R,
  waitForPipelineEvent,
} from '../events/events'
import { GameManager } from '../managers/game-manager'
import { SceneManager } from '../managers/scene-manager'
import { PluginContextImpl } from '../plugins/core/context'
import { resolveGameSteps } from './script'
import { createInitialEngineState } from './types'

const logger = getPackageLogger('engine')

export class QuaEngine {
  private static instance: QuaEngine | null = null
  private readonly store: QuaStore
  private readonly assets: QuaAssets
  private readonly pipeline: Pipeline
  private readonly plugins: Map<string, EnginePlugin> = new Map()
  private readonly pluginContext: PluginContextImpl = new PluginContextImpl()
  private currentStepAbortController?: AbortController
  private checkpointCounter = 0
  private navigationVersion = 0
  private isInitialized = false
  private isDestroyed = false

  public readonly gameManager: GameManager
  public readonly sceneManager: SceneManager

  constructor(private config: EngineConfig = {}) {
    if (QuaEngine.instance) {
      throw new Error('QuaEngine is a singleton. Use QuaEngine.getInstance() instead.')
    }
    if (!config.assets) {
      throw new Error('QuaEngine requires assets config with an adapter')
    }

    this.store = createStore({
      name: 'quaengine-main',
      state: {
        engine: createInitialEngineState(),
      },
      mutations: createEngineMutations(),
      storage: config.store?.storage,
    })
    this.assets = new QuaAssets(config.assets)
    this.pipeline = new Pipeline()
    this.sceneManager = new SceneManager(this)
    this.gameManager = new GameManager(this)

    this.setupAssetForwarding()
    logger.info('QuaEngine initialized')
  }

  static getInstance(config?: EngineConfig): QuaEngine {
    if (!QuaEngine.instance) {
      if (!config) {
        throw new Error('QuaEngine config is required for first initialization')
      }
      QuaEngine.instance = new QuaEngine(config)
    }
    return QuaEngine.instance
  }

  static resetInstance(): void {
    QuaEngine.instance = null
  }

  async init(): Promise<void> {
    if (this.isInitialized) {
      logger.warn('Engine already initialized')
      return
    }

    await Promise.all([
      this.assets.initialize(),
      this.initializePlugins(),
    ])

    this.isInitialized = true
    await emitLogicToRender(this.pipeline, L2R.SYSTEM_MESSAGE, {
      type: 'engine_ready',
      message: 'QuaEngine initialized successfully',
    })
    await this.emitViewUpdate()
  }

  use<_T extends EnginePlugin>(
    PluginClass: PluginConstructor,
    options?: PluginConstructorOptions
  ): this
  use<T extends EnginePlugin>(plugin: T): this
  use<T extends EnginePlugin>(
    pluginOrClass: PluginConstructor | T,
    options?: PluginConstructorOptions,
  ): this {
    const plugin = typeof pluginOrClass === 'function'
      ? new (pluginOrClass as PluginConstructor)(options || {})
      : pluginOrClass

    if (this.plugins.has(plugin.name)) {
      logger.warn(`Plugin ${plugin.name} already registered, skipping`)
      return this
    }

    this.plugins.set(plugin.name, plugin)
    this.pluginContext.registerPlugin(plugin)

    if (this.isInitialized) {
      this.initializePlugin(plugin).catch((error) => {
        logger.error(`Failed to initialize plugin ${plugin.name}:`, error)
      })
    }

    return this
  }

  async loadScene(scene: Scene): Promise<void> {
    this.assertInitialized()
    await this.sceneManager.loadScene(scene)
  }

  async dialogue(steps: GameStep[]): Promise<void>
  async dialogue<TScope>(steps: OptionalGameStepFactory<TScope>, scope?: TScope): Promise<void>
  async dialogue<TScope>(steps: GameStepFactory<TScope>, scope: TScope): Promise<void>
  async dialogue<TScope = GameStepScope>(steps: GameStepSource<TScope>, scope?: TScope): Promise<void> {
    this.assertInitialized()
    const resolvedSteps = resolveGameSteps(steps, scope)
    const navigationVersion = this.navigationVersion
    for (const step of resolvedSteps) {
      if (this.navigationVersion !== navigationVersion) {
        break
      }
      await this.executeStep(step)
      if (this.navigationVersion !== navigationVersion) {
        break
      }
    }
  }

  async executeStep(step: GameStep): Promise<void> {
    this.assertInitialized()

    const runtime = this.getRuntimeState()
    const previousStepId = runtime.currentStepId || undefined
    const point = this.resolveStepPoint(step)
    const stepHistory = [...runtime.stepHistory, step.uuid]
    const abortController = new AbortController()
    this.currentStepAbortController = abortController

    try {
      this.store.commit('setCurrentStep', {
        stepId: step.uuid,
        stepHistory,
      })
      this.store.commit('setStoryPoint', point)

      if (this.config.store?.enableSnapshots !== false) {
        await this.createCheckpoint({
          id: step.uuid,
          kind: 'step',
          point,
          metadata: step.metadata,
        })
      }

      const stepContext: StepContext = {
        engine: this,
        stepId: step.uuid,
        previousStepId,
        point,
        signal: abortController.signal,
        store: this.store,
        assets: this.assets,
        pipeline: this.pipeline,
      }

      await this.notifyPlugins('onStepStart', this.createEngineContext(step.uuid, { point }))
      await this.notifyPluginsOnStep(stepContext)
      await step.run(stepContext)
      if (abortController.signal.aborted) {
        logger.debug(`Step execution cancelled: ${step.uuid}`)
        return
      }
      await this.notifyPlugins('onStepComplete', this.createEngineContext(step.uuid, { point }))
      await this.emitViewUpdate()
    }
    catch (error) {
      if (abortController.signal.aborted) {
        logger.debug(`Step execution cancelled: ${step.uuid}`)
        return
      }
      logger.error(`Step execution failed: ${step.uuid}`, error)
      throw error
    }
    finally {
      if (this.currentStepAbortController === abortController) {
        this.currentStepAbortController = undefined
      }
    }
  }

  async rewind(stepUUID: string): Promise<void> {
    this.assertInitialized()
    await this.jumpTo(stepUUID, { reason: 'rewind', force: true })
  }

  async showDialogue(payload: DialogueIntent): Promise<void> {
    this.assertInitialized()
    this.store.commit('setDialogue', payload)
    await emitLogicToRender(this.pipeline, L2R.DIALOGUE_SHOW, {
      characterId: payload.characterId,
      characterName: payload.characterName,
      text: payload.text,
    })
    await this.emitViewUpdate()
  }

  async hideDialogue(): Promise<void> {
    this.assertInitialized()
    this.store.commit('hideDialogue')
    await emitLogicToRender(this.pipeline, L2R.DIALOGUE_HIDE, {})
    await this.emitViewUpdate()
  }

  async showChoices(choices: ChoiceIntent[]): Promise<void> {
    this.assertInitialized()
    const normalized = choices.map(choice => ({
      ...choice,
      enabled: choice.enabled !== false,
    }))
    this.store.commit('setChoices', normalized)
    await emitLogicToRender(this.pipeline, L2R.DIALOGUE_CHOICE, { choices: normalized })
    await this.emitViewUpdate()
  }

  async clearChoices(): Promise<void> {
    this.assertInitialized()
    this.store.commit('setChoices', [])
    await this.emitViewUpdate()
  }

  async showCharacter(payload: CharacterIntent): Promise<void> {
    this.assertInitialized()
    this.store.commit('upsertCharacter', {
      ...payload,
      visible: payload.visible !== false,
    })
    await emitLogicToRender(this.pipeline, L2R.CHARACTER_SHOW, payload)
    await this.emitViewUpdate()
  }

  async hideCharacter(id: string): Promise<void> {
    this.assertInitialized()
    this.store.commit('hideCharacter', id)
    await emitLogicToRender(this.pipeline, L2R.CHARACTER_HIDE, { id })
    await this.emitViewUpdate()
  }

  async moveCharacter(id: string, position: CharacterIntent['position']): Promise<void> {
    this.assertInitialized()
    this.store.commit('moveCharacter', { id, position })
    await emitLogicToRender(this.pipeline, L2R.CHARACTER_MOVE, { id, position })
    await this.emitViewUpdate()
  }

  async setCharacterExpression(id: string, expression?: string): Promise<void> {
    this.assertInitialized()
    this.store.commit('setCharacterExpression', { id, expression })
    await emitLogicToRender(this.pipeline, L2R.CHARACTER_EXPRESSION, { id, expression })
    await this.emitViewUpdate()
  }

  async setCharacterSprite(id: string, sprite?: string): Promise<void> {
    this.assertInitialized()
    this.store.commit('setCharacterSprite', { id, sprite })
    await emitLogicToRender(this.pipeline, L2R.CHARACTER_SPRITE, { id, sprite })
    await this.emitViewUpdate()
  }

  async setBackgroundProjection(background?: BackgroundIntent): Promise<void> {
    this.assertInitialized()
    this.store.commit('setBackground', background)
    if (background) {
      await emitLogicToRender(this.pipeline, L2R.BACKGROUND_SET, background)
    }
    else {
      await emitLogicToRender(this.pipeline, L2R.BACKGROUND_CLEAR, {})
    }
    await this.emitViewUpdate()
  }

  async setAnimationProjection(animation: ActiveAnimationProjection): Promise<void> {
    this.assertInitialized()
    this.store.commit('upsertAnimation', animation)
    await this.emitViewUpdate()
  }

  async removeAnimationProjection(id: string): Promise<void> {
    this.assertInitialized()
    this.store.commit('removeAnimation', id)
    await this.emitViewUpdate()
  }

  async clearAnimationProjections(): Promise<void> {
    this.assertInitialized()
    this.store.commit('clearAnimations')
    await this.emitViewUpdate()
  }

  async setPluginProjection<T = unknown>(pluginId: string, projection?: T): Promise<void> {
    this.assertInitialized()
    this.store.commit('setPluginProjection', { pluginId, projection })
    await this.emitViewUpdate()
  }

  async getAssetMetadata(type: 'audio' | 'images' | 'characters' | 'video' | 'scripts' | 'data', assetName: string): Promise<unknown> {
    this.assertInitialized()
    return await this.assets.getMediaMetadata(type, assetName)
  }

  async showUI(elementId: string, config: Record<string, unknown> = {}): Promise<void> {
    this.assertInitialized()
    this.store.commit('upsertUiOverlay', { elementId, config })
    await emitLogicToRender(this.pipeline, L2R.UI_SHOW, { elementId, config })
    await this.emitViewUpdate()
  }

  async hideUI(elementId: string): Promise<void> {
    this.assertInitialized()
    this.store.commit('removeUiOverlay', elementId)
    await emitLogicToRender(this.pipeline, L2R.UI_HIDE, { elementId })
    await this.emitViewUpdate()
  }

  async updateUI(elementId: string, config: Record<string, unknown>): Promise<void> {
    this.assertInitialized()
    this.store.commit('upsertUiOverlay', { elementId, config })
    await emitLogicToRender(this.pipeline, L2R.UI_UPDATE, { elementId, config })
    await this.emitViewUpdate()
  }

  async applyEffect(effect: EffectIntent): Promise<void> {
    this.assertInitialized()
    const next = {
      ...effect,
      id: effect.id || `${effect.type}:${Date.now()}`,
    }
    this.store.commit('upsertEffect', next)
    const eventMap: Partial<Record<string, LogicToRenderEvents>> = {
      fade_in: L2R.EFFECT_FADE_IN,
      fade_out: L2R.EFFECT_FADE_OUT,
      shake: L2R.EFFECT_SHAKE,
      flash: L2R.EFFECT_FLASH,
    }
    const eventType = eventMap[next.type]
    if (eventType) {
      await emitLogicToRender(this.pipeline, eventType, next)
    }
    await this.emitViewUpdate()
  }

  async clearEffect(id: string): Promise<void> {
    this.assertInitialized()
    this.store.commit('removeEffect', id)
    await this.emitViewUpdate()
  }

  getAssets(): QuaAssets {
    return this.assets
  }

  getPipeline(): Pipeline {
    return this.pipeline
  }

  getStore(): QuaStore {
    return this.store
  }

  getViewState() {
    return cloneViewProjection(this.getEngineState().view)
  }

  getPluginProjection<T = unknown>(pluginId: string): T | undefined {
    return cloneUnknownValue(this.getEngineState().view.plugins[pluginId]) as T | undefined
  }

  getStoryPoint(): StoryPoint | undefined {
    const point = this.getRuntimeState().currentStoryPoint
    return point ? { ...point } : undefined
  }

  async setStoryPoint(point: StoryPoint): Promise<void> {
    this.assertInitialized()
    this.store.commit('setStoryPoint', cloneStoryPoint(point))
    await this.emitViewUpdate()
  }

  async createCheckpoint(options: CreateCheckpointOptions = {}): Promise<EngineCheckpoint> {
    this.assertInitialized()
    const point = cloneStoryPoint(options.point || this.getStoryPoint() || this.createCurrentStoryPoint())
    const id = options.id || this.createCheckpointId(options.kind || 'manual', point)
    const checkpoint: EngineCheckpoint = {
      id,
      point,
      snapshotId: id,
      kind: options.kind || 'manual',
      metadata: options.metadata ? cloneUnknownRecord(options.metadata) : undefined,
    }

    await this.notifyPlugins('onBeforeCheckpoint', this.createEngineContext(point.stepId, { point, checkpoint }))
    await this.store.snapshot(checkpoint.snapshotId)
    this.store.commit('upsertCheckpoint', checkpoint)
    await this.notifyPlugins('onAfterCheckpoint', this.createEngineContext(point.stepId, { point, checkpoint }))
    return cloneCheckpoint(checkpoint)
  }

  getCheckpoint(id: string): EngineCheckpoint | undefined {
    const checkpoint = this.getEngineState().checkpoints[id]
    return checkpoint ? cloneCheckpoint(checkpoint) : undefined
  }

  waitFor<T extends LogicToRenderEvents | RenderToLogicEvents>(
    event: T,
    matcher?: (payload: EventPayload<T>) => boolean,
    options?: { timeout?: number, signal?: any },
  ): Promise<EventPayload<T>> {
    const signal = options?.signal || this.currentStepAbortController?.signal
    if (signal?.aborted) {
      return Promise.reject(new Error(`Waiting for ${event} was cancelled`))
    }
    return waitForPipelineEvent(this.pipeline, event, matcher, { ...options, signal })
  }

  async jumpTo(target: JumpTarget, options: JumpOptions = {}): Promise<void> {
    this.assertInitialized()
    const checkpoint = this.resolveJumpCheckpoint(target)
    const point = checkpoint?.point || this.resolveJumpPoint(target)
    if (!point) {
      throw new Error(`Unable to resolve jump target: ${typeof target === 'string' ? target : JSON.stringify(target)}`)
    }

    const jump: JumpContext = {
      target,
      checkpoint,
      point,
      options: {
        reason: options.reason,
        resume: options.resume || 'pause',
        mode: options.mode || (checkpoint ? 'restore' : 'fresh'),
        force: options.force,
        audio: options.audio || 'restore',
        animation: options.animation || 'clear-active',
        effects: options.effects || 'clear-active',
        ui: options.ui || 'clear-transient',
      },
    }

    this.currentStepAbortController?.abort()
    this.navigationVersion++
    await this.notifyPlugins('onBeforeJump', this.createEngineContext(point.stepId, { point, checkpoint, jump }))

    if (jump.options.mode === 'restore' && checkpoint) {
      await this.store.restore(checkpoint.snapshotId, { force: options.force ?? true })
    }
    else {
      this.store.commit('setStoryPoint', point)
      this.store.commit('setCurrentStep', {
        stepId: point.stepId,
        stepHistory: this.truncateStepHistory(point.stepId),
      })
    }

    this.store.commit('setChoices', [])
    if (jump.options.animation === 'clear-active') {
      this.store.commit('clearAnimations')
    }
    if (jump.options.effects === 'clear-active') {
      this.store.commit('clearEffects')
    }
    if (jump.options.ui === 'clear-transient') {
      this.store.commit('clearUiOverlays')
    }
    this.store.commit('setStoryPoint', point)
    if (checkpoint) {
      this.store.commit('upsertCheckpoint', checkpoint)
      this.store.commit('setCurrentCheckpoint', checkpoint.id)
    }

    await emitLogicToRender(this.pipeline, L2R.SCENE_INIT, {
      sceneId: point.sceneId || this.getRuntimeState().currentScene || 'unknown',
      stepId: point.stepId,
    })
    await this.notifyPlugins('onAfterJump', this.createEngineContext(point.stepId, { point, checkpoint, jump }))
    await this.emitViewUpdate()
  }

  async saveToSlot(slotId: string, metadata: SlotMetadata = {}): Promise<void> {
    this.assertInitialized()
    const checkpoint = await this.createCheckpoint({
      id: `save:${slotId}`,
      kind: 'save',
      metadata,
    })
    await this.store.saveToSlot(slotId, {
      ...metadata,
      sceneName: metadata.sceneName || this.getCurrentSceneName(),
      stepId: metadata.stepId || this.getCurrentStepId(),
      checkpointId: checkpoint.id,
      storyPoint: this.getStoryPoint(),
      timestamp: Date.now(),
    })
  }

  async loadFromSlot(slotId: string, options: LoadSlotOptions = {}): Promise<void> {
    this.assertInitialized()
    const slot = await this.store.getSlot(slotId)
    const slotPoint = isStoryPoint(slot?.metadata.storyPoint) ? cloneStoryPoint(slot.metadata.storyPoint) : undefined
    const beforeJump = slotPoint
      ? this.createLoadJumpContext(slotPoint, options)
      : undefined

    this.currentStepAbortController?.abort()
    this.navigationVersion++
    if (beforeJump) {
      await this.notifyPlugins('onBeforeJump', this.createEngineContext(beforeJump.point.stepId, {
        point: beforeJump.point,
        checkpoint: beforeJump.checkpoint,
        jump: beforeJump,
      }))
    }

    await this.store.loadFromSlot(slotId, options)
    const point = this.getStoryPoint() || slotPoint
    if (point && !this.getStoryPoint()) {
      this.store.commit('setStoryPoint', point)
    }
    const checkpointId = this.getRuntimeState().currentCheckpointId
    const checkpoint = checkpointId ? this.getCheckpoint(checkpointId) : undefined
    const jump: JumpContext | undefined = point
      ? this.createLoadJumpContext(point, options, checkpoint)
      : undefined
    if (jump) {
      await this.notifyPlugins('onAfterJump', this.createEngineContext(jump.point.stepId, {
        point: jump.point,
        checkpoint: jump.checkpoint,
        jump,
      }))
    }
    await this.emitViewUpdate()
  }

  async quickSave(metadata: SlotMetadata = {}): Promise<void> {
    await this.saveToSlot('quicksave', { name: 'Quick Save', ...metadata })
  }

  async quickLoad(): Promise<void> {
    await this.loadFromSlot('quicksave', { force: true, reason: 'quick-load' })
  }

  async autoSave(metadata: SlotMetadata = {}): Promise<void> {
    await this.saveToSlot('autosave', { name: 'Auto Save', ...metadata })
  }

  async listSaveSlots() {
    return await this.store.listSlots()
  }

  async deleteSaveSlot(slotId: string): Promise<void> {
    await this.store.deleteSlot(slotId)
  }

  getCurrentSceneName(): string | undefined {
    return this.getRuntimeState().currentScene || undefined
  }

  getCurrentStepId(): string | undefined {
    return this.getRuntimeState().currentStepId || undefined
  }

  async destroy(): Promise<void> {
    if (this.isDestroyed)
      return

    this.currentStepAbortController?.abort()
    await this.sceneManager.destroy()
    for (const plugin of this.plugins.values()) {
      await plugin.destroy?.()
    }
    this.gameManager.destroy()
    await this.assets.cleanup()
    this.plugins.clear()
    this.pluginContext.clear()
    this.isDestroyed = true
    this.isInitialized = false
  }

  private assertInitialized(): void {
    if (!this.isInitialized) {
      throw new Error('Engine not initialized. Call init() first.')
    }
    if (this.isDestroyed) {
      throw new Error('Engine has been destroyed')
    }
  }

  private async initializePlugins(): Promise<void> {
    await Promise.all(Array.from(this.plugins.values()).map(plugin => this.initializePlugin(plugin)))
  }

  private async initializePlugin(plugin: EnginePlugin): Promise<void> {
    const context = this.createEngineContext()
    await plugin.init(context)
  }

  private async notifyPluginsOnStep(stepContext: StepContext): Promise<void> {
    await Promise.all(Array.from(this.plugins.values())
      .filter(plugin => plugin.onStep)
      .map(plugin => plugin.onStep!(this.createEngineContext(stepContext.stepId, { point: stepContext.point }))))
  }

  private async notifyPlugins(
    hook: 'onStepStart' | 'onStepComplete' | 'onBeforeCheckpoint' | 'onAfterCheckpoint' | 'onBeforeJump' | 'onAfterJump',
    context: EngineContext,
  ): Promise<void> {
    await Promise.all(Array.from(this.plugins.values())
      .filter(plugin => plugin[hook])
      .map(plugin => plugin[hook]!(context)))
  }

  private createEngineContext(
    stepId?: string,
    extras: Pick<EngineContext, 'point' | 'checkpoint' | 'jump'> = {},
  ): EngineContext {
    return {
      engine: this,
      store: this.store,
      assets: this.assets,
      pipeline: this.pipeline,
      stepId,
      ...extras,
      plugins: this.pluginContext,
    }
  }

  private setupAssetForwarding(): void {
    this.assets.on('asset:changed', (change) => {
      emitLogicToRender(this.pipeline, L2R.ASSET_CHANGED, change).catch((error) => {
        logger.warn('Failed to forward asset change:', error)
      })
    })
  }

  private async emitViewUpdate(): Promise<void> {
    await emitLogicToRender(this.pipeline, L2R.VIEW_UPDATE, { view: this.getViewState() })
  }

  private getRuntimeState() {
    return this.getEngineState().runtime
  }

  private getEngineState() {
    return this.store.state.engine as ReturnType<typeof createInitialEngineState>
  }

  private resolveStepPoint(step: GameStep): StoryPoint {
    const current = this.getStoryPoint()
    return {
      ...(current || {}),
      ...(step.metadata?.point || {}),
      sceneId: step.metadata?.point?.sceneId || current?.sceneId || this.getCurrentSceneName(),
      stepId: step.uuid,
    }
  }

  private createCurrentStoryPoint(): StoryPoint {
    return {
      sceneId: this.getCurrentSceneName(),
      stepId: this.getCurrentStepId() || 'unknown',
    }
  }

  private createCheckpointId(kind: EngineCheckpoint['kind'], point: StoryPoint): string {
    let id: string
    do {
      id = `${kind}:${point.stepId}:${++this.checkpointCounter}`
    } while (this.getEngineState().checkpoints[id])
    return id
  }

  private resolveJumpCheckpoint(target: JumpTarget): EngineCheckpoint | undefined {
    if (typeof target === 'string') {
      return this.getCheckpoint(target)
    }
    if ('snapshotId' in target) {
      return cloneCheckpoint(target)
    }
    return Object.values(this.getEngineState().checkpoints).find(checkpoint => storyPointMatches(checkpoint.point, target))
  }

  private resolveJumpPoint(target: JumpTarget): StoryPoint | undefined {
    if (typeof target === 'string') {
      const checkpoint = this.getCheckpoint(target)
      if (checkpoint) {
        return checkpoint.point
      }
      return this.getRuntimeState().stepHistory.includes(target)
        ? { ...this.createCurrentStoryPoint(), stepId: target }
        : undefined
    }
    if ('snapshotId' in target) {
      return cloneStoryPoint(target.point)
    }
    return cloneStoryPoint(target)
  }

  private truncateStepHistory(stepId: string): string[] {
    const history = this.getRuntimeState().stepHistory
    const index = history.indexOf(stepId)
    return index === -1 ? [...history, stepId] : history.slice(0, index + 1)
  }

  private createLoadJumpContext(point: StoryPoint, options: LoadSlotOptions, checkpoint?: EngineCheckpoint): JumpContext {
    return {
      target: point,
      checkpoint,
      point,
      options: {
        reason: options.reason || 'load',
        resume: 'pause',
        mode: 'restore',
        force: options.force,
        audio: 'restore',
        animation: 'restore',
        effects: 'restore',
        ui: 'restore',
      },
    }
  }
}

function createEngineMutations() {
  return {
    setCurrentScene(state: any, sceneName: string | null) {
      if (state.engine.runtime.currentScene && state.engine.runtime.currentScene !== sceneName) {
        state.engine.runtime.sceneHistory = [
          ...state.engine.runtime.sceneHistory,
          state.engine.runtime.currentScene,
        ].slice(-50)
      }
      state.engine.runtime.currentScene = sceneName
    },
    clearSceneHistory(state: any) {
      state.engine.runtime.sceneHistory = []
    },
    setCurrentStep(state: any, payload: { stepId: string, stepHistory: string[] }) {
      state.engine.runtime.currentStepId = payload.stepId
      state.engine.runtime.stepHistory = [...payload.stepHistory]
    },
    setStoryPoint(state: any, payload: StoryPoint) {
      state.engine.runtime.currentStoryPoint = cloneStoryPoint(payload)
      state.engine.runtime.currentStepId = payload.stepId
    },
    upsertCheckpoint(state: any, payload: EngineCheckpoint) {
      state.engine.checkpoints = {
        ...(state.engine.checkpoints || {}),
        [payload.id]: cloneCheckpoint(payload),
      }
      state.engine.runtime.currentCheckpointId = payload.id
      state.engine.runtime.checkpointHistory = [
        ...(state.engine.runtime.checkpointHistory || []).filter((id: string) => id !== payload.id),
        payload.id,
      ].slice(-200)
    },
    setCurrentCheckpoint(state: any, checkpointId: string) {
      state.engine.runtime.currentCheckpointId = checkpointId
    },
    setPluginProjection(state: any, payload: { pluginId: string, projection?: unknown }) {
      const plugins = {
        ...(state.engine.view.plugins || {}),
      }
      if (payload.projection === undefined) {
        delete plugins[payload.pluginId]
      }
      else {
        plugins[payload.pluginId] = cloneUnknownValue(payload.projection)
      }
      state.engine.view.plugins = plugins
    },
    upsertUiOverlay(state: any, payload: { elementId: string, config?: Record<string, unknown> }) {
      const overlays = {
        ...(state.engine.view.ui.overlays || {}),
        [payload.elementId]: payload.config || {},
      }
      state.engine.view.ui = {
        ...state.engine.view.ui,
        visible: true,
        overlays,
      } satisfies UiIntent
    },
    removeUiOverlay(state: any, elementId: string) {
      const overlays = { ...(state.engine.view.ui.overlays || {}) }
      delete overlays[elementId]
      state.engine.view.ui = {
        ...state.engine.view.ui,
        overlays,
      } satisfies UiIntent
    },
    clearUiOverlays(state: any) {
      state.engine.view.ui = {
        ...state.engine.view.ui,
        overlays: {},
      } satisfies UiIntent
    },
    upsertEffect(state: any, payload: EffectIntent) {
      state.engine.view.effects = [
        ...state.engine.view.effects.filter((effect: EffectIntent) => effect.id !== payload.id),
        payload,
      ]
    },
    removeEffect(state: any, id: string) {
      state.engine.view.effects = state.engine.view.effects.filter((effect: EffectIntent) => effect.id !== id)
    },
    clearEffects(state: any) {
      state.engine.view.effects = []
    },
    setBackground(state: any, payload?: BackgroundIntent) {
      state.engine.view.background = payload
    },
    upsertAnimation(state: any, payload: ActiveAnimationProjection) {
      const animations = state.engine.view.animations || []
      state.engine.view.animations = [
        ...animations.filter((animation: ActiveAnimationProjection) => animation.id !== payload.id),
        payload,
      ]
    },
    removeAnimation(state: any, id: string) {
      state.engine.view.animations = (state.engine.view.animations || []).filter((animation: ActiveAnimationProjection) => animation.id !== id)
    },
    clearAnimations(state: any) {
      state.engine.view.animations = []
    },
    setDialogue(state: any, payload: DialogueIntent) {
      state.engine.view.dialogue = {
        visible: true,
        characterId: payload.characterId,
        characterName: payload.characterName,
        text: payload.text,
        mode: payload.mode || (payload.characterId || payload.characterName ? 'say' : 'narration'),
      }
    },
    hideDialogue(state: any) {
      state.engine.view.dialogue = { visible: false, text: '' }
    },
    setChoices(state: any, choices: ChoiceIntent[]) {
      state.engine.view.choices = choices.map(choice => ({
        id: choice.id,
        text: choice.text,
        enabled: choice.enabled !== false,
        metadata: choice.metadata,
      }))
    },
    upsertCharacter(state: any, payload: CharacterIntent) {
      const characters = [...state.engine.view.characters]
      const index = characters.findIndex((character: CharacterIntent) => character.id === payload.id)
      const next = {
        ...(index === -1 ? {} : characters[index]),
        ...payload,
        name: payload.name || payload.id,
        visible: payload.visible !== false,
      }
      if (index === -1) {
        characters.push(next)
      }
      else {
        characters[index] = next
      }
      state.engine.view.characters = characters
    },
    hideCharacter(state: any, id: string) {
      state.engine.view.characters = state.engine.view.characters.map((character: CharacterIntent) =>
        character.id === id ? { ...character, visible: false } : character,
      )
    },
    moveCharacter(state: any, payload: { id: string, position: CharacterIntent['position'] }) {
      state.engine.view.characters = state.engine.view.characters.map((character: CharacterIntent) =>
        character.id === payload.id ? { ...character, position: payload.position } : character,
      )
    },
    setCharacterExpression(state: any, payload: { id: string, expression?: string }) {
      state.engine.view.characters = state.engine.view.characters.map((character: CharacterIntent) =>
        character.id === payload.id ? { ...character, expression: payload.expression } : character,
      )
    },
    setCharacterSprite(state: any, payload: { id: string, sprite?: string }) {
      state.engine.view.characters = state.engine.view.characters.map((character: CharacterIntent) =>
        character.id === payload.id ? { ...character, sprite: payload.sprite } : character,
      )
    },
  }
}

function cloneViewProjection(view: QuaViewProjection): QuaViewProjection {
  return {
    background: view.background
      ? {
          ...view.background,
          transition: view.background.transition ? { ...view.background.transition } : undefined,
          video: view.background.video
            ? {
                ...view.background.video,
                transition: view.background.video.transition ? { ...view.background.video.transition } : undefined,
                metadata: view.background.video.metadata ? cloneUnknownRecord(view.background.video.metadata) : undefined,
              }
            : undefined,
          layers: view.background.layers?.map(layer => ({
            ...layer,
            transition: layer.transition ? { ...layer.transition } : undefined,
            metadata: layer.metadata ? cloneUnknownRecord(layer.metadata) : undefined,
          })),
          metadata: view.background.metadata ? cloneUnknownRecord(view.background.metadata) : undefined,
        }
      : undefined,
    characters: view.characters.map(character => ({
      ...character,
      position: character.position ? { ...character.position } : undefined,
      metadata: character.metadata ? { ...character.metadata } : undefined,
    })),
    dialogue: { ...view.dialogue },
    choices: view.choices.map(choice => ({
      ...choice,
      metadata: choice.metadata ? { ...choice.metadata } : undefined,
    })),
    ui: {
      ...view.ui,
      overlays: view.ui.overlays ? cloneUnknownRecord(view.ui.overlays) : undefined,
    },
    effects: view.effects.map(effect => ({
      ...effect,
      options: effect.options ? cloneUnknownRecord(effect.options) : undefined,
    })),
    animations: (view.animations || []).map(animation => ({
      ...animation,
      bindings: animation.bindings ? { ...animation.bindings } : undefined,
      resolvedTracks: animation.resolvedTracks.map(track => ({
        ...track,
        keyframes: track.keyframes.map(keyframe => ({ ...keyframe })),
      })),
    })),
    plugins: cloneUnknownRecord(view.plugins || {}),
  }
}

function cloneCheckpoint(checkpoint: EngineCheckpoint): EngineCheckpoint {
  return {
    ...checkpoint,
    point: cloneStoryPoint(checkpoint.point),
    metadata: checkpoint.metadata ? cloneUnknownRecord(checkpoint.metadata) : undefined,
  }
}

function cloneStoryPoint(point: StoryPoint): StoryPoint {
  return { ...point }
}

function storyPointMatches(point: StoryPoint, partial: StoryPoint): boolean {
  return Object.entries(partial).every(([key, value]) =>
    value === undefined || point[key as keyof StoryPoint] === value,
  )
}

function isStoryPoint(value: unknown): value is StoryPoint {
  return Boolean(value)
    && typeof value === 'object'
    && typeof (value as { stepId?: unknown }).stepId === 'string'
}

function cloneUnknownRecord<T extends Readonly<Record<string, unknown>>>(value: T): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cloneUnknownValue(item)]))
}

function cloneUnknownValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(cloneUnknownValue)
  }
  if (value && typeof value === 'object') {
    return cloneUnknownRecord(value as Readonly<Record<string, unknown>>)
  }
  return value
}
