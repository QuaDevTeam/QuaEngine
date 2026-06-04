import type {
  EngineContext,
  JsonSerializable,
  JsonSerializableRecord,
  QuaEngineInterface,
  SceneEnterContext,
  SceneTransitionIntent,
  StoryAssetRef,
  StoryPoint,
} from '@quajs/engine'
import type { QuaState } from '@quajs/store'
import type {
  AchievementCondition,
  AchievementCounterRecord,
  AchievementDefinition,
  AchievementDefinitionsInput,
  AchievementDismissNotificationRequestPayload,
  AchievementFallbackTarget,
  AchievementFilterState,
  AchievementGalleryUnlockedCondition,
  AchievementGroupDefinition,
  AchievementGroupProjectionItem,
  AchievementNotificationMode,
  AchievementNotificationOptions,
  AchievementNotificationProjection,
  AchievementOpenOptions,
  AchievementProfileState,
  AchievementProgressOptions,
  AchievementProgressRecord,
  AchievementProjection,
  AchievementProjectionItem,
  AchievementReward,
  AchievementRewardContext,
  AchievementStoryMetadata,
  AchievementStoryMetadataCondition,
  AchievementUnlockGalleryEntriesReward,
  AchievementUnlockOptions,
  AchievementUnlockRecord,
  AchievementUpdateFilterRequestPayload,
} from './contracts'
import { BaseEnginePlugin, releaseUiOverlayHostWithEngine, retainUiOverlayHostWithEngine, Scene } from '@quajs/engine'
import { QuaStore } from '@quajs/store'
import {
  ACHIEVEMENT_COCOS_RENDERER_ENTRY,
  ACHIEVEMENT_METADATA_NAMESPACE,
  ACHIEVEMENT_PLUGIN_ID,
  ACHIEVEMENT_PROFILE_STORE_PREFIX,
  ACHIEVEMENT_SCENE_ID,
  ACHIEVEMENT_TOAST_HOST_SOURCE,
  ACHIEVEMENT_VUE_RENDERER_ENTRY,
  ACHIEVEMENT_WEB_RENDERER_ENTRY,
  AchievementRenderToLogicEvents,
  emitAchievementRenderToLogic,
  onAchievementRenderToLogic,
} from './contracts'
import {
  decorators,
} from './script-compiler'

const DEFAULT_PROFILE_ID = 'default'
const DEFAULT_NOTIFICATION_MODE: AchievementNotificationMode = 'toast'
const DEFAULT_TOAST_DURATION_MS = 3200
const STORY_GRAPH_PLUGIN_ID = 'storyGraph' as const
const ACHIEVEMENT_SETTINGS_SCOPE = '@quajs/plugin-achievement' as const

interface StoryGraphNodeLike {
  id: string
  point: StoryPoint
  metadata?: Readonly<Record<string, unknown>>
}

interface StoryGraphProjectionLike {
  graphs?: Readonly<Record<string, {
    nodes?: readonly StoryGraphNodeLike[]
  }>>
}

interface AchievementProfileStoreState extends QuaState {
  profile: AchievementProfileState
}

interface AchievementProfileRuntime {
  store: QuaStore
  snapshotId: string
  state: AchievementProfileState
}

type AchievementUnlockListener = (
  engine: QuaEngineInterface,
  achievement: AchievementDefinition,
  unlock: AchievementUnlockRecord,
  profileId: string,
) => void | Promise<void>

type AchievementRewardHandler = (
  engine: QuaEngineInterface,
  reward: AchievementReward,
  context: AchievementRewardContext,
) => void | Promise<void>

interface AchievementDeveloperSettings {
  defaultProfileId: string
  defaultNotificationMode: AchievementNotificationMode
  defaultToastDurationMs: number
}

interface AchievementPlayerSettings {
  notificationMode: AchievementNotificationMode
  toastDurationMs: number
}

interface AchievementRuntimeState {
  defaultProfileId: string
  defaultNotificationMode: AchievementNotificationMode
  defaultToastDurationMs: number
  toastDurationMs: number
  groups: Map<string, AchievementGroupDefinition>
  achievements: Map<string, AchievementDefinition>
  profiles: Map<string, AchievementProfileRuntime>
  unlockListeners: Set<AchievementUnlockListener>
  rewardHandlers: Map<string, Set<AchievementRewardHandler>>
}

interface AchievementProjectionPatch {
  sceneActive?: boolean
  profileId?: string
  selectedGroupId?: string | null
  selectedAchievementId?: string | null
  returnCheckpointId?: string | null
  fallbackTarget?: AchievementFallbackTarget | null
  filter?: AchievementFilterState
  notifications?: readonly AchievementNotificationProjection[]
  notificationMode?: AchievementNotificationMode
}

interface AchievementSceneState {
  profileId?: string
  selectedGroupId?: string
  selectedAchievementId?: string
  returnCheckpointId?: string
  fallbackTarget?: string | StoryPoint
  filter?: AchievementFilterState
}

const achievementRuntimeState = new WeakMap<object, AchievementRuntimeState>()

export {
  ACHIEVEMENT_COCOS_RENDERER_ENTRY,
  ACHIEVEMENT_METADATA_NAMESPACE,
  ACHIEVEMENT_PLUGIN_ID,
  ACHIEVEMENT_PROFILE_STORE_PREFIX,
  ACHIEVEMENT_SCENE_ID,
  ACHIEVEMENT_SETTINGS_SCOPE,
  ACHIEVEMENT_TOAST_HOST_SOURCE,
  ACHIEVEMENT_VUE_RENDERER_ENTRY,
  ACHIEVEMENT_WEB_RENDERER_ENTRY,
  AchievementRenderToLogicEvents,
  emitAchievementRenderToLogic,
  onAchievementRenderToLogic,
}

export type {
  AchievementCondition,
  AchievementCounterRecord,
  AchievementDefinition,
  AchievementDefinitionsInput,
  AchievementDismissNotificationRequestPayload,
  AchievementFallbackTarget,
  AchievementFilterState,
  AchievementGroupDefinition,
  AchievementGroupProjectionItem,
  AchievementMetadataEnvelope,
  AchievementNotificationMode,
  AchievementNotificationOptions,
  AchievementNotificationProjection,
  AchievementOpenOptions,
  AchievementProgressOptions,
  AchievementProgressRecord,
  AchievementProjection,
  AchievementProjectionItem,
  AchievementRenderToLogicEvent,
  AchievementRenderToLogicEventPayloadMap,
  AchievementReward,
  AchievementRewardContext,
  AchievementSelectAchievementRequestPayload,
  AchievementSelectGroupRequestPayload,
  AchievementStoryMetadata,
  AchievementUnlockOptions,
  AchievementUnlockRecord,
  AchievementUpdateFilterRequestPayload,
} from './contracts'

export {
  achievementDecoratorMappings,
  createAchievementDecoratorCompiler,
  scriptCompiler,
} from './script-compiler'

export interface AchievementPluginOptions {
  profileId?: string
  notifications?: AchievementNotificationOptions
}

class AchievementSceneShell extends Scene {
  readonly name = ACHIEVEMENT_SCENE_ID

  constructor(
    private readonly engine: QuaEngineInterface,
    private readonly runtimeState: AchievementRuntimeState,
  ) {
    super()
  }

  override async init(ctx?: SceneEnterContext): Promise<void> {
    await applyAchievementSceneEnterState(this.engine, this.runtimeState, ctx)
  }

  override async run(_ctx?: SceneEnterContext): Promise<void> {}
}

export class AchievementPlugin extends BaseEnginePlugin {
  readonly name = '@quajs/plugin-achievement'
  readonly id = ACHIEVEMENT_PLUGIN_ID
  readonly version = '0.1.0'
  readonly description = 'Persistent achievements, unlock hooks, conditions, rewards, notifications, and dedicated achievement board scene'
  private disposers: Array<() => void> = []
  private unregisterScene?: () => void

  getProjection(): AchievementProjection {
    return getAchievementProjection(this.getEngine())
  }

  getProfile(profileId?: string): AchievementProfileState {
    return getAchievementProfile(this.getEngine(), profileId)
  }

  registerGroup(group: AchievementGroupDefinition): Promise<AchievementGroupDefinition> {
    return registerAchievementGroupWithEngine(this.getEngine(), group)
  }

  registerAchievement(achievement: AchievementDefinition): Promise<AchievementDefinition> {
    return registerAchievementWithEngine(this.getEngine(), achievement)
  }

  registerDefinitions(definitions: AchievementDefinitionsInput): Promise<void> {
    return registerAchievementDefinitionsWithEngine(this.getEngine(), definitions)
  }

  clearRuntimePackage(packageId: string): Promise<void> {
    return removeRuntimePackageAchievementContentWithEngine(this.getEngine(), packageId)
  }

  openBoard(options?: AchievementOpenOptions): Promise<void> {
    return openAchievementBoardWithEngine(this.getEngine(), options)
  }

  closeBoard(): Promise<void> {
    return closeAchievementBoardWithEngine(this.getEngine())
  }

  unlockAchievement(
    achievementId: string | readonly string[],
    options?: AchievementUnlockOptions,
  ): Promise<AchievementProfileState> {
    return unlockAchievementWithEngine(this.getEngine(), achievementId, options)
  }

  unlockAchievements(
    achievementIds: readonly string[],
    options?: AchievementUnlockOptions,
  ): Promise<AchievementProfileState> {
    return unlockAchievementsWithEngine(this.getEngine(), achievementIds, options)
  }

  setProgress(
    achievementId: string,
    value: number,
    options?: AchievementProgressOptions,
  ): Promise<AchievementProfileState> {
    return setAchievementProgressWithEngine(this.getEngine(), achievementId, value, options)
  }

  incrementProgress(
    achievementId: string,
    amount?: number,
    options?: AchievementProgressOptions,
  ): Promise<AchievementProfileState> {
    return incrementAchievementProgressWithEngine(this.getEngine(), achievementId, amount, options)
  }

  setCounter(
    counterId: string,
    value: number,
    options?: AchievementProgressOptions,
  ): Promise<AchievementProfileState> {
    return setAchievementCounterWithEngine(this.getEngine(), counterId, value, options)
  }

  incrementCounter(
    counterId: string,
    amount?: number,
    options?: AchievementProgressOptions,
  ): Promise<AchievementProfileState> {
    return incrementAchievementCounterWithEngine(this.getEngine(), counterId, amount, options)
  }

  hasAchievement(achievementId: string, profileId?: string): boolean {
    return hasAchievementWithEngine(this.getEngine(), achievementId, profileId)
  }

  evaluateCondition(
    condition: AchievementCondition,
    options?: { profileId?: string, point?: StoryPoint },
  ): Promise<boolean> {
    return evaluateAchievementConditionWithEngine(this.getEngine(), condition, options)
  }

  evaluateDefinitions(options?: { profileId?: string }): Promise<void> {
    return evaluateAchievementDefinitionsWithEngine(this.getEngine(), options)
  }

  setNotificationMode(mode: AchievementNotificationMode): Promise<AchievementProjection> {
    return setAchievementNotificationModeWithEngine(this.getEngine(), mode)
  }

  registerRewardHandler(kind: string, handler: AchievementRewardHandler): () => void {
    return registerAchievementRewardHandlerWithEngine(this.getEngine(), kind, handler)
  }

  resetProfile(options?: { profileId?: string }): Promise<AchievementProfileState> {
    return resetAchievementProfileWithEngine(this.getEngine(), options)
  }

