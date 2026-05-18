import type {
  DynamicBundleRecord,
  QuaAssets,
  QuaAssetsConfig,
  RuntimePackageManifest,
  RuntimePackagePluginManifest,
  RuntimePackageScriptManifest,
  RuntimePackageStoreMigrationManifest,
  TranslateInput,
} from '@quajs/assets'
import type { Pipeline } from '@quajs/pipeline'
import type { QuaStore, StorageConfig } from '@quajs/store'
import type {
  ActiveAnimationProjection,
  FlowControlMode,
  FlowControlPolicy,
  FlowControlProjectionInput,
  FlowControlTimingProjection,
  QuaViewProjection,
  RichTextContent,
  ViewBackgroundProjection,
  ViewEffectProjection,
  ViewFlowControlProjection,
  ViewLayoutInput,
  ViewUiProjection,
} from '../events/events'
import type { EnginePlugin, PluginConstructorOptions } from '../plugins/core/types'
import { createFlowControlProjection, createViewLayoutProjection } from '../events/events'

export type {
  RuntimePackageManifest,
  RuntimePackagePluginManifest,
  RuntimePackageScriptManifest,
  RuntimePackageScriptVariantManifest,
  RuntimePackageStoreMigrationManifest,
  RuntimePackageStoryGraphDeltaManifest,
  TranslateInput,
  TranslateOptions,
} from '@quajs/assets'

export type {
  ViewFlowControlProjection,
  ViewLayoutInput,
  ViewLayoutOrientation,
  ViewLayoutPreset,
  ViewLayoutProjection,
  ViewLayoutScaleMode,
  ViewPluginProjectionMap,
} from '../events/events'

export type {
  FlowControlMode,
  FlowControlPolicy,
  FlowControlProjectionInput,
  FlowControlSkipMode,
  FlowControlTimingProjection,
} from '../events/events'

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
    point?: Partial<StoryPoint>
    requiredRuntimePackages?: string[]
    runtimePackage?: {
      packageId: string
      scriptModuleId?: string
      scriptModuleVersion?: string
      scriptModuleLocale?: string
    }
  }
}

export type GameStepScope = Record<string, unknown>

export type GameStepFactory<TScope = GameStepScope> = (scope: TScope) => GameStep[]

export type OptionalGameStepFactory<TScope = GameStepScope> = (scope?: TScope) => GameStep[]

export type GameStepSource<TScope = GameStepScope> = GameStep[] | GameStepFactory<TScope> | OptionalGameStepFactory<TScope>

export interface StepContext {
  engine: QuaEngineInterface
  stepId: string
  previousStepId?: string
  point: StoryPoint
  signal: AbortSignal
  store: QuaStore
  assets: QuaAssets
  pipeline: Pipeline
  t: (key: string, options?: TranslateInput) => Promise<string>
  choice?: {
    choiceId: string
    [key: string]: unknown
  }
}

export interface QuaEngineInterface {
  getCurrentSceneName: () => string | undefined
  getCurrentStepId: () => string | undefined
  getStoryPoint: () => StoryPoint | undefined
  setStoryPoint: (point: StoryPoint) => Promise<void>
  createCheckpoint: (options?: CreateCheckpointOptions) => Promise<EngineCheckpoint>
  getCheckpoint: (id: string) => EngineCheckpoint | undefined
  jumpTo: (target: JumpTarget, options?: JumpOptions) => Promise<void>
  getStore: () => QuaStore
  getAssets: () => QuaAssets
  getPipeline: () => Pipeline
  translate: (key: string, options?: TranslateInput) => Promise<string>
  ensureRuntimePackages: (packageIds: readonly string[]) => Promise<void>
  getCurrentRuntimePackageId: () => string | undefined
  getRuntimeStateSnapshot: () => EngineRuntimeState
  getViewState: () => QuaViewProjection
  getFlowControlState: () => ViewFlowControlProjection
  unloadRuntimePackage: (packageId: string, options?: RuntimePackageUnloadOptions) => Promise<void>
  setFlowControlOptions: (options: FlowControlRuntimeOptions) => Promise<void>
  setFlowControlMode: (mode: FlowControlMode) => Promise<void>
  setFlowControlPolicy: (policy: FlowControlPolicy) => Promise<void>
  resetFlowControlPolicy: () => Promise<void>
  startAuto: () => Promise<void>
  stopAuto: () => Promise<void>
  startSkip: () => Promise<void>
  stopSkip: () => Promise<void>
  startFastForward: () => Promise<void>
  stopFastForward: () => Promise<void>
  setLayoutProjection: (layout: ViewLayoutInput) => Promise<void>
  getPluginProjection: <T = unknown>(pluginId: string) => T | undefined
  setPluginProjection: <T = unknown>(pluginId: string, projection?: T) => Promise<void>
  waitFor: QuaEngineWaitFor
  showDialogue: (payload: DialogueIntent) => Promise<void>
  hideDialogue: () => Promise<void>
  showChoices: (choices: ChoiceIntent[]) => Promise<void>
  clearChoices: () => Promise<void>
  setBackgroundProjection: (background?: BackgroundIntent) => Promise<void>
  setAnimationProjection: (animation: ActiveAnimationProjection) => Promise<void>
  removeAnimationProjection: (id: string) => Promise<void>
  clearAnimationProjections: () => Promise<void>
  showCharacter: (payload: CharacterIntent) => Promise<void>
  hideCharacter: (id: string) => Promise<void>
  moveCharacter: (id: string, position: CharacterIntent['position']) => Promise<void>
  setCharacterExpression: (id: string, expression?: string) => Promise<void>
  setCharacterSprite: (id: string, sprite?: string) => Promise<void>
  showUI: (elementId: string, config?: Record<string, unknown>) => Promise<void>
  hideUI: (elementId: string) => Promise<void>
  updateUI: (elementId: string, config: Record<string, unknown>) => Promise<void>
  saveToSlot: (slotId: string, metadata?: SlotMetadata) => Promise<void>
  loadFromSlot: (slotId: string, options?: LoadSlotOptions) => Promise<void>
  quickSave: (metadata?: SlotMetadata) => Promise<void>
  quickLoad: () => Promise<void>
  autoSave: (metadata?: SlotMetadata) => Promise<void>
  listSaveSlots: () => Promise<import('@quajs/store').QuaGameSaveSlotMeta[]>
  deleteSaveSlot: (slotId: string) => Promise<void>
  runScriptModule: <TScope>(moduleId: string, scope?: TScope, options?: RuntimeScriptModuleRunOptions) => Promise<void>
  withRuntimePackageContext: <T>(packageId: string | undefined, operation: (engine: QuaEngineInterface) => T | Promise<T>) => Promise<T>
}

