import type { EventListener } from '@quajs/pipeline'
import type { QuaStore } from '@quajs/store'
import type {
  ActiveAnimationProjection,
  EventPayload,
  FlowControlMode,
  FlowControlPolicy,
  LogicToRenderEvents,
  QuaViewProjection,
  RenderToLogicEvents,
  ViewFlowControlProjection,
} from '../events/events'
import type { SceneTransitionOptions } from '../managers/scene-manager'
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
  EngineFlowControlProgressState,
  FlowControlRuntimeOptions,
  GameStep,
  GameStepFactory,
  GameStepScope,
  GameStepSource,
  JumpContext,
  JumpOptions,
  JumpTarget,
  LoadSlotOptions,
  OptionalGameStepFactory,
  RuntimePackageLoadOptions,
  RuntimePackageManifest,
  QuaEngineInterface,
  RuntimePackageStateRecord,
  RuntimePackageStoreMigrationManifest,
  RuntimePackageUnloadOptions,
  RuntimeScriptModuleRecord,
  RuntimeScriptModuleRunOptions,
  Scene,
  SlotMetadata,
  StepContext,
  StoryPoint,
  TranslateInput,
  UiIntent,
  ViewLayoutInput,
} from './types'
import { QuaAssets } from '@quajs/assets'
import { getPackageLogger } from '@quajs/logger'
import { Pipeline } from '@quajs/pipeline'
import { createStore } from '@quajs/store'
import {
  createFlowControlProjection,
  createViewLayoutProjection,
  emitLogicToRender,
  emitRenderToLogic,
  LogicToRenderEvents as L2R,
  RenderToLogicEvents as R2L,
  waitForPipelineEvent,
} from '../events/events'
import { GameManager } from '../managers/game-manager'
import { SceneManager } from '../managers/scene-manager'
import { PluginContextImpl } from '../plugins/core/context'
import { RuntimeContentManager } from '../runtime-content/manager'
import { resolveGameSteps } from './script'
import { createInitialEngineState } from './types'

const logger = getPackageLogger('engine')

interface FlowControlAdvancePlan {
  delayMs: number
  mode: Exclude<FlowControlMode, 'normal'>
  source: string
}

type FlowControlProjectionPatch = FlowControlRuntimeOptions & {
  mode?: FlowControlMode
  lastAdvance?: ViewFlowControlProjection['lastAdvance']
}

