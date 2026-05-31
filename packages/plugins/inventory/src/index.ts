import type {
  EngineContext,
  JsonSerializableRecord,
  QuaEngineInterface,
  StoryAssetRef,
} from '@quajs/engine'
import type { QuaState } from '@quajs/store'
import type {
  InventoryCategoryDefinition,
  InventoryChangeOptions,
  InventoryItemDefinition,
  InventoryItemRecord,
  InventoryProfileState,
  InventoryProjection,
  InventoryProjectionItem,
} from './contracts'
import { BaseEnginePlugin } from '@quajs/engine'
import { QuaStore } from '@quajs/store'
import {
  emitInventoryLogic,
  INVENTORY_METADATA_NAMESPACE,
  INVENTORY_PLUGIN_ID,
  INVENTORY_PROFILE_STORE_PREFIX,
  InventoryLogicEvents,
  onInventoryLogic,
} from './contracts'
import {
  decorators as inventoryDecorators,
  inventoryDecoratorMappings,
} from './script-compiler'

const DEFAULT_PROFILE_ID = 'default'
export const INVENTORY_SETTINGS_SCOPE = '@quajs/plugin-inventory' as const

interface InventoryProfileStoreState extends QuaState {
  profile: InventoryProfileState
}

interface InventoryProfileRuntime {
  store: QuaStore
  snapshotId: string
  state: InventoryProfileState
}

interface InventoryRuntimeState {
  defaultProfileId: string
  revision: number
  categories: Map<string, InventoryCategoryDefinition>
  items: Map<string, InventoryItemDefinition>
  profiles: Map<string, InventoryProfileRuntime>
}

interface InventoryDeveloperSettings {
  defaultProfileId: string
}

interface InventoryViewProjection {
  revision: number
  profileId: string
}

const inventoryRuntimeState = new WeakMap<object, InventoryRuntimeState>()

export {
  emitInventoryLogic,
  INVENTORY_METADATA_NAMESPACE,
  INVENTORY_PLUGIN_ID,
  INVENTORY_PROFILE_STORE_PREFIX,
  InventoryLogicEvents,
  inventoryDecoratorMappings,
  onInventoryLogic,
}

export type {
  InventoryCategoryDefinition,
  InventoryCategoryProjectionItem,
  InventoryChangeOptions,
  InventoryItemChangedPayload,
  InventoryItemDefinition,
  InventoryItemRecord,
  InventoryLogicEvent,
  InventoryLogicEventPayloadMap,
  InventoryProfileResetPayload,
  InventoryProfileState,
  InventoryProjection,
  InventoryProjectionItem,
} from './contracts'

export {
  createInventoryDecoratorCompiler,
  inventoryDecoratorMappings as inventoryDecoratorCompilerMappings,
  scriptCompiler,
} from './script-compiler'

export interface InventoryPluginOptions {
  profileId?: string
}

export class InventoryPlugin extends BaseEnginePlugin {
  readonly name = '@quajs/plugin-inventory'
  readonly id = INVENTORY_PLUGIN_ID
  readonly version = '0.1.0'
  readonly description = 'Persistent profile inventory items for QuaEngine'
  private disposers: Array<() => void> = []

  protected override async setup(ctx: EngineContext): Promise<void> {
    const runtimeState = getOrCreateInventoryRuntimeState(ctx.engine, this.getOptions().profileId || DEFAULT_PROFILE_ID)
    await ensureInventoryProfile(ctx.engine, runtimeState, runtimeState.defaultProfileId)
    await rebuildInventoryViewProjection(ctx.engine, runtimeState, runtimeState.defaultProfileId, ctx.store)
    const settingsDisposer = await registerInventorySettingsScope(ctx, runtimeState)
    if (settingsDisposer) {
      this.disposers.push(settingsDisposer)
    }
  }

  override async onRuntimePackageUnload(ctx: EngineContext): Promise<void> {
    const packageId = ctx.runtimePackage?.package.id
    if (packageId) {
      await removeRuntimePackageInventoryContentWithEngine(ctx.engine, packageId)
    }
  }

  override async destroy(): Promise<void> {
    while (this.disposers.length > 0) {
      this.disposers.pop()?.()
    }
    if (this.ctx) {
      inventoryRuntimeState.delete(getInventoryRuntimeKey(this.ctx.engine))
      await this.ctx.engine.setPluginProjection(INVENTORY_PLUGIN_ID, undefined).catch(() => {})
    }
    await super.destroy?.()
  }

