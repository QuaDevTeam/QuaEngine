import type { QuaEngine } from '../core/engine'
import type { Scene } from '../core/types'
import { LogicToRenderEvents } from '../events/events'
import { getPackageLogger } from '@quajs/logger'

const logger = getPackageLogger('engine:scene-manager')

/**
 * Scene transition types
 */
export type SceneTransition =
  | 'instant'
  | 'fade'
  | 'slide_left'
  | 'slide_right'
  | 'slide_up'
  | 'slide_down'
  | 'zoom_in'
  | 'zoom_out'

/**
 * Scene transition options
 */
export interface SceneTransitionOptions {
  type: SceneTransition
  duration?: number
  easing?: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out'
}

/**
 * Scene Manager
 *
 * Manages scene lifecycle, transitions, and state.
 * Provides high-level APIs for scene management.
 */
export class SceneManager {
  private engine: QuaEngine
  private currentScene?: Scene
  private sceneHistory: string[] = []
  private maxHistorySize = 50

  constructor(engine: QuaEngine) {
    this.engine = engine
  }

  /**
   * Load and transition to a new scene
   */
  async loadScene(
    scene: Scene,
    transition?: SceneTransitionOptions
  ): Promise<void> {
    logger.info(`Loading scene: ${scene.name}`)

    try {
      const previousScene = this.currentScene

      // Prepare transition
      if (transition && previousScene) {
        await this.prepareTransition(transition)
      }

      // Clean up current scene
      if (this.currentScene) {
        await this.currentScene.destroy?.()
        this.addToHistory(this.currentScene.name)
      }

      // Set new scene
      this.currentScene = scene

      // Initialize new scene
      await scene.init()

      // Notify render layer of scene change
      await this.engine['pipeline'].emit(LogicToRenderEvents.SCENE_CHANGE, {
        fromScene: previousScene?.name,
        toScene: scene.name,
        transition
      })

      // Execute transition
      if (transition) {
        await this.executeTransition(transition)
      }

      // Run scene logic
      await scene.run()

      logger.info(`Scene loaded successfully: ${scene.name}`)

    } catch (error) {
      logger.error(`Failed to load scene: ${scene.name}`, error)
      throw error
    }
  }

  /**
   * Go back to the previous scene
   */
  async goBack(_transition?: SceneTransitionOptions): Promise<void> {
    if (this.sceneHistory.length === 0) {
      logger.warn('No previous scene to go back to')
      return
    }

    const previousSceneName = this.sceneHistory.pop()!
    logger.info(`Going back to scene: ${previousSceneName}`)

    // Note: In a real implementation, you'd need a scene registry
    // to recreate scene instances from their names
    throw new Error('Scene registry not implemented - cannot recreate scene from name')
  }

  /**
   * Initialize a scene (render layer communication)
   */
  async initializeScene(sceneId: string, config: Record<string, unknown> = {}): Promise<void> {
    logger.debug(`Initializing scene: ${sceneId}`)

    await this.engine['pipeline'].emit(LogicToRenderEvents.SCENE_INIT, {
      sceneId,
      config
    })
  }

  /**
   * Destroy the current scene
   */
  async destroyCurrentScene(): Promise<void> {
    if (!this.currentScene) {
      logger.warn('No current scene to destroy')
      return
    }

    logger.info(`Destroying scene: ${this.currentScene.name}`)

    try {
      await this.currentScene.destroy?.()

      await this.engine['pipeline'].emit(LogicToRenderEvents.SCENE_DESTROY, {
        sceneId: this.currentScene.name
      })

      this.addToHistory(this.currentScene.name)
      this.currentScene = undefined

      logger.info('Scene destroyed successfully')

    } catch (error) {
      logger.error('Failed to destroy scene', error)
      throw error
    }
  }

  /**
   * Set background for current scene
   */
  async setBackground(
    assetName: string,
    transition?: { type: 'fade' | 'slide' | 'instant'; duration?: number }
  ): Promise<void> {
    logger.debug(`Setting background: ${assetName}`)

    await this.engine['pipeline'].emit(LogicToRenderEvents.BACKGROUND_SET, {
      assetName,
      transition
    })
  }

  /**
   * Clear current background
   */
  async clearBackground(): Promise<void> {
    logger.debug('Clearing background')

    await this.engine['pipeline'].emit(LogicToRenderEvents.BACKGROUND_CLEAR, {})
  }

