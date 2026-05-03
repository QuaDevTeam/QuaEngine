import type { QuaAssets, QuaAssetsConfig } from '@quajs/assets'
import type { Pipeline } from '@quajs/pipeline'
import type { QuaStore } from '@quajs/store'
import type {
  AudioChannelIntent,
  AudioIntentProjection,
  QuaViewProjection,
  ViewEffectProjection,
  ViewUiProjection,
  VolumeSettings,
} from '../events/events'
import type { EnginePlugin, PluginConstructorOptions } from '../plugins/core/types'
export type { VolumeSettings } from '../events/events'

export interface SlotMetadata {
  name?: string
  screenshot?: string
  sceneName?: string
  stepId?: string
  playtime?: number
  [key: string]: unknown
}

export interface GameStep {
  uuid: string
  run: (ctx: StepContext) => void | Promise<void>
  metadata?: {
    title?: string
    description?: string
    tags?: string[]
  }
}

export interface StepContext {
  engine: QuaEngineInterface
  stepId: string
  previousStepId?: string
  store: QuaStore
  assets: QuaAssets
  pipeline: Pipeline
  choice?: {
    choiceId: string
    [key: string]: unknown
  }
}

export interface QuaEngineInterface {
  getCurrentSceneName: () => string | undefined
  getCurrentStepId: () => string | undefined
  getStore: () => QuaStore
  getAssets: () => QuaAssets
  getPipeline: () => Pipeline
  getViewState: () => QuaViewProjection
  waitFor: QuaEngineWaitFor
  playSound: (assetName: string, options?: SoundOptions) => Promise<void>
  dub: (assetName: string, options?: SoundOptions) => Promise<void>
  playBGM: (assetName: string, options?: SoundOptions) => Promise<void>
  setVolume: (type: keyof VolumeSettings, value: number) => Promise<void>
  showDialogue: (payload: DialogueIntent) => Promise<void>
  hideDialogue: () => Promise<void>
  showChoices: (choices: ChoiceIntent[]) => Promise<void>
  clearChoices: () => Promise<void>
  showCharacter: (payload: CharacterIntent) => Promise<void>
  hideCharacter: (id: string) => Promise<void>
  moveCharacter: (id: string, position: CharacterIntent['position']) => Promise<void>
  setCharacterExpression: (id: string, expression?: string) => Promise<void>
  setCharacterSprite: (id: string, sprite?: string) => Promise<void>
  showUI: (elementId: string, config?: Record<string, unknown>) => Promise<void>
  hideUI: (elementId: string) => Promise<void>
  updateUI: (elementId: string, config: Record<string, unknown>) => Promise<void>
}

export type QuaEngineWaitFor = <T extends import('../events/events').LogicToRenderEvents | import('../events/events').RenderToLogicEvents>(
  event: T,
  matcher?: (payload: import('../events/events').EventPayload<T>) => boolean,
  options?: { timeout?: number, signal?: any }
) => Promise<import('../events/events').EventPayload<T>>

export abstract class Scene {
  abstract readonly name: string
  abstract init(): void | Promise<void>
  abstract run(): void | Promise<void>
  destroy?(): void | Promise<void>
}

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

export interface EngineConfig {
  assets?: QuaAssetsConfig
  store?: {
    persistKey?: string
    enableSnapshots?: boolean
    maxSnapshots?: number
  }
  saves?: {
    maxSlots?: number
    autoSave?: boolean
    autoSaveInterval?: number
    encryptionKey?: string
  }
  debug?: {
    enableLogs?: boolean
    logLevel?: 'debug' | 'info' | 'warn' | 'error'
  }
}

export interface SoundOptions {
  id?: string
  volume?: number
  loop?: boolean
  fadeIn?: number
  fadeOut?: number
}

export interface AudioIntentUpdate {
  channel: 'bgm' | 'sound' | 'voice'
  id: string
  patch: Partial<AudioChannelIntent>
}

export interface UiIntent extends ViewUiProjection {}

export interface EffectIntent extends ViewEffectProjection {}

export interface DialogueIntent {
  characterId?: string
  characterName?: string
  text: string
  mode?: 'say' | 'narration'
}

export interface ChoiceIntent {
  id: string
  text: string
  enabled?: boolean
  metadata?: Record<string, unknown>
}

export interface CharacterIntent {
  id: string
  name?: string
  sprite?: string
  expression?: string
  visible?: boolean
  position?: {
    x?: number
    y?: number
    scale?: number
    rotation?: number
    anchor?: 'left' | 'center' | 'right' | string
  }
  layer?: number
  metadata?: Record<string, unknown>
}

export interface EngineRuntimeState {
  currentScene: string | null
  currentStepId: string | null
  sceneHistory: string[]
  stepHistory: string[]
  volumeSettings: VolumeSettings
}

export interface EngineState {
  runtime: EngineRuntimeState
  view: QuaViewProjection
  audio: AudioIntentProjection
}

export interface EngineStoreState {
  engine: EngineState
}

export interface EngineEventMap {
  'step:start': { stepId: string }
  'step:complete': { stepId: string }
  'step:error': { stepId: string, error: Error }
  'scene:change': { fromScene?: string, toScene: string }
  'save:complete': { slotId: string }
  'load:complete': { slotId: string }
  'plugin:loaded': { pluginName: string }
  'plugin:error': { pluginName: string, error: Error }
}

export type UsePluginOptions<T extends EnginePlugin = EnginePlugin>
  = | PluginConstructorOptions
    | T

export const defaultVolumeSettings: VolumeSettings = {
  master: 1,
  bgm: 1,
  sound: 1,
  voice: 1,
}

export function createInitialEngineState(): EngineState {
  return {
    runtime: {
      currentScene: null,
      currentStepId: null,
      sceneHistory: [],
      stepHistory: [],
      volumeSettings: { ...defaultVolumeSettings },
    },
    view: {
      background: undefined,
      characters: [],
      dialogue: {
        visible: false,
        text: '',
      },
      choices: [],
      ui: {
        visible: true,
        overlays: {},
      },
      effects: [],
      audio: {
        volumeSettings: { ...defaultVolumeSettings },
        sounds: [],
        voices: [],
      },
    },
    audio: {
      volumeSettings: { ...defaultVolumeSettings },
      sounds: [],
      voices: [],
    },
  }
}
