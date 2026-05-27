import type { QuaStore } from '@quajs/store'
import type { ChoiceIntent, ChoiceJumpOptions, ChoiceTarget, CreateCheckpointOptions, DialogueIntent, EngineReportErrorOptions, EnsureLocalePacksOptions, FlowControlMode, FlowControlPolicy, FlowControlRuntimeOptions, GameStep, GameStepFactory, GameStepScope, GameStepSource, JumpOptions, JumpTarget, LoadSlotOptions, OptionalGameStepFactory, ResolvedStoryAsset, ResolvedStoryJump, RollbackAnchorReason, RollbackConfigPatch, RollbackNavigationOptions, RollbackTarget, RuntimePackageLoadOptions, RuntimePackageStateRecord, RuntimePackageUnloadOptions, RuntimeScriptModuleRecord, RuntimeScriptModuleRunFromOptions, RuntimeScriptModuleRunOptions, SaveToSlotOptions, Scene, SceneEnterContext, SceneFactory, SetLocaleOptions, SlotMetadata, StoryAssetRef, StoryPoint, StoryTargetResolver, TranslateInput, ViewLayoutInput } from '../core/types'
import type { SceneTransitionOptions } from '../managers/scene-manager'
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
export async function loadScene(scene: Scene, transition?: SceneTransitionOptions, enterContext?: SceneEnterContext): Promise<void> {
  return getEngine().loadScene(scene, transition, enterContext)
}

export function registerScene(sceneId: string, factory: SceneFactory): () => void {
  return getEngine().registerScene(sceneId, factory)
}

export async function loadRuntimePackage(source: string, options?: RuntimePackageLoadOptions): Promise<RuntimePackageStateRecord> {
  return getEngine().loadRuntimePackage(source, options)
}

export async function activateRuntimePackage(packageId: string): Promise<RuntimePackageStateRecord> {
  return getEngine().activateRuntimePackage(packageId)
}

export async function unloadRuntimePackage(packageId: string, options?: RuntimePackageUnloadOptions): Promise<void> {
  return getEngine().unloadRuntimePackage(packageId, options)
}

export function getRuntimePackages(): RuntimePackageStateRecord[] {
  return getEngine().getRuntimePackages()
}

export function registerScriptModule(record: RuntimeScriptModuleRecord): void {
  return getEngine().registerScriptModule(record)
}

export async function runScriptModule<TScope>(moduleId: string, scope?: TScope, options?: RuntimeScriptModuleRunOptions): Promise<void> {
  return getEngine().runScriptModule(moduleId, scope, options)
}

export async function runScriptModuleFrom<TScope>(moduleId: string, options?: RuntimeScriptModuleRunFromOptions<TScope>): Promise<void> {
  return getEngine().runScriptModuleFrom(moduleId, options)
}

export function getLocale(): string {
  return getEngine().getLocale()
}

export async function setLocale(locale: string, options?: SetLocaleOptions): Promise<void> {
  return getEngine().setLocale(locale, options)
}

export async function ensureLocalePacks(locale: string, options?: EnsureLocalePacksOptions): Promise<RuntimePackageStateRecord[]> {
  return getEngine().ensureLocalePacks(locale, options)
}

/**
 * Execute a dialogue sequence
 */
export async function dialogue(steps: GameStep[]): Promise<void>
export async function dialogue<TScope>(steps: OptionalGameStepFactory<TScope>, scope?: TScope): Promise<void>
export async function dialogue<TScope>(steps: GameStepFactory<TScope>, scope: TScope): Promise<void>
export async function dialogue<TScope = GameStepScope>(steps: GameStepSource<TScope>, scope?: TScope): Promise<void> {
  return (getEngine().dialogue as (source: GameStepSource<TScope>, scope?: TScope) => Promise<void>)(steps, scope)
}

/**
 * Rewind to a specific step
 */
export async function rewind(stepUUID: string): Promise<void> {
  return getEngine().rewind(stepUUID)
}

export async function jumpToChoice(choiceId: string, options?: ChoiceJumpOptions): Promise<void> {
  return getEngine().jumpToChoice(choiceId, options)
}

export async function resolveStoryTarget(target: ChoiceTarget): Promise<ResolvedStoryJump> {
  return getEngine().resolveStoryTarget(target)
}

export function registerStoryTargetResolver(resolver: StoryTargetResolver): () => void {
  return getEngine().registerStoryTargetResolver(resolver)
}

/**
 * Save game to a slot with metadata
 */
export async function saveToSlot(
  slotId: string,
  metadata?: SlotMetadata,
  options?: SaveToSlotOptions,
): Promise<void> {
  return getEngine().saveToSlot(slotId, metadata, options)
}

/**
 * Load game from a slot
 */
export async function loadFromSlot(slotId: string, options?: LoadSlotOptions): Promise<void> {
  return getEngine().loadFromSlot(slotId, options)
}

export async function quickSave(metadata?: SlotMetadata, options?: SaveToSlotOptions): Promise<void> {
  return getEngine().quickSave(metadata, options)
}