  /**
   * Show dialogue
   */
  async showDialogue(
    characterName: string | undefined,
    text: string,
    choices?: Array<{ id: string; text: string; enabled: boolean }>
  ): Promise<void> {
    logger.debug(`Showing dialogue: ${characterName || 'Narrator'}`)

    await this.engine['pipeline'].emit(LogicToRenderEvents.DIALOGUE_SHOW, {
      characterName,
      text,
      choices
    })
  }

  /**
   * Hide dialogue
   */
  async hideDialogue(): Promise<void> {
    logger.debug('Hiding dialogue')

    await this.engine['pipeline'].emit(LogicToRenderEvents.DIALOGUE_HIDE, {})
  }

  /**
   * Update dialogue content
   */
  async updateDialogue(
    text: string,
    characterName?: string,
    choices?: Array<{ id: string; text: string; enabled: boolean }>
  ): Promise<void> {
    logger.debug('Updating dialogue')

    await this.engine['pipeline'].emit(LogicToRenderEvents.DIALOGUE_UPDATE, {
      characterName,
      text,
      choices
    })
  }

  /**
   * Show UI element
   */
  async showUI(
    elementId: string,
    config: Record<string, unknown> = {}
  ): Promise<void> {
    logger.debug(`Showing UI element: ${elementId}`)

    await this.engine['pipeline'].emit(LogicToRenderEvents.UI_SHOW, {
      elementId,
      config
    })
  }

  /**
   * Hide UI element
   */
  async hideUI(elementId: string): Promise<void> {
    logger.debug(`Hiding UI element: ${elementId}`)

    await this.engine['pipeline'].emit(LogicToRenderEvents.UI_HIDE, {
      elementId
    })
  }

  /**
   * Update UI element
   */
  async updateUI(
    elementId: string,
    config: Record<string, unknown>
  ): Promise<void> {
    logger.debug(`Updating UI element: ${elementId}`)

    await this.engine['pipeline'].emit(LogicToRenderEvents.UI_UPDATE, {
      elementId,
      config
    })
  }

  /**
   * Apply visual effect
   */
  async applyEffect(
    effectType: 'fade_in' | 'fade_out' | 'shake' | 'flash',
    options: {
      duration?: number
      intensity?: number
      target?: string
    } = {}
  ): Promise<void> {
    logger.debug(`Applying effect: ${effectType}`)

    const eventMap = {
      fade_in: LogicToRenderEvents.EFFECT_FADE_IN,
      fade_out: LogicToRenderEvents.EFFECT_FADE_OUT,
      shake: LogicToRenderEvents.EFFECT_SHAKE,
      flash: LogicToRenderEvents.EFFECT_FLASH
    }

    await this.engine['pipeline'].emit(eventMap[effectType], options)
  }

  /**
   * Get current scene
   */
  getCurrentScene(): Scene | undefined {
    return this.currentScene
  }

  /**
   * Get scene history
   */
  getSceneHistory(): string[] {
    return [...this.sceneHistory]
  }

  /**
   * Clear scene history
   */
  clearHistory(): void {
    this.sceneHistory.length = 0
    logger.debug('Scene history cleared')
  }

  // Private helper methods

  private addToHistory(sceneName: string): void {
    this.sceneHistory.push(sceneName)

    // Limit history size
    if (this.sceneHistory.length > this.maxHistorySize) {
      this.sceneHistory.shift()
    }
  }

  private async prepareTransition(transition: SceneTransitionOptions): Promise<void> {
    // Prepare the render layer for transition
    logger.debug(`Preparing transition: ${transition.type}`)

    // Implementation would depend on render layer capabilities
    // This could involve pre-loading assets, setting up animation contexts, etc.
  }

  private async executeTransition(transition: SceneTransitionOptions): Promise<void> {
    // Execute the transition effect
    logger.debug(`Executing transition: ${transition.type}`)

    const duration = transition.duration || 1000

    // Wait for transition to complete
    await new Promise(resolve => setTimeout(resolve, duration))
  }

  /**
   * Cleanup resources
   */
  async destroy(): Promise<void> {
    if (this.currentScene) {
      await this.currentScene.destroy?.()
    }

    this.currentScene = undefined
    this.sceneHistory.length = 0

    logger.debug('Scene manager destroyed')
  }
}