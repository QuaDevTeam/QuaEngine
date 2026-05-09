import type { QuaStore } from '@quajs/store'
import type {
  AudioIntentProjection,
  ActiveAnimationProjection,
  EventPayload,
  LogicToRenderEvents,
  QuaViewProjection,
  RenderToLogicEvents,
} from '../events/events'
import type {
  AudioIntentUpdate,
  BackgroundIntent,
  CharacterIntent,
  ChoiceIntent,
  DialogueIntent,
  EffectIntent,
  EngineConfig,
  GameStep,
  Scene,
  SoundOptions,
  StepContext,
  UiIntent,
  VolumeSettings,
} from './types'
import type {
  EngineContext,
  EnginePlugin,
  PluginConstructor,
  PluginConstructorOptions,
} from '../plugins/core/types'
import { QuaAssets } from '@quajs/assets'
import { getPackageLogger } from '@quajs/logger'
import { Pipeline } from '@quajs/pipeline'
import { createStore } from '@quajs/store'
import {
  emitLogicToRender,
  LogicToRenderEvents as L2R,
  RenderToLogicEvents as R2L,
  waitForPipelineEvent,
} from '../events/events'
import { GameManager } from '../managers/game-manager'
import { SceneManager } from '../managers/scene-manager'
import { SoundSystem } from '../managers/sound-system'
import { PluginContextImpl } from '../plugins/core/context'
import { createInitialEngineState } from './types'

const logger = getPackageLogger('engine')

export class QuaEngine {
  private static instance: QuaEngine | null = null
  private readonly store: QuaStore
  private readonly assets: QuaAssets
  private readonly pipeline: Pipeline
  private readonly plugins: Map<string, EnginePlugin> = new Map()
  private readonly pluginContext: PluginContextImpl = new PluginContextImpl()
  private isInitialized = false
  private isDestroyed = false

