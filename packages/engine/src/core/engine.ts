import { QuaStore, createStore } from '@quajs/store'
import { QuaAssets } from '@quajs/assets'
import { Pipeline } from '@quajs/pipeline'
import { getPackageLogger } from '@quajs/logger'

import type {
  EngineConfig,
  GameStep,
  Scene,
  StepContext,
  SoundOptions,
  VolumeSettings,
} from './types'
import type {
  EnginePlugin,
  EngineContext,
  PluginConstructor,
  PluginConstructorOptions
} from '../plugins/plugins'
import { LogicToRenderEvents, RenderToLogicEvents, type VolumeChangePayload } from '../events/events'

const logger = getPackageLogger('engine')

/**
 * QuaEngine - Core engine class for the visual novel engine
 * 
 * Provides plugin system, game state management, and communication
 * between logic and render layers through event-driven architecture.
 */
export class QuaEngine {
  private readonly store: QuaStore
  private readonly assets: QuaAssets
  private readonly pipeline: Pipeline
  private readonly plugins: Map<string, EnginePlugin> = new Map()

  private currentScene?: Scene
  private currentStepId?: string
  private stepHistory: string[] = []
  private volumeSettings: VolumeSettings = {
    master: 1.0,
    bgm: 1.0,
    sound: 1.0,
    voice: 1.0
  }

  private isInitialized = false
  private isDestroyed = false

  constructor(private config: EngineConfig = {}) {
    logger.info('Initializing QuaEngine')

    // Initialize core components
    this.store = createStore({
      name: 'quaengine-main',
      state: {
        engine: {
          currentStepId: null,
          stepHistory: [],
          currentScene: null,
          volumeSettings: this.volumeSettings
        }
      }
    })

    this.assets = new QuaAssets(this.config.assets?.baseUrl || '')
    this.pipeline = new Pipeline()

    // Set up render layer event listeners
    this.setupRenderLayerListeners()

    logger.info('QuaEngine initialized')
  }

  /**
   * Initialize the engine
   */
  async init(): Promise<void> {
    if (this.isInitialized) {
      logger.warn('Engine already initialized')
      return
    }

    logger.info('Starting engine initialization')

    try {
      // Initialize core components
      await Promise.all([
        this.assets.initialize?.(),
        this.initializePlugins()
      ])

      this.isInitialized = true
      logger.info('Engine initialization complete')

      // Notify render layer that engine is ready
      await this.pipeline.emit(LogicToRenderEvents.SYSTEM_MESSAGE, {
        type: 'engine_ready',
        message: 'QuaEngine initialized successfully'
      })

    } catch (error) {
      logger.error('Engine initialization failed:', error)
      throw error
    }
  }

  /**
   * Use a plugin in the engine
   */
  use<T extends EnginePlugin>(
    PluginClass: PluginConstructor,
    options?: PluginConstructorOptions
  ): this
  use<T extends EnginePlugin>(plugin: T): this
  use<T extends EnginePlugin>(
    pluginOrClass: PluginConstructor | T,
    options?: PluginConstructorOptions
  ): this {
    try {
      let plugin: EnginePlugin

      if (typeof pluginOrClass === 'function') {
        // It's a constructor
        plugin = new pluginOrClass(options || {})
      } else {
        // It's an instance
        plugin = pluginOrClass
      }

      if (this.plugins.has(plugin.name)) {
        logger.warn(`Plugin ${plugin.name} already registered, skipping`)
        return this
      }

      this.plugins.set(plugin.name, plugin)
      logger.info(`Plugin ${plugin.name} registered`)

      // If engine is already initialized, initialize the plugin immediately
      if (this.isInitialized) {
        this.initializePlugin(plugin).catch(error => {
          logger.error(`Failed to initialize plugin ${plugin.name}:`, error)
        })
      }

    } catch (error) {
      logger.error('Failed to register plugin:', error)
      throw error
    }

    return this
  }