  registerAPIs() {
    return {
      pluginName: this.name,
      apis: [
        { name: 'defineInventoryCategory', fn: defineInventoryCategory, module: this.name },
        { name: 'defineInventoryItem', fn: defineInventoryItem, module: this.name },
        { name: 'registerInventoryCategoryWithEngine', fn: registerInventoryCategoryWithEngine, module: this.name },
        { name: 'registerInventoryItemWithEngine', fn: registerInventoryItemWithEngine, module: this.name },
        { name: 'registerInventoryItemsWithEngine', fn: registerInventoryItemsWithEngine, module: this.name },
        { name: 'grantInventoryItemWithEngine', fn: grantInventoryItemWithEngine, module: this.name },
        { name: 'consumeInventoryItemWithEngine', fn: consumeInventoryItemWithEngine, module: this.name },
        { name: 'setInventoryItemQuantityWithEngine', fn: setInventoryItemQuantityWithEngine, module: this.name },
        { name: 'clearInventoryItemWithEngine', fn: clearInventoryItemWithEngine, module: this.name },
        { name: 'hasInventoryItemWithEngine', fn: hasInventoryItemWithEngine, module: this.name },
        { name: 'getInventoryItemQuantityWithEngine', fn: getInventoryItemQuantityWithEngine, module: this.name },
        { name: 'getInventoryProfile', fn: getInventoryProfile, module: this.name },
        { name: 'getInventoryProjection', fn: getInventoryProjection, module: this.name },
        { name: 'resetInventoryProfileWithEngine', fn: resetInventoryProfileWithEngine, module: this.name },
        { name: 'removeRuntimePackageInventoryContentWithEngine', fn: removeRuntimePackageInventoryContentWithEngine, module: this.name },
      ],
      decorators: inventoryDecorators,
    }
  }

  private getOptions(): InventoryPluginOptions {
    return this.options as InventoryPluginOptions
  }
}

export function defineInventoryCategory(category: InventoryCategoryDefinition): InventoryCategoryDefinition {
  return cloneInventoryCategoryDefinition(normalizeInventoryCategoryDefinition(undefined, category))
}

export function defineInventoryItem(item: InventoryItemDefinition): InventoryItemDefinition {
  return cloneInventoryItemDefinition(normalizeInventoryItemDefinition(undefined, item))
}

export function getInventoryProjection(
  engine: QuaEngineInterface,
  options: { profileId?: string } = {},
): InventoryProjection {
  const runtimeState = getInventoryRuntimeState(engine)
  const viewProjection = engine.getPluginProjection<InventoryViewProjection>(INVENTORY_PLUGIN_ID)
  const profileId = trimNonEmpty(options.profileId)
    || viewProjection?.profileId
    || runtimeState?.defaultProfileId
    || DEFAULT_PROFILE_ID
  const profile = runtimeState?.profiles.get(profileId)?.state || createEmptyInventoryProfile(profileId)
  return createInventoryProjection(runtimeState, profile)
}

export function getInventoryProfile(engine: QuaEngineInterface, profileId?: string): InventoryProfileState {
  const runtimeState = getInventoryRuntimeState(engine)
  const resolvedProfileId = trimNonEmpty(profileId)
    || engine.getPluginProjection<InventoryViewProjection>(INVENTORY_PLUGIN_ID)?.profileId
    || runtimeState?.defaultProfileId
    || DEFAULT_PROFILE_ID
  const profile = runtimeState?.profiles.get(resolvedProfileId)?.state
  return cloneInventoryProfileState(profile || createEmptyInventoryProfile(resolvedProfileId))
}

export async function registerInventoryCategoryWithEngine(
  engine: QuaEngineInterface,
  category: InventoryCategoryDefinition,
): Promise<InventoryCategoryDefinition> {
  const runtimeState = getRequiredInventoryRuntimeState(engine)
  const normalized = normalizeInventoryCategoryDefinition(engine, category)
  runtimeState.categories.set(normalized.id, normalized)
  await rebuildInventoryViewProjection(engine, runtimeState)
  return cloneInventoryCategoryDefinition(normalized)
}

export async function registerInventoryItemWithEngine(
  engine: QuaEngineInterface,
  item: InventoryItemDefinition,
): Promise<InventoryItemDefinition> {
  const runtimeState = getRequiredInventoryRuntimeState(engine)
  const normalized = normalizeInventoryItemDefinition(engine, item)
  assertInventoryCategoryExists(runtimeState, normalized)
  runtimeState.items.set(normalized.id, normalized)
  await rebuildInventoryViewProjection(engine, runtimeState)
  return cloneInventoryItemDefinition(normalized)
}

export async function registerInventoryItemsWithEngine(
  engine: QuaEngineInterface,
  items: readonly InventoryItemDefinition[],
): Promise<InventoryItemDefinition[]> {
  const runtimeState = getRequiredInventoryRuntimeState(engine)
  const normalized = items.map(item => normalizeInventoryItemDefinition(engine, item))
  normalized.forEach(item => assertInventoryCategoryExists(runtimeState, item))
  normalized.forEach(item => runtimeState.items.set(item.id, item))
  await rebuildInventoryViewProjection(engine, runtimeState)
  return normalized.map(cloneInventoryItemDefinition)
}

