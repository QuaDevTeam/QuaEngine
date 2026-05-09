// Global APIs (main exports)
export {
  dialogue,
  dub,
  getAssetMetadata,
  getCurrentSceneName,
  getCurrentStepId,
  getAssets,
  getPipeline,
  getStore,
  getViewState,
  waitFor,
  showDialogue,
  hideDialogue,
  showChoices,
  clearChoices,
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
  BackgroundIntent,
  CharacterIntent,
  ChoiceIntent,
  DialogueIntent,
  QuaEngineInterface,
} from './core/types'
// Events
export {
  emitLogicToRender,
  emitRenderToLogic,
  LogicToRenderEvents,
  onLogicToRender,
  onRenderToLogic,
  RenderToLogicEvents,
  waitForPipelineEvent,
} from './events/events'
export type {
  AudioPlayPayload,
  ActiveAnimationProjection,
  AnimationFillMode,
  AnimationInterpolation,
  AnimationKeyframeProjection,
  AnimationPlaybackState,
  AnimationTime,
  ResolvedAnimationTrackProjection,
  BackgroundLayerAssetType,
  BackgroundMode,
  BackgroundSetPayload,
  DialogueShowPayload,
  EngineEvents,
  SceneInitPayload,
  UserChoiceSelectPayload,
  UserClickPayload,
  ViewBackgroundLayerProjection,
  VolumeChangePayload,
  ViewBackgroundProjection,
  ViewVideoBackgroundProjection,
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
export { UiOverlayPlugin } from './plugins/ui-overlay-plugin'
export type { UiOverlayPluginOptions } from './plugins/ui-overlay-plugin'

export type {
  DecoratorMapping,
  EngineContext,
  EnginePlugin,
  PluginAPIFunction,
  PluginAPIRegistration,
  PluginConstructor,
  PluginConstructorOptions,
} from './plugins'
