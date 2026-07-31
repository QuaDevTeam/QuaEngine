import type {
  AssetData,
  AssetType,
  DynamicBundleRecord,
  QuaAssets,
  QuaAssetsConfig,
  RuntimeLocalePackManifest,
  RuntimePackageManifest,
  RuntimePackagePluginManifest,
  RuntimePackageSceneManifest,
  RuntimePackageScriptManifest,
  RuntimePackageStoreMigrationManifest,
  TranslateInput,
  VersionCompatibility,
} from '@quajs/assets'
import type { Pipeline } from '@quajs/pipeline'
import type { QuaGameSavePreviewPayload, QuaStateSerializer, QuaStore, StorageConfig } from '@quajs/store'
import type {
  ActiveAnimationProjection,
  DialogueAvatarProjection,
  DialogueTypewriterProjection,
  FlowControlMode,
  FlowControlPolicy,
  FlowControlProjectionInput,
  FlowControlTimingProjection,
  GameOverPayload,
  QuaErrorPayload,
  QuaErrorSeverity,
  QuaErrorSource,
  QuaViewProjection,
  RichTextContent,
  RichTextStyleProjection,
  SavePreviewCapturePolicy,
  SavePreviewCaptureReason,
  SavePreviewCaptureTransaction,
  SceneTransitionIntent,
  ViewBackgroundProjection,
  ViewEffectProjection,
  ViewFlowControlProjection,
  ViewLayoutInput,
  ViewUiProjection,
} from '../events/events'
import type { EnginePlugin, PluginConstructorOptions } from '../plugins/core/types'
import { createFlowControlProjection, createViewLayoutProjection } from '../events/events'

export type {
  ViewFlowControlProjection,
  ViewLayoutInput,
  ViewLayoutOrientation,
  ViewLayoutPreset,
  ViewLayoutProjection,
  ViewLayoutScaleMode,
  ViewPluginProjectionMap,
  ViewUiSceneHostProjection,
} from '../events/events'

export type {
  FlowControlMode,
  FlowControlPolicy,
  FlowControlProjectionInput,
  FlowControlSkipMode,
  FlowControlTimingProjection,
  SavePreviewCapturePolicy,
  SavePreviewCaptureReason,
  SavePreviewCaptureTransaction,
  SaveRequestPayload,
} from '../events/events'

export type {
  RuntimeLocalePackManifest,
  RuntimeLocalePackTargetManifest,
  RuntimePackageManifest,
  RuntimePackagePluginManifest,
  RuntimePackageSceneManifest,
  RuntimePackageScriptManifest,
  RuntimePackageScriptVariantManifest,
  RuntimePackageStoreMigrationManifest,
  RuntimePackageStoryGraphDeltaManifest,
  TranslateInput,
  TranslateOptions,
} from '@quajs/assets'

export interface SlotMetadata {
  name?: string
  sceneName?: string
  stepId?: string
  playtime?: number
  [key: string]: unknown
}

export type SavePreviewProvidedInput = QuaGameSavePreviewPayload

export interface SavePreviewOptions {
  mode?: 'disabled' | 'provided' | 'renderer-capture'
  transaction?: SavePreviewCaptureTransaction
  strict?: boolean
  policy?: SavePreviewCapturePolicy
  image?: SavePreviewProvidedInput
}