  /**
   * Load and activate a scene
   */
  async loadScene(scene: Scene): Promise<void> {
    this.assertInitialized()

    logger.info(`Loading scene: ${scene.name}`)

    try {
      // Clean up current scene if exists
      if (this.currentScene) {
        await this.currentScene.destroy?.()
        logger.debug(`Destroyed previous scene: ${this.currentScene.name}`)
      }

      // Set new scene
      const previousScene = this.currentScene?.name
      this.currentScene = scene

      // Update store
      this.store.commit('setCurrentScene', scene.name)

      // Initialize new scene
      await scene.init()

      // Notify render layer
      await this.pipeline.emit(LogicToRenderEvents.SCENE_CHANGE, {
        fromScene: previousScene,
        toScene: scene.name
      })

      // Run scene
      await scene.run()

      logger.info(`Scene loaded successfully: ${scene.name}`)

    } catch (error) {
      logger.error(`Failed to load scene ${scene.name}:`, error)
      throw error
    }
  }

  /**
   * Execute a dialogue sequence
   */
  async dialogue(steps: GameStep[]): Promise<void> {
    this.assertInitialized()

    logger.debug(`Executing dialogue with ${steps.length} steps`)

    for (const step of steps) {
      await this.executeStep(step)
    }
  }

  /**
   * Execute a single game step
   */
  async executeStep(step: GameStep): Promise<void> {
    this.assertInitialized()

    logger.debug(`Executing step: ${step.uuid}`)

    try {
      // Create snapshot before step execution
      if (this.config.store?.enableSnapshots !== false) {
        await this.store.snapshot(step.uuid)
      }

      // Update current step
      this.currentStepId = step.uuid
      this.stepHistory.push(step.uuid)

      // Update store
      this.store.commit('setCurrentStep', {
        stepId: step.uuid,
        stepHistory: [...this.stepHistory]
      })

      // Create step context
      const stepContext: StepContext = {
        engine: this,
        stepId: step.uuid,
        previousStepId: this.stepHistory[this.stepHistory.length - 2],
        store: this.store,
        assets: this.assets,
        pipeline: this.pipeline
      }

      // Notify plugins
      await this.notifyPluginsOnStep(stepContext)

      // Execute step
      await step.run(stepContext)

      logger.debug(`Step completed: ${step.uuid}`)

    } catch (error) {
      logger.error(`Step execution failed: ${step.uuid}`, error)
      throw error
    }
  }

  /**
   * Rewind to a specific step
   */
  async rewind(stepUUID: string): Promise<void> {
    this.assertInitialized()

    logger.info(`Rewinding to step: ${stepUUID}`)

    try {
      // Restore store snapshot
      await this.store.restore(stepUUID, { force: true })

      // Update current step
      this.currentStepId = stepUUID

      // Trim step history
      const stepIndex = this.stepHistory.indexOf(stepUUID)
      if (stepIndex !== -1) {
        this.stepHistory = this.stepHistory.slice(0, stepIndex + 1)
      }

      // Update store
      this.store.commit('setCurrentStep', {
        stepId: stepUUID,
        stepHistory: [...this.stepHistory]
      })

      // Re-render the scene for this step
      await this.pipeline.emit(LogicToRenderEvents.SCENE_INIT, {
        sceneId: this.currentScene?.name || 'unknown',
        stepId: stepUUID
      })

      logger.info(`Rewind completed to step: ${stepUUID}`)

    } catch (error) {
      logger.error(`Rewind failed for step: ${stepUUID}`, error)
      throw error
    }
  }

  /**
   * Play a sound effect
   */
  async playSound(assetName: string, options: SoundOptions = {}): Promise<void> {
    this.assertInitialized()

    const finalVolume = (options.volume ?? 1.0) * this.volumeSettings.sound * this.volumeSettings.master

    await this.pipeline.emit(LogicToRenderEvents.SOUND_PLAY, {
      assetName,
      volume: finalVolume,
      loop: options.loop ?? false,
      fadeIn: options.fadeIn
    })
  }

  /**
   * Play character dubbing
   */
  async dub(assetName: string, options: SoundOptions = {}): Promise<void> {
    this.assertInitialized()

    const finalVolume = (options.volume ?? 1.0) * this.volumeSettings.voice * this.volumeSettings.master

    await this.pipeline.emit(LogicToRenderEvents.DUB_PLAY, {
      assetName,
      volume: finalVolume,
      loop: options.loop ?? false,
      fadeIn: options.fadeIn
    })
  }

