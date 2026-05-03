import type { ChoiceIntent, DialogueIntent, GameStep, Scene, SoundOptions, VolumeSettings } from '../core/types'
import { QuaEngine } from '../core/engine'

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
export async function setVolume(type: keyof VolumeSettings, value: number): Promise<void> {
  return getEngine().setVolume(type, value)
}

/**
 * Save game to a slot with metadata
 */
export async function saveToSlot(
  slotId: string,
  metadata?: {
    name?: string
    screenshot?: string
    sceneName?: string
    stepId?: string
    playtime?: number
    [key: string]: unknown
  },
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

export function getAssets() {
  return getEngine().getAssets()
}

export function getPipeline() {
  return getEngine().getPipeline()
}

export function getViewState() {
  return getEngine().getViewState()
}

export function waitFor(event: string, matcher?: (payload: any) => boolean, options?: { timeout?: number, signal?: any }) {
  return getEngine().waitFor(event as any, matcher, options)
}

export async function showDialogue(payload: DialogueIntent): Promise<void> {
  return getEngine().showDialogue(payload)
}

export async function hideDialogue(): Promise<void> {
  return getEngine().hideDialogue()
}

export async function showChoices(choices: ChoiceIntent[]): Promise<void> {
  return getEngine().showChoices(choices)
}

export async function clearChoices(): Promise<void> {
  return getEngine().clearChoices()
}