  protected override async setup(ctx: EngineContext): Promise<void> {
    const runtimeState = getOrCreateAchievementRuntimeState(
      ctx.engine,
      this.getOptions().profileId || DEFAULT_PROFILE_ID,
      this.getOptions().notifications,
    )
    if (ctx.engine.hasScene(ACHIEVEMENT_SCENE_ID)) {
      throw new Error(`Achievement scene "${ACHIEVEMENT_SCENE_ID}" is already registered.`)
    }

    this.unregisterScene = ctx.engine.registerScene(
      ACHIEVEMENT_SCENE_ID,
      async () => new AchievementSceneShell(ctx.engine, runtimeState),
    )

    await ensureAchievementProfile(
      ctx.engine,
      runtimeState,
      getAchievementProjection(ctx.engine).profileId || runtimeState.defaultProfileId,
    )

    this.disposers.push(onAchievementRenderToLogic(ctx.pipeline, AchievementRenderToLogicEvents.OPEN_BOARD_REQUEST, async (payload) => {
      await openAchievementBoardWithEngine(ctx.engine, payload || {})
    }))
    this.disposers.push(onAchievementRenderToLogic(ctx.pipeline, AchievementRenderToLogicEvents.CLOSE_BOARD_REQUEST, async () => {
      await closeAchievementBoardWithEngine(ctx.engine)
    }))
    this.disposers.push(onAchievementRenderToLogic(ctx.pipeline, AchievementRenderToLogicEvents.SELECT_GROUP_REQUEST, async (payload) => {
      await selectAchievementGroupWithEngine(ctx.engine, payload.groupId)
    }))
    this.disposers.push(onAchievementRenderToLogic(ctx.pipeline, AchievementRenderToLogicEvents.SELECT_ACHIEVEMENT_REQUEST, async (payload) => {
      await selectAchievementWithEngine(ctx.engine, payload.achievementId)
    }))
    this.disposers.push(onAchievementRenderToLogic(ctx.pipeline, AchievementRenderToLogicEvents.UPDATE_FILTER_REQUEST, async (payload) => {
      await updateAchievementFilterWithEngine(ctx.engine, payload)
    }))
    this.disposers.push(onAchievementRenderToLogic(ctx.pipeline, AchievementRenderToLogicEvents.DISMISS_NOTIFICATION_REQUEST, async (payload) => {
      await dismissAchievementNotificationWithEngine(ctx.engine, payload)
    }))

    const settingsDisposer = await registerAchievementSettingsScope(ctx, runtimeState)
    if (settingsDisposer) {
      this.disposers.push(settingsDisposer)
    }

    await rebuildAchievementProjection(ctx.engine, runtimeState, {}, ctx.store)
  }

  override async onStepComplete(ctx: EngineContext): Promise<void> {
    const runtimeState = getAchievementRuntimeState(ctx.engine)
    if (!runtimeState) {
      return
    }
    await applyAchievementMetadataUnlocks(ctx.engine, runtimeState, ctx.engine.getStoryPoint())
    await evaluateAchievementDefinitionsWithEngine(ctx.engine)
  }

  override async onAfterJump(ctx: EngineContext): Promise<void> {
    const runtimeState = getAchievementRuntimeState(ctx.engine)
    if (!runtimeState) {
      return
    }
    await applyAchievementMetadataUnlocks(ctx.engine, runtimeState, ctx.engine.getStoryPoint())
    await evaluateAchievementDefinitionsWithEngine(ctx.engine)
    await rebuildAchievementProjection(ctx.engine, runtimeState, {})
  }

  override async onAfterRollback(ctx: EngineContext): Promise<void> {
    const runtimeState = getAchievementRuntimeState(ctx.engine)
    if (!runtimeState) {
      return
    }
    await rebuildAchievementProjection(ctx.engine, runtimeState, {})
  }

  override async onRuntimePackageUnload(ctx: EngineContext): Promise<void> {
    const packageId = ctx.runtimePackage?.package.id
    if (packageId) {
      await removeRuntimePackageAchievementContentWithEngine(ctx.engine, packageId)
    }
  }

  override async destroy(): Promise<void> {
    while (this.disposers.length > 0) {
      this.disposers.pop()?.()
    }
    this.unregisterScene?.()
    this.unregisterScene = undefined

    if (this.ctx) {
      achievementRuntimeState.delete(getAchievementRuntimeKey(this.ctx.engine))
      await this.ctx.engine.setPluginProjection(ACHIEVEMENT_PLUGIN_ID, undefined)
    }

    await super.destroy?.()
  }

  registerAPIs() {
    return {
      pluginName: this.name,
      apis: [
        { name: 'getProjection', fn: this.getProjection.bind(this), module: this.name },
        { name: 'getProfile', fn: this.getProfile.bind(this), module: this.name },
        { name: 'registerGroup', fn: this.registerGroup.bind(this), module: this.name },
        { name: 'registerAchievement', fn: this.registerAchievement.bind(this), module: this.name },
        { name: 'registerDefinitions', fn: this.registerDefinitions.bind(this), module: this.name },
        { name: 'clearRuntimePackage', fn: this.clearRuntimePackage.bind(this), module: this.name },
        { name: 'openBoard', fn: this.openBoard.bind(this), module: this.name },
        { name: 'closeBoard', fn: this.closeBoard.bind(this), module: this.name },
        { name: 'unlockAchievement', fn: this.unlockAchievement.bind(this), module: this.name },
        { name: 'unlockAchievements', fn: this.unlockAchievements.bind(this), module: this.name },
        { name: 'setProgress', fn: this.setProgress.bind(this), module: this.name },
        { name: 'incrementProgress', fn: this.incrementProgress.bind(this), module: this.name },
        { name: 'setCounter', fn: this.setCounter.bind(this), module: this.name },
        { name: 'incrementCounter', fn: this.incrementCounter.bind(this), module: this.name },
        { name: 'hasAchievement', fn: this.hasAchievement.bind(this), module: this.name },
        { name: 'evaluateCondition', fn: this.evaluateCondition.bind(this), module: this.name },
        { name: 'evaluateDefinitions', fn: this.evaluateDefinitions.bind(this), module: this.name },
        { name: 'setNotificationMode', fn: this.setNotificationMode.bind(this), module: this.name },
        { name: 'registerRewardHandler', fn: this.registerRewardHandler.bind(this), module: this.name },
        { name: 'resetProfile', fn: this.resetProfile.bind(this), module: this.name },
      ],
      decorators,
    }
  }

  private getOptions(): AchievementPluginOptions {
    return this.options as AchievementPluginOptions
  }
}

export function defineAchievement(definition: AchievementDefinition): AchievementDefinition {
  return definition
}

export function defineAchievementGroup(definition: AchievementGroupDefinition): AchievementGroupDefinition {
  return definition
}

export const achievementCondition = {
  all: (...conditions: AchievementCondition[]): AchievementCondition => ({ kind: 'all', conditions }),
  any: (...conditions: AchievementCondition[]): AchievementCondition => ({ kind: 'any', conditions }),
  not: (condition: AchievementCondition): AchievementCondition => ({ kind: 'not', condition }),
  achievementUnlocked: (achievementId: string): AchievementCondition => ({ kind: 'achievement-unlocked', achievementId }),
  galleryUnlocked: (entryId: string): AchievementCondition => ({ kind: 'gallery-unlocked', entryId }),
  progressAtLeast: (achievementId: string, value: number): AchievementCondition => ({ kind: 'progress-at-least', achievementId, value }),
  counterAtLeast: (counterId: string, value: number): AchievementCondition => ({ kind: 'counter-at-least', counterId, value }),
  runtimePackageActive: (packageId: string): AchievementCondition => ({ kind: 'runtime-package-active', packageId }),
  storyPoint: (point: Partial<StoryPoint>): AchievementCondition => ({ kind: 'story-point', point }),
  storyMetadata: (condition: Omit<AchievementStoryMetadataCondition, 'kind'>): AchievementCondition => ({ kind: 'story-metadata', ...condition }),
} as const

export const achievementReward = {
  unlockGalleryEntries: (entryIds: readonly string[] | string, options: { profileId?: string } = {}): AchievementReward => ({
    kind: 'unlock-gallery-entries',
    entryIds: Array.isArray(entryIds) ? entryIds : [entryIds],
    profileId: options.profileId,
  }),
  unlockAchievements: (achievementIds: readonly string[] | string): AchievementReward => ({
    kind: 'unlock-achievements',
    achievementIds: Array.isArray(achievementIds) ? achievementIds : [achievementIds],
  }),
  openBoard: (options: AchievementOpenOptions = {}): AchievementReward => ({
    kind: 'open-achievement-board',
    options,
  }),
  custom: (kind: string, data?: JsonSerializable): AchievementReward => ({
    kind,
    data,
  }),
} as const

export function onAchievementUnlocked(
  engine: QuaEngineInterface,
  listener: AchievementUnlockListener,
): () => void {
  const runtimeState = getRequiredAchievementRuntimeState(engine)
  runtimeState.unlockListeners.add(listener)
  return () => runtimeState.unlockListeners.delete(listener)
}

export function getAchievementProjection(engine: QuaEngineInterface): AchievementProjection {
  const runtimeState = getAchievementRuntimeState(engine)
  const projection = engine.getPluginProjection<AchievementProjection>(ACHIEVEMENT_PLUGIN_ID)
  return cloneAchievementProjection(projection || createInitialAchievementProjection(
    runtimeState?.defaultProfileId || DEFAULT_PROFILE_ID,
    runtimeState?.defaultNotificationMode || DEFAULT_NOTIFICATION_MODE,
  ))
}

export function getAchievementProfile(engine: QuaEngineInterface, profileId?: string): AchievementProfileState {
  const runtimeState = getAchievementRuntimeState(engine)
  const resolvedProfileId = trimNonEmpty(profileId)
    || getAchievementProjection(engine).profileId
    || runtimeState?.defaultProfileId
    || DEFAULT_PROFILE_ID
  const profile = runtimeState?.profiles.get(resolvedProfileId)?.state
  return cloneAchievementProfileState(profile || createEmptyAchievementProfile(resolvedProfileId))
}

export async function registerAchievementGroupWithEngine(
  engine: QuaEngineInterface,
  group: AchievementGroupDefinition,
): Promise<AchievementGroupDefinition> {
  const runtimeState = getRequiredAchievementRuntimeState(engine)
  const normalized = normalizeAchievementGroupDefinition(engine, group)
  runtimeState.groups.set(normalized.id, normalized)
  await rebuildAchievementProjection(engine, runtimeState, {})
  return cloneAchievementGroupDefinition(normalized)
}

export async function registerAchievementWithEngine(
  engine: QuaEngineInterface,
  achievement: AchievementDefinition,
): Promise<AchievementDefinition> {
  const runtimeState = getRequiredAchievementRuntimeState(engine)
  const normalized = normalizeAchievementDefinition(engine, achievement)
  assertAchievementGroupExists(runtimeState, normalized.groupId, normalized.id)
  runtimeState.achievements.set(normalized.id, normalized)
  await rebuildAchievementProjection(engine, runtimeState, {})
  await evaluateAchievementDefinitionsWithEngine(engine)
  return cloneAchievementDefinition(normalized)
}

export async function registerAchievementDefinitionsWithEngine(
  engine: QuaEngineInterface,
  definitions: AchievementDefinitionsInput,
): Promise<void> {
  const runtimeState = getRequiredAchievementRuntimeState(engine)
  const groups = (definitions.groups || []).map(group => normalizeAchievementGroupDefinition(engine, group))
  const achievements = (definitions.achievements || []).map(achievement => normalizeAchievementDefinition(engine, achievement))
  groups.forEach((group) => {
    runtimeState.groups.set(group.id, group)
  })
  achievements.forEach((achievement) => {
    assertAchievementGroupExists(runtimeState, achievement.groupId, achievement.id)
    runtimeState.achievements.set(achievement.id, achievement)
  })
  await rebuildAchievementProjection(engine, runtimeState, {})
  await evaluateAchievementDefinitionsWithEngine(engine)
}

