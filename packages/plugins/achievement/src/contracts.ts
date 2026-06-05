import type { JsonSerializable, SceneTransitionIntent, StoryAssetRef, StoryPoint } from '@quajs/engine'
import type { ViewOverlayStackPlacement } from '@quajs/engine'
import type { Pipeline, PipelineContext } from '@quajs/pipeline'

export const ACHIEVEMENT_PLUGIN_ID = 'achievement' as const
export const ACHIEVEMENT_WEB_RENDERER_ENTRY = '@quajs/renderer-web/plugins/achievement' as const
export const ACHIEVEMENT_VUE_RENDERER_ENTRY = '@quajs/renderer-vue/plugins/achievement' as const
export const ACHIEVEMENT_COCOS_RENDERER_ENTRY = '@quajs/renderer-cocos/plugins/achievement' as const
export const ACHIEVEMENT_SCENE_ID = '@quajs/plugin-achievement/scene' as const
export const ACHIEVEMENT_PROFILE_STORE_PREFIX = '@quajs/plugin-achievement:profile:' as const
export const ACHIEVEMENT_METADATA_NAMESPACE = 'achievement' as const
export const ACHIEVEMENT_TOAST_HOST_SOURCE = 'achievement-toast' as const

export type AchievementNotificationMode = 'none' | 'toast' | 'board'

export const AchievementRenderToLogicEvents = {
  OPEN_BOARD_REQUEST: 'achievement/open_board_request',
  CLOSE_BOARD_REQUEST: 'achievement/close_board_request',
  SELECT_GROUP_REQUEST: 'achievement/select_group_request',
  SELECT_ACHIEVEMENT_REQUEST: 'achievement/select_achievement_request',
  UPDATE_FILTER_REQUEST: 'achievement/update_filter_request',
  DISMISS_NOTIFICATION_REQUEST: 'achievement/dismiss_notification_request',
} as const

export type AchievementRenderToLogicEvent = typeof AchievementRenderToLogicEvents[keyof typeof AchievementRenderToLogicEvents]

export type AchievementFallbackTarget = string | StoryPoint

export interface AchievementStoryMetadata {
  unlock?: string | readonly string[]
}

export interface AchievementMetadataEnvelope {
  achievement?: AchievementStoryMetadata
}

export interface AchievementNotificationOptions extends ViewOverlayStackPlacement {
  mode?: AchievementNotificationMode
  durationMs?: number
}

export interface AchievementGroupDefinition {
  id: string
  title: string
  summary?: string
  description?: string
  icon?: StoryAssetRef
  banner?: StoryAssetRef
  order?: number
  metadata?: Readonly<Record<string, unknown>>
  contentPackageId?: string
  requiredRuntimePackages?: readonly string[]
}

export interface AchievementAllCondition {
  kind: 'all'
  conditions: readonly AchievementCondition[]
}

export interface AchievementAnyCondition {
  kind: 'any'
  conditions: readonly AchievementCondition[]
}

export interface AchievementNotCondition {
  kind: 'not'
  condition: AchievementCondition
}

export interface AchievementUnlockedCondition {
  kind: 'achievement-unlocked'
  achievementId: string
}

export interface AchievementGalleryUnlockedCondition {
  kind: 'gallery-unlocked'
  entryId: string
}

export interface AchievementProgressAtLeastCondition {
  kind: 'progress-at-least'
  achievementId: string
  value: number
}

export interface AchievementCounterAtLeastCondition {
  kind: 'counter-at-least'
  counterId: string
  value: number
}

export interface AchievementRuntimePackageActiveCondition {
  kind: 'runtime-package-active'
  packageId: string
}

export interface AchievementStoryPointCondition {
  kind: 'story-point'
  point: Partial<StoryPoint>
}

export interface AchievementStoryMetadataCondition {
  kind: 'story-metadata'
  namespace?: string
  keyPath: string | readonly string[]
  equals?: JsonSerializable
  includes?: string | readonly string[]
}

export type AchievementCondition
  = | AchievementAllCondition
    | AchievementAnyCondition
    | AchievementNotCondition
    | AchievementUnlockedCondition
    | AchievementGalleryUnlockedCondition
    | AchievementProgressAtLeastCondition
    | AchievementCounterAtLeastCondition
    | AchievementRuntimePackageActiveCondition
    | AchievementStoryPointCondition
    | AchievementStoryMetadataCondition

export interface AchievementUnlockGalleryEntriesReward {
  kind: 'unlock-gallery-entries'
  entryIds: readonly string[]
  profileId?: string
}

export interface AchievementUnlockAchievementsReward {
  kind: 'unlock-achievements'
  achievementIds: readonly string[]
}

export interface AchievementOpenBoardReward {
  kind: 'open-achievement-board'
  options?: AchievementOpenOptions
}

export interface AchievementCustomReward {
  kind: string
  data?: JsonSerializable
}

export type AchievementReward
  = | AchievementUnlockGalleryEntriesReward
    | AchievementUnlockAchievementsReward
    | AchievementOpenBoardReward
    | AchievementCustomReward

export interface AchievementDefinition {
  id: string
  title: string
  groupId?: string
  summary?: string
  description?: string
  hidden?: boolean
  tags?: readonly string[]
  icon?: StoryAssetRef
  banner?: StoryAssetRef
  background?: StoryAssetRef
  sound?: StoryAssetRef
  maxProgress?: number
  notification?: AchievementNotificationOptions
  unlockWhen?: AchievementCondition
  rewards?: readonly AchievementReward[]
  order?: number
  metadata?: Readonly<Record<string, unknown>>
  contentPackageId?: string
  requiredRuntimePackages?: readonly string[]
}

