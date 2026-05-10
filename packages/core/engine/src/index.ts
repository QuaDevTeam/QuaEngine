// Global APIs (main exports)
export {
  clearChoices,
  dialogue,
  getAssetMetadata,
  getAssets,
  getCurrentSceneName,
  getCurrentStepId,
  getPipeline,
  getPluginProjection,
  getStore,
  getViewState,
  hideDialogue,
  initEngine,
  loadFromSlot,
  loadScene,
  rewind,
  saveToSlot,
  setPluginProjection,
  showChoices,
  showDialogue,
  waitFor,
} from './api/global'

// Core Engine
export { QuaEngine } from './core/engine'

// Types
export { Scene } from './core/types'
export type {
  BackgroundIntent,
  CharacterIntent,
  ChoiceIntent,
  DialogueIntent,
  EngineConfig,
  EngineEventMap,
  GameSaveData,
  GameStep,
  GameStepFactory,
  GameStepScope,
  GameStepSource,
  OptionalGameStepFactory,
  QuaEngineInterface,
  SaveSlot,
  StepContext,
  UsePluginOptions,
  ViewPluginProjectionMap,
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
  ActiveAnimationProjection,
  AnimationFillMode,
  AnimationInterpolation,
  AnimationKeyframeProjection,
  AnimationPlaybackState,
  AnimationTime,
  BackgroundLayerAssetType,
  BackgroundMode,
  BackgroundSetPayload,
  DialogueShowPayload,
  EngineEvents,
  ResolvedAnimationTrackProjection,
  SceneInitPayload,
  UserChoiceSelectPayload,
  UserClickPayload,
  ViewBackgroundLayerProjection,
  ViewBackgroundProjection,
  ViewVideoBackgroundProjection,
} from './events/events'

// Managers
export { GameManager } from './managers/game-manager'
export { SceneManager } from './managers/scene-manager'

export type { SceneTransition, SceneTransitionOptions } from './managers/scene-manager'

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
export { UiOverlayPlugin } from './plugins/ui-overlay-plugin'
export type { UiOverlayPluginOptions } from './plugins/ui-overlay-plugin'
