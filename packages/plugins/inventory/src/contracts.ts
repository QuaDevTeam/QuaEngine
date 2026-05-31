import type { JsonSerializableRecord, StoryAssetRef } from '@quajs/engine'
import type { Pipeline, PipelineContext } from '@quajs/pipeline'

export const INVENTORY_PLUGIN_ID = 'inventory' as const
export const INVENTORY_PROFILE_STORE_PREFIX = '@quajs/plugin-inventory:profile:' as const
export const INVENTORY_METADATA_NAMESPACE = 'inventory' as const

export const InventoryLogicEvents = {
  ITEM_CHANGED: 'inventory/item_changed',
  PROFILE_RESET: 'inventory/profile_reset',
} as const

export type InventoryLogicEvent = typeof InventoryLogicEvents[keyof typeof InventoryLogicEvents]

export interface InventoryCategoryDefinition {
  id: string
  title?: string
  summary?: string
  order?: number
  metadata?: Readonly<Record<string, unknown>>
  contentPackageId?: string
  requiredRuntimePackages?: readonly string[]
}

export interface InventoryItemDefinition {
  id: string
  title?: string
  summary?: string
  description?: string
  categoryId?: string
  tags?: readonly string[]
  icon?: StoryAssetRef
  maxQuantity?: number
  consumable?: boolean
  metadata?: Readonly<Record<string, unknown>>
  contentPackageId?: string
  requiredRuntimePackages?: readonly string[]
}

export interface InventoryItemRecord {
  itemId: string
  quantity: number
  acquiredAt?: number
  updatedAt: number
  source?: string
  metadata?: JsonSerializableRecord
  contentPackageId?: string
  requiredRuntimePackages?: readonly string[]
}

export interface InventoryProfileState {
  profileId: string
  updatedAt: number
  items: Readonly<Record<string, InventoryItemRecord>>
}

export interface InventoryCategoryProjectionItem extends InventoryCategoryDefinition {
  itemIds: readonly string[]
}

export interface InventoryProjectionItem {
  itemId: string
  quantity: number
  available: boolean
  definition?: InventoryItemDefinition
  record?: InventoryItemRecord
}

export interface InventoryProjection {
  revision: number
  profileId: string
  categories: readonly InventoryCategoryProjectionItem[]
  definitions: readonly InventoryItemDefinition[]
  items: readonly InventoryProjectionItem[]
  missingItemRecords: readonly InventoryItemRecord[]
}

export interface InventoryChangeOptions {
  profileId?: string
  quantity?: number
  source?: string
  metadata?: JsonSerializableRecord
  contentPackageId?: string
  requiredRuntimePackages?: readonly string[]
}

export interface InventoryItemChangedPayload {
  profileId: string
  itemId: string
  previousQuantity: number
  quantity: number
  delta: number
  source?: string
  metadata?: JsonSerializableRecord
}

export interface InventoryProfileResetPayload {
  profileId: string
  previousItems: Readonly<Record<string, InventoryItemRecord>>
}

export interface InventoryLogicEventPayloadMap {
  [InventoryLogicEvents.ITEM_CHANGED]: InventoryItemChangedPayload
  [InventoryLogicEvents.PROFILE_RESET]: InventoryProfileResetPayload
}

export function emitInventoryLogic<T extends InventoryLogicEvent>(
  pipeline: Pipeline,
  type: T,
  payload: InventoryLogicEventPayloadMap[T],
): Promise<void> {
  return pipeline.emit(type, payload)
}

export function onInventoryLogic<T extends InventoryLogicEvent>(
  pipeline: Pipeline,
  type: T,
  handler: (
    payload: InventoryLogicEventPayloadMap[T],
    context: PipelineContext<InventoryLogicEventPayloadMap[T]>,
  ) => void | Promise<void>,
): () => void {
  const listener = async (context: PipelineContext<InventoryLogicEventPayloadMap[T]>) => {
    await handler(context.event.payload, context)
  }
  pipeline.on(type, listener)
  return () => pipeline.off(type, listener)
}