export async function removeRuntimePackageAchievementContentWithEngine(
  engine: QuaEngineInterface,
  packageId: string,
): Promise<void> {
  const runtimeState = getRequiredAchievementRuntimeState(engine)
  const removedGroupIds = new Set<string>()
  let changed = false

  for (const [groupId, group] of runtimeState.groups.entries()) {
    if (achievementGroupRequiresRuntimePackage(group, packageId)) {
      runtimeState.groups.delete(groupId)
      removedGroupIds.add(groupId)
      changed = true
    }
  }

  for (const [achievementId, achievement] of runtimeState.achievements.entries()) {
    if (removedGroupIds.has(achievement.groupId || '') || achievementRequiresRuntimePackage(achievement, packageId)) {
      runtimeState.achievements.delete(achievementId)
      changed = true
    }
  }

  const current = getAchievementProjection(engine)
  const notifications = current.notifications.filter(notification => !achievementNotificationRequiresRuntimePackage(notification, packageId))
  const notificationsChanged = notifications.length !== current.notifications.length

  if (changed || notificationsChanged) {
    await rebuildAchievementProjection(engine, runtimeState, notificationsChanged ? { notifications } : {})
  }
}

export async function openAchievementBoardWithEngine(
  engine: QuaEngineInterface,
  options: AchievementOpenOptions = {},
): Promise<void> {
  const runtimeState = getRequiredAchievementRuntimeState(engine)
  const current = getAchievementProjection(engine)
  const profileId = trimNonEmpty(options.profileId) || current.profileId || runtimeState.defaultProfileId
  await ensureAchievementProfile(engine, runtimeState, profileId)

  if (engine.getCurrentSceneName() === ACHIEVEMENT_SCENE_ID) {
    await rebuildAchievementProjection(engine, runtimeState, {
      sceneActive: true,
      profileId,
      selectedGroupId: options.groupId ?? undefined,
      selectedAchievementId: options.achievementId ?? undefined,
      fallbackTarget: options.fallbackTarget === undefined ? undefined : normalizeAchievementFallbackTarget(options.fallbackTarget) || null,
      filter: options.filter ? normalizeAchievementFilterState(options.filter) : current.filter,
    })
    return
  }

  const checkpoint = await createAchievementReturnCheckpoint(engine)
  await rebuildAchievementProjection(engine, runtimeState, {
    sceneActive: true,
    profileId,
    selectedGroupId: options.groupId ?? undefined,
    selectedAchievementId: options.achievementId ?? undefined,
    returnCheckpointId: checkpoint.id,
    fallbackTarget: options.fallbackTarget === undefined ? undefined : normalizeAchievementFallbackTarget(options.fallbackTarget) || null,
    filter: options.filter ? normalizeAchievementFilterState(options.filter) : current.filter,
  })

  const projection = getAchievementProjection(engine)
  const enterContext: SceneEnterContext = {
    sceneId: ACHIEVEMENT_SCENE_ID,
    initialState: createAchievementSceneState(projection) as JsonSerializableRecord,
    reason: options.reason || 'achievement-open',
    fromScene: engine.getCurrentSceneName(),
    fromPoint: engine.getStoryPoint(),
    transition: options.transition,
    requiredRuntimePackages: projection.requiredRuntimePackages,
  }

  await getSceneLoader(engine).loadScene(
    new AchievementSceneShell(engine, runtimeState),
    options.transition,
    enterContext,
  )
}

export async function closeAchievementBoardWithEngine(engine: QuaEngineInterface): Promise<void> {
  const runtimeState = getRequiredAchievementRuntimeState(engine)
  const projection = getAchievementProjection(engine)
  if (!isAchievementSceneOpen(engine, projection)) {
    return
  }

  if (projection.returnCheckpointId) {
    const checkpoint = engine.getCheckpoint(projection.returnCheckpointId)
    if (checkpoint) {
      await engine.jumpTo(checkpoint, { reason: 'achievement', resume: 'pause' })
      return
    }
  }

  if (projection.fallbackTarget) {
    await rebuildAchievementProjection(engine, runtimeState, {
      sceneActive: false,
      returnCheckpointId: null,
    })
    await engine.jumpTo(cloneAchievementFallbackTarget(projection.fallbackTarget)!, { reason: 'achievement', resume: 'pause' })
    return
  }

  await rebuildAchievementProjection(engine, runtimeState, {
    sceneActive: false,
    returnCheckpointId: null,
  })
}

export async function unlockAchievementWithEngine(
  engine: QuaEngineInterface,
  achievementId: string | readonly string[],
  options: AchievementUnlockOptions = {},
): Promise<AchievementProfileState> {
  const ids = Array.isArray(achievementId) ? achievementId : [achievementId]
  return await unlockAchievementsWithEngine(engine, ids, options)
}

export async function unlockAchievementsWithEngine(
  engine: QuaEngineInterface,
  achievementIds: readonly string[],
  options: AchievementUnlockOptions = {},
): Promise<AchievementProfileState> {
  const runtimeState = getRequiredAchievementRuntimeState(engine)
  const projection = getAchievementProjection(engine)
  const profileId = trimNonEmpty(options.profileId)
    || projection.profileId
    || runtimeState.defaultProfileId
  const profile = await ensureAchievementProfile(engine, runtimeState, profileId)
  const unlockedAchievements: Record<string, AchievementUnlockRecord> = {
    ...profile.state.unlockedAchievements,
  }
  const unlockedNow: Array<{ definition: AchievementDefinition, unlock: AchievementUnlockRecord }> = []

  for (const rawAchievementId of achievementIds) {
    const normalizedAchievementId = trimNonEmpty(rawAchievementId)
    if (!normalizedAchievementId || unlockedAchievements[normalizedAchievementId]) {
      continue
    }

    const definition = runtimeState.achievements.get(normalizedAchievementId)
    if (!definition) {
      throw new Error(`Achievement "${normalizedAchievementId}" is not registered.`)
    }
    const notificationMode = resolveUnlockNotificationMode(
      options.notification,
      definition.notification,
      projection.notificationMode,
      runtimeState.defaultNotificationMode,
    )
    const unlock: AchievementUnlockRecord = {
      achievementId: normalizedAchievementId,
      unlockedAt: Date.now(),
      source: trimNonEmpty(options.source),
      contentPackageId: trimNonEmpty(options.contentPackageId) || definition.contentPackageId,
      requiredRuntimePackages: mergeRequiredRuntimePackages(
        options.requiredRuntimePackages,
        definition.requiredRuntimePackages,
      ),
      notificationMode,
    }
    unlockedAchievements[normalizedAchievementId] = unlock
    unlockedNow.push({ definition, unlock })
  }

  if (unlockedNow.length === 0) {
    return cloneAchievementProfileState(profile.state)
  }

  const nextProfile: AchievementProfileState = {
    profileId,
    updatedAt: Date.now(),
    unlockedAchievements,
    progress: profile.state.progress,
    counters: profile.state.counters,
  }
  applyAchievementProfileState(profile, nextProfile)
  await persistAchievementProfile(profile)

  for (const unlocked of unlockedNow) {
    await handleAchievementUnlockEffects(engine, runtimeState, profileId, unlocked.definition, unlocked.unlock, options.notification)
  }

  await rebuildAchievementProjection(engine, runtimeState, { profileId })
  await evaluateAchievementDefinitionsWithEngine(engine)
  return cloneAchievementProfileState(nextProfile)
}

export async function setAchievementProgressWithEngine(
  engine: QuaEngineInterface,
  achievementId: string,
  value: number,
  options: AchievementProgressOptions = {},
): Promise<AchievementProfileState> {
  const runtimeState = getRequiredAchievementRuntimeState(engine)
  const profile = await resolveAchievementProfileForUpdate(engine, runtimeState, options.profileId)
  const definition = runtimeState.achievements.get(achievementId)
  const nextValue = Math.max(0, Number.isFinite(value) ? value : 0)
  const progress: Record<string, AchievementProgressRecord> = {
    ...profile.state.progress,
    [achievementId]: {
      achievementId,
      value: nextValue,
      maxValue: definition?.maxProgress,
      updatedAt: Date.now(),
    },
  }
  const nextProfile: AchievementProfileState = {
    ...profile.state,
    updatedAt: Date.now(),
    progress,
  }
  applyAchievementProfileState(profile, nextProfile)
  await persistAchievementProfile(profile)
  await rebuildAchievementProjection(engine, runtimeState, { profileId: profile.state.profileId })
  await evaluateAchievementDefinitionsWithEngine(engine)
  return cloneAchievementProfileState(nextProfile)
}

export async function incrementAchievementProgressWithEngine(
  engine: QuaEngineInterface,
  achievementId: string,
  amount = 1,
  options: AchievementProgressOptions = {},
): Promise<AchievementProfileState> {
  const current = getAchievementProfile(engine, options.profileId).progress[achievementId]?.value || 0
  return await setAchievementProgressWithEngine(engine, achievementId, current + amount, options)
}

export async function setAchievementCounterWithEngine(
  engine: QuaEngineInterface,
  counterId: string,
  value: number,
  options: AchievementProgressOptions = {},
): Promise<AchievementProfileState> {
  const runtimeState = getRequiredAchievementRuntimeState(engine)
  const profile = await resolveAchievementProfileForUpdate(engine, runtimeState, options.profileId)
  const nextValue = Math.max(0, Number.isFinite(value) ? value : 0)
  const counters: Record<string, AchievementCounterRecord> = {
    ...profile.state.counters,
    [counterId]: {
      counterId,
      value: nextValue,
      updatedAt: Date.now(),
    },
  }
  const nextProfile: AchievementProfileState = {
    ...profile.state,
    updatedAt: Date.now(),
    counters,
  }
  applyAchievementProfileState(profile, nextProfile)
  await persistAchievementProfile(profile)
  await rebuildAchievementProjection(engine, runtimeState, { profileId: profile.state.profileId })
  await evaluateAchievementDefinitionsWithEngine(engine)
  return cloneAchievementProfileState(nextProfile)
}

export async function incrementAchievementCounterWithEngine(
  engine: QuaEngineInterface,
  counterId: string,
  amount = 1,
  options: AchievementProgressOptions = {},
): Promise<AchievementProfileState> {
  const current = getAchievementProfile(engine, options.profileId).counters[counterId]?.value || 0
  return await setAchievementCounterWithEngine(engine, counterId, current + amount, options)
}

export function hasAchievementWithEngine(
  engine: QuaEngineInterface,
  achievementId: string,
  profileId?: string,
): boolean {
  return Boolean(getAchievementProfile(engine, profileId).unlockedAchievements[achievementId])
}

export async function evaluateAchievementConditionWithEngine(
  engine: QuaEngineInterface,
  condition: AchievementCondition,
  options: { profileId?: string, point?: StoryPoint } = {},
): Promise<boolean> {
  const profile = getAchievementProfile(engine, options.profileId)

  switch (condition.kind) {
    case 'all':
      for (const item of condition.conditions) {
        if (!(await evaluateAchievementConditionWithEngine(engine, item, options))) {
          return false
        }
      }
      return true
    case 'any':
      for (const item of condition.conditions) {
        if (await evaluateAchievementConditionWithEngine(engine, item, options)) {
          return true
        }
      }
      return false
    case 'not':
      return !(await evaluateAchievementConditionWithEngine(engine, condition.condition, options))
    case 'achievement-unlocked':
      return Boolean(profile.unlockedAchievements[condition.achievementId])
    case 'gallery-unlocked':
      return await isGalleryEntryUnlocked(engine, condition, options.profileId)
    case 'progress-at-least':
      return (profile.progress[condition.achievementId]?.value || 0) >= condition.value
    case 'counter-at-least':
      return (profile.counters[condition.counterId]?.value || 0) >= condition.value
    case 'runtime-package-active':
      return engine.getRuntimePackages().some(pkg => pkg.id === condition.packageId && pkg.state === 'active')
    case 'story-point':
      return storyPointSatisfies(options.point || engine.getStoryPoint(), condition.point)
    case 'story-metadata':
      return storyMetadataConditionMatches(engine, condition, options.point)
    default:
      return false
  }
}

