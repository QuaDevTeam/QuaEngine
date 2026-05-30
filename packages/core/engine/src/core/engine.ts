import type { EventListener } from '@quajs/pipeline'
import type { QuaGameSavePreviewWriteInput, QuaStore } from '@quajs/store'
import type {
  ActiveAnimationProjection,
  EventPayload,
  FlowControlMode,
  FlowControlPolicy,
  LogicToRenderEvents,
  QuaViewProjection,
  RenderToLogicEvents,
  SavePreviewCapturePolicy,
  SavePreviewCaptureResultPayload,
  ViewFlowControlProjection,
} from '../events/events'
import type { SceneTransitionOptions } from '../managers/scene-manager'
import type {
  EngineContext,
  EnginePlugin,
  PluginConstructor,
  PluginConstructorOptions,
} from '../plugins/core/types'
import type { RollbackStoreSaveData, SerializedRollbackJournal } from './rollback'
import type {
  BackgroundIntent,
  CharacterIntent,
  ChoiceIntent,
  ChoiceJumpOptions,
  ChoicePresentation,
  ChoiceTarget,
  CreateCheckpointOptions,
  DialogueIntent,
  EffectIntent,
  EngineCheckpoint,
  EngineConfig,
  EngineFlowControlProgressState,
  EnginePlaytimeState,
  EngineReportErrorOptions,
  EnsureLocalePacksOptions,
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
  QuaEngineInterface,
  ResolvedStoryAsset,
  ResolvedStoryJump,
  RollbackAnchor,
  RollbackAnchorReason,
  RollbackConfig,
  RollbackConfigPatch,
  RollbackEntry,
  RollbackNavigationOptions,
  RollbackSnapshotSet,
  RollbackTarget,
  RollbackTargetInfo,
  RuntimePackageLoadOptions,
  RuntimePackageManifest,
  RuntimePackagePluginManifest,
  RuntimePackageStateRecord,
  RuntimePackageStoreMigrationManifest,
  RuntimePackageUnloadOptions,
  RuntimeScriptModuleRecord,
  RuntimeScriptModuleRunFromOptions,
  RuntimeScriptModuleRunOptions,
  SaveToSlotOptions,
  Scene,
  SceneEnterContext,
  SceneFactory,
  SetLocaleOptions,
  SlotMetadata,
  StepContext,
  StoryAssetRef,
  StoryPoint,
  StoryTargetResolveContext,
  StoryTargetResolver,
  TranslateInput,
  UiIntent,
  ViewLayoutInput,
  ViewUiSceneHostProjection,
} from './types'
import { assertValidAppVersion, normalizeLocale, normalizeTranslateOptions, QuaAssets } from '@quajs/assets'
import { getPackageLogger } from '@quajs/logger'
import { Pipeline } from '@quajs/pipeline'
import { createStore } from '@quajs/store'
import { generateId } from '@quajs/utils'
import {
  createFlowControlProjection,
  createQuaErrorPayload,
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
import { getPluginRegistry } from '../plugins/core/registry'
import { RuntimeContentManager } from '../runtime-content/manager'
import { createRollbackConfig, isSerializedRollbackJournal, RollbackController } from './rollback'
import { resolveGameSteps } from './script'
import { assertSerializableSceneState, isChoiceTarget } from './story-targets'
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

interface ExecuteStepOptions {
  rollbackReplay?: boolean
}

type SaveReason = NonNullable<SaveToSlotOptions['reason']>

interface CheckpointStateSnapshot {
  checkpoints: EngineCheckpoint[]
  currentCheckpointId?: string
  rollbackJournal: SerializedRollbackJournal
}

export class QuaEngine {
  private static instance: QuaEngine | null = null
  private readonly store: QuaStore
  private readonly assets: QuaAssets
  private readonly pipeline: Pipeline
  private readonly plugins: Map<string, EnginePlugin> = new Map()
  private readonly pluginContext: PluginContextImpl = new PluginContextImpl()
  private readonly flowControlDisposers: Array<() => void> = []
  private readonly storyTargetResolvers: StoryTargetResolver[] = []
  private readonly sceneFactories = new Map<string, SceneFactory>()
  private readonly runtimeContentManager: RuntimeContentManager
  private readonly rollbackController: RollbackController
  private readonly handledErrors = new WeakSet<object>()
  private currentStepAbortController?: AbortController
  private flowControlAdvanceTimer?: ReturnType<typeof setTimeout>
  private checkpointCounter = 0
  private navigationVersion = 0
  private renderEventSuppressionDepth = 0
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
    this.config = {
      ...config,
      rollback: createRollbackConfig(config.rollback),
    }
    assertValidAppVersion(config.appVersion)

    this.store = createStore({
      name: 'quaengine-main',
      state: {
        engine: createInitialEngineState(config.layout, config.flowControl),
      },
      mutations: createEngineMutations(),
      serializer: config.store?.serializer,
      storage: config.store?.storage,
    })
    this.assets = new QuaAssets({
      ...config.assets,
      appVersion: config.assets.appVersion || config.appVersion,
    })
    this.pipeline = new Pipeline()
    this.sceneManager = new SceneManager(this)
    this.gameManager = new GameManager(this)
    this.runtimeContentManager = new RuntimeContentManager(
      this,
      config.runtimeModuleLoader,
      config.trustPolicy,
      config.runtimePackageRegistry,
    )
    this.rollbackController = new RollbackController(
      createRollbackConfig(this.config.rollback),
      {
        ensureRuntimePackages: packageIds => this.ensureRuntimePackages(packageIds),
        resolveStep: entry => this.resolveRollbackStep(entry),
        replayEntry: async (_entry, step) => {
          await this.executeStep(step, { rollbackReplay: true })
        },
        notifyRollback: (hook, context) => this.notifyPlugins(hook, this.createEngineContext(context.target.stepId, {
          point: context.target.point,
          rollback: context,
        })),
        emitFinalProjection: point => this.emitRollbackFinalProjection(point),
        hydrateCheckpoints: (checkpoints, currentCheckpointId) => this.hydrateCheckpoints(checkpoints, currentCheckpointId),
        getProtectedCheckpointIds: () => this.getProtectedRollbackCheckpointIds(),
      },
    )
    this.rollbackController.registerStore(this.store.getName(), this.store)

    this.setupAssetForwarding()
    this.setupRendererErrorForwarding()
    this.setupFlowControlIntents()
    this.setupSaveLoadIntents()
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
    this.assertNotDestroyed()

    let pluginsInitializationStarted = false
    try {
      await this.assets.initialize()
      pluginsInitializationStarted = true
      await this.initializePlugins()
    }
    catch (error) {
      await this.reportErrorOnce(error, {
        message: pluginsInitializationStarted
          ? 'QuaEngine initialization failed during plugin setup.'
          : 'QuaEngine initialization failed during asset setup.',
        source: 'engine',
        phase: pluginsInitializationStarted ? 'engine:init:plugins' : 'engine:init:assets',
        metadata: {
          pluginsInitializationStarted,
        },
      })
      await this.cleanupFailedInit(error, {
        pluginsInitializationStarted,
      })
      throw error
    }

    this.isInitialized = true
    if (this.config.playtime?.autoStart !== false) {
      this.store.commit('resumePlaytime', { now: Date.now(), reason: 'engine:init' })
    }
    await this.emitLogicToRender(L2R.SYSTEM_MESSAGE, {
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
        void this.reportError(error, {
          message: `Failed to initialize plugin "${plugin.name}".`,
          source: 'plugin',
          phase: 'engine-plugin:init',
          metadata: { pluginName: plugin.name },
        })
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
        await this.reportError(error, {
          message: `Failed to initialize runtime plugin "${plugin.name}".`,
          source: 'plugin',
          phase: 'runtime-plugin:init',
          metadata: { pluginName: plugin.name },
        })
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
    await this.destroyPlugin(plugin, 'unuse')
    this.plugins.delete(pluginName)
    this.pluginContext.unregisterPlugin(plugin)
  }

  async loadRuntimePackage(source: string, options: RuntimePackageLoadOptions = {}): Promise<RuntimePackageStateRecord> {
    this.assertInitialized()
    if (options.activate === false) {
      return await this.runtimeContentManager.loadRuntimePackage(source, options)
    }
    const loaded = await this.runtimeContentManager.loadRuntimePackage(source, {
      ...options,
      activate: false,
    })
    try {
      return await this.activateRuntimePackage(loaded.id)
    }
    catch (error) {
      await this.runtimeContentManager.unloadRuntimePackage(loaded.id, { force: true }).catch(() => {})
      await this.reportError(error, {
        message: `Failed to activate runtime package "${loaded.id}".`,
        source: 'runtime',
        phase: 'runtime-package:activate',
        metadata: { packageId: loaded.id, source },
      })
      throw error
    }
  }

  async activateRuntimePackage(packageId: string): Promise<RuntimePackageStateRecord> {
    this.assertInitialized()
    const wasActive = this.getRuntimePackages().some(pkg => pkg.id === packageId && pkg.state === 'active')
    try {
      const state = await this.runtimeContentManager.activateRuntimePackage(packageId)
      if (!wasActive && state.state === 'active') {
        await this.markRuntimePackageRollbackBoundary('activate', packageId, [packageId])
      }
      return state
    }
    catch (error) {
      await this.reportError(error, {
        message: `Failed to activate runtime package "${packageId}".`,
        source: 'runtime',
        phase: 'runtime-package:activate',
        metadata: { packageId },
      })
      throw error
    }
  }

  async unloadRuntimePackage(packageId: string, options?: RuntimePackageUnloadOptions): Promise<void> {
    this.assertInitialized()
    const wasLoaded = this.getRuntimePackages().some(pkg => pkg.id === packageId && pkg.state !== 'unloaded')
    try {
      await this.runtimeContentManager.unloadRuntimePackage(packageId, options)
      this.removeActiveLocalePackId(packageId)
      if (wasLoaded) {
        await this.markRuntimePackageRollbackBoundary('unload', packageId)
      }
    }
    catch (error) {
      await this.reportError(error, {
        message: `Failed to unload runtime package "${packageId}".`,
        source: 'runtime',
        phase: 'runtime-package:unload',
        metadata: { packageId },
      })
      throw error
    }
  }

  getRuntimePackages(): RuntimePackageStateRecord[] {
    return this.runtimeContentManager.getRuntimePackages()
  }

  registerScriptModule(record: RuntimeScriptModuleRecord): void {
    this.runtimeContentManager.registerScriptModule(record)
  }

  async runScriptModule<TScope>(moduleId: string, scope?: TScope, options?: RuntimeScriptModuleRunOptions): Promise<void> {
    this.assertInitialized()
    try {
      await this.runtimeContentManager.runScriptModule(moduleId, scope, options)
    }
    catch (error) {
      await this.reportError(error, {
        message: `Runtime script module "${moduleId}" failed.`,
        source: 'script',
        phase: 'runtime-script:run',
        metadata: { moduleId },
      })
      throw error
    }
  }

  async runScriptModuleFrom<TScope>(moduleId: string, options: RuntimeScriptModuleRunFromOptions<TScope> = {}): Promise<void> {
    this.assertInitialized()
    try {
      await this.runtimeContentManager.runScriptModuleFrom(moduleId, options)
    }
    catch (error) {
      await this.reportError(error, {
        message: `Runtime script module "${moduleId}" failed from target entry.`,
        source: 'script',
        phase: 'runtime-script:run-from',
        metadata: {
          moduleId,
          nodeId: options.nodeId,
          labelId: options.labelId,
          entryId: options.entryId,
          stepId: options.stepId,
          packageId: options.packageId,
        },
      })
      throw error
    }
  }

  async ensureRuntimePackages(packageIds: readonly string[]): Promise<void> {
    this.assertInitialized()
    await this.runtimeContentManager.ensureRuntimePackages(packageIds)
  }

  async emitRuntimePackageRendererPlugins(packageId: string, plugins: RuntimePackagePluginManifest[]): Promise<void> {
    await this.emitLogicToRender(L2R.RUNTIME_PACKAGE_PLUGIN, { packageId, plugins })
  }

  async emitRuntimePackageUnload(packageId: string, bundleName?: string): Promise<void> {
    await this.emitLogicToRender(L2R.RUNTIME_PACKAGE_UNLOAD, { packageId, bundleName })
  }

  getLocale(): string {
    return this.assets.getLocale()
  }

  async ensureLocalePacks(locale: string, options: EnsureLocalePacksOptions = {}): Promise<RuntimePackageStateRecord[]> {
    this.assertInitialized()
    const normalizedLocale = normalizeLocale(locale)
    const packages = await this.runtimeContentManager.ensureLocalePacks(normalizedLocale, options)
    this.store.commit('setActiveLocalePacks', {
      locale: normalizedLocale,
      packageIds: this.runtimeContentManager.getActiveLocalePackIds(normalizedLocale, options),
    })
    return packages
  }

  async setLocale(locale: string, options: SetLocaleOptions = {}): Promise<void> {
    this.assertInitialized()
    const normalizedLocale = normalizeLocale(locale)
    if (options.ensurePacks) {
      await this.ensureLocalePacks(normalizedLocale, options)
    }
    else {
      this.store.commit('setActiveLocalePacks', {
        locale: normalizedLocale,
        packageIds: this.runtimeContentManager.getActiveLocalePackIds(normalizedLocale, options),
      })
    }
    this.assets.setLocale(normalizedLocale)
  }

  async withRuntimePackageContext<T>(packageId: string | undefined, operation: (engine: QuaEngineInterface) => T | Promise<T>): Promise<T> {
    return await operation(packageId ? createRuntimePackageEngineFacade(this, packageId) : this)
  }

  async reportError(error: unknown, options: EngineReportErrorOptions = {}): Promise<ReturnType<typeof createQuaErrorPayload>> {
    const payload = createQuaErrorPayload(error, {
      source: 'engine',
      severity: 'error',
      recoverable: true,
      ...options,
      metadata: {
        ...(options.metadata || {}),
        currentScene: this.getCurrentSceneName(),
        currentStepId: this.getCurrentStepId(),
      },
    })
    this.markErrorHandled(error)
    logger.error(`[${payload.source || 'engine'}] ${payload.message}`, error)
    if (!this.isDestroyed && !this.shouldSuppressRenderEvents()) {
      await emitLogicToRender(this.pipeline, L2R.SYSTEM_ERROR, payload).catch((emitError) => {
        logger.error('Failed to emit system error:', emitError)
      })
    }
    return payload
  }

  registerScene(sceneId: string, factory: SceneFactory): () => void {
    this.sceneFactories.set(sceneId, factory)
    return () => {
      if (this.sceneFactories.get(sceneId) === factory) {
        this.sceneFactories.delete(sceneId)
      }
    }
  }

  hasScene(sceneId: string): boolean {
    return this.sceneFactories.has(sceneId)
  }

  async loadScene(scene: Scene, transition?: SceneTransitionOptions, enterContext?: SceneEnterContext): Promise<void> {
    this.assertInitialized()
    try {
      await this.sceneManager.loadScene(scene, transition, enterContext)
    }
    catch (error) {
      await this.reportError(error, {
        message: `Scene "${scene.name}" failed to load.`,
        source: 'scene',
        phase: 'scene:load',
        metadata: { sceneName: scene.name, sceneId: enterContext?.sceneId },
      })
      throw error
    }
  }

  async dialogue(steps: GameStep[]): Promise<void>
  async dialogue<TScope>(steps: OptionalGameStepFactory<TScope>, scope?: TScope): Promise<void>
  async dialogue<TScope>(steps: GameStepFactory<TScope>, scope: TScope): Promise<void>
  async dialogue<TScope = GameStepScope>(steps: GameStepSource<TScope>, scope?: TScope): Promise<void> {
    this.assertInitialized()
    try {
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
    catch (error) {
      await this.reportErrorOnce(error, {
        message: 'Dialogue sequence failed.',
        source: 'script',
        phase: 'dialogue:run',
      })
      throw error
    }
  }

  async executeStep(step: GameStep, options: ExecuteStepOptions = {}): Promise<void> {
    this.assertInitialized()

    const runtime = this.getRuntimeState()
    const previousStepId = runtime.currentStepId || undefined
    const point = this.resolveStepPoint(step)
    const stepHistory = [...runtime.stepHistory, step.uuid]
    const abortController = new AbortController()
    this.currentStepAbortController = abortController

    try {
      const rollbackStep = this.config.store?.enableSnapshots === false || options.rollbackReplay
        ? undefined
        : await this.rollbackController.beginStep(step, point)
      const rollbackSnapshotSet = rollbackStep?.anchorReason
        ? await this.rollbackController.createSnapshotSet(step.uuid)
        : undefined

      this.store.commit('setCurrentStep', {
        stepId: step.uuid,
        stepHistory,
      })
      this.store.commit('setStoryPoint', point)

      if (rollbackStep?.anchorReason) {
        const checkpoint = await this.createCheckpointInternal({
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
        }, rollbackSnapshotSet)
        this.rollbackController.registerStepAnchor(checkpoint, rollbackStep.anchorReason, rollbackSnapshotSet!, {
          requiredRuntimePackages: checkpoint.metadata?.requiredRuntimePackages,
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
      if (!options.rollbackReplay) {
        await this.emitViewUpdate()
      }
    }
    catch (error) {
      if (abortController.signal.aborted) {
        logger.debug(`Step execution cancelled: ${step.uuid}`)
        return
      }
      await this.reportErrorOnce(error, {
        message: `Step "${step.uuid}" failed.`,
        source: 'script',
        phase: 'step:run',
        metadata: {
          stepId: step.uuid,
          storyPoint: point,
        },
      })
      throw error
    }
    finally {
      if (!options.rollbackReplay) {
        this.rollbackController.completeStep()
      }
      if (this.currentStepAbortController === abortController) {
        this.currentStepAbortController = undefined
      }
    }
  }

  async rewind(stepUUID: string): Promise<void> {
    this.assertInitialized()
    if (this.rollbackController.hasTarget(stepUUID)) {
      await this.rollback(stepUUID, { reason: 'rewind' })
      return
    }
    await this.jumpTo(stepUUID, { reason: 'rewind', force: true })
  }

  async showDialogue(payload: DialogueIntent): Promise<void> {
    this.assertInitialized()
    const dialogue = this.withCurrentRuntimeContentMetadata(payload)
    this.store.commit('setDialogue', dialogue)
    await this.emitLogicToRender(L2R.DIALOGUE_SHOW, {
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
    await this.emitLogicToRender(L2R.DIALOGUE_HIDE, {})
    await this.emitViewUpdate()
  }

  async showChoices(choices: ChoiceIntent[]): Promise<void> {
    this.assertInitialized()
    const normalized = choices.map((choice) => {
      const projected = this.withCurrentRuntimeContentMetadata(choice)
      const contentPackageId = this.getCurrentRuntimePackageId()
      const presentation = contentPackageId && projected.presentation
        ? tagChoicePresentationWithRuntimePackage(projected.presentation, contentPackageId)
        : projected.presentation
      const projectedChoice = {
        ...projected,
        presentation,
      }
      return {
        ...projectedChoice,
        enabled: choice.enabled !== false,
        metadata: normalizeChoiceMetadata(projectedChoice),
      }
    })
    this.store.commit('setChoices', normalized)
    if (normalized.length > 0) {
      await this.createInternalRollbackAnchor('choice', {
        requiredRuntimePackages: this.getRequiredRuntimePackagesForCurrentState(this.getStoryPoint()),
      })
    }
    await this.emitLogicToRender(L2R.DIALOGUE_CHOICE, { choices: normalized })
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
    await this.emitLogicToRender(L2R.CHARACTER_SHOW, character)
    await this.emitViewUpdate()
  }

  async hideCharacter(id: string): Promise<void> {
    this.assertInitialized()
    this.store.commit('hideCharacter', id)
    await this.emitLogicToRender(L2R.CHARACTER_HIDE, { id })
    await this.emitViewUpdate()
  }

  async moveCharacter(id: string, position: CharacterIntent['position']): Promise<void> {
    this.assertInitialized()
    this.store.commit('moveCharacter', { id, position, contentPackageId: this.getCurrentRuntimePackageId() })
    await this.emitLogicToRender(L2R.CHARACTER_MOVE, { id, position })
    await this.emitViewUpdate()
  }

  async setCharacterExpression(id: string, expression?: string): Promise<void> {
    this.assertInitialized()
    this.store.commit('setCharacterExpression', { id, expression, contentPackageId: this.getCurrentRuntimePackageId() })
    await this.emitLogicToRender(L2R.CHARACTER_EXPRESSION, { id, expression })
    await this.emitViewUpdate()
  }

  async setCharacterSprite(id: string, sprite?: string): Promise<void> {
    this.assertInitialized()
    this.store.commit('setCharacterSprite', { id, sprite, contentPackageId: this.getCurrentRuntimePackageId() })
    await this.emitLogicToRender(L2R.CHARACTER_SPRITE, { id, sprite })
    await this.emitViewUpdate()
  }

  async setBackgroundProjection(background?: BackgroundIntent): Promise<void> {
    this.assertInitialized()
    const projectedBackground = background
      ? this.withCurrentRuntimeBackgroundMetadata(background)
      : undefined
    this.store.commit('setBackground', projectedBackground)
    if (projectedBackground) {
      await this.emitLogicToRender(L2R.BACKGROUND_SET, projectedBackground)
    }
    else {
      await this.emitLogicToRender(L2R.BACKGROUND_CLEAR, {})
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

  async resolveStoryAssetRef(ref: StoryAssetRef): Promise<ResolvedStoryAsset> {
    this.assertInitialized()
    const targetPackageId = ref.runtimePackageId
    if (targetPackageId) {
      await this.ensureRuntimePackages([targetPackageId])
    }
    const asset = await this.assets.getAsset(ref.type, ref.name, targetPackageId ? { targetPackageId } : undefined)
    const contentPackageId = ref.runtimePackageId || targetPackageId || getAssetRuntimePackageId(asset)
    return {
      ref: cloneStoryAssetRef(ref),
      asset,
      contentPackageId,
      requiredRuntimePackages: contentPackageId ? [contentPackageId] : [],
    }
  }

  async showUI(elementId: string, config: Record<string, unknown> = {}): Promise<void> {
    this.assertInitialized()
    const projectedConfig = this.withCurrentRuntimeContentConfig(config)
    this.store.commit('upsertUiOverlay', { elementId, config: projectedConfig })
    await this.emitLogicToRender(L2R.UI_SHOW, { elementId, config: projectedConfig })
    await this.emitViewUpdate()
  }

  async hideUI(elementId: string): Promise<void> {
    this.assertInitialized()
    this.store.commit('removeUiOverlay', elementId)
    await this.emitLogicToRender(L2R.UI_HIDE, { elementId })
    await this.emitViewUpdate()
  }

  async updateUI(elementId: string, config: Record<string, unknown>): Promise<void> {
    this.assertInitialized()
    const projectedConfig = this.withCurrentRuntimeContentConfig(config)
    this.store.commit('upsertUiOverlay', { elementId, config: projectedConfig })
    await this.emitLogicToRender(L2R.UI_UPDATE, { elementId, config: projectedConfig })
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
      await this.emitLogicToRender(eventType, next)
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

  getAppVersion(): string | undefined {
    return this.config.appVersion || this.config.assets?.appVersion
  }

  getPipeline(): Pipeline {
    return this.pipeline
  }

  async translate(key: string, options?: TranslateInput): Promise<string> {
    this.assertInitialized()
    return await this.assets.translate(key, this.withCurrentTranslationTarget(options))
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
    this.syncPlaytime()
    const point = cloneStoryPoint(options.point || this.getStoryPoint() || this.createCurrentStoryPoint())
    const id = options.id || this.createCheckpointId(options.kind || 'manual', point)
    const checkpointState = this.captureCheckpointStateSnapshot()
    const snapshotSet = await this.rollbackController.createSnapshotSet(id)
    try {
      const checkpoint = await this.createCheckpointInternal({ ...options, id, point }, snapshotSet)
      const currentEntryIndex = this.rollbackController.getCurrentEntryIndex()
      this.rollbackController.registerStepAnchor(checkpoint, checkpoint.kind, snapshotSet, {
        requiredRuntimePackages: checkpoint.metadata?.requiredRuntimePackages,
      }, currentEntryIndex === undefined ? undefined : currentEntryIndex + 1, !this.rollbackController.hasActiveEntry())
      return checkpoint
    }
    catch (error) {
      await this.cleanupCheckpointState(checkpointState, snapshotSet)
      throw error
    }
  }

  private async createCheckpointInternal(options: CreateCheckpointOptions = {}, snapshotSet?: RollbackSnapshotSet): Promise<EngineCheckpoint> {
    this.assertInitialized()
    if (!snapshotSet) {
      this.syncPlaytime()
    }
    const point = cloneStoryPoint(options.point || this.getStoryPoint() || this.createCurrentStoryPoint())
    const id = options.id || this.createCheckpointId(options.kind || 'manual', point)
    const metadata = createCheckpointMetadata(
      {
        ...(options.metadata || {}),
        ...(snapshotSet ? { rollbackSnapshotSet: cloneRollbackSnapshotSet(snapshotSet) } : {}),
      },
      this.getRequiredRuntimePackagesForCurrentState(point),
    )
    const resolvedSnapshotSet = snapshotSet || await this.rollbackController.createSnapshotSet(id)
    const snapshotId = resolvedSnapshotSet.storeSnapshots[this.store.getName()]
      || Object.values(resolvedSnapshotSet.storeSnapshots)[0]
    const checkpoint: EngineCheckpoint = {
      id,
      point,
      snapshotId,
      kind: options.kind || 'manual',
      metadata,
    }

    await this.notifyPlugins('onBeforeCheckpoint', this.createEngineContext(point.stepId, { point, checkpoint }))
    this.store.commit('upsertCheckpoint', checkpoint)
    await this.notifyPlugins('onAfterCheckpoint', this.createEngineContext(point.stepId, { point, checkpoint }))
    return cloneCheckpoint(checkpoint)
  }

  getCheckpoint(id: string): EngineCheckpoint | undefined {
    const checkpoint = this.getEngineState().checkpoints[id]
    return checkpoint ? cloneCheckpoint(checkpoint) : undefined
  }

  getRollbackConfig(): RollbackConfig {
    return this.rollbackController.getConfig()
  }

  setRollbackConfig(patch: RollbackConfigPatch): RollbackConfig {
    const config = this.rollbackController.setConfig(patch)
    this.config = {
      ...this.config,
      rollback: config,
    }
    return config
  }

  getRollbackTargets(): RollbackTargetInfo[] {
    return this.rollbackController.getTargets()
  }

  canRollback(): boolean {
    return this.rollbackController.canRollback()
  }

  canRollForward(): boolean {
    return this.rollbackController.canRollForward()
  }

  async rollback(target?: RollbackTarget, options?: RollbackNavigationOptions): Promise<void> {
    this.assertInitialized()
    this.currentStepAbortController?.abort()
    this.navigationVersion++
    this.clearFlowControlAdvance()
    await this.withSuppressedRenderEvents(async () => {
      await this.rollbackController.rollback(target, options)
    })
  }

  async rollForward(target?: RollbackTarget, options?: RollbackNavigationOptions): Promise<void> {
    this.assertInitialized()
    this.currentStepAbortController?.abort()
    this.navigationVersion++
    this.clearFlowControlAdvance()
    await this.withSuppressedRenderEvents(async () => {
      await this.rollbackController.rollForward(target, options)
    })
  }

  async createRollbackAnchor(reason: RollbackAnchorReason | string = 'developer', metadata?: Record<string, unknown>): Promise<RollbackAnchor | undefined> {
    this.assertInitialized()
    const anchor = await this.createInternalRollbackAnchor(reason, metadata)
    if (!anchor) {
      if (this.rollbackController.isReplaying()) {
        return undefined
      }
      throw new Error('Unable to create rollback anchor without an active rollback entry.')
    }
    return anchor
  }

  private async createInternalRollbackAnchor(
    reason: RollbackAnchorReason | string = 'developer',
    metadata?: Record<string, unknown>,
    replayStart: 'current-entry' | 'after-current-entry' = 'after-current-entry',
  ): Promise<RollbackAnchor | undefined> {
    const manual = await this.rollbackController.createManualAnchor(reason, metadata)
    if (!manual) {
      return undefined
    }
    const currentEntryIndex = this.rollbackController.getCurrentEntryIndex()
    const point = this.getStoryPoint() || this.createCurrentStoryPoint()
    const checkpointState = this.captureCheckpointStateSnapshot()
    this.syncPlaytime()
    const snapshotSet = await this.rollbackController.createSnapshotSet(`rollback-anchor:${String(reason)}:${point.stepId}`)
    try {
      const checkpoint = await this.createCheckpointInternal({
        kind: reason === 'choice' ? 'choice' : 'manual',
        point,
        metadata: {
          ...(metadata || {}),
          rollbackAnchorReason: reason,
        },
      }, snapshotSet)
      const anchor = this.rollbackController.registerStepAnchor(
        checkpoint,
        manual.reason,
        snapshotSet,
        metadata,
        currentEntryIndex === undefined
          ? undefined
          : replayStart === 'current-entry'
            ? currentEntryIndex
            : currentEntryIndex + 1,
        replayStart === 'current-entry' || !this.rollbackController.hasActiveEntry(),
      )
      if (!anchor) {
        throw new Error('Unable to register rollback anchor.')
      }
      return anchor
    }
    catch (error) {
      await this.cleanupCheckpointState(checkpointState, snapshotSet)
      throw error
    }
  }

  async markRollbackBoundary(reason = 'developer', metadata?: Record<string, unknown>): Promise<void> {
    this.assertInitialized()
    await this.createInternalRollbackAnchor(reason, {
      ...(metadata || {}),
      rollbackBoundaryReason: reason,
    }, 'current-entry')
    await this.rollbackController.markBoundary(reason, metadata)
  }

  async fixRollback(metadata?: Record<string, unknown>): Promise<void> {
    this.assertInitialized()
    this.rollbackController.fixRollback(metadata)
  }

  private async markRuntimePackageRollbackBoundary(operation: 'activate' | 'unload', packageId: string, requiredRuntimePackages: string[] = []): Promise<void> {
    if (!this.rollbackController.isEnabled()) {
      return
    }
    await this.createInternalRollbackAnchor('runtime-package', {
      operation,
      packageId,
      ...(requiredRuntimePackages.length > 0 ? { requiredRuntimePackages } : {}),
    })
    await this.rollbackController.markBoundary('runtime-package', { operation, packageId })
  }

  registerRollbackStore(name: string, store: QuaStore): void {
    this.rollbackController.registerStore(name, store)
  }

  unregisterRollbackStore(name: string): void {
    this.rollbackController.unregisterStore(name)
  }

  waitFor<T extends LogicToRenderEvents | RenderToLogicEvents>(
    event: T,
    matcher?: (payload: EventPayload<T>) => boolean,
    options?: { timeout?: number, signal?: any },
  ): Promise<EventPayload<T>> {
    if (this.rollbackController.isReplaying()) {
      const payload = this.rollbackController.consumeReplayInput(event, matcher)
      return this.pipeline.receive({ type: String(event), payload }).then(() => payload)
    }
    const signal = options?.signal || this.currentStepAbortController?.signal
    if (signal?.aborted) {
      return Promise.reject(new Error(`Waiting for ${event} was cancelled`))
    }
    return waitForPipelineEvent(this.pipeline, event, matcher, { ...options, signal })
      .then((payload) => {
        this.rollbackController.recordInput(event, payload)
        return payload
      })
  }

  registerStoryTargetResolver(resolver: StoryTargetResolver): () => void {
    this.storyTargetResolvers.push(resolver)
    return () => {
      const index = this.storyTargetResolvers.indexOf(resolver)
      if (index !== -1) {
        this.storyTargetResolvers.splice(index, 1)
      }
    }
  }

  async jumpToChoice(choiceId: string, options: ChoiceJumpOptions = {}): Promise<void> {
    this.assertInitialized()
    try {
      const choice = this.getViewState().choices.find(item => item.id === choiceId)
      if (!choice) {
        throw new Error(`Unable to resolve choice "${choiceId}" from current engine-owned choices.`)
      }
      if (choice.enabled === false) {
        throw new Error(`Cannot jump through disabled choice "${choiceId}".`)
      }
      const target = (choice as { target?: ChoiceTarget }).target || getChoiceMetadataTarget(choice.metadata)
      if (!target) {
        throw new Error(`Choice "${choiceId}" does not declare a structured jump target.`)
      }

      const resolved = await this.resolveStoryTarget(target, {
        choiceId,
        source: 'choice',
      })
      const requiredRuntimePackages = mergeRequiredRuntimePackages(
        target.requiredRuntimePackages as string[] | undefined,
        resolved.requiredRuntimePackages as string[] | undefined,
        getMetadataRequiredRuntimePackages(choice.metadata as Record<string, unknown> | undefined),
      )
      if (requiredRuntimePackages.length > 0) {
        await this.ensureRuntimePackages(requiredRuntimePackages)
      }

      if (options.clearChoices !== false) {
        await this.clearChoices()
      }

      if (resolved.scene) {
        await this.enterResolvedScene(resolved, choiceId, options)
        return
      }
      if (resolved.checkpoint) {
        await this.jumpTo(resolved.checkpoint, options)
      }
      else if (resolved.point) {
        await this.jumpTo(resolved.point, options)
      }
      if (resolved.script && options.runTarget !== false) {
        await this.runScriptModuleFrom(resolved.script.moduleId, {
          locale: this.getLocale(),
          nodeId: resolved.script.nodeId,
          labelId: resolved.script.labelId,
          entryId: resolved.script.entryId,
          stepId: resolved.script.stepId,
          packageId: resolved.script.packageId,
          scope: resolved.script.scope,
        })
      }
    }
    catch (error) {
      await this.reportErrorOnce(error, {
        message: `Choice jump "${choiceId}" failed.`,
        source: 'engine',
        phase: 'choice:jump',
        metadata: { choiceId },
      })
      throw error
    }
  }

  async resolveStoryTarget(target: ChoiceTarget, context: Partial<StoryTargetResolveContext> = {}): Promise<ResolvedStoryJump> {
    this.assertInitialized()
    const resolvedContext: StoryTargetResolveContext = {
      engine: this,
      assets: this.assets,
      target,
      currentPoint: context.currentPoint || this.getStoryPoint(),
      currentSceneId: context.currentSceneId || this.getCurrentSceneName(),
      choiceId: context.choiceId,
      source: context.source,
    }
    const direct = await this.resolveBuiltInStoryTarget(target, resolvedContext)
    if (direct) {
      return direct
    }

    const fromResolvers = await this.resolveStoryTargetFromResolvers(target, resolvedContext)
    if (fromResolvers) {
      return fromResolvers
    }

    const loaded = await this.runtimeContentManager.resolveStoryTargetFromRegistry(target, resolvedContext)
    if (loaded) {
      const afterLoad = await this.resolveBuiltInStoryTarget(target, resolvedContext)
        || await this.resolveStoryTargetFromResolvers(target, resolvedContext)
      if (afterLoad) {
        return afterLoad
      }
    }

    throw new Error(`Unable to resolve story target: ${JSON.stringify(target)}`)
  }

  private async resolveBuiltInStoryTarget(target: ChoiceTarget, context: StoryTargetResolveContext): Promise<ResolvedStoryJump | undefined> {
    switch (target.kind) {
      case 'checkpoint': {
        const checkpoint = this.getCheckpoint(target.id)
        return checkpoint
          ? {
              target,
              checkpoint,
              point: checkpoint.point,
              requiredRuntimePackages: getMetadataRequiredRuntimePackages(checkpoint.metadata),
            }
          : undefined
      }
      case 'scene': {
        assertSerializableSceneState(target.state)
        if (!this.sceneFactories.has(target.sceneId)) {
          return undefined
        }
        return {
          target,
          requiredRuntimePackages: mergeRequiredRuntimePackages(target.requiredRuntimePackages as string[] | undefined),
          scene: {
            sceneId: target.sceneId,
            entry: target.entry,
            initialState: target.state,
            transition: target.transition,
          },
          point: {
            ...createSceneTargetBasePoint(context.currentPoint),
            sceneId: target.sceneId,
            entryId: target.entry,
            stepId: target.entry || target.sceneId,
          },
        }
      }
      case 'script': {
        assertSerializableSceneState(target.scope)
        return {
          target,
          requiredRuntimePackages: mergeRequiredRuntimePackages(
            target.requiredRuntimePackages as string[] | undefined,
            target.packageId ? [target.packageId] : [],
          ),
          point: {
            ...(context.currentPoint || {}),
            nodeId: target.nodeId || context.currentPoint?.nodeId,
            labelId: target.labelId || context.currentPoint?.labelId,
            entryId: target.entryId || context.currentPoint?.entryId,
            stepId: target.stepId || target.labelId || target.nodeId || target.entryId || target.moduleId,
            contentPackageId: target.packageId || context.currentPoint?.contentPackageId,
            scriptModuleId: target.moduleId,
          },
          script: {
            moduleId: target.moduleId,
            nodeId: target.nodeId,
            labelId: target.labelId,
            entryId: target.entryId,
            stepId: target.stepId,
            packageId: target.packageId,
            scope: target.scope,
          },
        }
      }
      default:
        return undefined
    }
  }

  private async resolveStoryTargetFromResolvers(target: ChoiceTarget, context: StoryTargetResolveContext): Promise<ResolvedStoryJump | undefined> {
    for (let index = this.storyTargetResolvers.length - 1; index >= 0; index--) {
      const resolved = await this.storyTargetResolvers[index](target, context)
      if (resolved) {
        return resolved
      }
    }
    return undefined
  }

  private async enterResolvedScene(resolved: ResolvedStoryJump, choiceId: string | undefined, options: ChoiceJumpOptions): Promise<void> {
    const sceneTarget = resolved.scene
    if (!sceneTarget) {
      return
    }

    assertSerializableSceneState(sceneTarget.initialState)
    const factory = this.sceneFactories.get(sceneTarget.sceneId)
    if (!factory) {
      throw new Error(`Scene target "${sceneTarget.sceneId}" resolved, but no scene factory is registered.`)
    }

    const fromPoint = this.getStoryPoint()
    await this.rollbackController.markBoundary('scene', {
      reason: options.reason || 'choice-scene-jump',
      choiceId,
      target: resolved.target,
      requiredRuntimePackages: resolved.requiredRuntimePackages,
    })
    const scene = await factory()
    const enterContext: SceneEnterContext = {
      sceneId: sceneTarget.sceneId,
      entry: sceneTarget.entry,
      initialState: sceneTarget.initialState,
      transition: sceneTarget.transition,
      reason: options.reason || 'choice-scene-jump',
      choiceId,
      target: resolved.target,
      fromScene: this.getCurrentSceneName(),
      fromPoint,
      requiredRuntimePackages: resolved.requiredRuntimePackages,
    }
    await this.loadScene(scene, sceneTarget.transition, enterContext)
    const point = resolved.point || {
      ...(fromPoint || {}),
      sceneId: sceneTarget.sceneId,
      entryId: sceneTarget.entry,
      stepId: sceneTarget.entry || sceneTarget.sceneId,
    }
    this.store.commit('setStoryPoint', point)
    this.store.commit('setCurrentStep', {
      stepId: point.stepId,
      stepHistory: this.truncateStepHistory(point.stepId),
    })
    await this.emitViewUpdate()
  }

  async jumpTo(target: JumpTarget, options: JumpOptions = {}): Promise<void> {
    this.assertInitialized()
    try {
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
        await this.restoreCheckpointSnapshot(checkpoint, { force: options.force ?? true })
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
        this.store.commit('setUiSceneHost', undefined)
      }
      this.store.commit('setStoryPoint', point)
      if (checkpoint) {
        this.store.commit('upsertCheckpoint', checkpoint)
        this.store.commit('setCurrentCheckpoint', checkpoint.id)
      }
      this.store.commit('mergeFlowControlReadKeys', preservedReadKeys)

      await this.emitLogicToRender(L2R.SCENE_INIT, {
        sceneId: point.sceneId || this.getRuntimeState().currentScene || 'unknown',
        stepId: point.stepId,
      })
      await this.notifyPlugins('onAfterJump', this.createEngineContext(point.stepId, { point, checkpoint, jump }))
      await this.emitViewUpdate()
    }
    catch (error) {
      await this.reportErrorOnce(error, {
        message: 'Jump failed.',
        source: 'engine',
        phase: 'jump',
        metadata: { target: cloneUnknownValue(target as unknown) as Record<string, unknown> | string },
      })
      throw error
    }
  }

  async saveToSlot(slotId: string, metadata: SlotMetadata = {}, options: SaveToSlotOptions = {}): Promise<void> {
    this.assertInitialized()
    const playtime = this.syncPlaytime()
    const reason: SaveReason = options.reason || 'save'
    const rollbackConfig = this.rollbackController.getConfig()
    const checkpointState = this.captureCheckpointStateSnapshot()
    let checkpoint: EngineCheckpoint | undefined
    let savedSlot: Awaited<ReturnType<QuaStore['saveToSlot']>> | undefined
    let resolvedPreview: Awaited<ReturnType<typeof this.resolveSavePreview>> | undefined
    try {
      checkpoint = await this.createCheckpoint({
        id: `save:${slotId}`,
        kind: 'save',
        metadata: {
          ...metadata,
          locale: this.getLocale(),
          requiredRuntimePackages: this.getRequiredRuntimePackagesForCurrentState(this.getStoryPoint(), metadata),
        },
      })
      const rollbackJournal = rollbackConfig.saves.includeRollbackHistory
        ? this.rollbackController.serialize()
        : undefined
      const rollbackStoreData = rollbackConfig.saves.includeRollbackHistory
        ? await this.rollbackController.exportStoreSaveData(this.store.getName())
        : undefined
      const requiredRuntimePackages = this.getRequiredRuntimePackagesForCurrentState(this.getStoryPoint(), metadata)
      const mergedMetadata = {
        ...metadata,
        ...(rollbackJournal ? { rollbackJournal } : {}),
        ...(rollbackStoreData && Object.keys(rollbackStoreData).length > 0 ? { rollbackStoreData } : {}),
        sceneName: metadata.sceneName || this.getCurrentSceneName(),
        stepId: metadata.stepId || this.getCurrentStepId(),
        playtime,
        locale: this.getLocale(),
        checkpointId: checkpoint.id,
        storyPoint: this.getStoryPoint(),
        requiredRuntimePackages,
        timestamp: Date.now(),
      }
      const baseStoreData = await this.store.exportSaveData()
      resolvedPreview = await this.resolveSavePreview(slotId, reason, options)
      savedSlot = await this.store.saveToSlot({
        slotId,
        name: mergedMetadata.name,
        saveOpId: resolvedPreview.saveOpId,
        previewStatus: resolvedPreview.previewStatus,
        preview: resolvedPreview.preview,
        metadata: mergedMetadata,
        storeData: baseStoreData,
      })
    }
    catch (error) {
      await this.cleanupCheckpointState(
        checkpointState,
        getRollbackSnapshotSet(checkpoint?.metadata?.rollbackSnapshotSet),
      )
      throw error
    }

    await this.emitLogicToRender(L2R.SLOT_UPDATED, {
      slotId,
      revision: savedSlot.index.revision,
      previewStatus: savedSlot.index.previewStatus,
      source: reason,
    }).catch((error) => {
      void this.reportErrorOnce(error, {
        message: `Failed to emit save slot update for slot "${slotId}".`,
        source: 'engine',
        phase: 'save:slot-updated',
        metadata: { slotId, revision: savedSlot.index.revision, previewStatus: savedSlot.index.previewStatus, reason },
      })
    })
    await this.emitLogicToRender(L2R.GAME_SAVE, { slotId }).catch((error) => {
      void this.reportErrorOnce(error, {
        message: `Failed to emit game save event for slot "${slotId}".`,
        source: 'engine',
        phase: 'save:complete',
        metadata: { slotId, reason },
      })
    })
    if (resolvedPreview?.pending) {
      void this.finishAsyncSavePreview(slotId, resolvedPreview.pending).catch((error) => {
        void this.reportErrorOnce(error, {
          message: `Failed to patch async save preview for slot "${slotId}".`,
          source: 'engine',
          phase: 'save-preview:async-patch',
          metadata: { slotId, saveOpId: resolvedPreview.pending?.saveOpId },
        })
      })
    }
  }

  async loadFromSlot(slotId: string, options: LoadSlotOptions = {}): Promise<void> {
    this.assertInitialized()
    const slot = await this.store.getSlot(slotId)
    const slotMetadata = slot?.index.metadata
    const slotPoint = isStoryPoint(slotMetadata?.storyPoint) ? cloneStoryPoint(slotMetadata.storyPoint) : undefined
    const slotLocale = typeof slotMetadata?.locale === 'string'
      ? normalizeLocale(slotMetadata.locale)
      : undefined
    const rollbackJournal = isSerializedRollbackJournal(slotMetadata?.rollbackJournal)
      ? slotMetadata.rollbackJournal
      : undefined
    const rollbackStoreData = isRollbackStoreSaveDataRecord(slotMetadata?.rollbackStoreData)
      ? slotMetadata.rollbackStoreData
      : undefined
    await this.ensureRuntimeDependencies(slotPoint, slotMetadata)
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
    this.normalizePlaytimeAfterRestore()
    await this.rollbackController.importStoreSaveData(rollbackStoreData, options)
    const restoredLocale = this.getRuntimeState().locale || slotLocale
    if (restoredLocale) {
      this.assets.setLocale(restoredLocale)
    }
    if (rollbackJournal) {
      this.rollbackController.hydrate(rollbackJournal, Object.values(this.getEngineState().checkpoints))
      this.rollbackController.hydrateKnownCheckpoints()
    }
    else {
      this.rollbackController.hydrate(undefined)
    }
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

  async quickSave(metadata: SlotMetadata = {}, options: SaveToSlotOptions = {}): Promise<void> {
    await this.saveToSlot('quicksave', { name: 'Quick Save', ...metadata }, { ...options, reason: 'quickSave' })
  }

  async quickLoad(): Promise<void> {
    await this.loadFromSlot('quicksave', { force: true, reason: 'quick-load' })
  }

  async autoSave(metadata: SlotMetadata = {}, options: SaveToSlotOptions = {}): Promise<void> {
    await this.saveToSlot('autosave', { name: 'Auto Save', ...metadata }, { ...options, reason: 'autoSave' })
  }

  async listSaveSlots() {
    return await this.store.listSlots()
  }

  async deleteSaveSlot(slotId: string): Promise<void> {
    await this.store.deleteSlot(slotId)
    await this.emitLogicToRender(L2R.SLOT_UPDATED, {
      slotId,
      revision: 0,
      previewStatus: 'none',
      source: 'delete',
    })
  }

  getCurrentSceneName(): string | undefined {
    return this.getRuntimeState().currentScene || undefined
  }

  getCurrentStepId(): string | undefined {
    return this.getRuntimeState().currentStepId || undefined
  }

  getRuntimeStateSnapshot() {
    const runtime = this.getRuntimeState()
    const playtime = this.getPlaytimeState()
    return {
      ...runtime,
      locale: runtime.locale || this.assets.getLocale(),
      activeLocalePackIds: [...(runtime.activeLocalePackIds || [])],
      sceneHistory: [...(runtime.sceneHistory || [])],
      stepHistory: [...(runtime.stepHistory || [])],
      checkpointHistory: [...(runtime.checkpointHistory || [])],
      runtimePackages: { ...(runtime.runtimePackages || {}) },
      appliedRuntimeMigrations: [...(runtime.appliedRuntimeMigrations || [])],
      playtime,
    }
  }

  getPlaytimeMs(): number {
    return calculatePlaytimeMs(this.getRuntimeState().playtime, Date.now())
  }

  getPlaytimeState(): EnginePlaytimeState {
    return clonePlaytimeState({
      ...this.getRuntimeState().playtime,
      elapsedMs: this.getPlaytimeMs(),
    })
  }

  async pausePlaytime(reason = 'manual'): Promise<void> {
    const wasPaused = this.getRuntimeState().playtime.paused
    this.store.commit('pausePlaytime', { now: Date.now(), reason })
    if (wasPaused || !this.getRuntimeState().playtime.paused) {
      return
    }
    await this.emitLogicToRender(L2R.GAME_PAUSE, {}).catch((error) => {
      void this.reportErrorOnce(error, {
        message: 'Failed to emit game pause event.',
        source: 'engine',
        phase: 'playtime:pause',
        metadata: { reason },
      })
    })
  }

  async resumePlaytime(reason = 'manual'): Promise<void> {
    const wasPaused = this.getRuntimeState().playtime.paused
    this.store.commit('resumePlaytime', { now: Date.now(), reason })
    if (!wasPaused || this.getRuntimeState().playtime.paused) {
      return
    }
    await this.emitLogicToRender(L2R.GAME_RESUME, {}).catch((error) => {
      void this.reportErrorOnce(error, {
        message: 'Failed to emit game resume event.',
        source: 'engine',
        phase: 'playtime:resume',
        metadata: { reason },
      })
    })
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

    this.store.commit('pausePlaytime', { now: Date.now(), reason: 'engine:destroy' })
    this.currentStepAbortController?.abort()
    this.clearFlowControlAdvance()
    while (this.flowControlDisposers.length > 0) {
      try {
        this.flowControlDisposers.pop()?.()
      }
      catch (error) {
        await this.reportErrorOnce(error, {
          message: 'Engine flow-control disposer failed during destroy.',
          source: 'plugin',
          phase: 'engine:destroy:flow-control-disposer',
        })
      }
    }
    await this.runtimeContentManager.destroy()
    await this.sceneManager.destroy()
    await this.destroyRegisteredPlugins('destroy')
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
    const failures: unknown[] = []
    for (const plugin of this.plugins.values()) {
      try {
        await this.initializePlugin(plugin)
      }
      catch (error) {
        await this.reportErrorOnce(error, {
          message: `Failed to initialize plugin "${plugin.name}".`,
          source: 'plugin',
          phase: 'engine-plugin:init',
          metadata: { pluginName: plugin.name },
        })
        failures.push(error)
      }
    }

    if (failures.length > 0) {
      throw failures[0]
    }
  }

  private async cleanupFailedInit(
    cause: unknown,
    options: {
      pluginsInitializationStarted: boolean
    },
  ): Promise<void> {
    await this.assets.cleanup().catch((cleanupError) => {
      void this.reportError(cleanupError, {
        message: 'Failed to clean up assets after engine initialization failure.',
        source: 'engine',
        phase: 'engine:init:cleanup',
        metadata: { cause: createSerializableErrorSummary(cause) },
      })
    })
    if (options.pluginsInitializationStarted) {
      await this.destroyRegisteredPlugins('init-rollback')
      this.plugins.clear()
      this.pluginContext.clear()
    }
    this.isInitialized = false
  }

  private async initializePlugin(plugin: EnginePlugin): Promise<void> {
    const context = this.createEngineContext()
    await plugin.init(context)
  }

  private async destroyRegisteredPlugins(reason: 'destroy' | 'init-rollback'): Promise<void> {
    for (const plugin of Array.from(this.plugins.values()).reverse()) {
      await this.destroyPlugin(plugin, reason)
    }
  }

  private async destroyPlugin(plugin: EnginePlugin, reason: 'destroy' | 'init-rollback' | 'unuse'): Promise<void> {
    try {
      await plugin.destroy?.()
    }
    catch (error) {
      await this.reportErrorOnce(error, {
        message: `Failed to destroy plugin "${plugin.name}"${reason === 'unuse' ? ' during unuse' : reason === 'init-rollback' ? ' during init rollback' : ''}.`,
        source: 'plugin',
        phase: 'engine-plugin:destroy',
        metadata: { pluginName: plugin.name, reason },
      })
    }
    finally {
      getPluginRegistry().unregisterPlugin(plugin.name)
    }
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
    await this.notifyPluginsSequential(
      'onStep',
      stepContext.stepId,
      stepContext.point,
      plugin => plugin.onStep,
      (plugin, context) => plugin.onStep!(context),
    )
  }

  private async notifyPlugins(
    hook: 'onStepStart' | 'onStepComplete' | 'onBeforeCheckpoint' | 'onAfterCheckpoint' | 'onBeforeJump' | 'onAfterJump' | 'onBeforeRollback' | 'onAfterRollback' | 'onRuntimePackageActivate' | 'onRuntimePackageUnload' | 'onRuntimePackageMigrate',
    context: EngineContext,
  ): Promise<void> {
    await this.notifyPluginsSequential(
      hook,
      context.stepId,
      context.point,
      plugin => plugin[hook],
      (plugin, nextContext) => plugin[hook]!(nextContext),
      context,
    )
  }

  private async notifyPluginsSequential(
    hook: string,
    stepId: string | undefined,
    point: StoryPoint | undefined,
    predicate: (plugin: EnginePlugin) => unknown,
    invoke: (plugin: EnginePlugin, context: EngineContext) => Promise<void> | void,
    baseContext?: EngineContext,
  ): Promise<void> {
    const failures: unknown[] = []
    for (const plugin of this.plugins.values()) {
      if (!predicate(plugin)) {
        continue
      }

      const context = baseContext || this.createEngineContext(stepId, { point })
      try {
        await invoke(plugin, context)
      }
      catch (error) {
        await this.reportErrorOnce(error, {
          message: `Plugin "${plugin.name}" failed during "${hook}".`,
          source: 'plugin',
          phase: `engine-plugin:${hook}`,
          metadata: {
            pluginName: plugin.name,
            hook,
            stepId,
            sceneName: point?.sceneId,
          },
        })
        failures.push(error)
      }
    }

    if (failures.length > 0) {
      throw failures[0]
    }
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
    extras: Pick<EngineContext, 'point' | 'checkpoint' | 'jump' | 'rollback' | 'runtimePackage' | 'runtimeMigration'> = {},
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

  private hydrateCheckpoints(checkpoints: EngineCheckpoint[], currentCheckpointId?: string): void {
    this.store.commit('hydrateCheckpoints', {
      checkpoints,
      currentCheckpointId,
    })
  }

  private captureCheckpointStateSnapshot(): CheckpointStateSnapshot {
    const runtime = this.getRuntimeState()
    const checkpointMap = this.getEngineState().checkpoints
    const checkpoints = runtime.checkpointHistory
      .map(id => checkpointMap[id])
      .filter((checkpoint): checkpoint is EngineCheckpoint => Boolean(checkpoint))
      .map(cloneCheckpoint)

    return {
      checkpoints,
      currentCheckpointId: runtime.currentCheckpointId,
      rollbackJournal: this.rollbackController.serialize(),
    }
  }

  private async cleanupCheckpointState(
    snapshot: CheckpointStateSnapshot,
    snapshotSet?: RollbackSnapshotSet,
  ): Promise<void> {
    this.store.commit('hydrateCheckpoints', {
      checkpoints: snapshot.checkpoints,
      currentCheckpointId: snapshot.currentCheckpointId,
    })
    this.rollbackController.hydrate(snapshot.rollbackJournal, snapshot.checkpoints)
    if (snapshotSet) {
      await this.rollbackController.deleteSnapshotSet(snapshotSet).catch((error) => {
        logger.warn('Failed to clean up rollback snapshot set after checkpoint failure.', error)
      })
    }
  }

  private getProtectedRollbackCheckpointIds(): ReadonlySet<string> {
    const protectedIds = new Set<string>()
    collectCheckpointIdsFromUnknown(this.getEngineState().view.plugins, protectedIds)
    collectCheckpointIdsFromUnknown(this.getEngineState().view.ui, protectedIds)
    return protectedIds
  }

  private async restoreCheckpointSnapshot(checkpoint: EngineCheckpoint, options: { force?: boolean } = {}): Promise<void> {
    const snapshotSet = getRollbackSnapshotSet(checkpoint.metadata?.rollbackSnapshotSet)
    if (snapshotSet) {
      await this.rollbackController.restoreSnapshotSet(snapshotSet)
      this.rollbackController.hydrateKnownCheckpoints()
      return
    }
    await this.store.restore(checkpoint.snapshotId, { force: options.force ?? true })
  }

  private async resolveRollbackStep(entry: RollbackEntry): Promise<GameStep | undefined> {
    return await this.runtimeContentManager.resolveRollbackStep(entry)
  }

  private setupAssetForwarding(): void {
    this.assets.on('asset:changed', (change) => {
      this.emitLogicToRender(L2R.ASSET_CHANGED, change).catch((error) => {
        void this.reportErrorOnce(error, {
          message: 'Failed to forward asset change.',
          source: 'asset',
          phase: 'asset:changed',
        })
      })
    })
  }

  private setupRendererErrorForwarding(): void {
    this.flowControlDisposers.push(this.onRenderIntent(R2L.RENDER_ERROR, async (payload) => {
      await this.reportError(payload.error || payload.message, {
        ...payload,
        source: payload.source || 'renderer',
        phase: payload.phase || 'renderer:error',
        message: payload.message,
        metadata: {
          ...(payload.metadata || {}),
          rendererId: payload.rendererId,
          pluginName: payload.pluginName,
        },
      })
    }))
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
    this.flowControlDisposers.push(this.onRenderIntent(R2L.WINDOW_BLUR, async () => {
      if (this.config.playtime?.pauseOnWindowBlur === false) {
        return
      }
      await this.pausePlaytime('window-blur')
    }))
    this.flowControlDisposers.push(this.onRenderIntent(R2L.WINDOW_FOCUS, async () => {
      if (this.config.playtime?.pauseOnWindowBlur === false) {
        return
      }
      await this.resumePlaytime('window-blur')
    }))
  }

  private setupSaveLoadIntents(): void {
    this.flowControlDisposers.push(this.onRenderIntent(R2L.GAME_SAVE_REQUEST, async (payload) => {
      const slotId = typeof (payload as { slotId?: unknown }).slotId === 'string'
        ? (payload as { slotId: string }).slotId
        : 'quicksave'
      if (slotId === 'quicksave') {
        await this.quickSave({}, { preview: (payload as { preview?: SaveToSlotOptions['preview'] }).preview })
        return
      }
      await this.saveToSlot(slotId, {}, { preview: (payload as { preview?: SaveToSlotOptions['preview'] }).preview })
    }))
    this.flowControlDisposers.push(this.onRenderIntent(R2L.GAME_LOAD_REQUEST, async (payload) => {
      const slotId = typeof (payload as { slotId?: unknown }).slotId === 'string'
        ? (payload as { slotId: string }).slotId
        : 'quicksave'
      if (slotId === 'quicksave') {
        await this.quickLoad()
        return
      }
      await this.loadFromSlot(slotId, { force: true, reason: 'renderer-load' })
    }))
  }

  private onRenderIntent<T extends RenderToLogicEvents>(
    event: T,
    handler: (payload: EventPayload<T>) => void | Promise<void>,
  ): () => void {
    const listener: EventListener<EventPayload<T>> = async (context) => {
      try {
        await handler(context.event.payload)
      }
      catch (error) {
        await this.reportErrorOnce(error, {
          message: `Failed to handle renderer intent "${event}".`,
          source: 'engine',
          phase: 'renderer-intent',
          metadata: {
            event,
            payload: cloneUnknownValue(context.event.payload),
          },
        })
        throw error
      }
    }
    this.pipeline.on(event, listener as EventListener)
    return () => this.pipeline.off(event, listener as EventListener)
  }

  private getSavePreviewDefaults(reason: SaveReason): NonNullable<SaveToSlotOptions['preview']> {
    const previewConfig = this.config.saves?.preview
    const defaults = previewConfig?.defaults || {}
    const reasonConfig = reason === 'save'
      ? previewConfig?.save || {}
      : reason === 'quickSave'
        ? previewConfig?.quickSave || {}
        : previewConfig?.autoSave || {}
    const fallbackByReason: Record<SaveReason, SaveToSlotOptions['preview']> = {
      save: {
        mode: 'renderer-capture',
        transaction: 'sync',
        policy: {
          uiMode: 'hide-overlays',
          format: 'image/webp',
          quality: 0.72,
          maxWidth: 480,
        },
      },
      quickSave: {
        mode: 'renderer-capture',
        transaction: 'sync',
        policy: {
          uiMode: 'hide-overlays',
          format: 'image/webp',
          quality: 0.72,
          maxWidth: 480,
        },
      },
      autoSave: {
        mode: 'renderer-capture',
        transaction: 'async-clone',
        policy: {
          uiMode: 'scene-only',
          format: 'image/webp',
          quality: 0.58,
          maxWidth: 320,
        },
      },
    }
    return {
      ...(fallbackByReason[reason] || {}),
      ...defaults,
      ...reasonConfig,
      policy: {
        ...(fallbackByReason[reason]?.policy || {}),
        ...(defaults.policy || {}),
        ...(reasonConfig.policy || {}),
      },
    }
  }

  private async resolveSavePreview(
    slotId: string,
    reason: SaveReason,
    options: SaveToSlotOptions,
  ): Promise<{
    saveOpId?: string
    previewStatus: 'none' | 'pending' | 'ready' | 'error'
    preview?: QuaGameSavePreviewWriteInput
    pending?: {
      saveOpId: string
      requestId: string
      policy: NonNullable<NonNullable<SaveToSlotOptions['preview']>['policy']>
      response: Promise<SavePreviewCaptureResultPayload | undefined>
    }
  }> {
    const previewOptions = {
      ...this.getSavePreviewDefaults(reason),
      ...(options.preview || {}),
      policy: {
        ...(this.getSavePreviewDefaults(reason)?.policy || {}),
        ...(options.preview?.policy || {}),
      },
    }

    if (previewOptions.mode === 'disabled') {
      return {
        previewStatus: 'none',
      }
    }

    if (previewOptions.mode === 'provided') {
      return {
        saveOpId: `save:${slotId}:${generateId()}`,
        previewStatus: previewOptions.image ? 'ready' : 'none',
        preview: previewOptions.image
          ? this.createPreviewWriteInput(previewOptions.image, previewOptions.policy)
          : undefined,
      }
    }

    const saveOpId = `save:${slotId}:${generateId()}`
    const requestId = `save-preview:${generateId()}`
    const policy = previewOptions.policy || {}
    if (previewOptions.transaction === 'async-clone') {
      const response = this.waitForSavePreviewResponse(requestId, policy.timeoutMs || 5000, false)
      await this.emitLogicToRender(L2R.SAVE_PREVIEW_CAPTURE_REQUEST, {
        requestId,
        saveOpId,
        slotId,
        reason,
        transaction: 'async-clone',
        policy,
      })
      return {
        saveOpId,
        previewStatus: 'pending',
        pending: {
          saveOpId,
          requestId,
          policy,
          response,
        },
      }
    }

    const result = await this.requestSavePreviewCapture({
      requestId,
      saveOpId,
      slotId,
      reason,
      transaction: 'sync',
      policy,
    }, previewOptions.strict === true)

    if (!result) {
      return {
        saveOpId,
        previewStatus: previewOptions.strict ? 'error' : 'none',
      }
    }

    return {
      saveOpId,
      previewStatus: 'ready',
      preview: this.createCapturedPreviewWriteInput(result, policy),
    }
  }

  private async requestSavePreviewCapture(
    request: {
      requestId: string
      saveOpId: string
      slotId: string
      reason: SaveReason
      transaction: 'sync' | 'async-clone'
      policy: NonNullable<NonNullable<SaveToSlotOptions['preview']>['policy']>
    },
    strict: boolean,
  ) {
    const timeoutMs = request.policy?.timeoutMs || 5000
    const response = this.waitForSavePreviewResponse(request.requestId, timeoutMs, strict)
    await this.emitLogicToRender(L2R.SAVE_PREVIEW_CAPTURE_REQUEST, request)
    return await response
  }

  private async waitForSavePreviewResponse(requestId: string, timeoutMs: number, strict: boolean) {
    const controller = new AbortController()
    const resultPromise = this.waitFor(R2L.SAVE_PREVIEW_CAPTURE_RESULT, payload => payload.requestId === requestId, {
      timeout: timeoutMs,
      signal: controller.signal,
    }).then(payload => ({ kind: 'result' as const, payload }))
    const errorPromise = this.waitFor(R2L.SAVE_PREVIEW_CAPTURE_ERROR, payload => payload.requestId === requestId, {
      timeout: timeoutMs,
      signal: controller.signal,
    }).then(payload => ({ kind: 'error' as const, payload }))

    try {
      const race = await Promise.race([resultPromise, errorPromise])
      controller.abort()
      if (race.kind === 'result') {
        return race.payload
      }
      if (strict) {
        throw new Error(race.payload.message)
      }
      return undefined
    }
    catch (error) {
      controller.abort()
      if (strict) {
        throw error
      }
      return undefined
    }
  }

  private async finishAsyncSavePreview(
    slotId: string,
    pending: {
      saveOpId: string
      requestId: string
      policy: NonNullable<NonNullable<SaveToSlotOptions['preview']>['policy']>
      response: Promise<SavePreviewCaptureResultPayload | undefined>
    },
  ): Promise<void> {
    const result = await pending.response

    if (!result) {
      const patched = await this.store.patchSlotPreview(slotId, {
        expectedSaveOpId: pending.saveOpId,
        previewStatus: 'error',
      })
      if (patched) {
        await this.emitLogicToRender(L2R.SLOT_UPDATED, {
          slotId,
          revision: patched.revision,
          previewStatus: patched.previewStatus,
          source: 'save-patch',
        })
      }
      return
    }

    const patched = await this.store.patchSlotPreview(slotId, {
      expectedSaveOpId: pending.saveOpId,
      previewStatus: 'ready',
      preview: this.createCapturedPreviewWriteInput(result, pending.policy),
    })
    if (patched) {
      await this.emitLogicToRender(L2R.SLOT_UPDATED, {
        slotId,
        revision: patched.revision,
        previewStatus: patched.previewStatus,
        source: 'save-patch',
      })
    }
  }

  private createPreviewWriteInput(
    preview: NonNullable<NonNullable<SaveToSlotOptions['preview']>['image']>,
    policy?: SavePreviewCapturePolicy,
  ): QuaGameSavePreviewWriteInput {
    if (preview.kind === 'bytes') {
      return {
        kind: 'bytes',
        bytes: preview.bytes,
        mimeType: preview.mimeType,
        width: preview.width,
        height: preview.height,
        capturedAt: preview.capturedAt,
        policySummary: this.createSavePreviewPolicySummary(policy),
      }
    }

    return {
      kind: 'data-url',
      dataUrl: preview.dataUrl,
      mimeType: preview.mimeType,
      width: preview.width,
      height: preview.height,
      capturedAt: preview.capturedAt,
      policySummary: this.createSavePreviewPolicySummary(policy),
    }
  }

  private createCapturedPreviewWriteInput(
    result: SavePreviewCaptureResultPayload,
    policy?: SavePreviewCapturePolicy,
  ): QuaGameSavePreviewWriteInput {
    const image = result.image
    if (image.kind === 'bytes') {
      return {
        kind: 'bytes',
        bytes: image.bytes,
        mimeType: result.mimeType,
        width: result.width,
        height: result.height,
        capturedAt: result.capturedAt,
        policySummary: this.createSavePreviewPolicySummary(policy),
      }
    }

    return {
      kind: 'data-url',
      dataUrl: image.dataUrl,
      mimeType: result.mimeType,
      width: result.width,
      height: result.height,
      capturedAt: result.capturedAt,
      policySummary: this.createSavePreviewPolicySummary(policy),
    }
  }

  private createSavePreviewPolicySummary(
    policy?: SavePreviewCapturePolicy,
  ): Readonly<Record<string, unknown>> | undefined {
    if (!policy) {
      return undefined
    }

    const summary: Record<string, unknown> = {}
    const assignNumber = (key: string, value: number | undefined) => {
      if (typeof value === 'number' && Number.isFinite(value)) {
        summary[key] = value
      }
    }

    if (policy.uiMode !== undefined) {
      summary.uiMode = policy.uiMode
    }
    if (policy.format !== undefined) {
      summary.format = policy.format
    }
    assignNumber('quality', policy.quality)
    assignNumber('maxWidth', policy.maxWidth)
    assignNumber('maxHeight', policy.maxHeight)
    assignNumber('pixelRatio', policy.pixelRatio)
    if (policy.background !== undefined) {
      summary.background = policy.background
    }
    assignNumber('timeoutMs', policy.timeoutMs)

    return Object.keys(summary).length > 0 ? summary : undefined
  }

  private scheduleFlowControlAdvance(): void {
    if (this.shouldSuppressRenderEvents()) {
      return
    }
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
        void this.reportErrorOnce(error, {
          message: 'Failed to stop read-only skip mode.',
          source: 'engine',
          phase: 'flow-control:stop-read-skip',
        })
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
        void this.reportErrorOnce(error, {
          message: 'Failed to advance flow control.',
          source: 'engine',
          phase: 'flow-control:advance',
          metadata: { mode: plan.mode, source: plan.source },
        })
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
    if (this.shouldSuppressRenderEvents()) {
      return
    }
    await this.forceEmitViewUpdate()
  }

  private async forceEmitViewUpdate(): Promise<void> {
    await emitLogicToRender(this.pipeline, L2R.VIEW_UPDATE, { view: this.getViewState() })
  }

  private async emitLogicToRender<T extends LogicToRenderEvents>(
    event: T,
    payload: EventPayload<T>,
  ): Promise<void> {
    if (this.shouldSuppressRenderEvents()) {
      return
    }
    await emitLogicToRender(this.pipeline, event, payload)
  }

  private markErrorHandled(error: unknown): void {
    if (error && typeof error === 'object') {
      this.handledErrors.add(error)
    }
  }

  private hasHandledError(error: unknown): boolean {
    return Boolean(error && typeof error === 'object' && this.handledErrors.has(error))
  }

  private async reportErrorOnce(error: unknown, options: EngineReportErrorOptions = {}): Promise<void> {
    if (this.hasHandledError(error)) {
      return
    }
    await this.reportError(error, options)
  }

  private shouldSuppressRenderEvents(): boolean {
    return this.renderEventSuppressionDepth > 0 || this.rollbackController.isReplaying()
  }

  private async withSuppressedRenderEvents<T>(operation: () => Promise<T>): Promise<T> {
    this.renderEventSuppressionDepth++
    try {
      return await operation()
    }
    finally {
      this.renderEventSuppressionDepth--
    }
  }

  private async emitRollbackFinalProjection(point: StoryPoint): Promise<void> {
    await emitLogicToRender(this.pipeline, L2R.SCENE_INIT, {
      sceneId: point.sceneId || this.getRuntimeState().currentScene || 'unknown',
      stepId: point.stepId,
    })
    await this.forceEmitViewUpdate()
  }

  private getRuntimeState() {
    return this.getEngineState().runtime
  }

  private getFlowControlReadKeys(): string[] {
    return [...(this.getEngineState().flowControlProgress.readKeys || [])]
  }

  private syncPlaytime(now = Date.now()): number {
    this.store.commit('syncPlaytime', now)
    return calculatePlaytimeMs(this.getRuntimeState().playtime, now)
  }

  private normalizePlaytimeAfterRestore(now = Date.now()): void {
    this.store.commit('hydratePlaytimeAfterRestore', now)
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
      this.getActiveLocalePackIds(),
      this.getRequiredRuntimePackagesForCurrentView(),
    )
  }

  private withCurrentTranslationTarget(options?: TranslateInput): TranslateInput | undefined {
    const currentPackageId = this.getCurrentRuntimePackageId()
    if (!currentPackageId) {
      return options
    }
    const normalized = normalizeTranslateOptions(options)
    return {
      ...normalized,
      targetPackageId: normalized.targetPackageId || currentPackageId,
    }
  }

  private getActiveLocalePackIds(): string[] {
    return [...(this.getRuntimeState().activeLocalePackIds || [])]
  }

  private removeActiveLocalePackId(packageId: string): void {
    const runtime = this.getRuntimeState()
    if (!runtime.activeLocalePackIds?.includes(packageId)) {
      return
    }
    this.store.commit('setActiveLocalePacks', {
      locale: runtime.locale || this.assets.getLocale(),
      packageIds: runtime.activeLocalePackIds.filter(id => id !== packageId),
    })
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
    if (
      !packageId
      || value.contentPackageId
      || getMetadataRequiredRuntimePackages(value as Record<string, unknown>).length > 0
    ) {
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
    setActiveLocalePacks(state: any, payload: { locale: string, packageIds: string[] }) {
      state.engine.runtime.locale = payload.locale
      state.engine.runtime.activeLocalePackIds = [...payload.packageIds]
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
      ]
    },
    hydrateCheckpoints(state: any, payload: { checkpoints: EngineCheckpoint[], currentCheckpointId?: string }) {
      state.engine.checkpoints = Object.fromEntries(payload.checkpoints.map(checkpoint => [checkpoint.id, cloneCheckpoint(checkpoint)]))
      state.engine.runtime.checkpointHistory = payload.checkpoints.map(checkpoint => checkpoint.id)
      state.engine.runtime.currentCheckpointId = payload.currentCheckpointId
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
          sceneIds: [...payload.sceneIds],
          pluginIds: [...payload.pluginIds],
          migrationIds: [...payload.migrationIds],
          localePack: cloneRuntimeLocalePack(payload.localePack),
        },
      }
    },
    removeRuntimePackage(state: any, packageId: string) {
      const runtimePackages = {
        ...(state.engine.runtime.runtimePackages || {}),
      }
      delete runtimePackages[packageId]
      state.engine.runtime.runtimePackages = runtimePackages
    },
    markRuntimeMigrationApplied(state: any, migrationKey: string) {
      state.engine.runtime.appliedRuntimeMigrations = Array.from(new Set([
        ...(state.engine.runtime.appliedRuntimeMigrations || []),
        migrationKey,
      ]))
    },
    syncPlaytime(state: any, now: number) {
      const playtime = ensurePlaytimeState(state.engine.runtime.playtime)
      if (!playtime.paused && playtime.runningSince !== undefined) {
        playtime.elapsedMs += Math.max(0, now - playtime.runningSince)
        playtime.runningSince = now
      }
      playtime.updatedAt = now
      state.engine.runtime.playtime = playtime
    },
    pausePlaytime(state: any, payload: { now: number, reason?: string }) {
      const playtime = ensurePlaytimeState(state.engine.runtime.playtime)
      const now = payload.now
      const reason = payload.reason || 'manual'
      const pauseReasons = addPlaytimePauseReason(playtime, reason)
      if (playtime.paused) {
        playtime.pauseReasons = pauseReasons
        playtime.pauseReason = pauseReasons[0] || playtime.pauseReason
        playtime.pausedAt = playtime.pausedAt || now
        playtime.updatedAt = now
        state.engine.runtime.playtime = playtime
        return
      }
      if (playtime.runningSince !== undefined) {
        playtime.elapsedMs += Math.max(0, now - playtime.runningSince)
      }
      playtime.runningSince = undefined
      playtime.paused = true
      playtime.pausedAt = now
      playtime.pauseReasons = pauseReasons
      playtime.pauseReason = pauseReasons[0] || reason
      playtime.updatedAt = now
      state.engine.runtime.playtime = playtime
    },
    resumePlaytime(state: any, payload: { now: number, reason?: string }) {
      const playtime = ensurePlaytimeState(state.engine.runtime.playtime)
      const now = payload.now
      const reason = payload.reason || 'manual'
      if (playtime.startedAt <= 0) {
        playtime.startedAt = now
      }
      if (!playtime.paused && playtime.runningSince !== undefined) {
        playtime.updatedAt = now
        state.engine.runtime.playtime = playtime
        return
      }
      const pauseReasons = removePlaytimePauseReason(playtime, reason)
      if (pauseReasons.length > 0) {
        playtime.runningSince = undefined
        playtime.paused = true
        playtime.pausedAt = playtime.pausedAt || now
        playtime.pauseReason = pauseReasons[0]
        playtime.pauseReasons = pauseReasons
        playtime.updatedAt = now
        state.engine.runtime.playtime = playtime
        return
      }
      playtime.runningSince = now
      playtime.paused = false
      playtime.pausedAt = undefined
      playtime.pauseReason = undefined
      playtime.pauseReasons = []
      playtime.updatedAt = now
      state.engine.runtime.playtime = playtime
    },
    hydratePlaytimeAfterRestore(state: any, now: number) {
      const playtime = ensurePlaytimeState(state.engine.runtime.playtime)
      if (playtime.startedAt <= 0) {
        playtime.startedAt = now
      }
      playtime.runningSince = playtime.paused ? undefined : now
      playtime.pausedAt = playtime.paused ? now : undefined
      playtime.pauseReasons = playtime.paused ? normalizePlaytimePauseReasons(playtime) : []
      playtime.updatedAt = now
      state.engine.runtime.playtime = playtime
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
        if (recordRemovableByRuntimePackage(projection, packageId)) {
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
    setUiSceneHost(state: any, host?: ViewUiSceneHostProjection) {
      state.engine.view.ui = {
        ...state.engine.view.ui,
        host: host ? cloneUiSceneHostProjection(host) : undefined,
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
        target: choice.target ? cloneUnknownValue(choice.target) : undefined,
        unavailable: choice.unavailable ? cloneUnknownValue(choice.unavailable) : undefined,
        presentation: choice.presentation ? cloneUnknownValue(choice.presentation) : undefined,
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

function ensurePlaytimeState(value: Partial<EnginePlaytimeState> | undefined): EnginePlaytimeState {
  const pauseReasons = normalizePlaytimePauseReasons(value)
  return {
    startedAt: typeof value?.startedAt === 'number' ? value.startedAt : 0,
    elapsedMs: typeof value?.elapsedMs === 'number' ? Math.max(0, value.elapsedMs) : 0,
    runningSince: typeof value?.runningSince === 'number' ? value.runningSince : undefined,
    paused: typeof value?.paused === 'boolean' ? value.paused : true,
    pausedAt: typeof value?.pausedAt === 'number' ? value.pausedAt : undefined,
    pauseReason: pauseReasons[0] || (typeof value?.pauseReason === 'string' ? value.pauseReason : undefined),
    pauseReasons,
    updatedAt: typeof value?.updatedAt === 'number' ? value.updatedAt : 0,
  }
}

function normalizePlaytimePauseReasons(value: Partial<EnginePlaytimeState> | undefined): string[] {
  const reasons = new Set<string>()
  if (Array.isArray(value?.pauseReasons)) {
    value.pauseReasons.forEach((reason) => {
      if (typeof reason === 'string' && reason.length > 0 && reason !== 'not-started') {
        reasons.add(reason)
      }
    })
  }
  if (typeof value?.pauseReason === 'string' && value.pauseReason.length > 0 && value.pauseReason !== 'not-started') {
    reasons.add(value.pauseReason)
  }
  return [...reasons]
}

function addPlaytimePauseReason(playtime: EnginePlaytimeState, reason: string): string[] {
  return [...new Set([...normalizePlaytimePauseReasons(playtime), reason].filter(Boolean))]
}

function removePlaytimePauseReason(playtime: EnginePlaytimeState, reason: string): string[] {
  return normalizePlaytimePauseReasons(playtime).filter(activeReason => activeReason !== reason)
}

function calculatePlaytimeMs(playtime: EnginePlaytimeState | undefined, now: number): number {
  const normalized = ensurePlaytimeState(playtime)
  if (normalized.paused || normalized.runningSince === undefined) {
    return normalized.elapsedMs
  }
  return normalized.elapsedMs + Math.max(0, now - normalized.runningSince)
}

function clonePlaytimeState(playtime: EnginePlaytimeState): EnginePlaytimeState {
  return { ...ensurePlaytimeState(playtime) }
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
      host: view.ui.host
        ? cloneUiSceneHostProjection(view.ui.host)
        : undefined,
      overlays: view.ui.overlays
        ? (Object.fromEntries(
            Object.entries(view.ui.overlays).map(([overlayId, overlay]) => [
              overlayId,
              { ...overlay },
            ]),
          ) as QuaViewProjection['ui']['overlays'])
        : undefined,
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

function cloneUiSceneHostProjection(host: ViewUiSceneHostProjection): ViewUiSceneHostProjection {
  return {
    sceneId: host.sceneId,
    sceneActive: host.sceneActive,
    sources: [...host.sources],
    returnCheckpointId: host.returnCheckpointId,
    reason: host.reason,
  }
}

function cloneCheckpoint(checkpoint: EngineCheckpoint): EngineCheckpoint {
  return {
    ...checkpoint,
    point: cloneStoryPoint(checkpoint.point),
    metadata: checkpoint.metadata ? cloneUnknownRecord(checkpoint.metadata) : undefined,
  }
}

function cloneRollbackSnapshotSet(snapshotSet: RollbackSnapshotSet): RollbackSnapshotSet {
  return {
    ...snapshotSet,
    storeSnapshots: { ...snapshotSet.storeSnapshots },
  }
}

function getRollbackSnapshotSet(value: unknown): RollbackSnapshotSet | undefined {
  if (!value || typeof value !== 'object') {
    return undefined
  }
  const candidate = value as Partial<RollbackSnapshotSet>
  if (
    typeof candidate.id !== 'string'
    || typeof candidate.createdAt !== 'number'
    || !candidate.storeSnapshots
    || typeof candidate.storeSnapshots !== 'object'
  ) {
    return undefined
  }
  const storeSnapshots: Record<string, string> = {}
  for (const [storeName, snapshotId] of Object.entries(candidate.storeSnapshots)) {
    if (typeof snapshotId === 'string') {
      storeSnapshots[storeName] = snapshotId
    }
  }
  return {
    id: candidate.id,
    createdAt: candidate.createdAt,
    storeSnapshots,
  }
}

function cloneStoryPoint(point: StoryPoint): StoryPoint {
  return { ...point }
}

function cloneStoryAssetRef(ref: StoryAssetRef): StoryAssetRef {
  return {
    ...ref,
    focalPoint: ref.focalPoint ? { ...ref.focalPoint } : undefined,
    metadata: ref.metadata ? cloneUnknownRecord(ref.metadata) : undefined,
  }
}

function createSceneTargetBasePoint(point: StoryPoint | undefined): Partial<StoryPoint> {
  if (!point) {
    return {}
  }
  const {
    entryId,
    labelId,
    lineId,
    nodeId,
    scriptModuleId,
    scriptModuleLocale,
    scriptModuleVersion,
    stepId,
    contentPackageId,
    ...base
  } = point
  void entryId
  void labelId
  void lineId
  void nodeId
  void scriptModuleId
  void scriptModuleLocale
  void scriptModuleVersion
  void stepId
  void contentPackageId
  return base
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

function isRollbackStoreSaveDataRecord(value: unknown): value is Record<string, RollbackStoreSaveData> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }
  return Object.values(value as Record<string, unknown>).every((item) => {
    if (!item || typeof item !== 'object') {
      return false
    }
    return 'state' in item && Array.isArray((item as { snapshots?: unknown }).snapshots)
  })
}

function getMetadataRequiredRuntimePackages(metadata?: Record<string, unknown>): string[] {
  const value = metadata?.requiredRuntimePackages
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.length > 0)
    : []
}

function normalizeChoiceMetadata(choice: ChoiceIntent): Record<string, unknown> | undefined {
  const next = choice.metadata ? cloneUnknownRecord(choice.metadata) : {}
  if (choice.target) {
    next.jumpTarget = cloneUnknownValue(choice.target)
  }
  if (choice.presentation) {
    next.presentation = cloneUnknownValue(choice.presentation)
  }
  if (choice.unavailable) {
    next.unavailable = cloneUnknownValue(choice.unavailable)
  }
  const requiredRuntimePackages = mergeRequiredRuntimePackages(
    getMetadataRequiredRuntimePackages(next),
    choice.target?.requiredRuntimePackages as string[] | undefined,
  )
  if (requiredRuntimePackages.length > 0) {
    next.requiredRuntimePackages = requiredRuntimePackages
  }
  return Object.keys(next).length > 0 ? next : undefined
}

function tagChoicePresentationWithRuntimePackage(presentation: ChoicePresentation, packageId: string): ChoicePresentation {
  return {
    ...presentation,
    thumbnail: presentation.thumbnail ? tagStoryAssetRefWithRuntimePackage(presentation.thumbnail, packageId) : undefined,
    background: presentation.background ? tagStoryAssetRefWithRuntimePackage(presentation.background, packageId) : undefined,
    image: presentation.image ? tagStoryAssetRefWithRuntimePackage(presentation.image, packageId) : undefined,
  }
}

function tagStoryAssetRefWithRuntimePackage(ref: StoryAssetRef, packageId: string): StoryAssetRef {
  return ref.runtimePackageId
    ? cloneStoryAssetRef(ref)
    : {
        ...cloneStoryAssetRef(ref),
        runtimePackageId: packageId,
      }
}

function getChoiceMetadataTarget(metadata: Readonly<Record<string, unknown>> | undefined): ChoiceTarget | undefined {
  const target = metadata?.jumpTarget
  return isChoiceTarget(target) ? target : undefined
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

function getAssetRuntimePackageId(asset: { runtimePackageId?: string, bundleName?: string }): string | undefined {
  return asset.runtimePackageId || (asset.bundleName?.startsWith('runtime.') ? asset.bundleName : undefined)
}

function recordRequiresPackage(value: unknown, packageId: string): boolean {
  return getRecordRuntimePackages(value).includes(packageId)
}

function recordOwnedByPackage(value: unknown, packageId: string): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }
  const record = value as Record<string, unknown>
  if (record.contentPackageId !== packageId) {
    return false
  }
  const nestedPackages = mergeRequiredRuntimePackages(
    ...Object.entries(record)
      .filter(([key]) => key !== 'contentPackageId' && key !== 'requiredRuntimePackages' && key !== 'revision')
      .map(([, item]) => collectRuntimePackagesFromUnknown(item)),
  )
  return nestedPackages.every(nestedPackage => nestedPackage === packageId)
    && recordHasNoPackageIndependentCollections(record)
}

function recordRemovableByRuntimePackage(value: unknown, packageId: string): boolean {
  if (recordOwnedByPackage(value, packageId)) {
    return true
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }
  const record = value as Record<string, unknown>
  return recordRequiresPackage(record, packageId)
    && recordHasNoPackageIndependentCollections(record)
}

function recordHasNoPackageIndependentCollections(record: Record<string, unknown>): boolean {
  return Object.entries(record)
    .filter(([key]) => key !== 'contentPackageId' && key !== 'requiredRuntimePackages')
    .every(([, value]) => !containsRecordWithoutRuntimePackage(value))
}

function containsRecordWithoutRuntimePackage(value: unknown, seen = new Set<object>()): boolean {
  if (!value || typeof value !== 'object') {
    return false
  }
  if (seen.has(value)) {
    return false
  }
  seen.add(value)

  if (Array.isArray(value)) {
    return value.some(item => containsRecordWithoutRuntimePackage(item, seen))
  }

  const record = value as Record<string, unknown>
  if (isProjectionRecord(record) && getRecordRuntimePackages(record).length === 0) {
    return true
  }
  return Object.values(record).some(item => containsRecordWithoutRuntimePackage(item, seen))
}

function isProjectionRecord(record: Record<string, unknown>): boolean {
  return 'id' in record
    || 'assetKey' in record
    || 'assetName' in record
    || 'metadata' in record
    || 'contentPackageId' in record
    || 'requiredRuntimePackages' in record
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

function collectCheckpointIdsFromUnknown(value: unknown, output: Set<string>, seen = new Set<object>()): void {
  if (!value || typeof value !== 'object') {
    return
  }
  if (seen.has(value)) {
    return
  }
  seen.add(value)

  if (Array.isArray(value)) {
    for (const item of value) {
      collectCheckpointIdsFromUnknown(item, output, seen)
    }
    return
  }

  const record = value as Record<string, unknown>
  if (typeof record.checkpointId === 'string') {
    output.add(record.checkpointId)
  }
  for (const item of Object.values(record)) {
    collectCheckpointIdsFromUnknown(item, output, seen)
  }
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

function cloneRuntimeLocalePack(
  localePack: RuntimePackageStateRecord['localePack'] | undefined,
): RuntimePackageStateRecord['localePack'] | undefined {
  return localePack
    ? {
        ...localePack,
        targets: localePack.targets.map(target => ({ ...target })),
        resourceTypes: [...localePack.resourceTypes],
        fallbackLocales: localePack.fallbackLocales ? [...localePack.fallbackLocales] : undefined,
      }
    : undefined
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

function createSerializableErrorSummary(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    }
  }
  return {
    message: typeof error === 'string' ? error : String(error),
  }
}