export class QuaEngine {
  private static instance: QuaEngine | null = null
  private readonly store: QuaStore
  private readonly assets: QuaAssets
  private readonly pipeline: Pipeline
  private readonly plugins: Map<string, EnginePlugin> = new Map()
  private readonly pluginContext: PluginContextImpl = new PluginContextImpl()
  private readonly flowControlDisposers: Array<() => void> = []
  private readonly runtimeContentManager: RuntimeContentManager
  private currentStepAbortController?: AbortController
  private flowControlAdvanceTimer?: ReturnType<typeof setTimeout>
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
        engine: createInitialEngineState(config.layout, config.flowControl),
      },
      mutations: createEngineMutations(),
      storage: config.store?.storage,
    })
    this.assets = new QuaAssets(config.assets)
    this.pipeline = new Pipeline()
    this.sceneManager = new SceneManager(this)
    this.gameManager = new GameManager(this)
    this.runtimeContentManager = new RuntimeContentManager(
      this,
      config.runtimeModuleLoader,
      config.trustPolicy,
      config.runtimePackageRegistry,
    )

    this.setupAssetForwarding()
    this.setupFlowControlIntents()
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

    const registered = this.registerPluginInstance(plugin)
    if (!registered) {
      return this
    }

    if (this.isInitialized) {
      this.initializePlugin(plugin).catch((error) => {
        logger.error(`Failed to initialize plugin ${plugin.name}:`, error)
      })
    }

    return this
  }

  async useRuntimePlugin(plugin: EnginePlugin): Promise<boolean> {
    const registered = this.registerPluginInstance(plugin)
    if (registered && this.isInitialized) {
      try {
        await this.initializePlugin(plugin)
      }
      catch (error) {
        this.plugins.delete(plugin.name)
        this.pluginContext.unregisterPlugin(plugin)
        throw error
      }
    }
    return registered
  }

  async unuse(pluginName: string): Promise<void> {
    const plugin = this.plugins.get(pluginName)
    if (!plugin) {
      return
    }
    await plugin.destroy?.()
    this.plugins.delete(pluginName)
    this.pluginContext.unregisterPlugin(plugin)
  }

  async loadRuntimePackage(source: string, options?: RuntimePackageLoadOptions): Promise<RuntimePackageStateRecord> {
    this.assertInitialized()
    return await this.runtimeContentManager.loadRuntimePackage(source, options)
  }

  async activateRuntimePackage(packageId: string): Promise<RuntimePackageStateRecord> {
    this.assertInitialized()
    return await this.runtimeContentManager.activateRuntimePackage(packageId)
  }

  async unloadRuntimePackage(packageId: string, options?: RuntimePackageUnloadOptions): Promise<void> {
    this.assertInitialized()
    await this.runtimeContentManager.unloadRuntimePackage(packageId, options)
  }

  getRuntimePackages(): RuntimePackageStateRecord[] {
    return this.runtimeContentManager.getRuntimePackages()
  }

  registerScriptModule(record: RuntimeScriptModuleRecord): void {
    this.runtimeContentManager.registerScriptModule(record)
  }

  async runScriptModule<TScope>(moduleId: string, scope?: TScope, options?: RuntimeScriptModuleRunOptions): Promise<void> {
    this.assertInitialized()
    await this.runtimeContentManager.runScriptModule(moduleId, scope, options)
  }

  async ensureRuntimePackages(packageIds: readonly string[]): Promise<void> {
    this.assertInitialized()
    await this.runtimeContentManager.ensureRuntimePackages(packageIds)
  }

  async withRuntimePackageContext<T>(packageId: string | undefined, operation: (engine: QuaEngineInterface) => T | Promise<T>): Promise<T> {
    return await operation(packageId ? createRuntimePackageEngineFacade(this, packageId) : this)
  }

  async loadScene(scene: Scene, transition?: SceneTransitionOptions): Promise<void> {
    this.assertInitialized()
    await this.sceneManager.loadScene(scene, transition)
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
          metadata: {
            ...(step.metadata || {}),
            requiredRuntimePackages: mergeRequiredRuntimePackages(
              step.metadata?.requiredRuntimePackages,
              this.getRequiredRuntimePackagesForPoint(point),
            ),
          },
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
        t: (key, options) => this.translate(key, options),
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
    const dialogue = this.withCurrentRuntimeContentMetadata(payload)
    this.store.commit('setDialogue', dialogue)
    await emitLogicToRender(this.pipeline, L2R.DIALOGUE_SHOW, {
      characterId: dialogue.characterId,
      characterName: dialogue.characterName,
      text: dialogue.text,
    })
    await this.emitViewUpdate()
    this.scheduleFlowControlAdvance()
  }

  async hideDialogue(): Promise<void> {
    this.assertInitialized()
    this.clearFlowControlAdvance()
    this.store.commit('hideDialogue')
    await emitLogicToRender(this.pipeline, L2R.DIALOGUE_HIDE, {})
    await this.emitViewUpdate()
  }

  async showChoices(choices: ChoiceIntent[]): Promise<void> {
    this.assertInitialized()
    const normalized = choices.map(choice => ({
      ...this.withCurrentRuntimeContentMetadata(choice),
      enabled: choice.enabled !== false,
    }))
    this.store.commit('setChoices', normalized)
    await emitLogicToRender(this.pipeline, L2R.DIALOGUE_CHOICE, { choices: normalized })
    this.clearFlowControlAdvance()
    const flowControl = this.getEngineState().view.flowControl
    if (normalized.length > 0 && flowControl.stopAtChoices && flowControl.mode !== 'normal') {
      this.store.commit('setFlowControl', createFlowControlProjection({
        ...flowControl,
        revision: flowControl.revision + 1,
        mode: 'normal',
      }))
    }
    await this.emitViewUpdate()
  }

  async clearChoices(): Promise<void> {
    this.assertInitialized()
    this.store.commit('setChoices', [])
    await this.emitViewUpdate()
    this.scheduleFlowControlAdvance()
  }

  async showCharacter(payload: CharacterIntent): Promise<void> {
    this.assertInitialized()
    const character = this.withCurrentRuntimeContentMetadata({
      ...payload,
      visible: payload.visible !== false,
    })
    this.store.commit('upsertCharacter', character)
    await emitLogicToRender(this.pipeline, L2R.CHARACTER_SHOW, character)
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
    this.store.commit('moveCharacter', { id, position, contentPackageId: this.getCurrentRuntimePackageId() })
    await emitLogicToRender(this.pipeline, L2R.CHARACTER_MOVE, { id, position })
    await this.emitViewUpdate()
  }

  async setCharacterExpression(id: string, expression?: string): Promise<void> {
    this.assertInitialized()
    this.store.commit('setCharacterExpression', { id, expression, contentPackageId: this.getCurrentRuntimePackageId() })
    await emitLogicToRender(this.pipeline, L2R.CHARACTER_EXPRESSION, { id, expression })
    await this.emitViewUpdate()
  }

  async setCharacterSprite(id: string, sprite?: string): Promise<void> {
    this.assertInitialized()
    this.store.commit('setCharacterSprite', { id, sprite, contentPackageId: this.getCurrentRuntimePackageId() })
    await emitLogicToRender(this.pipeline, L2R.CHARACTER_SPRITE, { id, sprite })
    await this.emitViewUpdate()
  }

  async setBackgroundProjection(background?: BackgroundIntent): Promise<void> {
    this.assertInitialized()
    const projectedBackground = background
      ? this.withCurrentRuntimeBackgroundMetadata(background)
      : undefined
    this.store.commit('setBackground', projectedBackground)
    if (projectedBackground) {
      await emitLogicToRender(this.pipeline, L2R.BACKGROUND_SET, projectedBackground)
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
    const projected = shouldTagPluginProjectionWithRuntimePackage(projection)
      ? this.withCurrentRuntimeContentConfig(projection as Readonly<Record<string, unknown>>) as T
      : projection
    this.store.commit('setPluginProjection', { pluginId, projection: projected })
    await this.emitViewUpdate()
  }

  async getAssetMetadata(type: 'audio' | 'images' | 'characters' | 'video' | 'fonts' | 'scripts' | 'data', assetName: string): Promise<unknown> {
    this.assertInitialized()
    return await this.assets.getMediaMetadata(type, assetName)
  }

  async showUI(elementId: string, config: Record<string, unknown> = {}): Promise<void> {
    this.assertInitialized()
    const projectedConfig = this.withCurrentRuntimeContentConfig(config)
    this.store.commit('upsertUiOverlay', { elementId, config: projectedConfig })
    await emitLogicToRender(this.pipeline, L2R.UI_SHOW, { elementId, config: projectedConfig })
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
    const projectedConfig = this.withCurrentRuntimeContentConfig(config)
    this.store.commit('upsertUiOverlay', { elementId, config: projectedConfig })
    await emitLogicToRender(this.pipeline, L2R.UI_UPDATE, { elementId, config: projectedConfig })
    await this.emitViewUpdate()
  }

  async applyEffect(effect: EffectIntent): Promise<void> {
    this.assertInitialized()
    const effectOptions = (effect.options || this.getCurrentRuntimePackageId())
      ? this.withCurrentRuntimeContentConfig(effect.options || {})
      : undefined
    const next = {
      ...effect,
      id: effect.id || `${effect.type}:${Date.now()}`,
      options: effectOptions,
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

  async translate(key: string, options?: TranslateInput): Promise<string> {
    this.assertInitialized()
    return await this.assets.translate(key, options)
  }

  getStore(): QuaStore {
    return this.store
  }

  getViewState() {
    return cloneViewProjection(this.getEngineState().view)
  }

  getFlowControlState(): ViewFlowControlProjection {
    return cloneFlowControlProjection(this.getEngineState().view.flowControl)
  }

  async setFlowControlOptions(options: FlowControlRuntimeOptions): Promise<void> {
    this.assertNotDestroyed()
    this.updateFlowControl(options)
    if (this.isInitialized) {
      await this.emitViewUpdate()
      this.scheduleFlowControlAdvance()
    }
  }

  async setFlowControlMode(mode: FlowControlMode): Promise<void> {
    this.assertInitialized()
    this.updateFlowControl({ mode })
    await this.emitViewUpdate()
    this.scheduleFlowControlAdvance()
  }

  async setFlowControlPolicy(policy: FlowControlPolicy): Promise<void> {
    this.assertInitialized()
    this.updateFlowControl({ policy })
    await this.emitViewUpdate()
    this.scheduleFlowControlAdvance()
  }

  async resetFlowControlPolicy(): Promise<void> {
    this.assertInitialized()
    const current = this.getEngineState().view.flowControl
    this.updateFlowControl({ policy: current.defaultPolicy }, { replacePolicy: true })
    await this.emitViewUpdate()
    this.scheduleFlowControlAdvance()
  }

  async startAuto(): Promise<void> {
    await this.setFlowControlMode('auto')
  }

  async stopAuto(): Promise<void> {
    this.assertInitialized()
    if (this.getEngineState().view.flowControl.mode === 'auto') {
      await this.setFlowControlMode('normal')
    }
  }

  async startSkip(): Promise<void> {
    await this.setFlowControlMode('skip')
  }

  async stopSkip(): Promise<void> {
    this.assertInitialized()
    if (this.getEngineState().view.flowControl.mode === 'skip') {
      await this.setFlowControlMode('normal')
    }
  }

  async startFastForward(): Promise<void> {
    await this.setFlowControlMode('fast-forward')
  }

  async stopFastForward(): Promise<void> {
    this.assertInitialized()
    if (this.getEngineState().view.flowControl.mode === 'fast-forward') {
      await this.setFlowControlMode('normal')
    }
  }

  async setLayoutProjection(layout: ViewLayoutInput): Promise<void> {
    this.assertInitialized()
    this.store.commit('setLayout', createViewLayoutProjection(layout))
    await this.emitViewUpdate()
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
    const metadata = createCheckpointMetadata(
      options.metadata,
      this.getRequiredRuntimePackagesForCurrentState(point),
    )
    const checkpoint: EngineCheckpoint = {
      id,
      point,
      snapshotId: id,
      kind: options.kind || 'manual',
      metadata,
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
    await this.ensureRuntimeDependencies(point, checkpoint?.metadata)

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
    const preservedReadKeys = this.getFlowControlReadKeys()
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
    this.store.commit('mergeFlowControlReadKeys', preservedReadKeys)

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
      metadata: {
        ...metadata,
        requiredRuntimePackages: this.getRequiredRuntimePackagesForCurrentState(this.getStoryPoint(), metadata),
      },
    })
    const requiredRuntimePackages = this.getRequiredRuntimePackagesForCurrentState(this.getStoryPoint(), metadata)
    await this.store.saveToSlot(slotId, {
      ...metadata,
      sceneName: metadata.sceneName || this.getCurrentSceneName(),
      stepId: metadata.stepId || this.getCurrentStepId(),
      checkpointId: checkpoint.id,
      storyPoint: this.getStoryPoint(),
      requiredRuntimePackages,
      timestamp: Date.now(),
    })
  }

  async loadFromSlot(slotId: string, options: LoadSlotOptions = {}): Promise<void> {
    this.assertInitialized()
    const slot = await this.store.getSlot(slotId)
    const slotPoint = isStoryPoint(slot?.metadata.storyPoint) ? cloneStoryPoint(slot.metadata.storyPoint) : undefined
    await this.ensureRuntimeDependencies(slotPoint, slot?.metadata)
    const beforeJump = slotPoint
      ? this.createLoadJumpContext(slotPoint, options)
      : undefined

    this.currentStepAbortController?.abort()
    this.navigationVersion++
    const preservedReadKeys = this.getFlowControlReadKeys()
    if (beforeJump) {
      await this.notifyPlugins('onBeforeJump', this.createEngineContext(beforeJump.point.stepId, {
        point: beforeJump.point,
        checkpoint: beforeJump.checkpoint,
        jump: beforeJump,
      }))
    }

    await this.store.loadFromSlot(slotId, options)
    this.store.commit('mergeFlowControlReadKeys', preservedReadKeys)
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

  getRuntimeStateSnapshot() {
    const runtime = this.getRuntimeState()
    return {
      ...runtime,
      sceneHistory: [...(runtime.sceneHistory || [])],
      stepHistory: [...(runtime.stepHistory || [])],
      checkpointHistory: [...(runtime.checkpointHistory || [])],
      runtimePackages: { ...(runtime.runtimePackages || {}) },
      appliedRuntimeMigrations: [...(runtime.appliedRuntimeMigrations || [])],
    }
  }

  getRuntimeViewRequiredPackageIds(): string[] {
    return this.getRequiredRuntimePackagesForActiveView()
  }

  async clearRuntimePackageViewState(packageId: string): Promise<void> {
    this.store.commit('removeCharactersByRuntimePackage', packageId)
    this.store.commit('clearDialogueByRuntimePackage', packageId)
    this.store.commit('clearBackgroundByRuntimePackage', packageId)
    this.store.commit('removeChoicesByRuntimePackage', packageId)
    this.store.commit('removeEffectsByRuntimePackage', packageId)
    this.store.commit('removeAnimationsByRuntimePackage', packageId)
    this.store.commit('removeUiOverlaysByRuntimePackage', packageId)
    this.store.commit('removePluginProjectionsByRuntimePackage', packageId)
    await this.emitViewUpdate()
  }

  async destroy(): Promise<void> {
    if (this.isDestroyed)
      return

    this.currentStepAbortController?.abort()
    this.clearFlowControlAdvance()
    while (this.flowControlDisposers.length > 0) {
      this.flowControlDisposers.pop()?.()
    }
    await this.runtimeContentManager.destroy()
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
    this.assertNotDestroyed()
  }

  private assertNotDestroyed(): void {
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

  private registerPluginInstance(plugin: EnginePlugin): boolean {
    if (this.plugins.has(plugin.name)) {
      logger.warn(`Plugin ${plugin.name} already registered, skipping`)
      return false
    }

    this.plugins.set(plugin.name, plugin)
    this.pluginContext.registerPlugin(plugin)
    return true
  }

  private async notifyPluginsOnStep(stepContext: StepContext): Promise<void> {
    await Promise.all(Array.from(this.plugins.values())
      .filter(plugin => plugin.onStep)
      .map(plugin => plugin.onStep!(this.createEngineContext(stepContext.stepId, { point: stepContext.point }))))
  }

  private async notifyPlugins(
    hook: 'onStepStart' | 'onStepComplete' | 'onBeforeCheckpoint' | 'onAfterCheckpoint' | 'onBeforeJump' | 'onAfterJump' | 'onRuntimePackageActivate' | 'onRuntimePackageUnload' | 'onRuntimePackageMigrate',
    context: EngineContext,
  ): Promise<void> {
    await Promise.all(Array.from(this.plugins.values())
      .filter(plugin => plugin[hook])
      .map(plugin => plugin[hook]!(context)))
  }

  async notifyRuntimePackageActivate(runtimePackage: RuntimePackageManifest, bundleName?: string): Promise<void> {
    await this.notifyPlugins('onRuntimePackageActivate', this.createEngineContext(undefined, {
      runtimePackage: { package: runtimePackage, bundleName },
    }))
  }

  async notifyRuntimePackageUnload(runtimePackage: RuntimePackageManifest, bundleName?: string): Promise<void> {
    await this.notifyPlugins('onRuntimePackageUnload', this.createEngineContext(undefined, {
      runtimePackage: { package: runtimePackage, bundleName },
    }))
  }

  async notifyRuntimePackageMigrate(
    runtimePackage: RuntimePackageManifest,
    bundleName: string | undefined,
    migration: RuntimePackageStoreMigrationManifest,
  ): Promise<void> {
    await this.notifyPlugins('onRuntimePackageMigrate', this.createEngineContext(undefined, {
      runtimePackage: { package: runtimePackage, bundleName },
      runtimeMigration: migration,
    }))
  }

  private createEngineContext(
    stepId?: string,
    extras: Pick<EngineContext, 'point' | 'checkpoint' | 'jump' | 'runtimePackage' | 'runtimeMigration'> = {},
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

  private setupFlowControlIntents(): void {
    this.flowControlDisposers.push(this.onRenderIntent(R2L.FLOW_CONTROL_SET_MODE_REQUEST, async (payload) => {
      const mode = isFlowControlMode((payload as { mode?: unknown }).mode)
        ? (payload as { mode: FlowControlMode }).mode
        : 'normal'
      await this.setFlowControlMode(mode)
    }))
    this.flowControlDisposers.push(this.onRenderIntent(R2L.FLOW_CONTROL_START_AUTO_REQUEST, () => this.startAuto()))
    this.flowControlDisposers.push(this.onRenderIntent(R2L.FLOW_CONTROL_STOP_AUTO_REQUEST, () => this.stopAuto()))
    this.flowControlDisposers.push(this.onRenderIntent(R2L.FLOW_CONTROL_START_SKIP_REQUEST, () => this.startSkip()))
    this.flowControlDisposers.push(this.onRenderIntent(R2L.FLOW_CONTROL_STOP_SKIP_REQUEST, () => this.stopSkip()))
    this.flowControlDisposers.push(this.onRenderIntent(R2L.FLOW_CONTROL_START_FAST_FORWARD_REQUEST, () => this.startFastForward()))
    this.flowControlDisposers.push(this.onRenderIntent(R2L.FLOW_CONTROL_STOP_FAST_FORWARD_REQUEST, () => this.stopFastForward()))
    this.flowControlDisposers.push(this.onRenderIntent(R2L.USER_ADVANCE, () => {
      this.clearFlowControlAdvance()
      this.markCurrentStoryPointRead()
    }))
  }

  private onRenderIntent<T extends RenderToLogicEvents>(
    event: T,
    handler: (payload: EventPayload<T>) => void | Promise<void>,
  ): () => void {
    const listener: EventListener<EventPayload<T>> = async (context) => {
      await handler(context.event.payload)
    }
    this.pipeline.on(event, listener as EventListener)
    return () => this.pipeline.off(event, listener as EventListener)
  }

  private scheduleFlowControlAdvance(): void {
    this.clearFlowControlAdvance()
    const view = this.getEngineState().view
    if (!view.dialogue.visible || view.choices.length > 0) {
      return
    }

    if (
      view.flowControl.mode === 'skip'
      && view.flowControl.skipMode === 'read'
      && !this.isCurrentStoryPointRead()
    ) {
      this.updateFlowControl({ mode: 'normal' })
      this.emitViewUpdate().catch((error) => {
        logger.warn('Failed to stop read-only skip mode:', error)
      })
      return
    }

    const plan = resolveFlowControlAdvancePlan(view.flowControl)
    if (!plan) {
      return
    }

    this.flowControlAdvanceTimer = setTimeout(() => {
      this.flowControlAdvanceTimer = undefined
      this.emitFlowControlAdvance(plan).catch((error) => {
        logger.warn('Failed to advance flow control:', error)
      })
    }, plan.delayMs)
  }

  private clearFlowControlAdvance(): void {
    if (this.flowControlAdvanceTimer === undefined) {
      return
    }
    clearTimeout(this.flowControlAdvanceTimer)
    this.flowControlAdvanceTimer = undefined
  }

  private async emitFlowControlAdvance(plan: FlowControlAdvancePlan): Promise<void> {
    this.updateFlowControl({
      lastAdvance: {
        mode: plan.mode,
        source: plan.source,
        timestamp: Date.now(),
      },
    })
    await this.emitViewUpdate()
    await emitRenderToLogic(this.pipeline, R2L.USER_ADVANCE, { source: plan.source })
  }

  private updateFlowControl(
    patch: FlowControlProjectionPatch,
    options: { replacePolicy?: boolean, replaceDefaultPolicy?: boolean } = {},
  ): void {
    const current = this.getEngineState().view.flowControl
    const policy = patch.policy
      ? options.replacePolicy
        ? patch.policy
        : { ...current.policy, ...patch.policy }
      : current.policy
    const defaultPolicy = patch.defaultPolicy
      ? options.replaceDefaultPolicy
        ? patch.defaultPolicy
        : { ...current.defaultPolicy, ...patch.defaultPolicy }
      : current.defaultPolicy

    this.store.commit('setFlowControl', createFlowControlProjection({
      ...current,
      revision: current.revision + 1,
      mode: patch.mode ?? current.mode,
      skipMode: patch.skipMode ?? current.skipMode,
      policy,
      defaultPolicy,
      timings: patch.timings ? { ...current.timings, ...patch.timings } : current.timings,
      stopAtChoices: patch.stopAtChoices ?? current.stopAtChoices,
      lastAdvance: patch.lastAdvance ?? current.lastAdvance,
    }))
  }

  private markCurrentStoryPointRead(): void {
    if (!this.getEngineState().view.dialogue.visible) {
      return
    }
    const key = createStoryPointReadKey(this.getStoryPoint())
    if (!key) {
      return
    }
    this.store.commit('markFlowControlReadKey', key)
  }

  private isCurrentStoryPointRead(): boolean {
    const key = createStoryPointReadKey(this.getStoryPoint())
    return Boolean(key && this.getEngineState().flowControlProgress.readKeys.includes(key))
  }

  private async emitViewUpdate(): Promise<void> {
    await emitLogicToRender(this.pipeline, L2R.VIEW_UPDATE, { view: this.getViewState() })
  }

  private getRuntimeState() {
    return this.getEngineState().runtime
  }

  private getFlowControlReadKeys(): string[] {
    return [...(this.getEngineState().flowControlProgress.readKeys || [])]
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

  private async ensureRuntimeDependencies(point?: StoryPoint, metadata?: Record<string, unknown>): Promise<void> {
    const required = mergeRequiredRuntimePackages(
      getMetadataRequiredRuntimePackages(metadata),
      this.getRequiredRuntimePackagesForPoint(point),
    )
    if (required.length > 0) {
      await this.runtimeContentManager.ensureRuntimePackages(required)
    }
  }

  private getRequiredRuntimePackagesForPoint(point?: StoryPoint): string[] {
    return point?.contentPackageId ? [point.contentPackageId] : []
  }

  getCurrentRuntimePackageId(): string | undefined {
    return this.getStoryPoint()?.contentPackageId
  }

  private getRequiredRuntimePackagesForCurrentState(
    point?: StoryPoint,
    metadata?: Record<string, unknown>,
  ): string[] {
    return mergeRequiredRuntimePackages(
      getMetadataRequiredRuntimePackages(metadata),
      this.getRequiredRuntimePackagesForPoint(point),
      this.getCurrentCheckpointRequiredRuntimePackages(point),
      this.getRequiredRuntimePackagesForCurrentView(),
    )
  }

  private getRequiredRuntimePackagesForCurrentView(): string[] {
    return collectRuntimePackagesFromUnknown(this.getEngineState().view)
  }

  private getRequiredRuntimePackagesForActiveView(): string[] {
    return collectRuntimePackagesFromActiveView(this.getEngineState().view)
  }

  private getCurrentCheckpointRequiredRuntimePackages(point?: StoryPoint): string[] {
    const checkpointId = this.getRuntimeState().currentCheckpointId
    const checkpoint = checkpointId ? this.getCheckpoint(checkpointId) : undefined
    if (!checkpoint || !point || !storyPointsHaveSameReadIdentity(checkpoint.point, point)) {
      return []
    }
    return getMetadataRequiredRuntimePackages(checkpoint.metadata)
  }

  private withCurrentRuntimeContentMetadata<T extends { metadata?: Readonly<Record<string, unknown>> }>(value: T): T {
    const packageId = this.getCurrentRuntimePackageId()
    if (!packageId) {
      return value
    }
    return {
      ...value,
      metadata: mergeRuntimePackageMetadata(value.metadata, packageId),
    }
  }

  private withCurrentRuntimeBackgroundMetadata<T extends BackgroundIntent>(background: T): T {
    const packageId = this.getCurrentRuntimePackageId()
    if (!packageId) {
      return background
    }
    const projected = this.withCurrentRuntimeContentMetadata(background)
    const next: BackgroundIntent = { ...projected }
    if (projected.video) {
      next.video = {
        ...projected.video,
        metadata: projected.video.metadata?.contentPackageId
          ? cloneUnknownRecord(projected.video.metadata)
          : mergeRuntimePackageMetadata(projected.video.metadata, packageId),
      }
    }
    if (projected.layers) {
      next.layers = projected.layers.map(layer => ({
        ...layer,
        metadata: layer.metadata?.contentPackageId
          ? cloneUnknownRecord(layer.metadata)
          : mergeRuntimePackageMetadata(layer.metadata, packageId),
      }))
    }
    return next as T
  }

  private withCurrentRuntimeContentConfig<T extends Readonly<Record<string, unknown>>>(value: T): Record<string, unknown> {
    const packageId = this.getCurrentRuntimePackageId()
    if (!packageId || value.contentPackageId) {
      return cloneUnknownRecord(value)
    }
    return {
      ...cloneUnknownRecord(value),
      contentPackageId: packageId,
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
    upsertRuntimePackage(state: any, payload: RuntimePackageStateRecord) {
      state.engine.runtime.runtimePackages = {
        ...(state.engine.runtime.runtimePackages || {}),
        [payload.id]: {
          ...payload,
          dependencies: [...payload.dependencies],
          scriptModuleIds: [...payload.scriptModuleIds],
          pluginIds: [...payload.pluginIds],
          migrationIds: [...payload.migrationIds],
        },
      }
    },
    markRuntimeMigrationApplied(state: any, migrationKey: string) {
      state.engine.runtime.appliedRuntimeMigrations = Array.from(new Set([
        ...(state.engine.runtime.appliedRuntimeMigrations || []),
        migrationKey,
      ]))
    },
    setLayout(state: any, layout: ViewLayoutInput) {
      state.engine.view.layout = createViewLayoutProjection(layout)
    },
    setFlowControl(state: any, flowControl: ViewFlowControlProjection) {
      state.engine.view.flowControl = cloneFlowControlProjection(flowControl)
    },
    markFlowControlReadKey(state: any, key: string) {
      const current = state.engine.flowControlProgress?.readKeys || []
      if (current.includes(key)) {
        return
      }
      state.engine.flowControlProgress = {
        readKeys: [...current, key],
      } satisfies EngineFlowControlProgressState
    },
    mergeFlowControlReadKeys(state: any, keys: string[]) {
      state.engine.flowControlProgress = {
        readKeys: Array.from(new Set([
          ...(state.engine.flowControlProgress?.readKeys || []),
          ...keys,
        ])),
      } satisfies EngineFlowControlProgressState
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
    removePluginProjectionsByRuntimePackage(state: any, packageId: string) {
      const plugins = { ...(state.engine.view.plugins || {}) }
      for (const [pluginId, projection] of Object.entries(plugins)) {
        if (recordRequiresPackage(projection, packageId)) {
          delete plugins[pluginId]
        }
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
    removeUiOverlaysByRuntimePackage(state: any, packageId: string) {
      const overlays = { ...(state.engine.view.ui.overlays || {}) }
      for (const [elementId, config] of Object.entries(overlays)) {
        if (recordRequiresPackage(config, packageId)) {
          delete overlays[elementId]
        }
      }
      state.engine.view.ui = {
        ...state.engine.view.ui,
        overlays,
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
    removeEffectsByRuntimePackage(state: any, packageId: string) {
      state.engine.view.effects = (state.engine.view.effects || []).filter((effect: EffectIntent) =>
        !recordRequiresPackage(effect.options, packageId),
      )
    },
    setBackground(state: any, payload?: BackgroundIntent) {
      state.engine.view.background = payload
    },
    clearBackgroundByRuntimePackage(state: any, packageId: string) {
      const background = state.engine.view.background as BackgroundIntent | undefined
      if (!background) {
        return
      }
      if (recordRequiresPackage(background.metadata, packageId) || recordRequiresPackage(background.video?.metadata, packageId)) {
        state.engine.view.background = undefined
        return
      }
      if (background.mode !== 'layered' || !background.layers?.length) {
        return
      }
      const layers = background.layers.filter(layer => !recordRequiresPackage(layer.metadata, packageId))
      if (layers.length !== background.layers.length) {
        state.engine.view.background = {
          ...background,
          layers,
        }
      }
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
    removeAnimationsByRuntimePackage(state: any, packageId: string) {
      state.engine.view.animations = (state.engine.view.animations || []).filter((animation: ActiveAnimationProjection) =>
        animation.contentPackageId !== packageId,
      )
    },
    setDialogue(state: any, payload: DialogueIntent) {
      state.engine.view.dialogue = {
        visible: true,
        characterId: payload.characterId,
        characterName: payload.characterName,
        text: cloneUnknownValue(payload.text) as DialogueIntent['text'],
        mode: payload.mode || (payload.characterId || payload.characterName ? 'say' : 'narration'),
        metadata: payload.metadata,
      }
    },
    hideDialogue(state: any) {
      state.engine.view.dialogue = { visible: false, text: '' }
    },
    clearDialogueByRuntimePackage(state: any, packageId: string) {
      const dialogue = state.engine.view.dialogue as DialogueIntent | undefined
      if (recordRequiresPackage(dialogue?.metadata, packageId)) {
        state.engine.view.dialogue = { visible: false, text: '' }
      }
    },
    setChoices(state: any, choices: ChoiceIntent[]) {
      state.engine.view.choices = choices.map(choice => ({
        id: choice.id,
        text: choice.text,
        enabled: choice.enabled !== false,
        metadata: choice.metadata,
      }))
    },
    removeChoicesByRuntimePackage(state: any, packageId: string) {
      state.engine.view.choices = (state.engine.view.choices || []).filter((choice: ChoiceIntent) =>
        !recordRequiresPackage(choice.metadata, packageId),
      )
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
    removeCharactersByRuntimePackage(state: any, packageId: string) {
      state.engine.view.characters = (state.engine.view.characters || []).filter((character: CharacterIntent) =>
        !recordRequiresPackage(character.metadata, packageId),
      )
    },
    hideCharacter(state: any, id: string) {
      state.engine.view.characters = state.engine.view.characters.map((character: CharacterIntent) =>
        character.id === id ? { ...character, visible: false } : character,
      )
    },
    moveCharacter(state: any, payload: { id: string, position: CharacterIntent['position'], contentPackageId?: string }) {
      state.engine.view.characters = state.engine.view.characters.map((character: CharacterIntent) =>
        character.id === payload.id
          ? {
              ...character,
              position: payload.position,
              metadata: payload.contentPackageId
                ? mergeRuntimePackageMetadata(character.metadata, payload.contentPackageId)
                : character.metadata,
            }
          : character,
      )
    },
    setCharacterExpression(state: any, payload: { id: string, expression?: string, contentPackageId?: string }) {
      state.engine.view.characters = state.engine.view.characters.map((character: CharacterIntent) =>
        character.id === payload.id
          ? {
              ...character,
              expression: payload.expression,
              metadata: payload.contentPackageId
                ? mergeRuntimePackageMetadata(character.metadata, payload.contentPackageId)
                : character.metadata,
            }
          : character,
      )
    },
    setCharacterSprite(state: any, payload: { id: string, sprite?: string, contentPackageId?: string }) {
      state.engine.view.characters = state.engine.view.characters.map((character: CharacterIntent) =>
        character.id === payload.id
          ? {
              ...character,
              sprite: payload.sprite,
              metadata: payload.contentPackageId
                ? mergeRuntimePackageMetadata(character.metadata, payload.contentPackageId)
                : character.metadata,
            }
          : character,
      )
    },
  }
}

function resolveFlowControlAdvancePlan(flowControl: ViewFlowControlProjection): FlowControlAdvancePlan | undefined {
  switch (flowControl.mode) {
    case 'auto':
      return flowControl.policy.autoAdvanceable
        ? {
            delayMs: flowControl.timings.autoAdvanceDelayMs,
            mode: 'auto',
            source: 'flow-control:auto',
          }
        : undefined
    case 'skip':
      return flowControl.policy.skippable
        ? {
            delayMs: flowControl.timings.skipAdvanceDelayMs,
            mode: 'skip',
            source: 'flow-control:skip',
          }
        : undefined
    case 'fast-forward':
      return flowControl.policy.fastForwardable
        ? {
            delayMs: flowControl.timings.fastForwardAdvanceDelayMs,
            mode: 'fast-forward',
            source: 'flow-control:fast-forward',
          }
        : undefined
    case 'normal':
      return undefined
  }
}

function isFlowControlMode(value: unknown): value is FlowControlMode {
  return value === 'normal' || value === 'auto' || value === 'skip' || value === 'fast-forward'
}

function cloneViewProjection(view: QuaViewProjection): QuaViewProjection {
  return {
    layout: createViewLayoutProjection(view.layout),
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
            composition: layer.composition ? cloneUnknownRecord(layer.composition) : undefined,
            transition: layer.transition ? { ...layer.transition } : undefined,
            metadata: layer.metadata ? cloneUnknownRecord(layer.metadata) : undefined,
          })),
          composition: view.background.composition ? cloneUnknownRecord(view.background.composition) : undefined,
          metadata: view.background.metadata ? cloneUnknownRecord(view.background.metadata) : undefined,
        }
      : undefined,
    characters: view.characters.map(character => ({
      ...character,
      position: character.position ? { ...character.position } : undefined,
      metadata: character.metadata ? { ...character.metadata } : undefined,
    })),
    dialogue: {
      ...view.dialogue,
      text: cloneUnknownValue(view.dialogue.text) as DialogueIntent['text'],
      metadata: view.dialogue.metadata ? cloneUnknownRecord(view.dialogue.metadata) : undefined,
    },
    choices: view.choices.map(choice => ({
      ...choice,
      metadata: choice.metadata ? { ...choice.metadata } : undefined,
    })),
    ui: {
      ...view.ui,
      overlays: view.ui.overlays ? cloneUnknownRecord(view.ui.overlays) : undefined,
    },
    flowControl: cloneFlowControlProjection(view.flowControl),
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

function cloneFlowControlProjection(flowControl: ViewFlowControlProjection): ViewFlowControlProjection {
  return createFlowControlProjection({
    ...flowControl,
    policy: flowControl.policy,
    defaultPolicy: flowControl.defaultPolicy,
    timings: flowControl.timings,
    lastAdvance: flowControl.lastAdvance ? { ...flowControl.lastAdvance } : undefined,
  })
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

function createStoryPointReadKey(point: StoryPoint | undefined): string | undefined {
  if (!point?.stepId) {
    return undefined
  }

  const fields: Array<keyof StoryPoint> = [
    'storyId',
    'chapterId',
    'sceneId',
    'contentPackageId',
    'scriptModuleId',
    'scriptModuleVersion',
    'laneId',
    'routeId',
    'timelineId',
    'protagonistId',
    'nodeId',
    'stepId',
    'lineId',
  ]
  return fields
    .map(field => `${field}:${String(point[field] ?? '')}`)
    .join('|')
}

function storyPointsHaveSameReadIdentity(left: StoryPoint, right: StoryPoint): boolean {
  return createStoryPointReadKey(left) === createStoryPointReadKey(right)
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

function getMetadataRequiredRuntimePackages(metadata?: Record<string, unknown>): string[] {
  const value = metadata?.requiredRuntimePackages
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.length > 0)
    : []
}

function getRecordRuntimePackages(value: unknown): string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return []
  }
  const record = value as Record<string, unknown>
  return mergeRequiredRuntimePackages(
    typeof record.contentPackageId === 'string' ? [record.contentPackageId] : [],
    getMetadataRequiredRuntimePackages(record),
  )
}

function recordRequiresPackage(value: unknown, packageId: string): boolean {
  return getRecordRuntimePackages(value).includes(packageId)
}

function shouldTagPluginProjectionWithRuntimePackage(value: unknown): value is Readonly<Record<string, unknown>> {
  return Boolean(value)
    && typeof value === 'object'
    && !Array.isArray(value)
    && collectRuntimePackagesFromUnknown(value).length === 0
}

function createRuntimePackageEngineFacade(engine: QuaEngine, packageId: string): QuaEngineInterface {
  const facade = new Proxy(engine as unknown as QuaEngineInterface, {
    get(target, property, receiver) {
      if (property === 'getCurrentRuntimePackageId') {
        return () => packageId
      }
      const value = Reflect.get(target, property, receiver)
      return typeof value === 'function' ? value.bind(receiver) : value
    },
  })
  return facade
}

function mergeRuntimePackageMetadata(
  metadata: Readonly<Record<string, unknown>> | undefined,
  packageId: string,
): Record<string, unknown> {
  const next = metadata ? cloneUnknownRecord(metadata) : {}
  const currentPackageId = typeof next.contentPackageId === 'string' ? next.contentPackageId : undefined
  const requiredRuntimePackages = mergeRequiredRuntimePackages(
    currentPackageId ? [currentPackageId] : [],
    getMetadataRequiredRuntimePackages(next),
    [packageId],
  )

  if (!currentPackageId) {
    next.contentPackageId = packageId
  }
  else if (currentPackageId !== packageId) {
    next.requiredRuntimePackages = requiredRuntimePackages
  }
  else if (getMetadataRequiredRuntimePackages(next).length > 0) {
    next.requiredRuntimePackages = requiredRuntimePackages
  }

  return next
}

function collectRuntimePackagesFromUnknown(value: unknown, seen = new Set<object>()): string[] {
  if (!value || typeof value !== 'object') {
    return []
  }
  if (seen.has(value)) {
    return []
  }
  seen.add(value)

  const packages = new Set(getRecordRuntimePackages(value))
  if (Array.isArray(value)) {
    for (const item of value) {
      for (const packageId of collectRuntimePackagesFromUnknown(item, seen)) {
        packages.add(packageId)
      }
    }
    return [...packages]
  }

  for (const item of Object.values(value as Record<string, unknown>)) {
    for (const packageId of collectRuntimePackagesFromUnknown(item, seen)) {
      packages.add(packageId)
    }
  }
  return [...packages]
}

function collectRuntimePackagesFromActiveView(view: QuaViewProjection): string[] {
  return mergeRequiredRuntimePackages(
    collectRuntimePackagesFromUnknown(view.background),
    collectRuntimePackagesFromUnknown(view.characters),
    collectRuntimePackagesFromUnknown(view.dialogue),
    collectRuntimePackagesFromUnknown(view.choices),
    collectRuntimePackagesFromUnknown(view.ui),
    collectRuntimePackagesFromUnknown(view.effects),
    collectRuntimePackagesFromUnknown(view.animations),
    collectRuntimePackagesFromPluginProjectionRoots(view.plugins),
  )
}

function collectRuntimePackagesFromPluginProjectionRoots(plugins: QuaViewProjection['plugins']): string[] {
  return mergeRequiredRuntimePackages(
    ...Object.values(plugins || {}).map(projection => getRecordRuntimePackages(projection)),
  )
}

function createCheckpointMetadata(
  metadata: Record<string, unknown> | undefined,
  pointPackages: readonly string[],
): Record<string, unknown> | undefined {
  const next = metadata ? cloneUnknownRecord(metadata) : {}
  const requiredRuntimePackages = mergeRequiredRuntimePackages(
    getMetadataRequiredRuntimePackages(metadata),
    pointPackages,
  )
  if (requiredRuntimePackages.length > 0) {
    next.requiredRuntimePackages = requiredRuntimePackages
  }
  return Object.keys(next).length > 0 ? next : undefined
}

function mergeRequiredRuntimePackages(...groups: Array<readonly string[] | undefined>): string[] {
  return Array.from(new Set(groups.flatMap(group => group || []).filter(Boolean)))
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