export async function evaluateAchievementDefinitionsWithEngine(
  engine: QuaEngineInterface,
  options: { profileId?: string } = {},
): Promise<void> {
  const runtimeState = getRequiredAchievementRuntimeState(engine)
  let changed = true

  while (changed) {
    changed = false
    const profile = getAchievementProfile(engine, options.profileId)
    for (const achievement of runtimeState.achievements.values()) {
      if (profile.unlockedAchievements[achievement.id]) {
        continue
      }

      const progressValue = profile.progress[achievement.id]?.value || 0
      if (achievement.maxProgress && !achievement.unlockWhen && progressValue >= achievement.maxProgress) {
        const nextProfile = await unlockAchievementsWithEngine(engine, [achievement.id], { source: 'progress', profileId: profile.profileId })
        if (nextProfile.unlockedAchievements[achievement.id]) {
          changed = true
          break
        }
      }

      if (achievement.unlockWhen && await evaluateAchievementConditionWithEngine(engine, achievement.unlockWhen, { profileId: profile.profileId })) {
        const nextProfile = await unlockAchievementsWithEngine(engine, [achievement.id], { source: 'condition', profileId: profile.profileId })
        if (nextProfile.unlockedAchievements[achievement.id]) {
          changed = true
          break
        }
      }
    }
  }
}

export async function setAchievementNotificationModeWithEngine(
  engine: QuaEngineInterface,
  mode: AchievementNotificationMode,
): Promise<AchievementProjection> {
  const runtimeState = getRequiredAchievementRuntimeState(engine)
  const normalizedMode = normalizeNotificationMode(mode, runtimeState.defaultNotificationMode)
  try {
    const settings = await import('@quajs/plugin-settings')
    const bridge = settings.getSettingsBridge(engine)
    if (bridge?.getPlayerValues(ACHIEVEMENT_SETTINGS_SCOPE)) {
      const result = await bridge.updatePlayerValues(ACHIEVEMENT_SETTINGS_SCOPE, {
        notificationMode: normalizedMode,
      })
      if (!result.ok) {
        throw new Error(result.errors?.[0]?.message || 'Failed to update achievement notification settings.')
      }
      return getAchievementProjection(engine)
    }
  }
  catch (error) {
    if (!isOptionalPluginUnavailableError(error, '@quajs/plugin-settings')) {
      throw error
    }
  }
  return await rebuildAchievementProjection(engine, runtimeState, {
    notificationMode: normalizedMode,
  })
}

export function registerAchievementRewardHandlerWithEngine(
  engine: QuaEngineInterface,
  kind: string,
  handler: AchievementRewardHandler,
): () => void {
  const runtimeState = getRequiredAchievementRuntimeState(engine)
  const set = runtimeState.rewardHandlers.get(kind) || new Set<AchievementRewardHandler>()
  set.add(handler)
  runtimeState.rewardHandlers.set(kind, set)
  return () => {
    const current = runtimeState.rewardHandlers.get(kind)
    current?.delete(handler)
    if (current && current.size === 0) {
      runtimeState.rewardHandlers.delete(kind)
    }
  }
}

export async function resetAchievementProfileWithEngine(
  engine: QuaEngineInterface,
  options: { profileId?: string } = {},
): Promise<AchievementProfileState> {
  const runtimeState = getRequiredAchievementRuntimeState(engine)
  const profileId = trimNonEmpty(options.profileId)
    || getAchievementProjection(engine).profileId
    || runtimeState.defaultProfileId
  const profile = await ensureAchievementProfile(engine, runtimeState, profileId)
  const nextProfile = createEmptyAchievementProfile(profileId)
  applyAchievementProfileState(profile, nextProfile)
  await persistAchievementProfile(profile)
  await dismissAchievementNotificationWithEngine(engine, {})
  await rebuildAchievementProjection(engine, runtimeState, { profileId })
  return cloneAchievementProfileState(nextProfile)
}

export const metadata = {
  name: '@quajs/plugin-achievement',
  version: '0.1.0',
  description: 'Persistent achievements, conditions, rewards, and scene-hosted notifications for QuaEngine',
  category: 'system',
} as const

export const Plugin = AchievementPlugin
export { decorators }

async function selectAchievementGroupWithEngine(engine: QuaEngineInterface, groupId?: string): Promise<void> {
  const runtimeState = getRequiredAchievementRuntimeState(engine)
  await rebuildAchievementProjection(engine, runtimeState, {
    selectedGroupId: trimNonEmpty(groupId) || null,
    selectedAchievementId: null,
  })
}

async function selectAchievementWithEngine(engine: QuaEngineInterface, achievementId?: string): Promise<void> {
  const runtimeState = getRequiredAchievementRuntimeState(engine)
  const normalizedAchievementId = trimNonEmpty(achievementId)
  const groupId = normalizedAchievementId
    ? runtimeState.achievements.get(normalizedAchievementId)?.groupId || null
    : null
  await rebuildAchievementProjection(engine, runtimeState, {
    selectedGroupId: groupId,
    selectedAchievementId: normalizedAchievementId || null,
  })
}

async function updateAchievementFilterWithEngine(
  engine: QuaEngineInterface,
  payload: AchievementUpdateFilterRequestPayload,
): Promise<void> {
  const runtimeState = getRequiredAchievementRuntimeState(engine)
  const current = getAchievementProjection(engine)
  const nextFilter = payload.replace
    ? normalizeAchievementFilterState(payload.filter)
    : normalizeAchievementFilterState({
        ...current.filter,
        ...payload.filter,
      })
  await rebuildAchievementProjection(engine, runtimeState, {
    filter: nextFilter,
    selectedAchievementId: null,
  })
}

async function dismissAchievementNotificationWithEngine(
  engine: QuaEngineInterface,
  payload: AchievementDismissNotificationRequestPayload,
): Promise<void> {
  const runtimeState = getRequiredAchievementRuntimeState(engine)
  const current = getAchievementProjection(engine)
  const notifications = current.notifications.filter((notification) => {
    if (payload.notificationId) {
      return notification.id !== payload.notificationId
    }
    if (payload.achievementId) {
      return notification.achievementId !== payload.achievementId
    }
    return false
  })
  const nextNotifications = payload.notificationId || payload.achievementId
    ? notifications
    : current.notifications.slice(1)

  await rebuildAchievementProjection(engine, runtimeState, {
    notifications: nextNotifications,
  })
  if (nextNotifications.length === 0) {
    await releaseUiOverlayHostWithEngine(engine, ACHIEVEMENT_TOAST_HOST_SOURCE, {
      reason: 'achievement-toast-dismiss',
    }).catch(() => {})
  }
}

async function handleAchievementUnlockEffects(
  engine: QuaEngineInterface,
  runtimeState: AchievementRuntimeState,
  profileId: string,
  definition: AchievementDefinition,
  unlock: AchievementUnlockRecord,
  notificationOverride?: AchievementNotificationOptions,
): Promise<void> {
  const notificationMode = resolveUnlockNotificationMode(
    notificationOverride,
    definition.notification,
    getAchievementProjection(engine).notificationMode,
    runtimeState.defaultNotificationMode,
  )

  if (notificationMode === 'toast') {
    await enqueueAchievementToast(engine, runtimeState, definition, unlock)
  }
  else if (notificationMode === 'board') {
    await openAchievementBoardWithEngine(engine, {
      profileId,
      groupId: definition.groupId,
      achievementId: definition.id,
      reason: 'achievement-unlock',
    })
  }

  for (const reward of definition.rewards || []) {
    await applyAchievementReward(engine, runtimeState, reward, {
      achievement: definition,
      unlock,
      profileId,
    })
  }

  await rebuildAchievementProjection(engine, runtimeState, { profileId })

  for (const listener of runtimeState.unlockListeners) {
    await listener(engine, definition, unlock, profileId)
  }
}

async function enqueueAchievementToast(
  engine: QuaEngineInterface,
  runtimeState: AchievementRuntimeState,
  definition: AchievementDefinition,
  unlock: AchievementUnlockRecord,
): Promise<void> {
  const current = getAchievementProjection(engine)
  const durationMs = normalizeDurationMs(
    definition.notification?.durationMs,
    runtimeState.toastDurationMs,
  )
  const notification: AchievementNotificationProjection = {
    id: `achievement-toast:${definition.id}:${unlock.unlockedAt}`,
    achievementId: definition.id,
    title: definition.title,
    summary: definition.summary,
    mode: 'toast',
    durationMs,
    createdAt: Date.now(),
    icon: definition.icon ? cloneStoryAssetRef(definition.icon) : undefined,
    sound: definition.sound ? cloneStoryAssetRef(definition.sound) : undefined,
    contentPackageId: definition.contentPackageId,
    requiredRuntimePackages: definition.requiredRuntimePackages ? [...definition.requiredRuntimePackages] : undefined,
  }
  await retainUiOverlayHostWithEngine(engine, ACHIEVEMENT_TOAST_HOST_SOURCE, {
    reason: 'achievement-toast',
  }).catch(() => {})
  await rebuildAchievementProjection(engine, runtimeState, {
    notifications: [...current.notifications, notification],
  })
}

async function applyAchievementReward(
  engine: QuaEngineInterface,
  runtimeState: AchievementRuntimeState,
  reward: AchievementReward,
  context: AchievementRewardContext,
): Promise<void> {
  if (reward.kind === 'unlock-gallery-entries') {
    const galleryReward = reward as AchievementUnlockGalleryEntriesReward
    try {
      const gallery = await import('@quajs/plugin-gallery')
      await gallery.unlockGalleryEntryWithEngine(engine, galleryReward.entryIds, {
        profileId: galleryReward.profileId || context.profileId,
        source: `achievement:${context.achievement.id}`,
        contentPackageId: context.achievement.contentPackageId,
        requiredRuntimePackages: context.unlock.requiredRuntimePackages,
      })
    }
    catch (error) {
      if (isOptionalPluginUnavailableError(error, '@quajs/plugin-gallery')) {
        return
      }
      throw error
    }
    return
  }

  if (reward.kind === 'unlock-achievements') {
    await unlockAchievementsWithEngine(engine, (reward as { achievementIds: readonly string[] }).achievementIds, {
      source: `achievement:${context.achievement.id}`,
      profileId: context.profileId,
      notification: { mode: 'none' },
    })
    return
  }

  if (reward.kind === 'open-achievement-board') {
    await openAchievementBoardWithEngine(engine, {
      ...(reward as { options?: AchievementOpenOptions }).options,
      profileId: context.profileId,
      reason: `achievement:${context.achievement.id}`,
    })
    return
  }

  const handlers = runtimeState.rewardHandlers.get(reward.kind)
  if (!handlers || handlers.size === 0) {
    return
  }
  for (const handler of handlers) {
    await handler(engine, reward, context)
  }
}

async function isGalleryEntryUnlocked(
  engine: QuaEngineInterface,
  condition: AchievementGalleryUnlockedCondition,
  profileId?: string,
): Promise<boolean> {
  try {
    const gallery = await import('@quajs/plugin-gallery')
    return Boolean(gallery.getGalleryProfile(engine, profileId).unlockedEntries[condition.entryId])
  }
  catch (error) {
    if (isOptionalPluginUnavailableError(error, '@quajs/plugin-gallery')) {
      return false
    }
    throw error
  }
}

function storyMetadataConditionMatches(
  engine: QuaEngineInterface,
  condition: AchievementStoryMetadataCondition,
  point?: StoryPoint,
): boolean {
  const metadataContext = resolveCurrentAchievementMetadataContext(engine, point)
  if (!metadataContext?.rawMetadata) {
    return false
  }
  const namespace = trimNonEmpty(condition.namespace)
  const root = namespace
    ? metadataContext.rawMetadata[namespace]
    : metadataContext.rawMetadata
  const value = readNestedValue(root, condition.keyPath)
  if (condition.equals !== undefined) {
    return deepEqualJsonSerializable(value, condition.equals)
  }
  if (condition.includes !== undefined) {
    const includes = Array.isArray(condition.includes) ? condition.includes : [condition.includes]
    if (Array.isArray(value)) {
      return includes.every(item => value.includes(item))
    }
    if (typeof value === 'string') {
      return includes.every(item => value.includes(item))
    }
    return false
  }
  return value !== undefined
}

