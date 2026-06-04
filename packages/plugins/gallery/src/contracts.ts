import type { JsonSerializable, SceneTransitionIntent, StoryAssetRef, StoryPoint } from '@quajs/engine'
import type { Pipeline, PipelineContext } from '@quajs/pipeline'

export const GALLERY_PLUGIN_ID = 'gallery' as const
export const GALLERY_WEB_RENDERER_ENTRY = '@quajs/renderer-web/plugins/gallery' as const
export const GALLERY_VUE_RENDERER_ENTRY = '@quajs/renderer-vue/plugins/gallery' as const
export const GALLERY_COCOS_RENDERER_ENTRY = '@quajs/renderer-cocos/plugins/gallery' as const
export const GALLERY_SCENE_ID = '@quajs/plugin-gallery/scene' as const
export const GALLERY_PROFILE_STORE_PREFIX = '@quajs/plugin-gallery:profile:' as const
export const GALLERY_METADATA_NAMESPACE = 'gallery' as const

export const GalleryRenderToLogicEvents = {
  CLOSE_REQUEST: 'gallery/close_request',
  SELECT_CATALOG_REQUEST: 'gallery/select_catalog_request',
  SELECT_ENTRY_REQUEST: 'gallery/select_entry_request',
  SELECT_CONTENT_REQUEST: 'gallery/select_content_request',
  UPDATE_FILTER_REQUEST: 'gallery/update_filter_request',
} as const

export type GalleryRenderToLogicEvent = typeof GalleryRenderToLogicEvents[keyof typeof GalleryRenderToLogicEvents]

export type GalleryFallbackTarget = string | StoryPoint

export interface GalleryStoryMetadata {
  unlock?: string | readonly string[]
}

export interface GalleryMetadataEnvelope {
  gallery?: GalleryStoryMetadata
}

export interface GalleryBaseContentBlock {
  id: string
  kind: string
  title?: string
  summary?: string
  metadata?: Readonly<Record<string, unknown>>
  contentPackageId?: string
  requiredRuntimePackages?: readonly string[]
}

export interface GalleryImageContentBlock extends GalleryBaseContentBlock {
  kind: 'image'
  asset: StoryAssetRef
}

export interface GalleryVideoContentBlock extends GalleryBaseContentBlock {
  kind: 'video'
  asset: StoryAssetRef
  poster?: StoryAssetRef
}

export interface GalleryAudioContentBlock extends GalleryBaseContentBlock {
  kind: 'audio'
  asset: StoryAssetRef
  poster?: StoryAssetRef
}

export interface GalleryTextContentBlock extends GalleryBaseContentBlock {
  kind: 'text'
  text: string
}

export interface GalleryCustomContentBlock extends GalleryBaseContentBlock {
  kind: string
  data: JsonSerializable
}

export type GalleryContentBlock
  = | GalleryImageContentBlock
    | GalleryVideoContentBlock
    | GalleryAudioContentBlock
    | GalleryTextContentBlock
    | GalleryCustomContentBlock

export interface GalleryCatalogDefinition {
  id: string
  title: string
  summary?: string
  description?: string
  thumbnail?: StoryAssetRef
  entryIds?: readonly string[]
  metadata?: Readonly<Record<string, unknown>>
  contentPackageId?: string
  requiredRuntimePackages?: readonly string[]
}

export interface GalleryEntryDefinition {
  id: string
  catalogId: string
  title: string
  summary?: string
  description?: string
  thumbnail?: StoryAssetRef
  poster?: StoryAssetRef
  tags?: readonly string[]
  contents: readonly GalleryContentBlock[]
  metadata?: Readonly<Record<string, unknown>>
  contentPackageId?: string
  requiredRuntimePackages?: readonly string[]
}

export interface GalleryCatalogProjectionItem extends Omit<GalleryCatalogDefinition, 'entryIds'> {
  entryIds: readonly string[]
  totalEntries: number
  unlockedEntries: number
  lockedEntries: number
}

export interface GalleryEntryProjectionItem extends GalleryEntryDefinition {
  unlocked: boolean
}

export interface GalleryUnlockRecord {
  entryId: string
  unlockedAt: number
  source?: string
  contentPackageId?: string
  requiredRuntimePackages?: readonly string[]
}

export interface GalleryProfileState {
  profileId: string
  updatedAt: number
  unlockedEntries: Readonly<Record<string, GalleryUnlockRecord>>
}

export interface GalleryFilterState {
  search?: string
  tags?: readonly string[]
  contentKinds?: readonly string[]
  unlockedOnly?: boolean
}

export interface GalleryProjection {
  revision: number
  sceneActive: boolean
  profileId: string
  catalogs: readonly GalleryCatalogProjectionItem[]
  entries: readonly GalleryEntryProjectionItem[]
  filteredEntryIds: readonly string[]
  selectedCatalogId?: string
  selectedEntryId?: string
  selectedContentId?: string
  returnCheckpointId?: string
  fallbackTarget?: GalleryFallbackTarget
  requiredRuntimePackages: readonly string[]
  filter: GalleryFilterState
}

export interface GalleryOpenOptions {
  profileId?: string
  catalogId?: string
  entryId?: string
  contentId?: string
  filter?: GalleryFilterState
  fallbackTarget?: GalleryFallbackTarget
  transition?: SceneTransitionIntent
  reason?: string
}

export interface GalleryUnlockOptions {
  profileId?: string
  source?: string
  contentPackageId?: string
  requiredRuntimePackages?: readonly string[]
}

export interface GallerySelectCatalogRequestPayload {
  catalogId?: string
}

export interface GallerySelectEntryRequestPayload {
  entryId?: string
}

export interface GallerySelectContentRequestPayload {
  contentId?: string
}

export interface GalleryUpdateFilterRequestPayload {
  filter: Partial<GalleryFilterState>
  replace?: boolean
}

export interface GalleryRenderToLogicEventPayloadMap {
  [GalleryRenderToLogicEvents.CLOSE_REQUEST]: Record<string, never>
  [GalleryRenderToLogicEvents.SELECT_CATALOG_REQUEST]: GallerySelectCatalogRequestPayload
  [GalleryRenderToLogicEvents.SELECT_ENTRY_REQUEST]: GallerySelectEntryRequestPayload
  [GalleryRenderToLogicEvents.SELECT_CONTENT_REQUEST]: GallerySelectContentRequestPayload
  [GalleryRenderToLogicEvents.UPDATE_FILTER_REQUEST]: GalleryUpdateFilterRequestPayload
}

export function emitGalleryRenderToLogic<T extends GalleryRenderToLogicEvent>(
  pipeline: Pipeline,
  type: T,
  payload: GalleryRenderToLogicEventPayloadMap[T],
): Promise<void> {
  return pipeline.emit(type, payload)
}

export function onGalleryRenderToLogic<T extends GalleryRenderToLogicEvent>(
  pipeline: Pipeline,
  type: T,
  handler: (
    payload: GalleryRenderToLogicEventPayloadMap[T],
    context: PipelineContext<GalleryRenderToLogicEventPayloadMap[T]>,
  ) => void | Promise<void>,
): () => void {
  const listener = async (context: PipelineContext<GalleryRenderToLogicEventPayloadMap[T]>) => {
    await handler(context.event.payload, context)
  }
  pipeline.on(type, listener)
  return () => pipeline.off(type, listener)
}