export async function removeRuntimePackageInventoryContentWithEngine(
  engine: QuaEngineInterface,
  packageId: string,
): Promise<void> {
  const runtimeState = getRequiredInventoryRuntimeState(engine)
  const removedCategoryIds = new Set<string>()
  let changed = false

  for (const [categoryId, category] of runtimeState.categories.entries()) {
    if (inventoryDefinitionRequiresPackage(category, packageId)) {
      runtimeState.categories.delete(categoryId)
      removedCategoryIds.add(categoryId)
      changed = true
    }
  }

  for (const [itemId, item] of runtimeState.items.entries()) {
    if (
      inventoryDefinitionRequiresPackage(item, packageId)
      || (item.categoryId && removedCategoryIds.has(item.categoryId))
    ) {
      runtimeState.items.delete(itemId)
      changed = true
    }
  }

  if (changed) {
    await rebuildInventoryViewProjection(engine, runtimeState)
  }
}

export async function grantInventoryItemWithEngine(
  engine: QuaEngineInterface,
  itemId: string,
  quantityOrOptions: number | InventoryChangeOptions = 1,
  options: InventoryChangeOptions = {},
): Promise<InventoryProfileState> {
  const { quantity, changeOptions } = resolveQuantityOptions(quantityOrOptions, options, 1)
  return await changeInventoryQuantityWithEngine(engine, itemId, quantity, changeOptions, 'grant')
}

export async function consumeInventoryItemWithEngine(
  engine: QuaEngineInterface,
  itemId: string,
  quantityOrOptions: number | InventoryChangeOptions = 1,
  options: InventoryChangeOptions = {},
): Promise<InventoryProfileState> {
  const { quantity, changeOptions } = resolveQuantityOptions(quantityOrOptions, options, 1)
  return await changeInventoryQuantityWithEngine(engine, itemId, -quantity, changeOptions, 'consume')
}

export async function setInventoryItemQuantityWithEngine(
  engine: QuaEngineInterface,
  itemId: string,
  quantity: number,
  options: InventoryChangeOptions = {},
): Promise<InventoryProfileState> {
  const runtimeState = getRequiredInventoryRuntimeState(engine)
  const normalizedItemId = requireNonEmpty(itemId, 'Inventory item id must not be empty.')
  const definition = requireInventoryItemDefinition(runtimeState, normalizedItemId)
  const nextQuantity = normalizeNonNegativeQuantity(quantity, `Inventory item "${normalizedItemId}" quantity`)
  assertWithinMaxQuantity(definition, normalizedItemId, nextQuantity)
  const profileId = resolveInventoryProfileId(engine, runtimeState, options.profileId)
  const profile = await ensureInventoryProfile(engine, runtimeState, profileId)
  const previousRecord = profile.state.items[normalizedItemId]
  const previousQuantity = previousRecord?.quantity || 0
  const items = { ...profile.state.items }

  if (nextQuantity === 0) {
    delete items[normalizedItemId]
  }
  else {
    items[normalizedItemId] = createInventoryRecord(
      normalizedItemId,
      nextQuantity,
      definition,
      options,
      previousRecord,
    )
  }

  const nextProfile = createInventoryProfileFromItems(profileId, items)
  await applyInventoryProfileChange(engine, runtimeState, profile, nextProfile, {
    itemId: normalizedItemId,
    previousQuantity,
    quantity: nextQuantity,
    source: options.source,
    metadata: options.metadata,
  })
  return cloneInventoryProfileState(nextProfile)
}

export async function clearInventoryItemWithEngine(
  engine: QuaEngineInterface,
  itemId: string,
  options: InventoryChangeOptions = {},
): Promise<InventoryProfileState> {
  const runtimeState = getRequiredInventoryRuntimeState(engine)
  const normalizedItemId = requireNonEmpty(itemId, 'Inventory item id must not be empty.')
  const profileId = resolveInventoryProfileId(engine, runtimeState, options.profileId)
  const profile = await ensureInventoryProfile(engine, runtimeState, profileId)
  const previousRecord = profile.state.items[normalizedItemId]
  if (!previousRecord) {
    return cloneInventoryProfileState(profile.state)
  }
  const items = { ...profile.state.items }
  delete items[normalizedItemId]
  const nextProfile = createInventoryProfileFromItems(profileId, items)
  await applyInventoryProfileChange(engine, runtimeState, profile, nextProfile, {
    itemId: normalizedItemId,
    previousQuantity: previousRecord.quantity,
    quantity: 0,
    source: options.source,
    metadata: options.metadata,
  })
  return cloneInventoryProfileState(nextProfile)
}