function storyPointSatisfies(current: StoryPoint | undefined, expected: Partial<StoryPoint>): boolean {
  if (!current) {
    return false
  }
  return Object.entries(expected).every(([key, value]) => {
    if (value === undefined) {
      return true
    }
    return (current as unknown as Record<string, unknown>)[key] === value
  })
}

async function applyAchievementMetadataUnlocks(
  engine: QuaEngineInterface,
  runtimeState: AchievementRuntimeState,
  point?: StoryPoint,
): Promise<void> {
  const metadataContext = resolveCurrentAchievementMetadataContext(engine, point)
  if (!metadataContext?.metadata) {
    return
  }

  const unlockIds = extractAchievementUnlockIds(metadataContext.metadata)
  if (unlockIds.length === 0) {
    return
  }

  await unlockAchievementsWithEngine(engine, unlockIds, {
    source: 'metadata',
    notification: { mode: 'none' },
    contentPackageId: metadataContext.contentPackageId,
    requiredRuntimePackages: metadataContext.requiredRuntimePackages,
  })
  await rebuildAchievementProjection(engine, runtimeState, {})
}

async function applyAchievementSceneEnterState(
  engine: QuaEngineInterface,
  runtimeState: AchievementRuntimeState,
  ctx?: SceneEnterContext,
): Promise<void> {
  const initialState = isAchievementSceneState(ctx?.initialState) ? ctx.initialState : undefined
  if (!initialState) {
    await rebuildAchievementProjection(engine, runtimeState, { sceneActive: true })
    return
  }

  const profileId = trimNonEmpty(initialState.profileId)
  if (profileId) {
    await ensureAchievementProfile(engine, runtimeState, profileId)
  }

  await rebuildAchievementProjection(engine, runtimeState, {
    sceneActive: true,
    profileId,
    selectedGroupId: trimNonEmpty(initialState.selectedGroupId) || null,
    selectedAchievementId: trimNonEmpty(initialState.selectedAchievementId) || null,
    returnCheckpointId: trimNonEmpty(initialState.returnCheckpointId) || null,
    fallbackTarget: initialState.fallbackTarget === undefined
      ? undefined
      : normalizeAchievementFallbackTarget(initialState.fallbackTarget) || null,
    filter: initialState.filter ? normalizeAchievementFilterState(initialState.filter) : undefined,
  })
}

async function ensureAchievementProfile(
  engine: QuaEngineInterface,
  runtimeState: AchievementRuntimeState,
  profileId: string,
): Promise<AchievementProfileRuntime> {
  const resolvedProfileId = trimNonEmpty(profileId) || runtimeState.defaultProfileId
  const cached = runtimeState.profiles.get(resolvedProfileId)
  if (cached) {
    return cached
  }

  const engineStore = engine.getStore() as unknown as {
    getSerializer: () => unknown
    getStorageManager: () => Promise<unknown>
  }
  const storageManager = await engineStore.getStorageManager()
  const snapshotId = `${ACHIEVEMENT_PROFILE_STORE_PREFIX}${resolvedProfileId}`
  const store = new QuaStore(snapshotId, {
    state: {
      profile: createEmptyAchievementProfile(resolvedProfileId),
    } satisfies AchievementProfileStoreState,
    mutations: {
      setProfile(state: QuaState, payload: AchievementProfileState) {
        ;(state as AchievementProfileStoreState).profile = cloneAchievementProfileState(payload)
      },
    },
    serializer: engineStore.getSerializer() as any,
    storageManager,
  } as any)

  try {
    await store.restore(snapshotId, { force: true })
  }
  catch {
    // Achievement profiles are optional progress persistence. Read failures fall back to in-memory defaults.
  }

  const rawProfile = isAchievementProfileStoreState(store.getState())
    ? store.getState().profile
    : createEmptyAchievementProfile(resolvedProfileId)
  const runtime: AchievementProfileRuntime = {
    store,
    snapshotId,
    state: normalizeAchievementProfileState(rawProfile, resolvedProfileId),
  }
  applyAchievementProfileState(runtime, runtime.state)
  runtimeState.profiles.set(resolvedProfileId, runtime)
  return runtime
}

async function persistAchievementProfile(profile: AchievementProfileRuntime): Promise<void> {
  try {
    await profile.store.snapshot(profile.snapshotId)
  }
  catch {
    // Persistence failures must not prevent unlock/progress state from updating in memory.
  }
}

function applyAchievementProfileState(profile: AchievementProfileRuntime, nextProfile: AchievementProfileState): void {
  profile.state = cloneAchievementProfileState(nextProfile)
  profile.store.commit('setProfile', profile.state)
}

async function resolveAchievementProfileForUpdate(
  engine: QuaEngineInterface,
  runtimeState: AchievementRuntimeState,
  profileId?: string,
): Promise<AchievementProfileRuntime> {
  return await ensureAchievementProfile(
    engine,
    runtimeState,
    trimNonEmpty(profileId) || getAchievementProjection(engine).profileId || runtimeState.defaultProfileId,
  )
}

async function rebuildAchievementProjection(
  engine: QuaEngineInterface,
  runtimeState: AchievementRuntimeState,
  patch: AchievementProjectionPatch,
  preInitStore?: Pick<QuaStore, 'commit'>,
): Promise<AchievementProjection> {
  const current = getAchievementProjection(engine)
  const profileId = trimNonEmpty(patch.profileId)
    || current.profileId
    || runtimeState.defaultProfileId
  const profile = preInitStore
    ? getAchievementProfile(engine, profileId)
    : cloneAchievementProfileState((await ensureAchievementProfile(engine, runtimeState, profileId)).state)
  const groups = Array.from(runtimeState.groups.values())
    .map(group => createAchievementGroupProjectionItem(group, runtimeState.achievements, profile))
    .sort(compareAchievementGroups)
  const achievements = Array.from(runtimeState.achievements.values())
    .map(achievement => createAchievementProjectionItem(achievement, profile))
    .sort(compareAchievementDefinitions)
  const filter = patch.filter ? normalizeAchievementFilterState(patch.filter) : current.filter
  const selectedGroupId = selectAchievementGroupId(groups, achievements, patch.selectedGroupId === null ? undefined : patch.selectedGroupId || current.selectedGroupId)
  const filteredAchievements = filterAchievements(achievements, selectedGroupId, filter)
  const selectedAchievementId = selectAchievementId(
    filteredAchievements,
    patch.selectedAchievementId === null ? undefined : patch.selectedAchievementId || current.selectedAchievementId,
  )
  const sceneActive = patch.sceneActive ?? (engine.getCurrentSceneName() === ACHIEVEMENT_SCENE_ID)
  const notifications = patch.notifications ? patch.notifications.map(cloneAchievementNotification) : current.notifications
  const projection: AchievementProjection = {
    revision: current.revision + 1,
    sceneActive,
    profileId,
    notificationMode: patch.notificationMode || current.notificationMode || runtimeState.defaultNotificationMode,
    groups: sceneActive ? groups.map(cloneAchievementGroupProjectionItem) : [],
    achievements: sceneActive ? achievements.map(cloneAchievementProjectionItem) : [],
    filteredAchievementIds: sceneActive ? filteredAchievements.map(item => item.id) : [],
    selectedGroupId,
    selectedAchievementId,
    returnCheckpointId: patch.returnCheckpointId === null ? undefined : patch.returnCheckpointId || current.returnCheckpointId,
    fallbackTarget: patch.fallbackTarget === null ? undefined : cloneAchievementFallbackTarget(patch.fallbackTarget || current.fallbackTarget),
    notifications,
    requiredRuntimePackages: collectActiveAchievementRequiredRuntimePackages(
      sceneActive,
      groups,
      achievements,
      notifications,
    ),
    filter: cloneAchievementFilterState(filter),
  }
  if (preInitStore) {
    preInitStore.commit('setPluginProjection', {
      pluginId: ACHIEVEMENT_PLUGIN_ID,
      projection,
    })
  }
  else {
    await engine.setPluginProjection(ACHIEVEMENT_PLUGIN_ID, projection)
  }
  return cloneAchievementProjection(projection)
}

function getOrCreateAchievementRuntimeState(
  engine: QuaEngineInterface,
  defaultProfileId: string,
  notifications?: AchievementNotificationOptions,
): AchievementRuntimeState {
  const key = getAchievementRuntimeKey(engine)
  const existing = achievementRuntimeState.get(key)
  if (existing) {
    return existing
  }
  const created: AchievementRuntimeState = {
    defaultProfileId: trimNonEmpty(defaultProfileId) || DEFAULT_PROFILE_ID,
    defaultNotificationMode: normalizeNotificationMode(notifications?.mode, DEFAULT_NOTIFICATION_MODE),
    defaultToastDurationMs: normalizeDurationMs(notifications?.durationMs, DEFAULT_TOAST_DURATION_MS),
    toastDurationMs: normalizeDurationMs(notifications?.durationMs, DEFAULT_TOAST_DURATION_MS),
    groups: new Map(),
    achievements: new Map(),
    profiles: new Map(),
    unlockListeners: new Set(),
    rewardHandlers: new Map(),
  }
  achievementRuntimeState.set(key, created)
  return created
}

async function registerAchievementSettingsScope(
  ctx: EngineContext,
  runtimeState: AchievementRuntimeState,
): Promise<(() => void) | undefined> {
  try {
    const settings = await import('@quajs/plugin-settings')
    const unregister = settings.registerSettingsScope(ctx.engine, {
      scope: ACHIEVEMENT_SETTINGS_SCOPE,
      version: 1,
      title: 'Achievements',
      description: 'Achievement notification behavior and profile defaults.',
      developer: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            defaultProfileId: {
              type: 'string',
              title: 'Default Profile',
              default: runtimeState.defaultProfileId,
            },
            defaultNotificationMode: {
              type: 'string',
              title: 'Default Notification Mode',
              enum: ['none', 'toast', 'board'],
              default: runtimeState.defaultNotificationMode,
            },
            defaultToastDurationMs: {
              type: 'integer',
              title: 'Default Toast Duration',
              minimum: 100,
              maximum: 30000,
              multipleOf: 100,
              default: runtimeState.defaultToastDurationMs,
            },
          },
        },
        defaults: {
          defaultProfileId: DEFAULT_PROFILE_ID,
          defaultNotificationMode: DEFAULT_NOTIFICATION_MODE,
          defaultToastDurationMs: DEFAULT_TOAST_DURATION_MS,
        } satisfies AchievementDeveloperSettings,
        values: {
          defaultProfileId: runtimeState.defaultProfileId,
          defaultNotificationMode: runtimeState.defaultNotificationMode,
          defaultToastDurationMs: runtimeState.defaultToastDurationMs,
        } satisfies AchievementDeveloperSettings,
      },
      player: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            notificationMode: {
              type: 'string',
              title: 'Achievement Notifications',
              enum: ['none', 'toast', 'board'],
              default: runtimeState.defaultNotificationMode,
            },
            toastDurationMs: {
              type: 'integer',
              title: 'Toast Duration',
              minimum: 100,
              maximum: 30000,
              multipleOf: 100,
              default: runtimeState.defaultToastDurationMs,
            },
          },
        },
        defaults: {
          notificationMode: runtimeState.defaultNotificationMode,
          toastDurationMs: runtimeState.defaultToastDurationMs,
        } satisfies AchievementPlayerSettings,
        expose: true,
        ui: {
          label: 'Achievements',
          order: 40,
          groups: {
            notifications: {
              label: 'Notifications',
              order: 0,
            },
          },
          controls: {
            notificationMode: {
              control: 'select',
              group: 'notifications',
              order: 0,
              options: [
                { label: 'None', value: 'none' },
                { label: 'Toast', value: 'toast' },
                { label: 'Open Board', value: 'board' },
              ],
            },
            toastDurationMs: {
              control: 'slider',
              group: 'notifications',
              order: 1,
              min: 100,
              max: 30000,
              step: 100,
            },
          },
        },
      },
      apply: async ({ developer, player }) => {
        runtimeState.defaultProfileId = trimNonEmpty(developer.defaultProfileId) || DEFAULT_PROFILE_ID
        runtimeState.defaultNotificationMode = normalizeNotificationMode(developer.defaultNotificationMode, DEFAULT_NOTIFICATION_MODE)
        runtimeState.defaultToastDurationMs = normalizeDurationMs(developer.defaultToastDurationMs, DEFAULT_TOAST_DURATION_MS)
        runtimeState.toastDurationMs = normalizeDurationMs(player.toastDurationMs, runtimeState.defaultToastDurationMs)
        await rebuildAchievementProjection(ctx.engine, runtimeState, {
          notificationMode: normalizeNotificationMode(player.notificationMode, runtimeState.defaultNotificationMode),
        })
      },
    })
    await settings.getSettingsBridge(ctx.engine)?.rebuildProjection({ reason: 'rebuild', apply: true, persist: false })
    return unregister
  }
  catch (error) {
    if (isOptionalPluginUnavailableError(error, '@quajs/plugin-settings')) {
      return undefined
    }
    throw error
  }
}