export interface AchievementDefinitionsInput {
  groups?: readonly AchievementGroupDefinition[]
  achievements?: readonly AchievementDefinition[]
}

export interface AchievementUnlockRecord {
  achievementId: string
  unlockedAt: number
  source?: string
  contentPackageId?: string
  requiredRuntimePackages?: readonly string[]
  notificationMode?: AchievementNotificationMode
}

export interface AchievementProgressRecord {
  achievementId: string
  value: number
  maxValue?: number
  updatedAt: number
}

export interface AchievementCounterRecord {
  counterId: string
  value: number
  updatedAt: number
}

export interface AchievementProfileState {
  profileId: string
  updatedAt: number
  unlockedAchievements: Readonly<Record<string, AchievementUnlockRecord>>
  progress: Readonly<Record<string, AchievementProgressRecord>>
  counters: Readonly<Record<string, AchievementCounterRecord>>
}

export interface AchievementFilterState {
  search?: string
  tags?: readonly string[]
  unlockedOnly?: boolean
  includeHidden?: boolean
}

export interface AchievementNotificationProjection extends ViewOverlayStackPlacement {
  id: string
  achievementId: string
  title: string
  summary?: string
  mode: 'toast'
  durationMs: number
  createdAt: number
  icon?: StoryAssetRef
  sound?: StoryAssetRef
  contentPackageId?: string
  requiredRuntimePackages?: readonly string[]
}

export interface AchievementGroupProjectionItem extends AchievementGroupDefinition {
  totalAchievements: number
  unlockedAchievements: number
  lockedAchievements: number
}

export interface AchievementProjectionItem extends AchievementDefinition {
  unlocked: boolean
  unlockRecord?: AchievementUnlockRecord
  progress?: AchievementProgressRecord
}

export interface AchievementProjection extends ViewOverlayStackPlacement {
  revision: number
  sceneActive: boolean
  profileId: string
  notificationMode: AchievementNotificationMode
  groups: readonly AchievementGroupProjectionItem[]
  achievements: readonly AchievementProjectionItem[]
  filteredAchievementIds: readonly string[]
  selectedGroupId?: string
  selectedAchievementId?: string
  returnCheckpointId?: string
  fallbackTarget?: AchievementFallbackTarget
  notifications: readonly AchievementNotificationProjection[]
  requiredRuntimePackages: readonly string[]
  filter: AchievementFilterState
}

export interface AchievementOpenOptions extends ViewOverlayStackPlacement {
  profileId?: string
  groupId?: string
  achievementId?: string
  filter?: AchievementFilterState
  fallbackTarget?: AchievementFallbackTarget
  transition?: SceneTransitionIntent
  reason?: string
}

export interface AchievementUnlockOptions {
  profileId?: string
  source?: string
  notification?: AchievementNotificationOptions
  contentPackageId?: string
  requiredRuntimePackages?: readonly string[]
}

export interface AchievementProgressOptions {
  profileId?: string
  source?: string
}

export interface AchievementRewardContext {
  achievement: AchievementDefinition
  unlock: AchievementUnlockRecord
  profileId: string
}

export interface AchievementSelectGroupRequestPayload {
  groupId?: string
}

export interface AchievementSelectAchievementRequestPayload {
  achievementId?: string
}

export interface AchievementUpdateFilterRequestPayload {
  filter: Partial<AchievementFilterState>
  replace?: boolean
}

export interface AchievementDismissNotificationRequestPayload {
  notificationId?: string
  achievementId?: string
}

export interface AchievementRenderToLogicEventPayloadMap {
  [AchievementRenderToLogicEvents.OPEN_BOARD_REQUEST]: AchievementOpenOptions
  [AchievementRenderToLogicEvents.CLOSE_BOARD_REQUEST]: Record<string, never>
  [AchievementRenderToLogicEvents.SELECT_GROUP_REQUEST]: AchievementSelectGroupRequestPayload
  [AchievementRenderToLogicEvents.SELECT_ACHIEVEMENT_REQUEST]: AchievementSelectAchievementRequestPayload
  [AchievementRenderToLogicEvents.UPDATE_FILTER_REQUEST]: AchievementUpdateFilterRequestPayload
  [AchievementRenderToLogicEvents.DISMISS_NOTIFICATION_REQUEST]: AchievementDismissNotificationRequestPayload
}

export function emitAchievementRenderToLogic<T extends AchievementRenderToLogicEvent>(
  pipeline: Pipeline,
  type: T,
  payload: AchievementRenderToLogicEventPayloadMap[T],
): Promise<void> {
  return pipeline.emit(type, payload)
}

export function onAchievementRenderToLogic<T extends AchievementRenderToLogicEvent>(
  pipeline: Pipeline,
  type: T,
  handler: (
    payload: AchievementRenderToLogicEventPayloadMap[T],
    context: PipelineContext<AchievementRenderToLogicEventPayloadMap[T]>,
  ) => void | Promise<void>,
): () => void {
  const listener = async (context: PipelineContext<AchievementRenderToLogicEventPayloadMap[T]>) => {
    await handler(context.event.payload, context)
  }
  pipeline.on(type, listener)
  return () => pipeline.off(type, listener)
}