export type QuaEngineWaitFor = <T extends import('../events/events').LogicToRenderEvents | import('../events/events').RenderToLogicEvents>(
  event: T,
  matcher?: (payload: import('../events/events').EventPayload<T>) => boolean,
  options?: { timeout?: number, signal?: any },
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

export interface StoryPoint {
  storyId?: string
  chapterId?: string
  sceneId?: string
  laneId?: string
  routeId?: string
  timelineId?: string
  protagonistId?: string
  nodeId?: string
  stepId: string
  lineId?: string
  contentPackageId?: string
  scriptModuleId?: string
  scriptModuleVersion?: string
  scriptModuleLocale?: string
}

export type EngineCheckpointKind = 'step' | 'line' | 'choice' | 'manual' | 'save'

export interface EngineCheckpoint {
  id: string
  point: StoryPoint
  snapshotId: string
  kind: EngineCheckpointKind
  metadata?: Record<string, unknown>
}

export interface CreateCheckpointOptions {
  id?: string
  point?: StoryPoint
  kind?: EngineCheckpointKind
  metadata?: Record<string, unknown>
}

export type JumpTarget = string | StoryPoint | EngineCheckpoint

export interface JumpOptions {
  reason?: string
  resume?: 'pause' | 'continue'
  mode?: 'restore' | 'fresh'
  force?: boolean
  audio?: 'restore' | 'stop' | 'keep'
  animation?: 'clear-active' | 'restore'
  effects?: 'clear-active' | 'restore'
  ui?: 'clear-transient' | 'restore'
}

export interface JumpContext {
  target: JumpTarget
  checkpoint?: EngineCheckpoint
  point: StoryPoint
  options: Required<Pick<JumpOptions, 'resume' | 'mode' | 'audio' | 'animation' | 'effects' | 'ui'>> & Omit<JumpOptions, 'resume' | 'mode' | 'audio' | 'animation' | 'effects' | 'ui'>
}

export interface LoadSlotOptions {
  force?: boolean
  reason?: string
}

export type RuntimePackageState = 'loaded' | 'active' | 'unloaded'

export interface RuntimePackageStateRecord {
  id: string
  version: string
  state: RuntimePackageState
  bundleName?: string
  priority?: number
  loadedAt: number
  activatedAt?: number
  dependencies: string[]
  scriptModuleIds: string[]
  pluginIds: string[]
  migrationIds: string[]
}

export interface RuntimeScriptModuleRecord extends RuntimePackageScriptManifest {
  packageId: string
  bundleName?: string
  factory?: GameStepFactory<any> | OptionalGameStepFactory<any>
  module?: Record<string, unknown>
}

export interface RuntimeScriptModuleRunOptions {
  locale?: string
}

export interface RuntimePackageLoadOptions {
  activate?: boolean
  bundleName?: string
  priority?: number
}

export interface RuntimePackageUnloadOptions {
  force?: boolean
}

export interface RuntimePackageRegistryEntry {
  source: string
  options?: RuntimePackageLoadOptions
}

export interface RuntimePackageRegistryResolveContext {
  engine: QuaEngineInterface
  assets: QuaAssets
  requestedPackageId: string
}

export interface RuntimePackageRegistry {
  resolvePackage: (
    packageId: string,
    ctx: RuntimePackageRegistryResolveContext,
  ) => string | RuntimePackageRegistryEntry | undefined | Promise<string | RuntimePackageRegistryEntry | undefined>
}

export interface RuntimeLoadedScriptModule {
  default?: GameStepFactory<any> | OptionalGameStepFactory<any>
  [key: string]: unknown
}

export interface RuntimeLoadedPluginModule {
  default?: unknown
  Plugin?: unknown
  [key: string]: unknown
}

export interface RuntimeLoadedMigrationModule {
  default?: RuntimeStoreMigrationHandler
  [key: string]: unknown
}

export interface RuntimeStoreMigrationContext {
  engine: QuaEngineInterface
  store: QuaStore
  assets: QuaAssets
  pipeline: Pipeline
  package: RuntimePackageManifest
  migration: RuntimePackageStoreMigrationManifest
}

export type RuntimeStoreMigrationHandler = (ctx: RuntimeStoreMigrationContext) => void | Promise<void>

export interface RuntimeModuleLoader {
  loadScriptModule?: (record: RuntimeScriptModuleRecord, ctx: RuntimeModuleLoadContext) => Promise<RuntimeLoadedScriptModule>
  loadEnginePluginModule?: (record: RuntimePackagePluginManifest, ctx: RuntimeModuleLoadContext) => Promise<RuntimeLoadedPluginModule>
  loadStoreMigrationModule?: (record: RuntimePackageStoreMigrationManifest, ctx: RuntimeModuleLoadContext) => Promise<RuntimeLoadedMigrationModule>
}

export interface RuntimeModuleLoadContext {
  assets: QuaAssets
  package: RuntimePackageManifest
  bundle: DynamicBundleRecord
  locale?: string
}

export interface RuntimeTrustPolicy {
  requireSignature?: boolean
  allowUnsignedInDevelopment?: boolean
  verifyPackage?: (ctx: RuntimePackageTrustContext) => boolean | Promise<boolean>
}

export interface RuntimePackageTrustContext {
  package: RuntimePackageManifest
  bundle: DynamicBundleRecord
}

export interface RuntimePackageContext {
  package: RuntimePackageManifest
  bundleName?: string
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
  layout?: ViewLayoutInput
  assets?: QuaAssetsConfig
  store?: {
    persistKey?: string
    enableSnapshots?: boolean
    maxSnapshots?: number
    storage?: StorageConfig
  }
  saves?: {
    maxSlots?: number
    autoSave?: boolean
    autoSaveInterval?: number
    encryptionKey?: string
  }
  runtimeModuleLoader?: RuntimeModuleLoader
  runtimePackageRegistry?: RuntimePackageRegistry
  trustPolicy?: RuntimeTrustPolicy
  debug?: {
    enableLogs?: boolean
    logLevel?: 'debug' | 'info' | 'warn' | 'error'
  }
  flowControl?: FlowControlOptions
}

export interface FlowControlOptions extends FlowControlProjectionInput {}

export type FlowControlRuntimeOptions = Partial<Pick<
  FlowControlProjectionInput,
  'defaultPolicy' | 'policy' | 'skipMode' | 'stopAtChoices'
>> & {
  timings?: Partial<FlowControlTimingProjection>
}

export interface BackgroundIntent extends ViewBackgroundProjection {}

export interface UiIntent extends ViewUiProjection {}

export interface EffectIntent extends ViewEffectProjection {}

export interface DialogueIntent {
  characterId?: string
  characterName?: string
  text: RichTextContent
  mode?: 'say' | 'narration'
  metadata?: Record<string, unknown>
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
  opacity?: number
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
  currentStoryPoint?: StoryPoint
  currentCheckpointId?: string
  sceneHistory: string[]
  stepHistory: string[]
  checkpointHistory: string[]
  runtimePackages: Record<string, RuntimePackageStateRecord>
  appliedRuntimeMigrations: string[]
}

export interface EngineFlowControlProgressState {
  readKeys: string[]
}

export interface EngineState {
  runtime: EngineRuntimeState
  flowControlProgress: EngineFlowControlProgressState
  view: QuaViewProjection
  checkpoints: Record<string, EngineCheckpoint>
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

export function createInitialEngineState(layout?: ViewLayoutInput, flowControl?: FlowControlOptions): EngineState {
  return {
    runtime: {
      currentScene: null,
      currentStepId: null,
      currentStoryPoint: undefined,
      currentCheckpointId: undefined,
      sceneHistory: [],
      stepHistory: [],
      checkpointHistory: [],
      runtimePackages: {},
      appliedRuntimeMigrations: [],
    },
    flowControlProgress: {
      readKeys: [],
    },
    checkpoints: {},
    view: {
      layout: createViewLayoutProjection(layout),
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
      flowControl: createFlowControlProjection(flowControl),
      effects: [],
      animations: [],
      plugins: {},
    },
  }
}