export interface SaveToSlotOptions {
  reason?: SavePreviewCaptureReason
  preview?: SavePreviewOptions
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

export type GameStepList = GameStep[] | Promise<GameStep[]>

export type GameStepFactory<TScope = GameStepScope> = (scope: TScope) => GameStepList

export type OptionalGameStepFactory<TScope = GameStepScope> = (scope?: TScope) => GameStepList

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

export type JsonSerializable = string | number | boolean | null | JsonSerializable[] | { [key: string]: JsonSerializable }

export type JsonSerializableRecord = Record<string, JsonSerializable>

export interface StoryAssetRef {
  type: AssetType
  name: string
  runtimePackageId?: string
  alt?: string
  focalPoint?: {
    x: number
    y: number
  }
  metadata?: Readonly<Record<string, unknown>>
}

export interface ResolvedStoryAsset {
  ref: StoryAssetRef
  asset: AssetData
  contentPackageId?: string
  requiredRuntimePackages: string[]
}

export interface ChoiceTargetBase {
  kind: string
  requiredRuntimePackages?: readonly string[]
  metadata?: Readonly<Record<string, unknown>>
}

export interface NodeChoiceTarget extends ChoiceTargetBase {
  kind: 'node'
  id: string
  graphId?: string
  sceneId?: string
  packageId?: string
}

export interface LabelChoiceTarget extends ChoiceTargetBase {
  kind: 'label'
  id: string
  graphId?: string
  sceneId?: string
  packageId?: string
}

export interface SceneChoiceTarget extends ChoiceTargetBase {
  kind: 'scene'
  sceneId: string
  entry?: string
  state?: JsonSerializableRecord
  transition?: SceneTransitionIntent
}

export interface ScriptChoiceTarget extends ChoiceTargetBase {
  kind: 'script'
  moduleId: string
  nodeId?: string
  labelId?: string
  entryId?: string
  stepId?: string
  packageId?: string
  scope?: JsonSerializableRecord
}

export interface CheckpointChoiceTarget extends ChoiceTargetBase {
  kind: 'checkpoint'
  id: string
}

export interface PackageNodeChoiceTarget extends ChoiceTargetBase {
  kind: 'package-node'
  packageId: string
  nodeId: string
  graphId?: string
  sceneId?: string
}

export type ChoiceTarget
  = | NodeChoiceTarget
    | LabelChoiceTarget
    | SceneChoiceTarget
    | ScriptChoiceTarget
    | CheckpointChoiceTarget
    | PackageNodeChoiceTarget

export interface ChoiceUnavailablePolicy {
  mode: 'disabled' | 'hidden'
  reason?: string
  metadata?: Readonly<Record<string, unknown>>
}

export interface ChoicePresentation {
  skinId?: string
  title?: string
  subtitle?: string
  description?: string
  thumbnail?: StoryAssetRef
  background?: StoryAssetRef
  image?: StoryAssetRef
  metadata?: Readonly<Record<string, unknown>>
}

export interface ChoiceDefinitionOptions {
  id?: string
  when?: boolean
  unavailable?: ChoiceUnavailablePolicy
  presentation?: ChoicePresentation
  metadata?: Readonly<Record<string, unknown>>
}

export interface ChoiceDefinition {
  id: string
  text: string
  target?: ChoiceTarget
  enabled: boolean
  unavailable?: ChoiceUnavailablePolicy
  presentation?: ChoicePresentation
  metadata?: Readonly<Record<string, unknown>>
}

export interface StoryTargetResolveContext {
  engine: QuaEngineInterface
  assets: QuaAssets
  target: ChoiceTarget
  currentPoint?: StoryPoint
  currentSceneId?: string
  choiceId?: string
  source?: 'choice' | 'jump' | string
}

export interface ResolvedStoryJump {
  target: ChoiceTarget
  point?: StoryPoint
  checkpoint?: EngineCheckpoint
  requiredRuntimePackages?: readonly string[]
  script?: {
    moduleId: string
    nodeId?: string
    labelId?: string
    entryId?: string
    stepId?: string
    packageId?: string
    scope?: JsonSerializableRecord
  }
  scene?: {
    sceneId: string
    entry?: string
    initialState?: JsonSerializableRecord
    transition?: SceneTransitionIntent
  }
  metadata?: Readonly<Record<string, unknown>>
}

export type StoryTargetResolver = (target: ChoiceTarget, ctx: StoryTargetResolveContext) => ResolvedStoryJump | undefined | Promise<ResolvedStoryJump | undefined>

export interface QuaEngineInterface {
  getCurrentSceneName: () => string | undefined
  getCurrentStepId: () => string | undefined
  registerScene: (sceneId: string, factory: SceneFactory) => () => void
  hasScene: (sceneId: string) => boolean
  getStoryPoint: () => StoryPoint | undefined
  setStoryPoint: (point: StoryPoint) => Promise<void>
  createCheckpoint: (options?: CreateCheckpointOptions) => Promise<EngineCheckpoint>
  getCheckpoint: (id: string) => EngineCheckpoint | undefined
  jumpTo: (target: JumpTarget, options?: JumpOptions) => Promise<void>
  jumpToChoice: (choiceId: string, options?: ChoiceJumpOptions) => Promise<void>
  resolveStoryTarget: (target: ChoiceTarget, context?: Partial<StoryTargetResolveContext>) => Promise<ResolvedStoryJump>
  registerStoryTargetResolver: (resolver: StoryTargetResolver) => () => void
  getRollbackConfig: () => RollbackConfig
  setRollbackConfig: (patch: RollbackConfigPatch) => RollbackConfig
  getRollbackTargets: () => RollbackTargetInfo[]
  canRollback: () => boolean
  canRollForward: () => boolean
  rollback: (target?: RollbackTarget, options?: RollbackNavigationOptions) => Promise<void>
  rollForward: (target?: RollbackTarget, options?: RollbackNavigationOptions) => Promise<void>
  createRollbackAnchor: (reason?: RollbackAnchorReason | string, metadata?: Record<string, unknown>) => Promise<RollbackAnchor | undefined>
  markRollbackBoundary: (reason?: string, metadata?: Record<string, unknown>) => Promise<void>
  fixRollback: (metadata?: Record<string, unknown>) => Promise<void>
  registerRollbackStore: (name: string, store: QuaStore) => void
  unregisterRollbackStore: (name: string) => void
  getStore: () => QuaStore
  getAssets: () => QuaAssets
  getAssetMetadata: (type: AssetType, assetName: string) => Promise<unknown>
  resolveStoryAssetRef: (ref: StoryAssetRef) => Promise<ResolvedStoryAsset>
  getPipeline: () => Pipeline
  translate: (key: string, options?: TranslateInput) => Promise<string>
  ensureRuntimePackages: (packageIds: readonly string[]) => Promise<void>
  ensureLocalePacks: (locale: string, options?: EnsureLocalePacksOptions) => Promise<RuntimePackageStateRecord[]>
  getLocale: () => string
  setLocale: (locale: string, options?: SetLocaleOptions) => Promise<void>
  getCurrentRuntimePackageId: () => string | undefined
  getRuntimePackages: () => RuntimePackageStateRecord[]
  getRuntimeStateSnapshot: () => EngineRuntimeState
  getPlugin: <T extends EnginePlugin = EnginePlugin>(name: string) => T | undefined
  getPluginById: <T extends EnginePlugin = EnginePlugin>(id: string) => T | undefined
  getAllPlugins: () => Map<string, EnginePlugin>
  hasPlugin: (name: string) => boolean
  getPlaytimeMs: () => number
  getPlaytimeState: () => EnginePlaytimeState
  getProjectInfo: () => EngineProjectInfo | undefined
  getGameOverState: () => EngineGameOverState | undefined
  endGame: (options?: EndGameOptions) => Promise<EngineGameOverState>
  pausePlaytime: (reason?: string) => Promise<void>
  resumePlaytime: (reason?: string) => Promise<void>
  getViewState: () => QuaViewProjection
  getFlowControlState: () => ViewFlowControlProjection
  unloadRuntimePackage: (packageId: string, options?: RuntimePackageUnloadOptions) => Promise<void>
  setFlowControlOptions: (options: FlowControlRuntimeOptions) => Promise<void>
  setDialogueOptions: (options: DialogueOptions) => Promise<void>
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
  setRendererOptions: (options: { targetFrameRate?: number }) => Promise<void>
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
  saveToSlot: (slotId: string, metadata?: SlotMetadata, options?: SaveToSlotOptions) => Promise<void>
  loadFromSlot: (slotId: string, options?: LoadSlotOptions) => Promise<void>
  quickSave: (metadata?: SlotMetadata, options?: SaveToSlotOptions) => Promise<void>
  quickLoad: () => Promise<void>
  autoSave: (metadata?: SlotMetadata, options?: SaveToSlotOptions) => Promise<void>
  listSaveSlots: () => Promise<import('@quajs/store').QuaGameSaveSlotIndex[]>
  deleteSaveSlot: (slotId: string) => Promise<void>
  runScriptModule: <TScope>(moduleId: string, scope?: TScope, options?: RuntimeScriptModuleRunOptions) => Promise<void>
  runScriptModuleFrom: <TScope>(moduleId: string, options?: RuntimeScriptModuleRunFromOptions<TScope>) => Promise<void>
  withRuntimePackageContext: <T>(packageId: string | undefined, operation: (engine: QuaEngineInterface) => T | Promise<T>) => Promise<T>
  reportError: (error: unknown, options?: EngineReportErrorOptions) => Promise<QuaErrorPayload>
}

export interface EngineReportErrorOptions extends Partial<Omit<QuaErrorPayload, 'error'>> {
  source?: QuaErrorSource | string
  severity?: QuaErrorSeverity
  metadata?: Readonly<Record<string, unknown>>
}

export type QuaEngineWaitFor = <T extends import('../events/events').LogicToRenderEvents | import('../events/events').RenderToLogicEvents>(
  event: T,
  matcher?: (payload: import('../events/events').EventPayload<T>) => boolean,
  options?: { timeout?: number, signal?: any },
) => Promise<import('../events/events').EventPayload<T>>

export abstract class Scene {
  abstract readonly name: string
  abstract init(ctx?: SceneEnterContext): void | Promise<void>
  abstract run(ctx?: SceneEnterContext): void | Promise<void>
  destroy?(): void | Promise<void>
}

export type SceneFactory = () => Scene | Promise<Scene>

export interface SceneEnterContext {
  sceneId: string
  entry?: string
  initialState?: JsonSerializableRecord
  transition?: SceneTransitionIntent
  reason?: string
  choiceId?: string
  target?: ChoiceTarget
  fromScene?: string
  fromPoint?: StoryPoint
  requiredRuntimePackages?: readonly string[]
}

export interface SaveSlot {
  slotId: string
  index: import('@quajs/store').QuaGameSaveSlotIndex
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
  labelId?: string
  entryId?: string
  stepId: string
  lineId?: string
  contentPackageId?: string
  requiredRuntimePackages?: readonly string[]
  scriptModuleId?: string
  scriptModuleVersion?: string
  scriptModuleLocale?: string
}

export type EngineCheckpointKind = 'step' | 'line' | 'choice' | 'manual' | 'save'

export type RollbackBoundaryMode = 'stop' | 'allow'

export type RollbackAnchorReason
  = | 'segment-start'
    | 'interval'
    | 'choice'
    | 'save'
    | 'load'
    | 'runtime-package'
    | 'developer'
    | 'manual'
    | 'line'
    | 'step'
    | 'rollback-origin'

export interface RollbackBoundaryConfig {
  scene: RollbackBoundaryMode
  chapter: RollbackBoundaryMode
}

export interface RollbackCheckpointConfig {
  interval: number
  anchorOn: RollbackAnchorReason[]
}

export interface RollbackForwardConfig {
  preserveFuture: boolean
  truncateOnDivergence: boolean
}

export interface RollbackSaveConfig {
  includeRollbackHistory: boolean
}

export interface RollbackConfig {
  enabled: boolean
  boundary: RollbackBoundaryConfig
  checkpoints: RollbackCheckpointConfig
  forward: RollbackForwardConfig
  saves: RollbackSaveConfig
}

export interface RollbackConfigPatch {
  enabled?: boolean
  boundary?: Partial<RollbackBoundaryConfig>
  checkpoints?: Partial<RollbackCheckpointConfig>
  forward?: Partial<RollbackForwardConfig>
  saves?: Partial<RollbackSaveConfig>
}

export interface RollbackSnapshotSet {
  id: string
  storeSnapshots: Record<string, string>
  createdAt: number
}

export interface RollbackRecordedInput {
  event: string
  payload: unknown
}

export interface RollbackEntry {
  entryIndex: number
  stepId: string
  point: StoryPoint
  segmentId: string
  requiredRuntimePackages: string[]
  inputs: RollbackRecordedInput[]
  replayable: boolean
  decision: boolean
  fixed: boolean
  source?: {
    runtimePackageId?: string
    scriptModuleId?: string
    scriptModuleVersion?: string
    scriptModuleLocale?: string
  }
  metadata?: Record<string, unknown>
}

export interface RollbackAnchor {
  id: string
  entryIndex: number
  replayStartEntryIndex: number
  segmentId: string
  reason: RollbackAnchorReason | string
  replayable?: boolean
  snapshotSet: RollbackSnapshotSet
  checkpointId?: string
  metadata?: Record<string, unknown>
}

export interface RollbackSegment {
  id: string
  startEntryIndex: number
  reason: string
  sceneId?: string
  chapterId?: string
  createdAt: number
  closedAt?: number
}

export interface RollbackJournal {
  entries: RollbackEntry[]
  anchors: RollbackAnchor[]
  segments: RollbackSegment[]
  cursor: number
  liveTail: number
  currentSegmentId?: string
  fixedUntilEntryIndex?: number
}

export type RollbackTarget = number | string | StoryPoint | {
  entryIndex?: number
  stepId?: string
  point?: StoryPoint
}

export interface RollbackTargetInfo {
  entryIndex: number
  stepId: string
  point: StoryPoint
  segmentId: string
  fixed: boolean
  decision: boolean
  requiredRuntimePackages: string[]
}

export interface RollbackNavigationOptions {
  reason?: string
  force?: boolean
}

export interface RollbackContext {
  direction: 'rollback' | 'forward'
  reason?: string
  target: RollbackTargetInfo
  anchor: RollbackAnchor
  replayedEntries: RollbackTargetInfo[]
}

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

export interface ChoiceJumpOptions extends JumpOptions {
  clearChoices?: boolean
  runTarget?: boolean
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
  compatibility?: VersionCompatibility
  priority?: number
  loadedAt: number
  activatedAt?: number
  dependencies: string[]
  scriptModuleIds: string[]
  sceneIds: string[]
  pluginIds: string[]
  migrationIds: string[]
  localePack?: RuntimeLocalePackManifest
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

export interface RuntimeScriptModuleRunFromOptions<TScope = GameStepScope> extends RuntimeScriptModuleRunOptions {
  scope?: TScope
  nodeId?: string
  labelId?: string
  entryId?: string
  stepId?: string
  packageId?: string
}

export interface EnsureLocalePacksOptions {
  targetPackageIds?: string[]
}

export interface SetLocaleOptions extends EnsureLocalePacksOptions {
  ensurePacks?: boolean
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

export interface RuntimePackageRegistryResolveStoryTargetContext {
  engine: QuaEngineInterface
  assets: QuaAssets
  target: ChoiceTarget
  currentPoint?: StoryPoint
  currentSceneId?: string
  activePackageIds: string[]
}

export interface RuntimeLocalePackRegistryResolveContext {
  engine: QuaEngineInterface
  assets: QuaAssets
  locale: string
  activePackageIds: string[]
  targetPackageIds?: string[]
}

export interface RuntimePackageRegistry {
  resolvePackage: (
    packageId: string,
    ctx: RuntimePackageRegistryResolveContext,
  ) => string | RuntimePackageRegistryEntry | undefined | Promise<string | RuntimePackageRegistryEntry | undefined>
  resolveLocalePacks?: (
    locale: string,
    ctx: RuntimeLocalePackRegistryResolveContext,
  ) => Array<string | RuntimePackageRegistryEntry> | undefined | Promise<Array<string | RuntimePackageRegistryEntry> | undefined>
  resolveStoryTarget?: (
    target: ChoiceTarget,
    ctx: RuntimePackageRegistryResolveStoryTargetContext,
  ) => string | RuntimePackageRegistryEntry | Array<string | RuntimePackageRegistryEntry> | undefined | Promise<string | RuntimePackageRegistryEntry | Array<string | RuntimePackageRegistryEntry> | undefined>
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

export interface RuntimeLoadedSceneModule {
  default?: unknown
  Scene?: unknown
  createScene?: unknown
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
  loadSceneModule?: (record: RuntimePackageSceneManifest, ctx: RuntimeModuleLoadContext) => Promise<RuntimeLoadedSceneModule>
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
  appVersion?: string
  project?: EngineProjectInfo
  layout?: ViewLayoutInput
  assets?: QuaAssetsConfig
  store?: {
    persistKey?: string
    enableSnapshots?: boolean
    serializer?: QuaStateSerializer
    storage?: StorageConfig
  }
  rollback?: RollbackConfigPatch
  saves?: {
    maxSlots?: number
    autoSave?: boolean
    autoSaveInterval?: number
    encryptionKey?: string
    preview?: {
      defaults?: SavePreviewOptions
      save?: SavePreviewOptions
      quickSave?: SavePreviewOptions
      autoSave?: SavePreviewOptions
    }
  }
  playtime?: {
    autoStart?: boolean
    pauseOnWindowBlur?: boolean
  }
  runtimeModuleLoader?: RuntimeModuleLoader
  runtimePackageRegistry?: RuntimePackageRegistry
  trustPolicy?: RuntimeTrustPolicy
  debug?: {
    enableLogs?: boolean
    logLevel?: 'debug' | 'info' | 'warn' | 'error'
  }
  flowControl?: FlowControlOptions
  dialogue?: DialogueOptions
}

export interface EngineProjectInfo {
  name: string
  bundleId: string
  version?: string
}

export interface FlowControlOptions extends FlowControlProjectionInput {}

export interface DialogueOptions {
  typewriter?: DialogueTypewriterInput
}

export interface EndGameOptions {
  ending?: string
  title?: string
  message?: string
  reason?: string
  metadata?: Record<string, unknown>
}

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
  revision?: number
  characterId?: string
  characterName?: string
  avatar?: DialogueAvatarProjection
  speaker?: RichTextContent
  speakerStyle?: RichTextStyleProjection
  text: RichTextContent
  mode?: 'say' | 'narration'
  typewriter?: DialogueTypewriterInput
  metadata?: Record<string, unknown>
}

export type DialogueTypewriterInput = boolean | DialogueTypewriterProjection

export interface ChoiceIntent {
  id: string
  text: string
  enabled?: boolean
  target?: ChoiceTarget
  unavailable?: ChoiceUnavailablePolicy
  presentation?: ChoicePresentation
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
  locale: string
  activeLocalePackIds: string[]
  currentScene: string | null
  currentStepId: string | null
  currentStoryPoint?: StoryPoint
  currentCheckpointId?: string
  gameOver?: EngineGameOverState
  sceneHistory: string[]
  stepHistory: string[]
  checkpointHistory: string[]
  runtimePackages: Record<string, RuntimePackageStateRecord>
  appliedRuntimeMigrations: string[]
  playtime: EnginePlaytimeState
}

export interface EngineGameOverState extends Omit<GameOverPayload, 'storyPoint' | 'metadata'> {
  storyPoint?: StoryPoint
  metadata?: Record<string, unknown>
}

export interface EnginePlaytimeState {
  startedAt: number
  elapsedMs: number
  runningSince?: number
  paused: boolean
  pausedAt?: number
  pauseReason?: string
  pauseReasons: string[]
  updatedAt: number
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
      locale: 'default',
      activeLocalePackIds: [],
      currentScene: null,
      currentStepId: null,
      currentStoryPoint: undefined,
      currentCheckpointId: undefined,
      gameOver: undefined,
      sceneHistory: [],
      stepHistory: [],
      checkpointHistory: [],
      runtimePackages: {},
      appliedRuntimeMigrations: [],
      playtime: {
        startedAt: 0,
        elapsedMs: 0,
        paused: true,
        pauseReason: 'not-started',
        pauseReasons: [],
        updatedAt: 0,
      },
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
        host: undefined,
        overlays: {},
      },
      flowControl: createFlowControlProjection(flowControl),
      effects: [],
      animations: [],
      plugins: {},
    },
  }
}