  public readonly gameManager: GameManager
  public readonly sceneManager: SceneManager
  public readonly soundSystem: SoundSystem

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
    })
    this.assets = new QuaAssets(config.assets)
    this.pipeline = new Pipeline()
    this.sceneManager = new SceneManager(this)
    this.gameManager = new GameManager(this)
    this.soundSystem = new SoundSystem(this)

    this.setupRenderLayerListeners()
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

  async dialogue(steps: GameStep[]): Promise<void> {
    this.assertInitialized()
    for (const step of steps) {
      await this.executeStep(step)
    }
  }

  async executeStep(step: GameStep): Promise<void> {
    this.assertInitialized()

    try {
      if (this.config.store?.enableSnapshots !== false) {
        await this.store.snapshot(step.uuid)
      }

      const runtime = this.getRuntimeState()
      const stepHistory = [...runtime.stepHistory, step.uuid]
      this.store.commit('setCurrentStep', {
        stepId: step.uuid,
        stepHistory,
      })

      const stepContext: StepContext = {
        engine: this,
        stepId: step.uuid,
        previousStepId: runtime.currentStepId || undefined,
        store: this.store,
        assets: this.assets,
        pipeline: this.pipeline,
      }

      await this.notifyPluginsOnStep(stepContext)
      await step.run(stepContext)
      await this.emitViewUpdate()
    }
    catch (error) {
      logger.error(`Step execution failed: ${step.uuid}`, error)
      throw error
    }
  }

  async rewind(stepUUID: string): Promise<void> {
    this.assertInitialized()
    await this.store.restore(stepUUID, { force: true })
    this.store.commit('clearAnimations')
    const runtime = this.getRuntimeState()
    const index = runtime.stepHistory.indexOf(stepUUID)
    this.store.commit('setCurrentStep', {
      stepId: stepUUID,
      stepHistory: index === -1 ? runtime.stepHistory : runtime.stepHistory.slice(0, index + 1),
    })
    await emitLogicToRender(this.pipeline, L2R.SCENE_INIT, {
      sceneId: runtime.currentScene || 'unknown',
      stepId: stepUUID,
    })
    await this.emitViewUpdate()
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

  async playSound(assetName: string, options: SoundOptions = {}): Promise<void> {
    this.assertInitialized()
    const volume = this.calculateVolume('sound', options.volume)
    const id = options.id || `${assetName}:${Date.now()}`
    this.store.commit('playSound', {
      id,
      assetName,
      volume,
      loop: options.loop ?? false,
      fadeIn: options.fadeIn,
      fadeOut: options.fadeOut,
      state: 'playing',
    })
    await emitLogicToRender(this.pipeline, L2R.SOUND_PLAY, {
      id,
      assetName,
      volume,
      loop: options.loop ?? false,
      fadeIn: options.fadeIn,
    })
    await this.emitViewUpdate()
  }

  async dub(assetName: string, options: SoundOptions = {}): Promise<void> {
    this.assertInitialized()
    const volume = this.calculateVolume('voice', options.volume)
    const id = options.id || `${assetName}:${Date.now()}`
    this.store.commit('playVoice', {
      id,
      assetName,
      volume,
      loop: options.loop ?? false,
      fadeIn: options.fadeIn,
      fadeOut: options.fadeOut,
      state: 'playing',
    })
    await emitLogicToRender(this.pipeline, L2R.DUB_PLAY, {
      id,
      assetName,
      volume,
      loop: options.loop ?? false,
      fadeIn: options.fadeIn,
    })
    await this.emitViewUpdate()
  }

  async playBGM(assetName: string, options: SoundOptions = {}): Promise<void> {
    this.assertInitialized()
    const volume = this.calculateVolume('bgm', options.volume)
    const id = options.id || 'bgm'
    this.store.commit('playBGM', {
      id,
      assetName,
      volume,
      loop: options.loop ?? true,
      fadeIn: options.fadeIn,
      fadeOut: options.fadeOut,
      state: 'playing',
    })
    await emitLogicToRender(this.pipeline, L2R.BGM_PLAY, {
      id,
      assetName,
      volume,
      loop: options.loop ?? true,
      fadeIn: options.fadeIn,
    })
    await this.emitViewUpdate()
  }

  async stopSound(id: string): Promise<void> {
    this.assertInitialized()
    this.store.commit('stopSound', id)
    await emitLogicToRender(this.pipeline, L2R.SOUND_STOP, { id, soundId: id })
    await this.emitViewUpdate()
  }

  async stopDub(id: string): Promise<void> {
    this.assertInitialized()
    this.store.commit('stopVoice', id)
    await emitLogicToRender(this.pipeline, L2R.DUB_STOP, { id, characterId: id })
    await this.emitViewUpdate()
  }

  async stopBGM(): Promise<void> {
    this.assertInitialized()
    this.store.commit('stopBGM')
    await emitLogicToRender(this.pipeline, L2R.BGM_STOP, {})
    await this.emitViewUpdate()
  }

  async getAssetMetadata(type: 'audio' | 'images' | 'characters' | 'video' | 'scripts' | 'data', assetName: string): Promise<unknown> {
    this.assertInitialized()
    return await this.assets.getMediaMetadata(type, assetName)
  }

  async setVolume(type: keyof VolumeSettings, value: number): Promise<void> {
    this.assertInitialized()
    const clamped = Math.max(0, Math.min(1, value))
    this.store.commit('setVolumeSettings', {
      ...this.getRuntimeState().volumeSettings,
      [type]: clamped,
    })
    await this.emitViewUpdate()
  }

  async updateAudioIntent(update: AudioIntentUpdate): Promise<void> {
    this.assertInitialized()
    this.store.commit('updateAudioIntent', update)
    await emitLogicToRender(this.pipeline, L2R.AUDIO_INTENT, { audio: this.getEngineState().audio })
    await this.emitViewUpdate()
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

  getVolumeSettings(): VolumeSettings {
    return { ...this.getRuntimeState().volumeSettings }
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

  waitFor<T extends LogicToRenderEvents | RenderToLogicEvents>(
    event: T,
    matcher?: (payload: EventPayload<T>) => boolean,
    options?: { timeout?: number, signal?: any },
  ): Promise<EventPayload<T>> {
    return waitForPipelineEvent(this.pipeline, event, matcher, options)
  }

  async saveToSlot(slotId: string, metadata: {
    name?: string
    screenshot?: string
    sceneName?: string
    stepId?: string
    playtime?: number
    [key: string]: unknown
  } = {}): Promise<void> {
    this.assertInitialized()
    await this.store.saveToSlot(slotId, {
      ...metadata,
      sceneName: metadata.sceneName || this.getCurrentSceneName(),
      stepId: metadata.stepId || this.getCurrentStepId(),
      timestamp: Date.now(),
    })
  }

  async loadFromSlot(slotId: string, options: { force?: boolean } = {}): Promise<void> {
    this.assertInitialized()
    await this.store.loadFromSlot(slotId, options)
    this.store.commit('clearAnimations')
    await this.emitViewUpdate()
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

    await this.sceneManager.destroy()
    for (const plugin of this.plugins.values()) {
      await plugin.destroy?.()
    }
    this.gameManager.destroy()
    this.soundSystem.destroy()
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
      .map(plugin => plugin.onStep!(this.createEngineContext(stepContext.stepId))))
  }

  private createEngineContext(stepId?: string): EngineContext {
    return {
      engine: this,
      store: this.store,
      assets: this.assets,
      pipeline: this.pipeline,
      stepId,
      plugins: this.pluginContext,
    }
  }

  private setupRenderLayerListeners(): void {
    this.pipeline.on(R2L.VOLUME_CHANGE, async (context) => {
      const { type, value } = context.event.payload as { type: keyof VolumeSettings, value: number }
      await this.setVolume(type, value)
    })

    this.pipeline.on(R2L.AUDIO_ENDED, async (context) => {
      const payload = context.event.payload as { channel: string, id: string }
      if (payload.channel === 'bgm') {
        this.store.commit('stopBGM')
      }
      else if (payload.channel === 'voice') {
        this.store.commit('stopVoice', payload.id)
      }
      else {
        this.store.commit('stopSound', payload.id)
      }
      await this.emitViewUpdate()
    })
  }

  private setupAssetForwarding(): void {
    this.assets.on('asset:changed', (change) => {
      emitLogicToRender(this.pipeline, L2R.ASSET_CHANGED, change).catch((error) => {
        logger.warn('Failed to forward asset change:', error)
      })
    })
  }

  private async emitViewUpdate(): Promise<void> {
    this.store.commit('syncViewAudio')
    await emitLogicToRender(this.pipeline, L2R.VIEW_UPDATE, { view: this.getViewState() })
  }

  private calculateVolume(type: Exclude<keyof VolumeSettings, 'master'>, value: number = 1): number {
    const settings = this.getRuntimeState().volumeSettings
    return value * settings[type as 'bgm' | 'sound' | 'voice'] * settings.master
  }

  private getRuntimeState() {
    return this.getEngineState().runtime
  }

  private getEngineState() {
    return this.store.state.engine as ReturnType<typeof createInitialEngineState>
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
    setVolumeSettings(state: any, payload: VolumeSettings) {
      state.engine.runtime.volumeSettings = { ...payload }
      state.engine.audio.volumeSettings = { ...payload }
      state.engine.view.audio = state.engine.audio
    },
    syncViewAudio(state: any) {
      state.engine.view.audio = state.engine.audio
    },
    updateAudioIntent(state: any, payload: AudioIntentUpdate) {
      if (payload.channel === 'bgm') {
        if (state.engine.audio.bgm?.id === payload.id) {
          state.engine.audio.bgm = { ...state.engine.audio.bgm, ...payload.patch }
        }
      }
      else {
        const key = payload.channel === 'voice' ? 'voices' : 'sounds'
        state.engine.audio[key] = state.engine.audio[key].map((intent: any) =>
          intent.id === payload.id ? { ...intent, ...payload.patch } : intent,
        )
      }
      state.engine.view.audio = state.engine.audio
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
    upsertEffect(state: any, payload: EffectIntent) {
      state.engine.view.effects = [
        ...state.engine.view.effects.filter((effect: EffectIntent) => effect.id !== payload.id),
        payload,
      ]
    },
    removeEffect(state: any, id: string) {
      state.engine.view.effects = state.engine.view.effects.filter((effect: EffectIntent) => effect.id !== id)
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
    playBGM(state: any, payload: any) {
      state.engine.audio.bgm = payload
      state.engine.view.audio = state.engine.audio
    },
    stopBGM(state: any) {
      state.engine.audio.bgm = undefined
      state.engine.view.audio = state.engine.audio
    },
    playSound(state: any, payload: any) {
      state.engine.audio.sounds = [...state.engine.audio.sounds.filter((sound: any) => sound.id !== payload.id), payload]
      state.engine.view.audio = state.engine.audio
    },
    stopSound(state: any, id: string) {
      state.engine.audio.sounds = id === '*'
        ? []
        : state.engine.audio.sounds.filter((sound: any) => sound.id !== id)
      state.engine.view.audio = state.engine.audio
    },
    playVoice(state: any, payload: any) {
      state.engine.audio.voices = [...state.engine.audio.voices.filter((voice: any) => voice.id !== payload.id), payload]
      state.engine.view.audio = state.engine.audio
    },
    stopVoice(state: any, id: string) {
      state.engine.audio.voices = id === '*'
        ? []
        : state.engine.audio.voices.filter((voice: any) => voice.id !== id)
      state.engine.view.audio = state.engine.audio
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
    audio: cloneAudioProjection(view.audio),
  }
}

function cloneAudioProjection(audio: AudioIntentProjection): AudioIntentProjection {
  return {
    volumeSettings: { ...audio.volumeSettings },
    bgm: audio.bgm ? { ...audio.bgm } : undefined,
    sounds: audio.sounds.map(sound => ({ ...sound })),
    voices: audio.voices.map(voice => ({ ...voice })),
  }
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