function getAchievementRuntimeState(engine: QuaEngineInterface): AchievementRuntimeState | undefined {
  return achievementRuntimeState.get(getAchievementRuntimeKey(engine))
}

function getRequiredAchievementRuntimeState(engine: QuaEngineInterface): AchievementRuntimeState {
  const runtimeState = getAchievementRuntimeState(engine)
  if (!runtimeState) {
    throw new Error('@quajs/plugin-achievement must be installed before achievement APIs can be used.')
  }
  return runtimeState
}

function resolveCurrentAchievementMetadataContext(
  engine: QuaEngineInterface,
  point?: StoryPoint,
): {
  metadata: AchievementStoryMetadata
  rawMetadata?: Readonly<Record<string, unknown>>
  contentPackageId?: string
  requiredRuntimePackages: string[]
} | undefined {
  const currentPoint = point || engine.getStoryPoint()
  if (!currentPoint) {
    return undefined
  }

  const projection = engine.getPluginProjection<StoryGraphProjectionLike>(STORY_GRAPH_PLUGIN_ID)
  const graph = projection?.graphs?.[currentPoint.storyId || DEFAULT_PROFILE_ID]
  const node = findStoryNodeForPoint(graph?.nodes || [], currentPoint)
  const value = node?.metadata?.[ACHIEVEMENT_METADATA_NAMESPACE]
  if (!isAchievementStoryMetadata(value)) {
    return undefined
  }

  return {
    metadata: value,
    rawMetadata: node?.metadata,
    contentPackageId: node?.point.contentPackageId || contentPackageIdFromMetadata(node?.metadata),
    requiredRuntimePackages: mergeRequiredRuntimePackages(
      node?.point.contentPackageId ? [node.point.contentPackageId] : [],
      node?.point.requiredRuntimePackages,
      getRequiredRuntimePackages(node?.metadata),
    ),
  }
}

function findStoryNodeForPoint(nodes: readonly StoryGraphNodeLike[], point: StoryPoint): StoryGraphNodeLike | undefined {
  const candidateIds = [
    point.nodeId,
    point.labelId,
    point.entryId,
    point.stepId,
  ].filter((value): value is string => typeof value === 'string' && value.length > 0)

  for (const id of candidateIds) {
    const match = nodes.find(node => node.id === id)
    if (match) {
      return match
    }
  }

  return nodes.find(node => node.point.stepId === point.stepId)
}

function extractAchievementUnlockIds(metadata?: AchievementStoryMetadata): string[] {
  if (!metadata) {
    return []
  }
  if (typeof metadata.unlock === 'string') {
    return trimNonEmpty(metadata.unlock) ? [metadata.unlock.trim()] : []
  }
  if (!Array.isArray(metadata.unlock)) {
    return []
  }
  return metadata.unlock
    .map(item => trimNonEmpty(item))
    .filter((item): item is string => Boolean(item))
}

function createInitialAchievementProjection(profileId: string, notificationMode: AchievementNotificationMode): AchievementProjection {
  return {
    revision: 0,
    sceneActive: false,
    profileId,
    notificationMode,
    groups: [],
    achievements: [],
    filteredAchievementIds: [],
    notifications: [],
    requiredRuntimePackages: [],
    filter: {},
  }
}

function createEmptyAchievementProfile(profileId: string): AchievementProfileState {
  return {
    profileId,
    updatedAt: 0,
    unlockedAchievements: {},
    progress: {},
    counters: {},
  }
}

function normalizeAchievementProfileState(value: unknown, profileId: string): AchievementProfileState {
  if (!isPlainRecord(value)) {
    return createEmptyAchievementProfile(profileId)
  }

  const unlockedAchievements = isPlainRecord(value.unlockedAchievements)
    ? Object.fromEntries(
        Object.entries(value.unlockedAchievements)
          .filter(([, record]) => isAchievementUnlockRecord(record))
          .map(([achievementId, record]) => [achievementId, cloneAchievementUnlockRecord(record as AchievementUnlockRecord)]),
      )
    : {}
  const progress = isPlainRecord(value.progress)
    ? Object.fromEntries(
        Object.entries(value.progress)
          .filter(([, record]) => isAchievementProgressRecord(record))
          .map(([achievementId, record]) => [achievementId, cloneAchievementProgressRecord(record as AchievementProgressRecord)]),
      )
    : {}
  const counters = isPlainRecord(value.counters)
    ? Object.fromEntries(
        Object.entries(value.counters)
          .filter(([, record]) => isAchievementCounterRecord(record))
          .map(([counterId, record]) => [counterId, cloneAchievementCounterRecord(record as AchievementCounterRecord)]),
      )
    : {}

  return {
    profileId,
    updatedAt: typeof value.updatedAt === 'number' ? value.updatedAt : 0,
    unlockedAchievements,
    progress,
    counters,
  }
}

function createAchievementGroupProjectionItem(
  group: AchievementGroupDefinition,
  achievements: ReadonlyMap<string, AchievementDefinition>,
  profile: AchievementProfileState,
): AchievementGroupProjectionItem {
  const groupAchievements = Array.from(achievements.values()).filter(achievement => achievement.groupId === group.id)
  const unlockedAchievements = groupAchievements.filter(achievement => Boolean(profile.unlockedAchievements[achievement.id])).length
  return {
    ...cloneAchievementGroupDefinition(group),
    totalAchievements: groupAchievements.length,
    unlockedAchievements,
    lockedAchievements: groupAchievements.length - unlockedAchievements,
  }
}

function createAchievementProjectionItem(
  achievement: AchievementDefinition,
  profile: AchievementProfileState,
): AchievementProjectionItem {
  return {
    ...cloneAchievementDefinition(achievement),
    unlocked: Boolean(profile.unlockedAchievements[achievement.id]),
    unlockRecord: profile.unlockedAchievements[achievement.id]
      ? cloneAchievementUnlockRecord(profile.unlockedAchievements[achievement.id]!)
      : undefined,
    progress: profile.progress[achievement.id]
      ? cloneAchievementProgressRecord(profile.progress[achievement.id]!)
      : undefined,
  }
}

function selectAchievementGroupId(
  groups: readonly AchievementGroupProjectionItem[],
  achievements: readonly AchievementProjectionItem[],
  requested?: string,
): string | undefined {
  const available = new Set(groups.map(group => group.id))
  if (requested && available.has(requested)) {
    return requested
  }
  const groupId = achievements.find(achievement => achievement.groupId && available.has(achievement.groupId))?.groupId
  return groupId || groups[0]?.id
}

function filterAchievements(
  achievements: readonly AchievementProjectionItem[],
  selectedGroupId: string | undefined,
  filter: AchievementFilterState,
): AchievementProjectionItem[] {
  const search = filter.search?.toLowerCase()
  return achievements.filter((achievement) => {
    if (selectedGroupId && achievement.groupId !== selectedGroupId) {
      return false
    }
    if (filter.unlockedOnly && !achievement.unlocked) {
      return false
    }
    if (!filter.includeHidden && achievement.hidden && !achievement.unlocked) {
      return false
    }
    if (filter.tags?.length) {
      const tagSet = new Set(achievement.tags || [])
      if (!filter.tags.every(tag => tagSet.has(tag))) {
        return false
      }
    }
    if (search) {
      const haystack = [
        achievement.title,
        achievement.summary,
        achievement.description,
        ...(achievement.tags || []),
      ]
        .filter((value): value is string => typeof value === 'string' && value.length > 0)
        .join(' ')
        .toLowerCase()
      if (!haystack.includes(search)) {
        return false
      }
    }
    return true
  })
}

function selectAchievementId(
  filteredAchievements: readonly AchievementProjectionItem[],
  requested?: string,
): string | undefined {
  if (requested && filteredAchievements.some(achievement => achievement.id === requested)) {
    return requested
  }
  return filteredAchievements[0]?.id
}

function collectActiveAchievementRequiredRuntimePackages(
  sceneActive: boolean,
  groups: readonly AchievementGroupProjectionItem[],
  achievements: readonly AchievementProjectionItem[],
  notifications: readonly AchievementNotificationProjection[],
): string[] {
  const activeGroupPackages = sceneActive ? groups.map(group => group.requiredRuntimePackages) : []
  const activeAchievementPackages = sceneActive
    ? achievements.map(achievement => mergeRequiredRuntimePackages(
        achievement.requiredRuntimePackages,
        achievement.unlockRecord?.contentPackageId ? [achievement.unlockRecord.contentPackageId] : [],
        achievement.unlockRecord?.requiredRuntimePackages,
      ))
    : []

  return mergeRequiredRuntimePackages(
    ...notifications.map(notification => mergeRequiredRuntimePackages(
      notification.contentPackageId ? [notification.contentPackageId] : [],
      notification.requiredRuntimePackages,
    )),
    ...activeGroupPackages,
    ...activeAchievementPackages,
  )
}

function normalizeAchievementGroupDefinition(
  engine: QuaEngineInterface,
  group: AchievementGroupDefinition,
): AchievementGroupDefinition {
  const id = requireNonEmpty(group.id, 'Achievement group id must not be empty.')
  const title = requireNonEmpty(group.title, `Achievement group "${id}" title must not be empty.`)
  const packageId = resolveAchievementContentPackageId(engine, group.contentPackageId, group.metadata)
  const icon = normalizeStoryAssetRef(group.icon, packageId)
  const banner = normalizeStoryAssetRef(group.banner, packageId)
  return {
    id,
    title,
    summary: trimNonEmpty(group.summary),
    description: trimNonEmpty(group.description),
    icon,
    banner,
    order: typeof group.order === 'number' ? group.order : undefined,
    metadata: cloneUnknownRecord(group.metadata),
    contentPackageId: packageId,
    requiredRuntimePackages: mergeRequiredRuntimePackages(
      group.requiredRuntimePackages,
      packageId ? [packageId] : [],
      icon?.runtimePackageId ? [icon.runtimePackageId] : [],
      banner?.runtimePackageId ? [banner.runtimePackageId] : [],
      getRequiredRuntimePackages(group.metadata),
      currentMetadataRuntimePackageDependencies(engine, group.metadata),
    ),
  }
}