  /**
   * Play background music
   */
  async playBGM(assetName: string, options: SoundOptions = {}): Promise<void> {
    this.assertInitialized()

    const finalVolume = (options.volume ?? 1.0) * this.volumeSettings.bgm * this.volumeSettings.master

    await this.pipeline.emit(LogicToRenderEvents.BGM_PLAY, {
      assetName,
      volume: finalVolume,
      loop: options.loop ?? true,
      fadeIn: options.fadeIn
    })
  }

  /**
   * Set volume for a specific audio type
   */
  setVolume(type: keyof VolumeSettings, value: number): void {
    this.assertInitialized()

    this.volumeSettings[type] = Math.max(0, Math.min(1, value))

    // Update store
    this.store.commit('setVolumeSettings', { ...this.volumeSettings })

    logger.debug(`Volume updated: ${type} = ${this.volumeSettings[type]}`)
  }

  /**
   * Get the store instance for direct access to save/load slot methods
   */
  getStore(): QuaStore {
    return this.store
  }

  /**
   * Get current scene name
   */
  getCurrentSceneName(): string | undefined {
    return this.currentScene?.name
  }

  /**
   * Get current step ID
   */
  getCurrentStepId(): string | undefined {
    return this.currentStepId
  }

  /**
   * Destroy the engine and cleanup resources
   */
  async destroy(): Promise<void> {
    if (this.isDestroyed) {
      return
    }

    logger.info('Destroying QuaEngine')

    try {
      // Destroy current scene
      await this.currentScene?.destroy?.()

      // Destroy all plugins
      for (const plugin of this.plugins.values()) {
        await plugin.destroy?.()
      }

      // Clear collections
      this.plugins.clear()
      this.stepHistory.length = 0

      this.isDestroyed = true
      this.isInitialized = false

      logger.info('QuaEngine destroyed')

    } catch (error) {
      logger.error('Error during engine destruction:', error)
      throw error
    }
  }

  // Private helper methods

  private assertInitialized(): void {
    if (!this.isInitialized) {
      throw new Error('Engine not initialized. Call init() first.')
    }
    if (this.isDestroyed) {
      throw new Error('Engine has been destroyed')
    }
  }

  private async initializePlugins(): Promise<void> {
    const pluginPromises = Array.from(this.plugins.values()).map(plugin =>
      this.initializePlugin(plugin)
    )

    await Promise.all(pluginPromises)
  }

  private async initializePlugin(plugin: EnginePlugin): Promise<void> {
    try {
      const context: EngineContext = {
        engine: this,
        store: this.store,
        assets: this.assets,
        pipeline: this.pipeline,
        stepId: this.currentStepId
      }

      await plugin.init(context)
      logger.debug(`Plugin initialized: ${plugin.name}`)

    } catch (error) {
      logger.error(`Plugin initialization failed: ${plugin.name}`, error)
      throw error
    }
  }

  private async notifyPluginsOnStep(stepContext: StepContext): Promise<void> {
    const promises = Array.from(this.plugins.values())
      .filter(plugin => plugin.onStep)
      .map(plugin => plugin.onStep!({
        engine: this,
        store: this.store,
        assets: this.assets,
        pipeline: this.pipeline,
        stepId: stepContext.stepId
      }))

    await Promise.all(promises)
  }

  private setupRenderLayerListeners(): void {
    // User interaction events
    this.pipeline.on(RenderToLogicEvents.USER_CLICK, async (context: { event: { payload: unknown } }) => {
      // Handle user clicks - advance dialogue, etc.
      logger.debug('User click received', context.event.payload)
    })

    this.pipeline.on(RenderToLogicEvents.USER_CHOICE_SELECT, async (context: { event: { payload: unknown } }) => {
      // Handle user choice selection
      logger.debug('User choice selected', context.event.payload)
    })

    this.pipeline.on(RenderToLogicEvents.VOLUME_CHANGE, async (context: { event: { payload: unknown } }) => {
      const { type, value } = context.event.payload as VolumeChangePayload
      this.setVolume(type, value)
    })

    // Add more render layer event handlers as needed
  }
}