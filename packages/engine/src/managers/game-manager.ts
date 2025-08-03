import { getPackageLogger } from '@quajs/logger'
import { generateId } from '@quajs/utils'

import type { QuaEngine } from '../core/engine'
import type { Scene, GameStep, StepContext, SlotMetadata, SaveSlot } from '../core/types'

// Type assertion interface for store slot methods
interface StoreWithSlots {
  saveToSlot(slotId: string, metadata?: SlotMetadata): Promise<void>
  loadFromSlot(slotId: string, options?: { force?: boolean }): Promise<void>
  deleteSlot(slotId: string): Promise<void>
  hasSlot(slotId: string): Promise<boolean>
  getSlot(slotId: string): Promise<SaveSlot | undefined>
  listSlots(): Promise<SaveSlot[]>
}

const logger = getPackageLogger('engine:game-manager')

/**
 * Game Manager
 *
 * Provides high-level game management APIs including scene management,
 * save/load functionality, and game state control.
 */
export class GameManager {
  private engine: QuaEngine
  private autoSaveTimer?: number

  constructor(engine: QuaEngine) {
    this.engine = engine
    this.setupAutoSave()
  }

  /**
   * Load a scene and prepare it for execution
   */
  async loadScene(sceneInstance: Scene): Promise<void> {
    logger.info(`Loading scene: ${sceneInstance.name}`)

    try {
      await this.engine.loadScene(sceneInstance)
      logger.info(`Scene loaded successfully: ${sceneInstance.name}`)
    } catch (error) {
      logger.error(`Failed to load scene: ${sceneInstance.name}`, error)
      throw error
    }
  }

  /**
   * Execute a dialogue sequence
   * This is the main API for game progression
   */
  async dialogue(steps: GameStep[]): Promise<void> {
    logger.debug(`Starting dialogue with ${steps.length} steps`)

    try {
      await this.engine.dialogue(steps)
      logger.debug('Dialogue sequence completed')
    } catch (error) {
      logger.error('Dialogue execution failed', error)
      throw error
    }
  }

  /**
   * Create a single game step
   */
  createStep(
    action: (ctx: StepContext) => void | Promise<void>,
    metadata?: { title?: string; description?: string; tags?: string[] }
  ): GameStep {
    return {
      uuid: generateId(),
      run: action,
      metadata
    }
  }

  /**
   * Create multiple steps from an array of actions
   */
  createSteps(
    actions: Array<(ctx: StepContext) => void | Promise<void>>,
    metadata?: Array<{ title?: string; description?: string; tags?: string[] }>
  ): GameStep[] {
    return actions.map((action, index) => ({
      uuid: generateId(),
      run: action,
      metadata: metadata?.[index]
    }))
  }

  /**
   * Rewind to a specific step by UUID
   */
  async rewind(stepUUID: string): Promise<void> {
    logger.info(`Rewinding to step: ${stepUUID}`)

    try {
      await this.engine.rewind(stepUUID)
      logger.info(`Rewind completed: ${stepUUID}`)
    } catch (error) {
      logger.error(`Rewind failed: ${stepUUID}`, error)
      throw error
    }
  }

  /**
   * Save game to a specific slot using the store's slot save functionality
   */
  async saveGame(
    slotId: string,
    slotName?: string,
    screenshot?: string
  ): Promise<void> {
    logger.info(`Saving game to slot: ${slotId}`)

    try {
      const store = this.engine.getStore() as unknown as StoreWithSlots

      const metadata: SlotMetadata = {
        name: slotName,
        screenshot,
        sceneName: this.engine.getCurrentSceneName(),
        stepId: this.engine.getCurrentStepId(),
        playtime: this.calculatePlaytime()
      }

      await store.saveToSlot(slotId, metadata)

      logger.info(`Game saved successfully: ${slotId}`)

    } catch (error) {
      logger.error(`Save failed: ${slotId}`, error)
      throw error
    }
  }

  /**
   * Load game from a specific slot using the store's slot load functionality
   */
  async loadGame(slotId: string): Promise<void> {
    logger.info(`Loading game from slot: ${slotId}`)

    try {
      const store = this.engine.getStore() as unknown as StoreWithSlots

      // Check if slot exists
      if (!(await store.hasSlot(slotId))) {
        throw new Error(`Save slot not found: ${slotId}`)
      }

      await store.loadFromSlot(slotId, { force: true })

      logger.info(`Game loaded successfully: ${slotId}`)

    } catch (error) {
      logger.error(`Load failed: ${slotId}`, error)
      throw error
    }
  }

  /**
   * Delete a save slot
   */
  async deleteSave(slotId: string): Promise<void> {
    logger.info(`Deleting save slot: ${slotId}`)

    try {
      const store = this.engine.getStore() as unknown as StoreWithSlots
      await store.deleteSlot(slotId)

      logger.info(`Save slot deleted: ${slotId}`)

    } catch (error) {
      logger.error(`Delete save failed: ${slotId}`, error)
      throw error
    }
  }

  /**
   * Get list of all save slots
   */
  async getSaveSlots() {
    const store = this.engine.getStore() as unknown as StoreWithSlots
    return await store.listSlots()
  }

  /**
   * Get a specific save slot
   */
  async getSaveSlot(slotId: string) {
    const store = this.engine.getStore() as unknown as StoreWithSlots
    return await store.getSlot(slotId)
  }

  /**
   * Create an auto-save
   */
  async autoSave(): Promise<void> {
    const autoSaveId = 'autosave'
    await this.saveGame(autoSaveId, 'Auto Save')
    logger.debug('Auto-save completed')
  }

  /**
   * Quick save to slot 'quicksave'
   */
  async quickSave(): Promise<void> {
    const quickSaveId = 'quicksave'
    await this.saveGame(quickSaveId, 'Quick Save')
    logger.info('Quick save completed')
  }

  /**
   * Quick load from slot 'quicksave'
   */
  async quickLoad(): Promise<void> {
    const quickSaveId = 'quicksave'
    await this.loadGame(quickSaveId)
    logger.info('Quick load completed')
  }

  /**
   * Calculate total playtime
   */
  private calculatePlaytime(): number {
    // This would need to be implemented based on game start time tracking
    return 0 // Placeholder
  }

  /**
   * Setup auto-save functionality
   */
  private setupAutoSave(): void {
    // Auto-save configuration would come from engine config
    const autoSaveInterval = 300000 // 5 minutes default

    if (typeof window !== 'undefined') {
      this.autoSaveTimer = window.setInterval(() => {
        this.autoSave().catch(error => {
          logger.warn('Auto-save failed:', error)
        })
      }, autoSaveInterval)
    }
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    if (this.autoSaveTimer && typeof window !== 'undefined') {
      window.clearInterval(this.autoSaveTimer)
      this.autoSaveTimer = undefined
    }

    logger.debug('Game manager destroyed')
  }
}