function normalizeAchievementDefinition(
  engine: QuaEngineInterface,
  achievement: AchievementDefinition,
): AchievementDefinition {
  const id = requireNonEmpty(achievement.id, 'Achievement id must not be empty.')
  const title = requireNonEmpty(achievement.title, `Achievement "${id}" title must not be empty.`)
  const packageId = resolveAchievementContentPackageId(engine, achievement.contentPackageId, achievement.metadata)
  const icon = normalizeStoryAssetRef(achievement.icon, packageId)
  const banner = normalizeStoryAssetRef(achievement.banner, packageId)
  const background = normalizeStoryAssetRef(achievement.background, packageId)
  const sound = normalizeStoryAssetRef(achievement.sound, packageId)
  const unlockWhen = achievement.unlockWhen ? normalizeAchievementCondition(achievement.unlockWhen) : undefined
  const rewards = (achievement.rewards || []).map(normalizeAchievementReward)
  return {
    id,
    title,
    groupId: trimNonEmpty(achievement.groupId),
    summary: trimNonEmpty(achievement.summary),
    description: trimNonEmpty(achievement.description),
    hidden: achievement.hidden === true ? true : undefined,
    tags: dedupeStrings(achievement.tags),
    icon,
    banner,
    background,
    sound,
    maxProgress: typeof achievement.maxProgress === 'number' && Number.isFinite(achievement.maxProgress)
      ? Math.max(0, achievement.maxProgress)
      : undefined,
    notification: normalizeNotificationOptions(achievement.notification),
    unlockWhen,
    rewards,
    order: typeof achievement.order === 'number' ? achievement.order : undefined,
    metadata: cloneUnknownRecord(achievement.metadata),
    contentPackageId: packageId,
    requiredRuntimePackages: mergeRequiredRuntimePackages(
      achievement.requiredRuntimePackages,
      packageId ? [packageId] : [],
      icon?.runtimePackageId ? [icon.runtimePackageId] : [],
      banner?.runtimePackageId ? [banner.runtimePackageId] : [],
      background?.runtimePackageId ? [background.runtimePackageId] : [],
      sound?.runtimePackageId ? [sound.runtimePackageId] : [],
      getRequiredRuntimePackages(achievement.metadata),
      currentMetadataRuntimePackageDependencies(engine, achievement.metadata),
      ...rewards.map(reward => rewardRequiredRuntimePackages(reward)),
    ),
  }
}

function normalizeAchievementCondition(condition: AchievementCondition): AchievementCondition {
  switch (condition.kind) {
    case 'all':
      return { kind: 'all', conditions: condition.conditions.map(normalizeAchievementCondition) }
    case 'any':
      return { kind: 'any', conditions: condition.conditions.map(normalizeAchievementCondition) }
    case 'not':
      return { kind: 'not', condition: normalizeAchievementCondition(condition.condition) }
    case 'achievement-unlocked':
      return { kind: 'achievement-unlocked', achievementId: requireNonEmpty(condition.achievementId, 'Achievement condition achievementId must not be empty.') }
    case 'gallery-unlocked':
      return { kind: 'gallery-unlocked', entryId: requireNonEmpty(condition.entryId, 'Achievement gallery condition entryId must not be empty.') }
    case 'progress-at-least':
      return { kind: 'progress-at-least', achievementId: requireNonEmpty(condition.achievementId, 'Achievement progress condition achievementId must not be empty.'), value: Math.max(0, condition.value) }
    case 'counter-at-least':
      return { kind: 'counter-at-least', counterId: requireNonEmpty(condition.counterId, 'Achievement counter condition counterId must not be empty.'), value: Math.max(0, condition.value) }
    case 'runtime-package-active':
      return { kind: 'runtime-package-active', packageId: requireNonEmpty(condition.packageId, 'Achievement runtime package condition packageId must not be empty.') }
    case 'story-point':
      return { kind: 'story-point', point: cloneStoryPoint(condition.point as StoryPoint) }
    case 'story-metadata':
      return {
        kind: 'story-metadata',
        namespace: trimNonEmpty(condition.namespace),
        keyPath: typeof condition.keyPath === 'string'
          ? requireNonEmpty(condition.keyPath, 'Achievement story metadata keyPath must not be empty.')
          : [...condition.keyPath],
        equals: condition.equals === undefined ? undefined : cloneJsonSerializable(condition.equals),
        includes: Array.isArray(condition.includes) ? [...condition.includes] : condition.includes,
      }
    default:
      return condition
  }
}

function normalizeAchievementReward(reward: AchievementReward): AchievementReward {
  if (reward.kind === 'unlock-gallery-entries') {
    return {
      kind: 'unlock-gallery-entries',
      entryIds: dedupeStrings((reward as AchievementUnlockGalleryEntriesReward).entryIds) || [],
      profileId: trimNonEmpty((reward as AchievementUnlockGalleryEntriesReward).profileId),
    }
  }
  if (reward.kind === 'unlock-achievements') {
    return {
      kind: 'unlock-achievements',
      achievementIds: dedupeStrings((reward as { achievementIds: readonly string[] }).achievementIds) || [],
    }
  }
  if (reward.kind === 'open-achievement-board') {
    return {
      kind: 'open-achievement-board',
      options: (reward as { options?: AchievementOpenOptions }).options
        ? {
            ...(reward as { options: AchievementOpenOptions }).options,
          }
        : undefined,
    }
  }
  if ('data' in reward && reward.data !== undefined) {
    assertJsonSerializable(reward.data, `Achievement reward "${reward.kind}" data must be JSON-serializable.`)
    return {
      kind: reward.kind,
      data: cloneJsonSerializable(reward.data),
    }
  }
  return { kind: reward.kind }
}

function rewardRequiredRuntimePackages(reward: AchievementReward): string[] {
  if (reward.kind === 'open-achievement-board') {
    return []
  }
  return []
}

function normalizeStoryAssetRef(
  ref: StoryAssetRef | undefined,
  runtimePackageId?: string,
): StoryAssetRef | undefined {
  if (!ref) {
    return undefined
  }
  assertAssetRef(ref, 'Achievement asset refs must include non-empty type and name.')
  return {
    type: ref.type,
    name: ref.name.trim(),
    runtimePackageId: trimNonEmpty(ref.runtimePackageId) || runtimePackageId,
    alt: trimNonEmpty(ref.alt),
    focalPoint: ref.focalPoint ? { x: ref.focalPoint.x, y: ref.focalPoint.y } : undefined,
    metadata: cloneUnknownRecord(ref.metadata),
  }
}

function resolveAchievementContentPackageId(
  engine: QuaEngineInterface,
  explicitPackageId: string | undefined,
  metadata?: Readonly<Record<string, unknown>>,
): string | undefined {
  return trimNonEmpty(explicitPackageId)
    || contentPackageIdFromMetadata(metadata)
    || currentRuntimePackageId(engine)
}

function currentMetadataRuntimePackageDependencies(
  engine: QuaEngineInterface,
  metadata?: Readonly<Record<string, unknown>>,
): string[] {
  const metadataPackageId = contentPackageIdFromMetadata(metadata)
  const currentPackageId = currentRuntimePackageId(engine)
  return metadataPackageId && currentPackageId && metadataPackageId !== currentPackageId
    ? [currentPackageId]
    : []
}

function achievementGroupRequiresRuntimePackage(group: AchievementGroupDefinition, packageId: string): boolean {
  return achievementDefinitionRequiresRuntimePackage(group, packageId)
}

function achievementRequiresRuntimePackage(achievement: AchievementDefinition, packageId: string): boolean {
  return achievementDefinitionRequiresRuntimePackage(achievement, packageId)
}

function achievementDefinitionRequiresRuntimePackage(
  definition: Pick<AchievementDefinition, 'contentPackageId' | 'requiredRuntimePackages' | 'metadata'>,
  packageId: string,
): boolean {
  return definition.contentPackageId === packageId
    || definition.requiredRuntimePackages?.includes(packageId) === true
    || contentPackageIdFromMetadata(definition.metadata) === packageId
    || getRequiredRuntimePackages(definition.metadata).includes(packageId)
}

function achievementNotificationRequiresRuntimePackage(notification: AchievementNotificationProjection, packageId: string): boolean {
  return notification.contentPackageId === packageId
    || notification.requiredRuntimePackages?.includes(packageId) === true
}

function createAchievementSceneState(projection: AchievementProjection): AchievementSceneState {
  return {
    profileId: projection.profileId,
    selectedGroupId: projection.selectedGroupId,
    selectedAchievementId: projection.selectedAchievementId,
    returnCheckpointId: projection.returnCheckpointId,
    fallbackTarget: cloneAchievementFallbackTarget(projection.fallbackTarget),
    filter: cloneAchievementFilterState(projection.filter),
  }
}

function normalizeAchievementFilterState(filter: Partial<AchievementFilterState> | undefined): AchievementFilterState {
  return {
    search: trimNonEmpty(filter?.search),
    tags: dedupeStrings(filter?.tags),
    unlockedOnly: filter?.unlockedOnly === true ? true : undefined,
    includeHidden: filter?.includeHidden === true ? true : undefined,
  }
}

function normalizeAchievementFallbackTarget(value: unknown): AchievementFallbackTarget | undefined {
  if (typeof value === 'string') {
    return trimNonEmpty(value)
  }
  if (isPlainRecord(value) && typeof value.stepId === 'string') {
    return cloneStoryPoint(value as unknown as StoryPoint)
  }
  return undefined
}

function cloneAchievementProjection(projection: AchievementProjection): AchievementProjection {
  return {
    revision: projection.revision,
    sceneActive: projection.sceneActive,
    profileId: projection.profileId,
    notificationMode: projection.notificationMode,
    groups: projection.groups.map(cloneAchievementGroupProjectionItem),
    achievements: projection.achievements.map(cloneAchievementProjectionItem),
    filteredAchievementIds: [...projection.filteredAchievementIds],
    selectedGroupId: projection.selectedGroupId,
    selectedAchievementId: projection.selectedAchievementId,
    returnCheckpointId: projection.returnCheckpointId,
    fallbackTarget: cloneAchievementFallbackTarget(projection.fallbackTarget),
    notifications: projection.notifications.map(cloneAchievementNotification),
    requiredRuntimePackages: [...projection.requiredRuntimePackages],
    filter: cloneAchievementFilterState(projection.filter),
  }
}

function cloneAchievementGroupDefinition(group: AchievementGroupDefinition): AchievementGroupDefinition {
  return {
    ...group,
    icon: group.icon ? cloneStoryAssetRef(group.icon) : undefined,
    banner: group.banner ? cloneStoryAssetRef(group.banner) : undefined,
    metadata: group.metadata ? cloneUnknownRecord(group.metadata) : undefined,
    requiredRuntimePackages: group.requiredRuntimePackages ? [...group.requiredRuntimePackages] : undefined,
  }
}

function cloneAchievementGroupProjectionItem(group: AchievementGroupProjectionItem): AchievementGroupProjectionItem {
  return {
    ...cloneAchievementGroupDefinition(group),
    totalAchievements: group.totalAchievements,
    unlockedAchievements: group.unlockedAchievements,
    lockedAchievements: group.lockedAchievements,
  }
}

function cloneAchievementDefinition(achievement: AchievementDefinition): AchievementDefinition {
  return {
    ...achievement,
    tags: achievement.tags ? [...achievement.tags] : undefined,
    icon: achievement.icon ? cloneStoryAssetRef(achievement.icon) : undefined,
    banner: achievement.banner ? cloneStoryAssetRef(achievement.banner) : undefined,
    background: achievement.background ? cloneStoryAssetRef(achievement.background) : undefined,
    sound: achievement.sound ? cloneStoryAssetRef(achievement.sound) : undefined,
    notification: achievement.notification ? { ...achievement.notification } : undefined,
    unlockWhen: achievement.unlockWhen ? normalizeAchievementCondition(achievement.unlockWhen) : undefined,
    rewards: achievement.rewards ? achievement.rewards.map(normalizeAchievementReward) : undefined,
    metadata: achievement.metadata ? cloneUnknownRecord(achievement.metadata) : undefined,
    requiredRuntimePackages: achievement.requiredRuntimePackages ? [...achievement.requiredRuntimePackages] : undefined,
  }
}

