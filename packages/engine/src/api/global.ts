import { QuaEngine } from '../core/engine'
import type { GameStep, Scene, SoundOptions, VolumeSettings } from '../core/types'

let engineInstance: QuaEngine | null = null

/**
 * Initialize the global QuaEngine instance
 */
export function initEngine(config?: any): Promise<void> {
  engineInstance = QuaEngine.getInstance(config)
  return engineInstance.init()
}

/**
 * Get the current engine instance
 */
function getEngine(): QuaEngine {
  if (!engineInstance) {
    throw new Error('Engine not initialized. Call initEngine() first.')
  }
  return engineInstance
}

/**
 * Load and activate a scene
 */
export async function loadScene(scene: Scene): Promise<void> {
  return getEngine().loadScene(scene)
}

/**
 * Execute a dialogue sequence
 */
export async function dialogue(steps: GameStep[]): Promise<void> {
  return getEngine().dialogue(steps)
}

/**
 * Rewind to a specific step
 */
export async function rewind(stepUUID: string): Promise<void> {
  return getEngine().rewind(stepUUID)
}

/**
 * Play a sound effect
 */
export async function playSound(assetName: string, options?: SoundOptions): Promise<void> {
  return getEngine().playSound(assetName, options)
}

/**
 * Play character dubbing
 */
export async function dub(assetName: string, options?: SoundOptions): Promise<void> {
  return getEngine().dub(assetName, options)
}

/**
 * Play background music
 */
export async function playBGM(assetName: string, options?: SoundOptions): Promise<void> {
  return getEngine().playBGM(assetName, options)
}

/**
 * Set volume for a specific audio type
 */
export function setVolume(type: keyof VolumeSettings, value: number): void {
  return getEngine().setVolume(type, value)
}

/**
 * Save game to a slot with metadata
 */
export async function saveToSlot(
  slotId: string, 
  metadata?: {
    name?: string;
    screenshot?: string;
    sceneName?: string;
    stepId?: string;
    playtime?: number;
    [key: string]: unknown;
  }
): Promise<void> {
  return getEngine().saveToSlot(slotId, metadata)
}

/**
 * Load game from a slot
 */
export async function loadFromSlot(slotId: string, options?: { force?: boolean }): Promise<void> {
  return getEngine().loadFromSlot(slotId, options)
}

/**
 * Get asset metadata
 */
export async function getAssetMetadata(type: 'audio' | 'images' | 'characters' | 'scripts' | 'data', assetName: string): Promise<any> {
  return getEngine().getAssetMetadata(type, assetName)
}

/**
 * Get current scene name
 */
export function getCurrentSceneName(): string | undefined {
  return getEngine().getCurrentSceneName()
}

/**
 * Get current step ID
 */
export function getCurrentStepId(): string | undefined {
  return getEngine().getCurrentStepId()
}

/**
 * Get the store instance
 */
export function getStore() {
  return getEngine().getStore()
}