export function hasInventoryItemWithEngine(
  engine: QuaEngineInterface,
  itemId: string,
  options: { profileId?: string } = {},
): boolean {
  return getInventoryItemQuantityWithEngine(engine, itemId, options) > 0
}

export function getInventoryItemQuantityWithEngine(
  engine: QuaEngineInterface,
  itemId: string,
  options: { profileId?: string } = {},
): number {
  const normalizedItemId = trimNonEmpty(itemId)
  if (!normalizedItemId) {
    return 0
  }
  return getInventoryProfile(engine, options.profileId).items[normalizedItemId]?.quantity || 0
}

export async function resetInventoryProfileWithEngine(
  engine: QuaEngineInterface,
  options: { profileId?: string } = {},
): Promise<InventoryProfileState> {
  const runtimeState = getRequiredInventoryRuntimeState(engine)
  const profileId = resolveInventoryProfileId(engine, runtimeState, options.profileId)
  const profile = await ensureInventoryProfile(engine, runtimeState, profileId)
  const previousItems = cloneInventoryProfileState(profile.state).items
  const nextProfile = createEmptyInventoryProfile(profileId)
  applyInventoryProfileState(profile, nextProfile)
  await persistInventoryProfile(profile)
  await rebuildInventoryViewProjection(engine, runtimeState, profileId)
  await emitInventoryLogic(engine.getPipeline(), InventoryLogicEvents.PROFILE_RESET, {
    profileId,
    previousItems,
  })
  return cloneInventoryProfileState(nextProfile)
}

async function changeInventoryQuantityWithEngine(
  engine: QuaEngineInterface,
  itemId: string,
  delta: number,
  options: InventoryChangeOptions,
  operation: 'grant' | 'consume',
): Promise<InventoryProfileState> {
  const runtimeState = getRequiredInventoryRuntimeState(engine)
  const normalizedItemId = requireNonEmpty(itemId, 'Inventory item id must not be empty.')
  const definition = requireInventoryItemDefinition(runtimeState, normalizedItemId)
  const normalizedDelta = normalizePositiveQuantity(Math.abs(delta), `Inventory item "${normalizedItemId}" ${operation} quantity`)
  const signedDelta = operation === 'consume' ? -normalizedDelta : normalizedDelta
  const profileId = resolveInventoryProfileId(engine, runtimeState, options.profileId)
  const profile = await ensureInventoryProfile(engine, runtimeState, profileId)
  const previousRecord = profile.state.items[normalizedItemId]
  const previousQuantity = previousRecord?.quantity || 0
  const nextQuantity = previousQuantity + signedDelta
  if (nextQuantity < 0) {
    throw new Error(`Inventory item "${normalizedItemId}" quantity cannot go below 0.`)
  }
  assertWithinMaxQuantity(definition, normalizedItemId, nextQuantity)

  const items = { ...profile.state.items }
  if (nextQuantity === 0) {
    delete items[normalizedItemId]
  }
  else {
    items[normalizedItemId] = createInventoryRecord(
      normalizedItemId,
      nextQuantity,
      definition,
      options,
      previousRecord,
    )
  }

  const nextProfile = createInventoryProfileFromItems(profileId, items)
  await applyInventoryProfileChange(engine, runtimeState, profile, nextProfile, {
    itemId: normalizedItemId,
    previousQuantity,
    quantity: nextQuantity,
    source: options.source,
    metadata: options.metadata,
  })
  return cloneInventoryProfileState(nextProfile)
}

async function applyInventoryProfileChange(
  engine: QuaEngineInterface,
  runtimeState: InventoryRuntimeState,
  profile: InventoryProfileRuntime,
  nextProfile: InventoryProfileState,
  event: {
    itemId: string
    previousQuantity: number
    quantity: number
    source?: string
    metadata?: JsonSerializableRecord
  },
): Promise<void> {
  applyInventoryProfileState(profile, nextProfile)
  await persistInventoryProfile(profile)
  await rebuildInventoryViewProjection(engine, runtimeState, nextProfile.profileId)
  await emitInventoryLogic(engine.getPipeline(), InventoryLogicEvents.ITEM_CHANGED, {
    profileId: nextProfile.profileId,
    itemId: event.itemId,
    previousQuantity: event.previousQuantity,
    quantity: event.quantity,
    delta: event.quantity - event.previousQuantity,
    source: trimNonEmpty(event.source),
    metadata: event.metadata ? cloneUnknownValue(event.metadata) as JsonSerializableRecord : undefined,
  })
}

