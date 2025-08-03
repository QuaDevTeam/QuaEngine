import type { EnginePlugin, PluginConstructorOptions } from '../plugins/plugins'
import type { QuaStore } from '@quajs/store'
import type { QuaAssets } from '@quajs/assets'
import type { Pipeline } from '@quajs/pipeline'

/**
 * Slot metadata for save games
 */
export interface SlotMetadata {
  name?: string
  screenshot?: string
  sceneName?: string
  stepId?: string
  playtime?: number
  [key: string]: unknown
}

/**
 * Game step definition
 */
export interface GameStep {
  uuid: string
  run: (ctx: StepContext) => void | Promise<void>
  metadata?: {
    title?: string
    description?: string
    tags?: string[]
  }
}

/**
 * Context passed to step execution
 */
export interface StepContext {
  engine: QuaEngineInterface // Forward reference to avoid circular dependency
  stepId: string
  previousStepId?: string
  store: QuaStore
  assets: QuaAssets
  pipeline: Pipeline
}

/**
 * Forward reference interface for QuaEngine to avoid circular dependencies
 */
export interface QuaEngineInterface {
  getCurrentSceneName(): string | undefined
  getCurrentStepId(): string | undefined
  getStore(): QuaStore
  playSound(assetName: string, options?: SoundOptions): Promise<void>
  dub(assetName: string, options?: SoundOptions): Promise<void>
  playBGM(assetName: string, options?: SoundOptions): Promise<void>
  setVolume(type: keyof VolumeSettings, value: number): void
}

/**
 * Scene definition
 */
export abstract class Scene {
  abstract readonly name: string

  /**
   * Initialize the scene
   */
  abstract init(): void | Promise<void>

  /**
   * Run the scene logic (dialogue and other steps)
   */
  abstract run(): void | Promise<void>

  /**
   * Cleanup when scene is destroyed
   */
  destroy?(): void | Promise<void>
}

/**
 * Save slot information
 */
export interface SaveSlot {
  slotId: string
  name?: string
  timestamp: Date
  screenshot?: string
  metadata: {
    sceneName?: string
    stepId?: string
    playtime?: number
    [key: string]: unknown
  }
}

/**
 * Game save data
 */
export interface GameSaveData {
  version: string
  timestamp: number
  currentStepId?: string
  storeSnapshots: Array<{
    stepId: string
    snapshot: unknown
    timestamp: number
  }>
  metadata: Record<string, unknown>
}

/**
 * Engine configuration
 */
export interface EngineConfig {
  /**
   * Assets configuration
   */
  assets?: {
    baseUrl?: string
    cacheSize?: number
  }

  /**
   * Store configuration
   */
  store?: {
    persistKey?: string
    enableSnapshots?: boolean
    maxSnapshots?: number
  }

  /**
   * Save system configuration
   */
  saves?: {
    maxSlots?: number
    autoSave?: boolean
    autoSaveInterval?: number
    encryptionKey?: string
  }

  /**
   * Debug configuration
   */
  debug?: {
    enableLogs?: boolean
    logLevel?: 'debug' | 'info' | 'warn' | 'error'
  }
}

/**
 * Sound system options
 */
export interface SoundOptions {
  volume?: number
  loop?: boolean
  fadeIn?: number
  fadeOut?: number
}

/**
 * Volume settings
 */
export interface VolumeSettings {
  master: number
  bgm: number
  sound: number
  voice: number
}

/**
 * Engine events
 */
export interface EngineEventMap {
  'step:start': { stepId: string }
  'step:complete': { stepId: string }
  'step:error': { stepId: string; error: Error }
  'scene:change': { fromScene?: string; toScene: string }
  'save:complete': { slotId: string }
  'load:complete': { slotId: string }
  'plugin:loaded': { pluginName: string }
  'plugin:error': { pluginName: string; error: Error }
}

/**
 * Plugin use options
 */
export type UsePluginOptions<T extends EnginePlugin = EnginePlugin> =
  | PluginConstructorOptions
  | T