function cloneAchievementProjectionItem(achievement: AchievementProjectionItem): AchievementProjectionItem {
  return {
    ...cloneAchievementDefinition(achievement),
    unlocked: achievement.unlocked,
    unlockRecord: achievement.unlockRecord ? cloneAchievementUnlockRecord(achievement.unlockRecord) : undefined,
    progress: achievement.progress ? cloneAchievementProgressRecord(achievement.progress) : undefined,
  }
}

function cloneAchievementUnlockRecord(record: AchievementUnlockRecord): AchievementUnlockRecord {
  return {
    achievementId: record.achievementId,
    unlockedAt: record.unlockedAt,
    source: record.source,
    contentPackageId: record.contentPackageId,
    requiredRuntimePackages: record.requiredRuntimePackages ? [...record.requiredRuntimePackages] : undefined,
    notificationMode: record.notificationMode,
  }
}

function cloneAchievementProgressRecord(record: AchievementProgressRecord): AchievementProgressRecord {
  return {
    achievementId: record.achievementId,
    value: record.value,
    maxValue: record.maxValue,
    updatedAt: record.updatedAt,
  }
}

function cloneAchievementCounterRecord(record: AchievementCounterRecord): AchievementCounterRecord {
  return {
    counterId: record.counterId,
    value: record.value,
    updatedAt: record.updatedAt,
  }
}

function cloneAchievementNotification(notification: AchievementNotificationProjection): AchievementNotificationProjection {
  return {
    ...notification,
    icon: notification.icon ? cloneStoryAssetRef(notification.icon) : undefined,
    sound: notification.sound ? cloneStoryAssetRef(notification.sound) : undefined,
    requiredRuntimePackages: notification.requiredRuntimePackages ? [...notification.requiredRuntimePackages] : undefined,
  }
}

function cloneAchievementProfileState(profile: AchievementProfileState): AchievementProfileState {
  return {
    profileId: profile.profileId,
    updatedAt: profile.updatedAt,
    unlockedAchievements: Object.fromEntries(
      Object.entries(profile.unlockedAchievements).map(([achievementId, record]) => [achievementId, cloneAchievementUnlockRecord(record as AchievementUnlockRecord)]),
    ),
    progress: Object.fromEntries(
      Object.entries(profile.progress).map(([achievementId, record]) => [achievementId, cloneAchievementProgressRecord(record as AchievementProgressRecord)]),
    ),
    counters: Object.fromEntries(
      Object.entries(profile.counters).map(([counterId, record]) => [counterId, cloneAchievementCounterRecord(record as AchievementCounterRecord)]),
    ),
  }
}

function cloneAchievementFilterState(filter: AchievementFilterState): AchievementFilterState {
  return {
    search: filter.search,
    tags: filter.tags ? [...filter.tags] : undefined,
    unlockedOnly: filter.unlockedOnly,
    includeHidden: filter.includeHidden,
  }
}

function cloneAchievementFallbackTarget(
  value: AchievementFallbackTarget | undefined,
): AchievementFallbackTarget | undefined {
  if (!value) {
    return undefined
  }
  if (typeof value === 'string') {
    return value
  }
  return cloneStoryPoint(value)
}

function cloneStoryAssetRef(ref: StoryAssetRef): StoryAssetRef {
  return {
    type: ref.type,
    name: ref.name,
    runtimePackageId: ref.runtimePackageId,
    alt: ref.alt,
    focalPoint: ref.focalPoint ? { x: ref.focalPoint.x, y: ref.focalPoint.y } : undefined,
    metadata: ref.metadata ? cloneUnknownRecord(ref.metadata) : undefined,
  }
}

function cloneStoryPoint(point: StoryPoint): StoryPoint {
  return {
    ...point,
  }
}

function cloneUnknownValue<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map(item => cloneUnknownValue(item)) as T
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, cloneUnknownValue(item)]),
    ) as T
  }
  return value
}

function cloneUnknownRecord<T extends Readonly<Record<string, unknown>>>(value: T | undefined): Record<string, unknown> | undefined {
  if (!value) {
    return undefined
  }
  return cloneUnknownValue(value)
}

function cloneJsonSerializable<T extends JsonSerializable>(value: T): T {
  return cloneUnknownValue(value)
}

function assertAssetRef(value: unknown, message: string): asserts value is StoryAssetRef {
  if (!isPlainRecord(value) || typeof value.type !== 'string' || typeof value.name !== 'string' || value.name.trim().length === 0) {
    throw new Error(message)
  }
}

function assertJsonSerializable(value: unknown, message: string): asserts value is JsonSerializable {
  if (!isJsonSerializable(value, new Set())) {
    throw new Error(message)
  }
}

function isJsonSerializable(value: unknown, seen: Set<object>): value is JsonSerializable {
  if (value === null) {
    return true
  }
  if (typeof value === 'string' || typeof value === 'boolean') {
    return true
  }
  if (typeof value === 'number') {
    return Number.isFinite(value)
  }
  if (typeof value !== 'object') {
    return false
  }
  if (seen.has(value)) {
    return false
  }
  seen.add(value)
  if (Array.isArray(value)) {
    return value.every(item => isJsonSerializable(item, seen))
  }
  return Object.values(value).every(item => isJsonSerializable(item, seen))
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isAchievementStoryMetadata(value: unknown): value is AchievementStoryMetadata {
  return isPlainRecord(value)
    && (
      value.unlock === undefined
      || typeof value.unlock === 'string'
      || Array.isArray(value.unlock)
    )
}

function isAchievementUnlockRecord(value: unknown): value is AchievementUnlockRecord {
  return isPlainRecord(value)
    && typeof value.achievementId === 'string'
    && typeof value.unlockedAt === 'number'
}

function isAchievementProgressRecord(value: unknown): value is AchievementProgressRecord {
  return isPlainRecord(value)
    && typeof value.achievementId === 'string'
    && typeof value.value === 'number'
    && typeof value.updatedAt === 'number'
}

function isAchievementCounterRecord(value: unknown): value is AchievementCounterRecord {
  return isPlainRecord(value)
    && typeof value.counterId === 'string'
    && typeof value.value === 'number'
    && typeof value.updatedAt === 'number'
}

function isAchievementProfileStoreState(value: unknown): value is AchievementProfileStoreState {
  return isPlainRecord(value) && isPlainRecord(value.profile)
}

function isAchievementSceneState(value: unknown): value is AchievementSceneState {
  return isPlainRecord(value)
}

function trimNonEmpty(value: string | undefined): string | undefined {
  if (typeof value !== 'string') {
    return undefined
  }
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function requireNonEmpty(value: string | undefined, message: string): string {
  const trimmed = trimNonEmpty(value)
  if (!trimmed) {
    throw new Error(message)
  }
  return trimmed
}

function dedupeStrings(values: readonly string[] | undefined): string[] | undefined {
  if (!values) {
    return undefined
  }
  const normalized = values
    .map(value => trimNonEmpty(value))
    .filter((value): value is string => Boolean(value))
  return normalized.length > 0 ? Array.from(new Set(normalized)) : undefined
}

function normalizeNotificationOptions(options?: AchievementNotificationOptions): AchievementNotificationOptions | undefined {
  if (!options) {
    return undefined
  }
  return {
    mode: options.mode ? normalizeNotificationMode(options.mode, DEFAULT_NOTIFICATION_MODE) : undefined,
    durationMs: options.durationMs !== undefined ? normalizeDurationMs(options.durationMs, DEFAULT_TOAST_DURATION_MS) : undefined,
  }
}

function normalizeDurationMs(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback
}

function normalizeNotificationMode(value: unknown, fallback: AchievementNotificationMode): AchievementNotificationMode {
  return value === 'none' || value === 'toast' || value === 'board'
    ? value
    : fallback
}

function resolveUnlockNotificationMode(
  override: AchievementNotificationOptions | undefined,
  definition: AchievementNotificationOptions | undefined,
  projectionMode: AchievementNotificationMode | undefined,
  fallback: AchievementNotificationMode,
): AchievementNotificationMode {
  return override?.mode || definition?.mode || projectionMode || fallback
}

function currentRuntimePackageId(engine: QuaEngineInterface): string | undefined {
  return engine.getCurrentRuntimePackageId?.() || engine.getStoryPoint?.()?.contentPackageId
}

function contentPackageIdFromMetadata(metadata?: Readonly<Record<string, unknown>>): string | undefined {
  return trimNonEmpty(typeof metadata?.contentPackageId === 'string' ? metadata.contentPackageId : undefined)
}

function getRequiredRuntimePackages(metadata?: Readonly<Record<string, unknown>>): string[] {
  const value = metadata?.requiredRuntimePackages
  return Array.isArray(value)
    ? value
        .map(item => typeof item === 'string' ? item.trim() : '')
        .filter((item): item is string => item.length > 0)
    : []
}

function mergeRequiredRuntimePackages(...groups: Array<readonly string[] | undefined>): string[] {
  return Array.from(new Set(
    groups
      .flatMap(group => group || [])
      .map(item => typeof item === 'string' ? item.trim() : '')
      .filter((item): item is string => item.length > 0),
  ))
}

function isOptionalPluginUnavailableError(error: unknown, packageName: string): boolean {
  if (!(error instanceof Error)) {
    return false
  }
  return error.message.includes(packageName)
    && (
      error.message.includes('Cannot find package')
      || error.message.includes('Cannot find module')
      || error.message.includes('Failed to resolve')
      || error.message.includes('must be installed')
    )
}

function assertAchievementGroupExists(runtimeState: AchievementRuntimeState, groupId: string | undefined, achievementId: string): void {
  if (groupId && !runtimeState.groups.has(groupId)) {
    throw new Error(`Achievement "${achievementId}" references unknown group "${groupId}". Register the group first.`)
  }
}

function readNestedValue(value: unknown, keyPath: string | readonly string[]): unknown {
  const keys = typeof keyPath === 'string' ? keyPath.split('.') : [...keyPath]
  let current: unknown = value
  for (const key of keys) {
    if (!isPlainRecord(current)) {
      return undefined
    }
    current = current[key]
  }
  return current
}

function deepEqualJsonSerializable(left: unknown, right: JsonSerializable): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

function compareAchievementGroups(left: AchievementGroupProjectionItem, right: AchievementGroupProjectionItem): number {
  if ((left.order || 0) !== (right.order || 0)) {
    return (left.order || 0) - (right.order || 0)
  }
  return left.title.localeCompare(right.title)
}

function compareAchievementDefinitions(left: AchievementProjectionItem, right: AchievementProjectionItem): number {
  if ((left.order || 0) !== (right.order || 0)) {
    return (left.order || 0) - (right.order || 0)
  }
  return left.title.localeCompare(right.title)
}

function isAchievementSceneOpen(engine: QuaEngineInterface, projection: AchievementProjection): boolean {
  return projection.sceneActive || engine.getCurrentSceneName() === ACHIEVEMENT_SCENE_ID
}

async function createAchievementReturnCheckpoint(engine: QuaEngineInterface) {
  const checkpoint = await engine.createCheckpoint({ kind: 'manual' })
  engine.getStore().commit('upsertCheckpoint', checkpoint)
  return checkpoint
}

function getSceneLoader(engine: QuaEngineInterface): QuaEngineInterface & {
  loadScene: (scene: Scene, transition?: SceneTransitionIntent, enterContext?: SceneEnterContext) => Promise<void>
} {
  return engine as QuaEngineInterface & {
    loadScene: (scene: Scene, transition?: SceneTransitionIntent, enterContext?: SceneEnterContext) => Promise<void>
  }
}

function getAchievementRuntimeKey(engine: QuaEngineInterface): object {
  return engine.getStore() as unknown as object
}