function createInventoryRecord(
  itemId: string,
  quantity: number,
  definition: InventoryItemDefinition,
  options: InventoryChangeOptions,
  previous?: InventoryItemRecord,
): InventoryItemRecord {
  const contentPackageId = trimNonEmpty(options.contentPackageId) || definition.contentPackageId || previous?.contentPackageId
  return {
    itemId,
    quantity,
    acquiredAt: previous?.acquiredAt || Date.now(),
    updatedAt: Date.now(),
    source: trimNonEmpty(options.source) || previous?.source,
    metadata: options.metadata
      ? cloneUnknownValue(options.metadata) as JsonSerializableRecord
      : previous?.metadata ? cloneUnknownValue(previous.metadata) as JsonSerializableRecord : undefined,
    contentPackageId,
    requiredRuntimePackages: mergeRequiredRuntimePackages(
      options.requiredRuntimePackages,
      definition.requiredRuntimePackages,
      previous?.requiredRuntimePackages,
      contentPackageId ? [contentPackageId] : undefined,
    ),
  }
}

async function rebuildInventoryViewProjection(
  engine: QuaEngineInterface,
  runtimeState: InventoryRuntimeState,
  profileId?: string,
  preInitStore?: QuaStore,
): Promise<void> {
  const resolvedProfileId = trimNonEmpty(profileId)
    || engine.getPluginProjection<InventoryViewProjection>(INVENTORY_PLUGIN_ID)?.profileId
    || runtimeState.defaultProfileId
  runtimeState.revision += 1
  const projection: InventoryViewProjection = {
    revision: runtimeState.revision,
    profileId: resolvedProfileId,
  }
  const store = preInitStore || engine.getStore()
  store.commit('setPluginProjection', {
    pluginId: INVENTORY_PLUGIN_ID,
    projection,
  })
}

function createInventoryProjection(
  runtimeState: InventoryRuntimeState | undefined,
  profile: InventoryProfileState,
): InventoryProjection {
  const definitions = runtimeState ? Array.from(runtimeState.items.values()).map(cloneInventoryItemDefinition) : []
  const categories = runtimeState ? Array.from(runtimeState.categories.values()).map((category) => {
    const itemIds = definitions
      .filter(item => item.categoryId === category.id)
      .map(item => item.id)
    return {
      ...cloneInventoryCategoryDefinition(category),
      itemIds,
    }
  }) : []
  const itemIds = new Set<string>([
    ...definitions.map(item => item.id),
    ...Object.keys(profile.items),
  ])
  const items = Array.from(itemIds).map((itemId) => {
    const definition = definitions.find(item => item.id === itemId)
    const record = profile.items[itemId]
    return {
      itemId,
      quantity: record?.quantity || 0,
      available: Boolean(definition),
      definition: definition ? cloneInventoryItemDefinition(definition) : undefined,
      record: record ? cloneInventoryItemRecord(record) : undefined,
    } satisfies InventoryProjectionItem
  })
  return {
    revision: runtimeState?.revision || 0,
    profileId: profile.profileId,
    categories,
    definitions,
    items,
    missingItemRecords: items
      .filter(item => !item.available && item.record)
      .map(item => cloneInventoryItemRecord(item.record!)),
  }
}

function getOrCreateInventoryRuntimeState(engine: QuaEngineInterface, defaultProfileId: string): InventoryRuntimeState {
  const key = getInventoryRuntimeKey(engine)
  const existing = inventoryRuntimeState.get(key)
  if (existing) {
    return existing
  }
  const created: InventoryRuntimeState = {
    defaultProfileId: trimNonEmpty(defaultProfileId) || DEFAULT_PROFILE_ID,
    revision: 0,
    categories: new Map(),
    items: new Map(),
    profiles: new Map(),
  }
  inventoryRuntimeState.set(key, created)
  return created
}

function getInventoryRuntimeState(engine: QuaEngineInterface): InventoryRuntimeState | undefined {
  return inventoryRuntimeState.get(getInventoryRuntimeKey(engine))
}

function getRequiredInventoryRuntimeState(engine: QuaEngineInterface): InventoryRuntimeState {
  const runtimeState = getInventoryRuntimeState(engine)
  if (!runtimeState) {
    throw new Error('@quajs/plugin-inventory must be installed before inventory APIs can be used.')
  }
  return runtimeState
}

async function ensureInventoryProfile(
  engine: QuaEngineInterface,
  runtimeState: InventoryRuntimeState,
  profileId: string,
): Promise<InventoryProfileRuntime> {
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
  const snapshotId = `${INVENTORY_PROFILE_STORE_PREFIX}${resolvedProfileId}`
  const store = new QuaStore(snapshotId, {
    state: {
      profile: createEmptyInventoryProfile(resolvedProfileId),
    } satisfies InventoryProfileStoreState,
    mutations: {
      setProfile(state: QuaState, payload: InventoryProfileState) {
        ;(state as InventoryProfileStoreState).profile = cloneInventoryProfileState(payload)
      },
    },
    serializer: engineStore.getSerializer() as any,
    storageManager,
  } as any)

  try {
    await store.restore(snapshotId, { force: true })
  }
  catch {
    // Inventory profiles are long-lived optional progress; failed storage reads fall back to memory.
  }

  const rawProfile = isInventoryProfileStoreState(store.getState())
    ? store.getState().profile
    : createEmptyInventoryProfile(resolvedProfileId)
  const runtime: InventoryProfileRuntime = {
    store,
    snapshotId,
    state: normalizeInventoryProfileState(rawProfile, resolvedProfileId),
  }
  applyInventoryProfileState(runtime, runtime.state)
  runtimeState.profiles.set(resolvedProfileId, runtime)
  return runtime
}