export async function quickLoad(): Promise<void> {
  return getEngine().quickLoad()
}

export async function autoSave(metadata?: SlotMetadata, options?: SaveToSlotOptions): Promise<void> {
  return getEngine().autoSave(metadata, options)
}

export async function listSaveSlots() {
  return getEngine().listSaveSlots()
}

export async function deleteSaveSlot(slotId: string): Promise<void> {
  return getEngine().deleteSaveSlot(slotId)
}

export function getStoryPoint(): StoryPoint | undefined {
  return getEngine().getStoryPoint()
}

export async function setStoryPoint(point: StoryPoint): Promise<void> {
  return getEngine().setStoryPoint(point)
}

export async function createCheckpoint(options?: CreateCheckpointOptions) {
  return getEngine().createCheckpoint(options)
}

export function getCheckpoint(id: string) {
  return getEngine().getCheckpoint(id)
}

export async function jumpTo(target: JumpTarget, options?: JumpOptions): Promise<void> {
  return getEngine().jumpTo(target, options)
}

export function getRollbackConfig() {
  return getEngine().getRollbackConfig()
}

export function setRollbackConfig(patch: RollbackConfigPatch) {
  return getEngine().setRollbackConfig(patch)
}

export function getRollbackTargets() {
  return getEngine().getRollbackTargets()
}

export function canRollback(): boolean {
  return getEngine().canRollback()
}

export function canRollForward(): boolean {
  return getEngine().canRollForward()
}

export async function rollback(target?: RollbackTarget, options?: RollbackNavigationOptions): Promise<void> {
  return getEngine().rollback(target, options)
}

export async function rollForward(target?: RollbackTarget, options?: RollbackNavigationOptions): Promise<void> {
  return getEngine().rollForward(target, options)
}

export async function createRollbackAnchor(reason?: RollbackAnchorReason | string, metadata?: Record<string, unknown>) {
  return getEngine().createRollbackAnchor(reason, metadata)
}

export async function markRollbackBoundary(reason?: string, metadata?: Record<string, unknown>): Promise<void> {
  return getEngine().markRollbackBoundary(reason, metadata)
}

export async function fixRollback(metadata?: Record<string, unknown>): Promise<void> {
  return getEngine().fixRollback(metadata)
}

export function registerRollbackStore(name: string, store: QuaStore): void {
  return getEngine().registerRollbackStore(name, store)
}

export function unregisterRollbackStore(name: string): void {
  return getEngine().unregisterRollbackStore(name)
}

/**
 * Get asset metadata
 */
export async function getAssetMetadata(type: 'audio' | 'images' | 'characters' | 'video' | 'fonts' | 'scripts' | 'data', assetName: string): Promise<any> {
  return getEngine().getAssetMetadata(type, assetName)
}

export async function resolveStoryAssetRef(ref: StoryAssetRef): Promise<ResolvedStoryAsset> {
  return getEngine().resolveStoryAssetRef(ref)
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

export async function translate(key: string, options?: TranslateInput): Promise<string> {
  return getEngine().translate(key, options)
}

export async function t(key: string, options?: TranslateInput): Promise<string> {
  return translate(key, options)
}

export function getViewState() {
  return getEngine().getViewState()
}

export function getFlowControlState() {
  return getEngine().getFlowControlState()
}

export async function setFlowControlOptions(options: FlowControlRuntimeOptions): Promise<void> {
  return getEngine().setFlowControlOptions(options)
}

export async function setFlowControlMode(mode: FlowControlMode): Promise<void> {
  return getEngine().setFlowControlMode(mode)
}

export async function setFlowControlPolicy(policy: FlowControlPolicy): Promise<void> {
  return getEngine().setFlowControlPolicy(policy)
}

export async function resetFlowControlPolicy(): Promise<void> {
  return getEngine().resetFlowControlPolicy()
}

export async function startAuto(): Promise<void> {
  return getEngine().startAuto()
}

export async function stopAuto(): Promise<void> {
  return getEngine().stopAuto()
}

export async function startSkip(): Promise<void> {
  return getEngine().startSkip()
}

export async function stopSkip(): Promise<void> {
  return getEngine().stopSkip()
}

export async function startFastForward(): Promise<void> {
  return getEngine().startFastForward()
}

export async function stopFastForward(): Promise<void> {
  return getEngine().stopFastForward()
}

export async function setLayoutProjection(layout: ViewLayoutInput): Promise<void> {
  return getEngine().setLayoutProjection(layout)
}

export function getPluginProjection<T = unknown>(pluginId: string): T | undefined {
  return getEngine().getPluginProjection<T>(pluginId)
}

export async function setPluginProjection<T = unknown>(pluginId: string, projection?: T): Promise<void> {
  return getEngine().setPluginProjection(pluginId, projection)
}

export function waitFor(event: string, matcher?: (payload: any) => boolean, options?: { timeout?: number, signal?: any }) {
  return getEngine().waitFor(event as any, matcher, options)
}

export async function reportError(error: unknown, options?: EngineReportErrorOptions) {
  return getEngine().reportError(error, options)
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
