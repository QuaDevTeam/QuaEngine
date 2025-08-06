// Global APIs (main exports)
export {
  initEngine,
  loadScene,
  dialogue,
  rewind,
  playSound,
  dub,
  playBGM,
  setVolume,
  saveToSlot,
  loadFromSlot,
  getAssetMetadata,
  getCurrentSceneName,
  getCurrentStepId,
  getStore
} from './api/global'

// Core Engine
export { QuaEngine } from './core/engine'

// Managers
export { GameManager } from './managers/game-manager'
export { SoundSystem } from './managers/sound-system'
export { SceneManager } from './managers/scene-manager'
export type { SceneTransition, SceneTransitionOptions } from './managers/scene-manager'

// Plugin System
export { BaseEnginePlugin } from './plugins/plugins'
export type {
  EnginePlugin,
  EngineContext,
  PluginConstructor,
  PluginConstructorOptions,
} from './plugins/plugins'

// Events
export {
  LogicToRenderEvents,
  RenderToLogicEvents
} from './events/events'
export type {
  EngineEvents,
  SceneInitPayload,
  BackgroundSetPayload,
  DialogueShowPayload,
  AudioPlayPayload,
  UserClickPayload,
  UserChoiceSelectPayload,
  VolumeChangePayload
} from './events/events'

// Types
export { Scene } from './core/types'
export type {
  GameStep,
  StepContext,
  SaveSlot,
  GameSaveData,
  EngineConfig,
  SoundOptions,
  VolumeSettings,
  EngineEventMap,
  UsePluginOptions
} from './core/types'