async function persistInventoryProfile(profile: InventoryProfileRuntime): Promise<void> {
  try {
    await profile.store.snapshot(profile.snapshotId)
  }
  catch {
    // Profile persistence is best-effort; in-memory item counts remain authoritative for this session.
  }
}

function applyInventoryProfileState(profile: InventoryProfileRuntime, nextProfile: InventoryProfileState): void {
  profile.state = cloneInventoryProfileState(nextProfile)
  profile.store.commit('setProfile', profile.state)
}

async function registerInventorySettingsScope(
  ctx: EngineContext,
  runtimeState: InventoryRuntimeState,
): Promise<(() => void) | undefined> {
  try {
    const settings = await import('@quajs/plugin-settings')
    const unregister = settings.registerSettingsScope(ctx.engine, {
      scope: INVENTORY_SETTINGS_SCOPE,
      version: 1,
      title: 'Inventory',
      description: 'Inventory profile defaults.',
      developer: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            defaultProfileId: {
              type: 'string',
              title: 'Default Profile',
              default: DEFAULT_PROFILE_ID,
            },
          },
        },
        defaults: {
          defaultProfileId: DEFAULT_PROFILE_ID,
        } satisfies InventoryDeveloperSettings,
        values: {
          defaultProfileId: runtimeState.defaultProfileId,
        } satisfies InventoryDeveloperSettings,
      },
      apply: async ({ developer }) => {
        runtimeState.defaultProfileId = trimNonEmpty(developer.defaultProfileId) || DEFAULT_PROFILE_ID
        await ensureInventoryProfile(ctx.engine, runtimeState, runtimeState.defaultProfileId)
        await rebuildInventoryViewProjection(ctx.engine, runtimeState, runtimeState.defaultProfileId)
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

function normalizeInventoryCategoryDefinition(
  engine: QuaEngineInterface | undefined,
  category: InventoryCategoryDefinition,
): InventoryCategoryDefinition {
  const id = requireNonEmpty(category.id, 'Inventory category id must not be empty.')
  const contentPackageId = resolveDefinitionPackageId(engine, category.contentPackageId, category.metadata)
  return {
    id,
    title: trimNonEmpty(category.title),
    summary: trimNonEmpty(category.summary),
    order: normalizeOptionalInteger(category.order, `Inventory category "${id}" order`),
    metadata: cloneOptionalRecord(category.metadata),
    contentPackageId,
    requiredRuntimePackages: mergeRequiredRuntimePackages(
      category.requiredRuntimePackages,
      contentPackageId ? [contentPackageId] : undefined,
    ),
  }
}

function normalizeInventoryItemDefinition(
  engine: QuaEngineInterface | undefined,
  item: InventoryItemDefinition,
): InventoryItemDefinition {
  const id = requireNonEmpty(item.id, 'Inventory item id must not be empty.')
  const contentPackageId = resolveDefinitionPackageId(engine, item.contentPackageId, item.metadata)
  const maxQuantity = item.maxQuantity === undefined
    ? undefined
    : normalizePositiveQuantity(item.maxQuantity, `Inventory item "${id}" maxQuantity`)
  return {
    id,
    title: trimNonEmpty(item.title),
    summary: trimNonEmpty(item.summary),
    description: trimNonEmpty(item.description),
    categoryId: trimNonEmpty(item.categoryId),
    tags: normalizeStringList(item.tags),
    icon: normalizeStoryAssetRef(item.icon, contentPackageId),
    maxQuantity,
    consumable: item.consumable,
    metadata: cloneOptionalRecord(item.metadata),
    contentPackageId,
    requiredRuntimePackages: mergeRequiredRuntimePackages(
      item.requiredRuntimePackages,
      contentPackageId ? [contentPackageId] : undefined,
    ),
  }
}

function resolveDefinitionPackageId(
  engine: QuaEngineInterface | undefined,
  explicitPackageId?: string,
  metadata?: Readonly<Record<string, unknown>>,
): string | undefined {
  return trimNonEmpty(explicitPackageId)
    || contentPackageIdFromMetadata(metadata)
    || engine?.getCurrentRuntimePackageId()
}

function normalizeStoryAssetRef(ref: StoryAssetRef | undefined, packageId?: string): StoryAssetRef | undefined {
  if (!ref) {
    return undefined
  }
  return {
    ...cloneUnknownValue(ref) as StoryAssetRef,
    ...(packageId && !ref.runtimePackageId ? { runtimePackageId: packageId } : {}),
  }
}

function assertInventoryCategoryExists(runtimeState: InventoryRuntimeState, item: InventoryItemDefinition): void {
  if (item.categoryId && !runtimeState.categories.has(item.categoryId)) {
    throw new Error(`Inventory item "${item.id}" references unknown category "${item.categoryId}".`)
  }
}

function requireInventoryItemDefinition(runtimeState: InventoryRuntimeState, itemId: string): InventoryItemDefinition {
  const definition = runtimeState.items.get(itemId)
  if (!definition) {
    throw new Error(`Inventory item "${itemId}" is not registered.`)
  }
  return definition
}

function assertWithinMaxQuantity(definition: InventoryItemDefinition, itemId: string, quantity: number): void {
  if (definition.maxQuantity !== undefined && quantity > definition.maxQuantity) {
    throw new Error(`Inventory item "${itemId}" quantity ${quantity} exceeds maxQuantity ${definition.maxQuantity}.`)
  }
}

function resolveQuantityOptions(
  quantityOrOptions: number | InventoryChangeOptions,
  options: InventoryChangeOptions,
  defaultQuantity: number,
): { quantity: number, changeOptions: InventoryChangeOptions } {
  if (typeof quantityOrOptions === 'number') {
    return { quantity: quantityOrOptions, changeOptions: options }
  }
  const quantity = quantityOrOptions.quantity ?? defaultQuantity
  return { quantity, changeOptions: quantityOrOptions }
}

function resolveInventoryProfileId(
  engine: QuaEngineInterface,
  runtimeState: InventoryRuntimeState,
  profileId?: string,
): string {
  return trimNonEmpty(profileId)
    || engine.getPluginProjection<InventoryViewProjection>(INVENTORY_PLUGIN_ID)?.profileId
    || runtimeState.defaultProfileId
}

function createInventoryProfileFromItems(
  profileId: string,
  items: Record<string, InventoryItemRecord>,
): InventoryProfileState {
  return {
    profileId,
    updatedAt: Date.now(),
    items: Object.fromEntries(
      Object.entries(items)
        .filter(([, record]) => record.quantity > 0)
        .map(([id, record]) => [id, cloneInventoryItemRecord(record)]),
    ),
  }
}

function createEmptyInventoryProfile(profileId: string): InventoryProfileState {
  return {
    profileId,
    updatedAt: 0,
    items: {},
  }
}

function normalizeInventoryProfileState(input: InventoryProfileState, profileId: string): InventoryProfileState {
  const items: Record<string, InventoryItemRecord> = {}
  for (const [itemId, record] of Object.entries(input.items || {})) {
    const normalizedItemId = trimNonEmpty(record.itemId) || trimNonEmpty(itemId)
    if (!normalizedItemId) {
      continue
    }
    const quantity = normalizeNonNegativeQuantity(record.quantity, `Inventory item "${normalizedItemId}" quantity`)
    if (quantity === 0) {
      continue
    }
    items[normalizedItemId] = {
      itemId: normalizedItemId,
      quantity,
      acquiredAt: normalizeOptionalInteger(record.acquiredAt, `Inventory item "${normalizedItemId}" acquiredAt`),
      updatedAt: normalizeOptionalInteger(record.updatedAt, `Inventory item "${normalizedItemId}" updatedAt`) || Date.now(),
      source: trimNonEmpty(record.source),
      metadata: record.metadata ? cloneUnknownValue(record.metadata) as JsonSerializableRecord : undefined,
      contentPackageId: trimNonEmpty(record.contentPackageId),
      requiredRuntimePackages: mergeRequiredRuntimePackages(record.requiredRuntimePackages),
    }
  }
  return {
    profileId,
    updatedAt: normalizeOptionalInteger(input.updatedAt, 'Inventory profile updatedAt') || 0,
    items,
  }
}

function cloneInventoryProfileState(profile: InventoryProfileState): InventoryProfileState {
  return {
    profileId: profile.profileId,
    updatedAt: profile.updatedAt,
    items: Object.fromEntries(
      Object.entries(profile.items || {}).map(([id, record]) => [id, cloneInventoryItemRecord(record)]),
    ),
  }
}

function cloneInventoryItemRecord(record: InventoryItemRecord): InventoryItemRecord {
  return {
    itemId: record.itemId,
    quantity: record.quantity,
    acquiredAt: record.acquiredAt,
    updatedAt: record.updatedAt,
    source: record.source,
    metadata: record.metadata ? cloneUnknownValue(record.metadata) as JsonSerializableRecord : undefined,
    contentPackageId: record.contentPackageId,
    requiredRuntimePackages: record.requiredRuntimePackages ? [...record.requiredRuntimePackages] : undefined,
  }
}

function cloneInventoryCategoryDefinition(category: InventoryCategoryDefinition): InventoryCategoryDefinition {
  return {
    id: category.id,
    title: category.title,
    summary: category.summary,
    order: category.order,
    metadata: cloneOptionalRecord(category.metadata),
    contentPackageId: category.contentPackageId,
    requiredRuntimePackages: category.requiredRuntimePackages ? [...category.requiredRuntimePackages] : undefined,
  }
}

function cloneInventoryItemDefinition(item: InventoryItemDefinition): InventoryItemDefinition {
  return {
    id: item.id,
    title: item.title,
    summary: item.summary,
    description: item.description,
    categoryId: item.categoryId,
    tags: item.tags ? [...item.tags] : undefined,
    icon: item.icon ? cloneUnknownValue(item.icon) as StoryAssetRef : undefined,
    maxQuantity: item.maxQuantity,
    consumable: item.consumable,
    metadata: cloneOptionalRecord(item.metadata),
    contentPackageId: item.contentPackageId,
    requiredRuntimePackages: item.requiredRuntimePackages ? [...item.requiredRuntimePackages] : undefined,
  }
}

function isInventoryProfileStoreState(value: unknown): value is InventoryProfileStoreState {
  return value !== null
    && typeof value === 'object'
    && 'profile' in value
    && Boolean((value as InventoryProfileStoreState).profile)
}

function inventoryDefinitionRequiresPackage(
  definition: { contentPackageId?: string, requiredRuntimePackages?: readonly string[], metadata?: Readonly<Record<string, unknown>> },
  packageId: string,
): boolean {
  return definition.contentPackageId === packageId
    || (definition.requiredRuntimePackages || []).includes(packageId)
    || getRequiredRuntimePackages(definition.metadata).includes(packageId)
}

function contentPackageIdFromMetadata(metadata?: Readonly<Record<string, unknown>>): string | undefined {
  return typeof metadata?.contentPackageId === 'string' ? metadata.contentPackageId : undefined
}

function getRequiredRuntimePackages(metadata?: Readonly<Record<string, unknown>>): string[] {
  const required = metadata?.requiredRuntimePackages
  return Array.isArray(required) ? required.filter((item): item is string => typeof item === 'string' && item.length > 0) : []
}

function mergeRequiredRuntimePackages(...groups: Array<readonly string[] | undefined>): string[] | undefined {
  const merged = Array.from(new Set(groups.flatMap(group => group || []).filter(Boolean)))
  return merged.length > 0 ? merged : undefined
}

function normalizeStringList(values: readonly string[] | undefined): string[] | undefined {
  const normalized = Array.from(new Set((values || []).map(trimNonEmpty).filter((item): item is string => Boolean(item))))
  return normalized.length > 0 ? normalized : undefined
}

function normalizePositiveQuantity(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive safe integer.`)
  }
  return value
}

function normalizeNonNegativeQuantity(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative safe integer.`)
  }
  return value
}

