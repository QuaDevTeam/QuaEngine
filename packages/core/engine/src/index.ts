// Global APIs (main exports)
export {
  dialogue,
  dub,
  getAssetMetadata,
  getCurrentSceneName,
  getCurrentStepId,
  getStore,
  initEngine,
  loadFromSlot,
  loadScene,
  playBGM,
  playSound,
  rewind,
  saveToSlot,
  setVolume,
} from './api/global'

// Core Engine
export { QuaEngine } from './core/engine'

// Types
export { Scene } from './core/types'
export type {
  EngineConfig,
  EngineEventMap,
  GameSaveData,
  GameStep,
  SaveSlot,
  SoundOptions,
  StepContext,
  UsePluginOptions,
  VolumeSettings,
} from './core/types'
// Events
export {
  LogicToRenderEvents,
  RenderToLogicEvents,
} from './events/events'
export type {
  AudioPlayPayload,
  BackgroundSetPayload,
  DialogueShowPayload,
  EngineEvents,
  SceneInitPayload,
  UserChoiceSelectPayload,
  UserClickPayload,
  VolumeChangePayload,
} from './events/events'

// Managers
export { GameManager } from './managers/game-manager'
export { SceneManager } from './managers/scene-manager'

export type { SceneTransition, SceneTransitionOptions } from './managers/scene-manager'
export { SoundSystem } from './managers/sound-system'

// Plugin System (organized structure)
export {
  BaseEnginePlugin,
  defineAPIFunction,
  defineDecorator,
  getDiscoveredDecoratorMappings,
  getPluginDiscovery,
  getPluginRegistry,
  PluginAPIRegistry,
  PluginDiscovery,
  PluginFramework,
} from './plugins'

export type {
  DecoratorMapping,
  EngineContext,
  EnginePlugin,
  PluginAPIFunction,
  PluginAPIRegistration,
  PluginConstructor,
  PluginConstructorOptions,
} from './plugins'