function normalizeOptionalInteger(value: number | undefined, label: string): number | undefined {
  if (value === undefined) {
    return undefined
  }
  if (!Number.isSafeInteger(value)) {
    throw new Error(`${label} must be a safe integer.`)
  }
  return value
}

function requireNonEmpty(value: string | undefined, message: string): string {
  const trimmed = trimNonEmpty(value)
  if (!trimmed) {
    throw new Error(message)
  }
  return trimmed
}

function trimNonEmpty(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

function cloneOptionalRecord<T extends Readonly<Record<string, unknown>>>(value: T | undefined): Record<string, unknown> | undefined {
  return value ? cloneUnknownValue(value) as Record<string, unknown> : undefined
}

function cloneUnknownValue<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map(item => cloneUnknownValue(item)) as T
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [
      key,
      cloneUnknownValue(item),
    ])) as T
  }
  return value
}

function isOptionalPluginUnavailableError(error: unknown, packageName: string): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return message.includes(packageName)
    && (
      message.includes('Cannot find package')
      || message.includes('Cannot find module')
      || message.includes('Failed to resolve')
      || message.includes('ERR_MODULE_NOT_FOUND')
    )
}

function getInventoryRuntimeKey(engine: QuaEngineInterface): object {
  return engine.getStore() as unknown as object
}

export const metadata = {
  name: '@quajs/plugin-inventory',
  version: '0.1.0',
  description: 'Persistent profile inventory items for QuaEngine',
  category: 'data',
} as const

export const Plugin = InventoryPlugin
export const decorators = inventoryDecoratorMappings
