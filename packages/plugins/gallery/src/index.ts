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
  GalleryAudioContentBlock,
  GalleryCatalogDefinition,
  GalleryCatalogProjectionItem,
  GalleryContentBlock,
  GalleryCustomContentBlock,
  GalleryEntryDefinition,
  GalleryEntryProjectionItem,
  GalleryFallbackTarget,
  GalleryFilterState,
  GalleryImageContentBlock,
  GalleryLockedPresentation,
  GalleryOpenOptions,
  GalleryProfileState,
  GalleryProjection,
  GalleryStoryMetadata,
  GalleryTextContentBlock,
  GalleryUnlockOptions,
  GalleryUnlockRecord,
  GalleryUpdateFilterRequestPayload,
  GalleryVideoContentBlock,
} from './contracts'
import { BaseEnginePlugin, DEFAULT_UI_OVERLAY_Z_INDEXES, Scene } from '@quajs/engine'
import { QuaStore } from '@quajs/store'
import {
  emitGalleryRenderToLogic,
  GALLERY_COCOS_RENDERER_ENTRY,
  GALLERY_METADATA_NAMESPACE,
  GALLERY_PLUGIN_ID,
  GALLERY_PROFILE_STORE_PREFIX,
  GALLERY_REACT_RENDERER_ENTRY,
  GALLERY_SCENE_ID,
  GALLERY_SVELTE_RENDERER_ENTRY,
  GALLERY_VUE_RENDERER_ENTRY,
  GALLERY_WEB_RENDERER_ENTRY,
  GalleryRenderToLogicEvents,
  onGalleryRenderToLogic,
} from './contracts'
import {
  decorators,
} from './decorators'

const DEFAULT_PROFILE_ID = 'default'
const STORY_GRAPH_PLUGIN_ID = 'storyGraph' as const
const GALLERY_SETTINGS_SCOPE = '@quajs/plugin-gallery' as const

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

interface GalleryProfileStoreState extends QuaState {
  profile: GalleryProfileState
}

interface GalleryProfileRuntime {
  store: QuaStore
  snapshotId: string
  state: GalleryProfileState
}

interface GalleryRuntimeState {
  defaultProfileId: string
  catalogs: Map<string, GalleryCatalogDefinition>
  entries: Map<string, GalleryEntryDefinition>
  profiles: Map<string, GalleryProfileRuntime>
}

interface GalleryDeveloperSettings {
  defaultProfileId: string
}

interface GalleryProjectionPatch {
  sceneActive?: boolean
  profileId?: string
  selectedCatalogId?: string | null
  selectedEntryId?: string | null
  selectedContentId?: string | null
  returnCheckpointId?: string | null
  fallbackTarget?: GalleryFallbackTarget | null
  filter?: GalleryFilterState
  overlayStack?: string
  stackPriority?: number
  zIndex?: number
}

interface GallerySceneState {
  profileId?: string
  selectedCatalogId?: string
  selectedEntryId?: string
  selectedContentId?: string
  returnCheckpointId?: string
  fallbackTarget?: string | StoryPoint
  overlayStack?: string
  stackPriority?: number
  zIndex?: number
  filter?: {
    search?: string
    tags?: string[]
    contentKinds?: string[]
    unlockedOnly?: boolean
  }
}

type GalleryEntryProjectionDefinition = Omit<GalleryEntryDefinition, 'lockedPresentation'>

const galleryRuntimeState = new WeakMap<object, GalleryRuntimeState>()

export {
  emitGalleryRenderToLogic,
  GALLERY_COCOS_RENDERER_ENTRY,
  GALLERY_METADATA_NAMESPACE,
  GALLERY_PLUGIN_ID,
  GALLERY_PROFILE_STORE_PREFIX,
  GALLERY_REACT_RENDERER_ENTRY,
  GALLERY_SCENE_ID,
  GALLERY_SETTINGS_SCOPE,
  GALLERY_SVELTE_RENDERER_ENTRY,
  GALLERY_VUE_RENDERER_ENTRY,
  GALLERY_WEB_RENDERER_ENTRY,
  GalleryRenderToLogicEvents,
  onGalleryRenderToLogic,
}

export type {
  GalleryAudioContentBlock,
  GalleryCatalogDefinition,
  GalleryCatalogProjectionItem,
  GalleryContentBlock,
  GalleryCustomContentBlock,
  GalleryEntryDefinition,
  GalleryEntryProjectionItem,
  GalleryFallbackTarget,
  GalleryFilterState,
  GalleryImageContentBlock,
  GalleryLockedPresentation,
  GalleryMetadataEnvelope,
  GalleryOpenOptions,
  GalleryProfileState,
  GalleryProjection,
  GalleryRenderToLogicEvent,
  GalleryRenderToLogicEventPayloadMap,
  GallerySelectCatalogRequestPayload,
  GallerySelectContentRequestPayload,
  GallerySelectEntryRequestPayload,
  GalleryStoryMetadata,
  GalleryTextContentBlock,
  GalleryUnlockOptions,
  GalleryUnlockRecord,
  GalleryUpdateFilterRequestPayload,
  GalleryVideoContentBlock,
} from './contracts'

export {
  decorators,
  galleryDecoratorMappings,
} from './decorators'

export interface GalleryPluginOptions {
  profileId?: string
}

class GallerySceneShell extends Scene {
  readonly name = GALLERY_SCENE_ID

  constructor(
    private readonly engine: QuaEngineInterface,
    private readonly runtimeState: GalleryRuntimeState,
  ) {
    super()
  }

  override async init(ctx?: SceneEnterContext): Promise<void> {
    await applyGallerySceneEnterState(this.engine, this.runtimeState, ctx)
  }

  override async run(_ctx?: SceneEnterContext): Promise<void> {}
}

export class GalleryPlugin extends BaseEnginePlugin {
  readonly name = '@quajs/plugin-gallery'
  readonly id = GALLERY_PLUGIN_ID
  readonly version = '0.1.0'
  readonly description = 'Gallery catalog scene shell and persistent unlock profiles for QuaEngine'
  private disposers: Array<() => void> = []
  private unregisterScene?: () => void

  getProjection(): GalleryProjection {
    return getGalleryProjection(this.getEngine())
  }

  getProfile(profileId?: string): GalleryProfileState {
    return getGalleryProfile(this.getEngine(), profileId)
  }

  registerCatalog(catalog: GalleryCatalogDefinition): Promise<GalleryCatalogDefinition> {
    return registerGalleryCatalogWithEngine(this.getEngine(), catalog)
  }

  registerEntry(entry: GalleryEntryDefinition): Promise<GalleryEntryDefinition> {
    return registerGalleryEntryWithEngine(this.getEngine(), entry)
  }

  registerEntries(entries: readonly GalleryEntryDefinition[]): Promise<GalleryEntryDefinition[]> {
    return registerGalleryEntriesWithEngine(this.getEngine(), entries)
  }

  clearRuntimePackage(packageId: string): Promise<void> {
    return removeRuntimePackageGalleryContentWithEngine(this.getEngine(), packageId)
  }

  openScene(options?: GalleryOpenOptions): Promise<void> {
    return openGallerySceneWithEngine(this.getEngine(), options)
  }

  closeScene(): Promise<void> {
    return closeGallerySceneWithEngine(this.getEngine())
  }

  unlockEntry(entryId: string | readonly string[], options?: GalleryUnlockOptions): Promise<GalleryProfileState> {
    return unlockGalleryEntryWithEngine(this.getEngine(), entryId, options)
  }

  unlockEntries(entryIds: readonly string[], options?: GalleryUnlockOptions): Promise<GalleryProfileState> {
    return unlockGalleryEntriesWithEngine(this.getEngine(), entryIds, options)
  }

  resetProfile(options?: { profileId?: string }): Promise<GalleryProfileState> {
    return resetGalleryProfileWithEngine(this.getEngine(), options)
  }

  protected override async setup(ctx: EngineContext): Promise<void> {
    const runtimeState = getOrCreateGalleryRuntimeState(ctx.engine, this.getOptions().profileId || DEFAULT_PROFILE_ID)
    if (ctx.engine.hasScene(GALLERY_SCENE_ID)) {
      throw new Error(`Gallery scene "${GALLERY_SCENE_ID}" is already registered.`)
    }

    this.unregisterScene = ctx.engine.registerScene(
      GALLERY_SCENE_ID,
      async () => new GallerySceneShell(ctx.engine, runtimeState),
    )

    await ensureGalleryProfile(
      ctx.engine,
      runtimeState,
      getGalleryProjection(ctx.engine).profileId || runtimeState.defaultProfileId,
    )

    this.disposers.push(onGalleryRenderToLogic(ctx.pipeline, GalleryRenderToLogicEvents.CLOSE_REQUEST, async () => {
      await closeGallerySceneWithEngine(ctx.engine)
    }))
    this.disposers.push(onGalleryRenderToLogic(ctx.pipeline, GalleryRenderToLogicEvents.SELECT_CATALOG_REQUEST, async (payload) => {
      await selectGalleryCatalogWithEngine(ctx.engine, payload.catalogId)
    }))
    this.disposers.push(onGalleryRenderToLogic(ctx.pipeline, GalleryRenderToLogicEvents.SELECT_ENTRY_REQUEST, async (payload) => {
      await selectGalleryEntryWithEngine(ctx.engine, payload.entryId)
    }))
    this.disposers.push(onGalleryRenderToLogic(ctx.pipeline, GalleryRenderToLogicEvents.SELECT_CONTENT_REQUEST, async (payload) => {
      await selectGalleryContentWithEngine(ctx.engine, payload.contentId)
    }))
    this.disposers.push(onGalleryRenderToLogic(ctx.pipeline, GalleryRenderToLogicEvents.UPDATE_FILTER_REQUEST, async (payload) => {
      await updateGalleryFilterWithEngine(ctx.engine, payload)
    }))

    await rebuildGalleryProjection(ctx.engine, runtimeState, {}, ctx.store)
    const settingsDisposer = await registerGallerySettingsScope(ctx, runtimeState)
    if (settingsDisposer) {
      this.disposers.push(settingsDisposer)
    }
  }

  override async onStepComplete(ctx: EngineContext): Promise<void> {
    const runtimeState = getGalleryRuntimeState(ctx.engine)
    if (!runtimeState) {
      return
    }
    await applyGalleryMetadataUnlocks(ctx.engine, runtimeState, ctx.engine.getStoryPoint())
  }

  override async onAfterJump(ctx: EngineContext): Promise<void> {
    const runtimeState = getGalleryRuntimeState(ctx.engine)
    if (!runtimeState) {
      return
    }
    await applyGalleryMetadataUnlocks(ctx.engine, runtimeState, ctx.engine.getStoryPoint())
    await rebuildGalleryProjection(ctx.engine, runtimeState, {})
  }

  override async onRuntimePackageUnload(ctx: EngineContext): Promise<void> {
    const packageId = ctx.runtimePackage?.package.id
    if (packageId) {
      await removeRuntimePackageGalleryContentWithEngine(ctx.engine, packageId)
    }
  }

  override async destroy(): Promise<void> {
    while (this.disposers.length > 0) {
      this.disposers.pop()?.()
    }
    this.unregisterScene?.()
    this.unregisterScene = undefined

    if (this.ctx) {
      galleryRuntimeState.delete(getGalleryRuntimeKey(this.ctx.engine))
      await this.ctx.engine.setPluginProjection(GALLERY_PLUGIN_ID, undefined)
    }

    await super.destroy?.()
  }

  registerAPIs() {
    return {
      pluginName: this.name,
      apis: [
        { name: 'getProjection', fn: this.getProjection.bind(this), module: this.name },
        { name: 'getProfile', fn: this.getProfile.bind(this), module: this.name },
        { name: 'registerCatalog', fn: this.registerCatalog.bind(this), module: this.name },
        { name: 'registerEntry', fn: this.registerEntry.bind(this), module: this.name },
        { name: 'registerEntries', fn: this.registerEntries.bind(this), module: this.name },
        { name: 'clearRuntimePackage', fn: this.clearRuntimePackage.bind(this), module: this.name },
        { name: 'openScene', fn: this.openScene.bind(this), module: this.name },
        { name: 'closeScene', fn: this.closeScene.bind(this), module: this.name },
        { name: 'unlockEntry', fn: this.unlockEntry.bind(this), module: this.name },
        { name: 'unlockEntries', fn: this.unlockEntries.bind(this), module: this.name },
        { name: 'resetProfile', fn: this.resetProfile.bind(this), module: this.name },
      ],
      decorators,
    }
  }

  private getOptions(): GalleryPluginOptions {
    return this.options as GalleryPluginOptions
  }
}

export function getGalleryProjection(engine: QuaEngineInterface): GalleryProjection {
  const runtimeState = getGalleryRuntimeState(engine)
  const projection = engine.getPluginProjection<GalleryProjection>(GALLERY_PLUGIN_ID)
  return cloneGalleryProjection(projection || createInitialGalleryProjection(runtimeState?.defaultProfileId || DEFAULT_PROFILE_ID))
}

export function getGalleryProfile(engine: QuaEngineInterface, profileId?: string): GalleryProfileState {
  const runtimeState = getGalleryRuntimeState(engine)
  const resolvedProfileId = trimNonEmpty(profileId)
    || getGalleryProjection(engine).profileId
    || runtimeState?.defaultProfileId
    || DEFAULT_PROFILE_ID
  const profile = runtimeState?.profiles.get(resolvedProfileId)?.state
  return cloneGalleryProfileState(profile || createEmptyGalleryProfile(resolvedProfileId))
}

export async function registerGalleryCatalogWithEngine(
  engine: QuaEngineInterface,
  catalog: GalleryCatalogDefinition,
): Promise<GalleryCatalogDefinition> {
  const runtimeState = getRequiredGalleryRuntimeState(engine)
  const normalized = normalizeGalleryCatalogDefinition(engine, catalog)
  runtimeState.catalogs.set(normalized.id, normalized)
  await rebuildGalleryProjection(engine, runtimeState, {})
  return cloneGalleryCatalogDefinition(normalized)
}

export async function registerGalleryEntryWithEngine(
  engine: QuaEngineInterface,
  entry: GalleryEntryDefinition,
): Promise<GalleryEntryDefinition> {
  const runtimeState = getRequiredGalleryRuntimeState(engine)
  const normalized = normalizeGalleryEntryDefinition(engine, entry)
  assertGalleryCatalogExists(runtimeState, normalized.catalogId, normalized.id)
  runtimeState.entries.set(normalized.id, normalized)
  await rebuildGalleryProjection(engine, runtimeState, {})
  return cloneGalleryEntryDefinition(normalized)
}

export async function registerGalleryEntriesWithEngine(
  engine: QuaEngineInterface,
  entries: readonly GalleryEntryDefinition[],
): Promise<GalleryEntryDefinition[]> {
  const runtimeState = getRequiredGalleryRuntimeState(engine)
  const normalized = entries.map(entry => normalizeGalleryEntryDefinition(engine, entry))
  normalized.forEach((entry) => {
    assertGalleryCatalogExists(runtimeState, entry.catalogId, entry.id)
  })
  normalized.forEach((entry) => {
    runtimeState.entries.set(entry.id, entry)
  })
  await rebuildGalleryProjection(engine, runtimeState, {})
  return normalized.map(cloneGalleryEntryDefinition)
}

export async function removeRuntimePackageGalleryContentWithEngine(
  engine: QuaEngineInterface,
  packageId: string,
): Promise<void> {
  const runtimeState = getRequiredGalleryRuntimeState(engine)
  const removedCatalogIds = new Set<string>()
  let changed = false

  for (const [catalogId, catalog] of runtimeState.catalogs.entries()) {
    if (galleryCatalogRequiresRuntimePackage(catalog, packageId)) {
      runtimeState.catalogs.delete(catalogId)
      removedCatalogIds.add(catalogId)
      changed = true
    }
  }

  for (const [entryId, entry] of runtimeState.entries.entries()) {
    if (removedCatalogIds.has(entry.catalogId) || galleryEntryRequiresRuntimePackage(entry, packageId)) {
      runtimeState.entries.delete(entryId)
      changed = true
    }
  }

  if (!changed) {
    return
  }

  await rebuildGalleryProjection(engine, runtimeState, {})
}

export async function openGallerySceneWithEngine(
  engine: QuaEngineInterface,
  options: GalleryOpenOptions = {},
): Promise<void> {
  const runtimeState = getRequiredGalleryRuntimeState(engine)
  const current = getGalleryProjection(engine)
  const profileId = trimNonEmpty(options.profileId) || current.profileId || runtimeState.defaultProfileId
  await ensureGalleryProfile(engine, runtimeState, profileId)

  if (engine.getCurrentSceneName() === GALLERY_SCENE_ID) {
    await rebuildGalleryProjection(engine, runtimeState, {
      sceneActive: true,
      profileId,
      selectedCatalogId: options.catalogId ?? undefined,
      selectedEntryId: options.entryId ?? undefined,
      selectedContentId: options.contentId ?? undefined,
      fallbackTarget: options.fallbackTarget === undefined ? undefined : normalizeGalleryFallbackTarget(options.fallbackTarget) || null,
      overlayStack: options.overlayStack,
      stackPriority: options.stackPriority,
      zIndex: options.zIndex,
      filter: options.filter ? normalizeGalleryFilterState(options.filter) : current.filter,
    })
    return
  }

  const checkpoint = await createGalleryReturnCheckpoint(engine)
  await rebuildGalleryProjection(engine, runtimeState, {
    sceneActive: true,
    profileId,
    selectedCatalogId: options.catalogId ?? undefined,
    selectedEntryId: options.entryId ?? undefined,
    selectedContentId: options.contentId ?? undefined,
    returnCheckpointId: checkpoint.id,
    fallbackTarget: options.fallbackTarget === undefined ? undefined : normalizeGalleryFallbackTarget(options.fallbackTarget) || null,
    overlayStack: options.overlayStack,
    stackPriority: options.stackPriority,
    zIndex: options.zIndex,
    filter: options.filter ? normalizeGalleryFilterState(options.filter) : current.filter,
  })

  const projection = getGalleryProjection(engine)
  const enterContext: SceneEnterContext = {
    sceneId: GALLERY_SCENE_ID,
    initialState: createGallerySceneState(projection) as JsonSerializableRecord,
    reason: options.reason || 'gallery-open',
    fromScene: engine.getCurrentSceneName(),
    fromPoint: engine.getStoryPoint(),
    transition: options.transition,
    requiredRuntimePackages: projection.requiredRuntimePackages,
  }

  await getSceneLoader(engine).loadScene(
    new GallerySceneShell(engine, runtimeState),
    options.transition,
    enterContext,
  )
}

export async function closeGallerySceneWithEngine(engine: QuaEngineInterface): Promise<void> {
  const runtimeState = getRequiredGalleryRuntimeState(engine)
  const projection = getGalleryProjection(engine)
  if (!isGallerySceneOpen(engine, projection)) {
    return
  }

  if (projection.returnCheckpointId) {
    const checkpoint = engine.getCheckpoint(projection.returnCheckpointId)
    if (checkpoint) {
      await engine.jumpTo(checkpoint, { reason: 'gallery', resume: 'pause' })
      return
    }
  }

  if (projection.fallbackTarget) {
    await rebuildGalleryProjection(engine, runtimeState, {
      sceneActive: false,
      returnCheckpointId: null,
    })
    await engine.jumpTo(cloneGalleryFallbackTarget(projection.fallbackTarget)!, { reason: 'gallery', resume: 'pause' })
    return
  }

  await rebuildGalleryProjection(engine, runtimeState, {
    sceneActive: false,
    returnCheckpointId: null,
  })
}

export async function unlockGalleryEntryWithEngine(
  engine: QuaEngineInterface,
  entryId: string | readonly string[],
  options: GalleryUnlockOptions = {},
): Promise<GalleryProfileState> {
  const entryIds = Array.isArray(entryId) ? entryId : [entryId]
  return await unlockGalleryEntriesWithEngine(engine, entryIds, options)
}

export async function unlockGalleryEntriesWithEngine(
  engine: QuaEngineInterface,
  entryIds: readonly string[],
  options: GalleryUnlockOptions = {},
): Promise<GalleryProfileState> {
  const runtimeState = getRequiredGalleryRuntimeState(engine)
  const projection = getGalleryProjection(engine)
  const profileId = trimNonEmpty(options.profileId)
    || projection.profileId
    || runtimeState.defaultProfileId
  const profile = await ensureGalleryProfile(engine, runtimeState, profileId)
  const unlockedEntries: Record<string, GalleryUnlockRecord> = {
    ...profile.state.unlockedEntries,
  }
  let changed = false

  for (const rawEntryId of entryIds) {
    const normalizedEntryId = trimNonEmpty(rawEntryId)
    if (!normalizedEntryId || unlockedEntries[normalizedEntryId]) {
      continue
    }

    const definition = runtimeState.entries.get(normalizedEntryId)
    if (!definition) {
      throw new Error(`Gallery entry "${normalizedEntryId}" is not registered.`)
    }
    unlockedEntries[normalizedEntryId] = {
      entryId: normalizedEntryId,
      unlockedAt: Date.now(),
      source: trimNonEmpty(options.source),
      contentPackageId: trimNonEmpty(options.contentPackageId) || definition?.contentPackageId,
      requiredRuntimePackages: mergeRequiredRuntimePackages(
        options.requiredRuntimePackages,
        definition?.requiredRuntimePackages,
      ),
    }
    changed = true
  }

  if (!changed) {
    return cloneGalleryProfileState(profile.state)
  }

  const nextProfile: GalleryProfileState = {
    profileId,
    updatedAt: Date.now(),
    unlockedEntries,
  }
  applyGalleryProfileState(profile, nextProfile)
  await persistGalleryProfile(profile)
  await rebuildGalleryProjection(engine, runtimeState, { profileId })
  return cloneGalleryProfileState(nextProfile)
}

export async function resetGalleryProfileWithEngine(
  engine: QuaEngineInterface,
  options: { profileId?: string } = {},
): Promise<GalleryProfileState> {
  const runtimeState = getRequiredGalleryRuntimeState(engine)
  const profileId = trimNonEmpty(options.profileId)
    || getGalleryProjection(engine).profileId
    || runtimeState.defaultProfileId
  const profile = await ensureGalleryProfile(engine, runtimeState, profileId)
  const nextProfile = createEmptyGalleryProfile(profileId)
  applyGalleryProfileState(profile, nextProfile)
  await persistGalleryProfile(profile)
  await rebuildGalleryProjection(engine, runtimeState, { profileId })
  return cloneGalleryProfileState(nextProfile)
}

export const metadata = {
  name: '@quajs/plugin-gallery',
  version: '0.1.0',
  description: 'Gallery catalog scene shell and persistent unlock profiles for QuaEngine',
  category: 'ui',
} as const

export const Plugin = GalleryPlugin

async function selectGalleryCatalogWithEngine(engine: QuaEngineInterface, catalogId?: string): Promise<void> {
  const runtimeState = getRequiredGalleryRuntimeState(engine)
  await rebuildGalleryProjection(engine, runtimeState, {
    selectedCatalogId: trimNonEmpty(catalogId) || null,
    selectedEntryId: null,
    selectedContentId: null,
  })
}

async function selectGalleryEntryWithEngine(engine: QuaEngineInterface, entryId?: string): Promise<void> {
  const runtimeState = getRequiredGalleryRuntimeState(engine)
  const normalizedEntryId = trimNonEmpty(entryId)
  const catalogId = normalizedEntryId
    ? runtimeState.entries.get(normalizedEntryId)?.catalogId || null
    : null
  await rebuildGalleryProjection(engine, runtimeState, {
    selectedCatalogId: catalogId,
    selectedEntryId: normalizedEntryId || null,
    selectedContentId: null,
  })
}

async function selectGalleryContentWithEngine(engine: QuaEngineInterface, contentId?: string): Promise<void> {
  const runtimeState = getRequiredGalleryRuntimeState(engine)
  await rebuildGalleryProjection(engine, runtimeState, {
    selectedContentId: trimNonEmpty(contentId) || null,
  })
}

async function updateGalleryFilterWithEngine(
  engine: QuaEngineInterface,
  payload: GalleryUpdateFilterRequestPayload,
): Promise<void> {
  const runtimeState = getRequiredGalleryRuntimeState(engine)
  const current = getGalleryProjection(engine)
  const nextFilter = payload.replace
    ? normalizeGalleryFilterState(payload.filter)
    : normalizeGalleryFilterState({
        ...current.filter,
        ...payload.filter,
      })
  await rebuildGalleryProjection(engine, runtimeState, {
    filter: nextFilter,
    selectedEntryId: null,
    selectedContentId: null,
  })
}

async function applyGallerySceneEnterState(
  engine: QuaEngineInterface,
  runtimeState: GalleryRuntimeState,
  ctx?: SceneEnterContext,
): Promise<void> {
  const initialState = isGallerySceneState(ctx?.initialState) ? ctx.initialState : undefined
  if (!initialState) {
    await rebuildGalleryProjection(engine, runtimeState, { sceneActive: true })
    return
  }

  const profileId = trimNonEmpty(initialState.profileId)
  if (profileId) {
    await ensureGalleryProfile(engine, runtimeState, profileId)
  }

  await rebuildGalleryProjection(engine, runtimeState, {
    sceneActive: true,
    profileId,
    selectedCatalogId: trimNonEmpty(initialState.selectedCatalogId) || null,
    selectedEntryId: trimNonEmpty(initialState.selectedEntryId) || null,
    selectedContentId: trimNonEmpty(initialState.selectedContentId) || null,
    returnCheckpointId: trimNonEmpty(initialState.returnCheckpointId) || null,
    fallbackTarget: initialState.fallbackTarget === undefined
      ? undefined
      : normalizeGalleryFallbackTarget(initialState.fallbackTarget) || null,
    overlayStack: initialState.overlayStack,
    stackPriority: initialState.stackPriority,
    zIndex: initialState.zIndex,
    filter: initialState.filter ? normalizeGalleryFilterState(initialState.filter) : undefined,
  })
}

async function applyGalleryMetadataUnlocks(
  engine: QuaEngineInterface,
  runtimeState: GalleryRuntimeState,
  point?: StoryPoint,
): Promise<void> {
  const metadataContext = resolveCurrentGalleryMetadataContext(engine, point)
  if (!metadataContext?.metadata) {
    return
  }

  const unlockIds = extractGalleryUnlockIds(metadataContext.metadata)
  if (unlockIds.length === 0) {
    return
  }

  await unlockGalleryEntriesWithEngine(engine, unlockIds, {
    profileId: getGalleryProjection(engine).profileId || runtimeState.defaultProfileId,
    source: 'metadata',
    contentPackageId: metadataContext.contentPackageId,
    requiredRuntimePackages: metadataContext.requiredRuntimePackages,
  })
}

async function createGalleryReturnCheckpoint(engine: QuaEngineInterface) {
  const galleryPackageId = trimNonEmpty(
    (engine.getViewState().plugins[GALLERY_PLUGIN_ID] as { contentPackageId?: string } | undefined)?.contentPackageId,
  )
  const checkpoint = await engine.createCheckpoint({ kind: 'manual' })
  const point = engine.getStoryPoint()
  const pointPackages = mergeRequiredRuntimePackages(
    point?.contentPackageId ? [point.contentPackageId] : [],
    point?.requiredRuntimePackages,
  )
  const metadata: Record<string, unknown> = checkpoint.metadata
    ? (cloneUnknownRecord(checkpoint.metadata) || {})
    : {}
  const requiredRuntimePackages = mergeRequiredRuntimePackages(
    getRequiredRuntimePackages(metadata),
    pointPackages,
  )
  const nextRequiredRuntimePackages = galleryPackageId && !pointPackages.includes(galleryPackageId)
    ? requiredRuntimePackages.filter(packageId => packageId !== galleryPackageId)
    : requiredRuntimePackages
  if (nextRequiredRuntimePackages.length > 0) {
    metadata.requiredRuntimePackages = nextRequiredRuntimePackages
  }
  else {
    delete metadata.requiredRuntimePackages
  }
  const normalizedCheckpoint = {
    ...checkpoint,
    metadata,
  }
  engine.getStore().commit('upsertCheckpoint', normalizedCheckpoint)
  return normalizedCheckpoint
}

async function rebuildGalleryProjection(
  engine: QuaEngineInterface,
  runtimeState: GalleryRuntimeState,
  patch: GalleryProjectionPatch,
  preInitStore?: Pick<QuaStore, 'commit'>,
): Promise<GalleryProjection> {
  const current = getGalleryProjection(engine)
  const profileId = trimNonEmpty(patch.profileId)
    || current.profileId
    || runtimeState.defaultProfileId
  const profile = await ensureGalleryProfile(engine, runtimeState, profileId)
  const catalogs = Array.from(runtimeState.catalogs.values()).map(catalog =>
    createGalleryCatalogProjectionItem(catalog, runtimeState.entries, profile.state),
  )
  const unorderedEntries = Array.from(runtimeState.entries.values())
    .filter(entry => runtimeState.catalogs.has(entry.catalogId))
    .map(entry => createGalleryEntryProjectionItem(entry, profile.state))
  const entries = orderGalleryProjectionEntries(catalogs, unorderedEntries)

  const nextFilter = patch.filter ? normalizeGalleryFilterState(patch.filter) : normalizeGalleryFilterState(current.filter)
  const requestedCatalogId = patch.selectedCatalogId === undefined ? current.selectedCatalogId : patch.selectedCatalogId || undefined
  const selectedCatalogId = selectGalleryCatalogId(catalogs, requestedCatalogId)
  const filteredEntries = filterGalleryEntries(entries, selectedCatalogId, nextFilter)
  const filteredEntryIds = filteredEntries.map(entry => entry.id)
  const requestedEntryId = patch.selectedEntryId === undefined ? current.selectedEntryId : patch.selectedEntryId || undefined
  const selectedEntryId = selectGalleryEntryId(filteredEntries, requestedEntryId)
  const selectedEntry = selectedEntryId
    ? entries.find(entry => entry.id === selectedEntryId)
    : undefined
  const requestedContentId = patch.selectedContentId === undefined ? current.selectedContentId : patch.selectedContentId || undefined
  const selectedContentId = selectGalleryContentId(selectedEntry, requestedContentId)
  const sceneActive = patch.sceneActive ?? (engine.getCurrentSceneName() === GALLERY_SCENE_ID)
  const nextProjection: GalleryProjection = {
    revision: current.revision + 1,
    sceneActive,
    profileId,
    overlayStack: patch.overlayStack ?? current.overlayStack ?? 'overlay',
    stackPriority: patch.stackPriority ?? current.stackPriority,
    zIndex: patch.zIndex ?? current.zIndex ?? DEFAULT_UI_OVERLAY_Z_INDEXES.gallery,
    catalogs: sceneActive ? catalogs.map(cloneGalleryCatalogProjectionItem) : [],
    entries: sceneActive ? entries.map(cloneGalleryEntryProjectionItem) : [],
    filteredEntryIds: sceneActive ? filteredEntryIds : [],
    selectedCatalogId,
    selectedEntryId,
    selectedContentId,
    returnCheckpointId: patch.returnCheckpointId === undefined
      ? current.returnCheckpointId
      : patch.returnCheckpointId || undefined,
    fallbackTarget: patch.fallbackTarget === undefined
      ? cloneGalleryFallbackTarget(current.fallbackTarget)
      : cloneGalleryFallbackTarget(patch.fallbackTarget || undefined),
    requiredRuntimePackages: sceneActive
      ? collectActiveGalleryRequiredRuntimePackages(catalogs, entries)
      : [],
    filter: nextFilter,
  }
  if (preInitStore) {
    preInitStore.commit('setPluginProjection', {
      pluginId: GALLERY_PLUGIN_ID,
      projection: nextProjection,
    })
  }
  else {
    await engine.setPluginProjection(GALLERY_PLUGIN_ID, nextProjection)
  }
  return nextProjection
}

function getOrCreateGalleryRuntimeState(engine: QuaEngineInterface, defaultProfileId: string): GalleryRuntimeState {
  const key = getGalleryRuntimeKey(engine)
  const existing = galleryRuntimeState.get(key)
  if (existing) {
    return existing
  }
  const created: GalleryRuntimeState = {
    defaultProfileId: trimNonEmpty(defaultProfileId) || DEFAULT_PROFILE_ID,
    catalogs: new Map(),
    entries: new Map(),
    profiles: new Map(),
  }
  galleryRuntimeState.set(key, created)
  return created
}

async function registerGallerySettingsScope(
  ctx: EngineContext,
  runtimeState: GalleryRuntimeState,
): Promise<(() => void) | undefined> {
  try {
    const settings = await import('@quajs/plugin-settings')
    const unregister = settings.registerSettingsScope(ctx.engine, {
      scope: GALLERY_SETTINGS_SCOPE,
      version: 1,
      title: 'Gallery',
      description: 'Gallery profile defaults.',
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
        } satisfies GalleryDeveloperSettings,
        values: {
          defaultProfileId: runtimeState.defaultProfileId,
        } satisfies GalleryDeveloperSettings,
      },
      apply: async ({ developer }) => {
        runtimeState.defaultProfileId = trimNonEmpty(developer.defaultProfileId) || DEFAULT_PROFILE_ID
        await ensureGalleryProfile(ctx.engine, runtimeState, runtimeState.defaultProfileId)
        await rebuildGalleryProjection(ctx.engine, runtimeState, {})
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

function getGalleryRuntimeState(engine: QuaEngineInterface): GalleryRuntimeState | undefined {
  return galleryRuntimeState.get(getGalleryRuntimeKey(engine))
}

function getRequiredGalleryRuntimeState(engine: QuaEngineInterface): GalleryRuntimeState {
  const runtimeState = getGalleryRuntimeState(engine)
  if (!runtimeState) {
    throw new Error('@quajs/plugin-gallery must be installed before gallery APIs can be used.')
  }
  return runtimeState
}

async function ensureGalleryProfile(
  engine: QuaEngineInterface,
  runtimeState: GalleryRuntimeState,
  profileId: string,
): Promise<GalleryProfileRuntime> {
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
  const snapshotId = `${GALLERY_PROFILE_STORE_PREFIX}${resolvedProfileId}`
  const store = new QuaStore(snapshotId, {
    state: {
      profile: createEmptyGalleryProfile(resolvedProfileId),
    } satisfies GalleryProfileStoreState,
    mutations: {
      setProfile(state: QuaState, payload: GalleryProfileState) {
        ;(state as GalleryProfileStoreState).profile = cloneGalleryProfileState(payload)
      },
    },
    serializer: engineStore.getSerializer() as any,
    storageManager,
  } as any)

  try {
    await store.restore(snapshotId, { force: true })
  }
  catch {
    // Gallery profiles are long-lived optional progress. Storage read failures fall back to an empty in-memory profile.
  }

  const rawProfile = isGalleryProfileStoreState(store.getState())
    ? store.getState().profile
    : createEmptyGalleryProfile(resolvedProfileId)
  const runtime: GalleryProfileRuntime = {
    store,
    snapshotId,
    state: normalizeGalleryProfileState(rawProfile, resolvedProfileId),
  }
  applyGalleryProfileState(runtime, runtime.state)
  runtimeState.profiles.set(resolvedProfileId, runtime)
  return runtime
}

async function persistGalleryProfile(profile: GalleryProfileRuntime): Promise<void> {
  try {
    await profile.store.snapshot(profile.snapshotId)
  }
  catch {
    // Profile persistence is best-effort; current in-memory unlock state should keep moving.
  }
}

function applyGalleryProfileState(profile: GalleryProfileRuntime, nextProfile: GalleryProfileState): void {
  profile.state = cloneGalleryProfileState(nextProfile)
  profile.store.commit('setProfile', profile.state)
}

function resolveCurrentGalleryMetadataContext(
  engine: QuaEngineInterface,
  point?: StoryPoint,
): {
  metadata: GalleryStoryMetadata
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
  const value = node?.metadata?.[GALLERY_METADATA_NAMESPACE]
  if (!isGalleryStoryMetadata(value)) {
    return undefined
  }

  return {
    metadata: value,
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

function extractGalleryUnlockIds(metadata?: GalleryStoryMetadata): string[] {
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

function createInitialGalleryProjection(profileId: string): GalleryProjection {
  return {
    revision: 0,
    sceneActive: false,
    profileId,
    overlayStack: 'overlay',
    zIndex: DEFAULT_UI_OVERLAY_Z_INDEXES.gallery,
    catalogs: [],
    entries: [],
    filteredEntryIds: [],
    requiredRuntimePackages: [],
    filter: {},
  }
}

function createEmptyGalleryProfile(profileId: string): GalleryProfileState {
  return {
    profileId,
    updatedAt: 0,
    unlockedEntries: {},
  }
}

function normalizeGalleryProfileState(value: unknown, profileId: string): GalleryProfileState {
  if (!isPlainRecord(value)) {
    return createEmptyGalleryProfile(profileId)
  }

  const unlockedEntries = isPlainRecord(value.unlockedEntries)
    ? Object.fromEntries(
        Object.entries(value.unlockedEntries)
          .filter(([, record]) => isGalleryUnlockRecord(record))
          .map(([entryId, record]) => [entryId, cloneGalleryUnlockRecord(record as GalleryUnlockRecord)]),
      )
    : {}

  return {
    profileId,
    updatedAt: typeof value.updatedAt === 'number' ? value.updatedAt : 0,
    unlockedEntries,
  }
}

function createGalleryCatalogProjectionItem(
  catalog: GalleryCatalogDefinition,
  entries: ReadonlyMap<string, GalleryEntryDefinition>,
  profile: GalleryProfileState,
): GalleryCatalogProjectionItem {
  const catalogEntries = Array.from(entries.values()).filter(entry => entry.catalogId === catalog.id)
  const orderedIds = orderCatalogEntryIds(catalog, catalogEntries)
  const unlockedEntries = catalogEntries.filter(entry => Boolean(profile.unlockedEntries[entry.id])).length
  return {
    ...cloneGalleryCatalogDefinition(catalog),
    entryIds: orderedIds,
    totalEntries: catalogEntries.length,
    unlockedEntries,
    lockedEntries: catalogEntries.length - unlockedEntries,
  }
}

function createGalleryEntryProjectionItem(
  entry: GalleryEntryDefinition,
  profile: GalleryProfileState,
): GalleryEntryProjectionItem {
  const unlocked = Boolean(profile.unlockedEntries[entry.id])
  const projectedEntry = unlocked ? cloneGalleryEntryProjectionDefinition(entry) : createLockedGalleryEntryProjection(entry)
  return {
    ...projectedEntry,
    unlocked,
  }
}

function orderGalleryProjectionEntries(
  catalogs: readonly GalleryCatalogProjectionItem[],
  entries: readonly GalleryEntryProjectionItem[],
): GalleryEntryProjectionItem[] {
  const entryById = new Map(entries.map(entry => [entry.id, entry]))
  const seen = new Set<string>()
  const ordered: GalleryEntryProjectionItem[] = []

  for (const catalog of catalogs) {
    for (const entryId of catalog.entryIds) {
      const entry = entryById.get(entryId)
      if (!entry || seen.has(entry.id)) {
        continue
      }
      ordered.push(entry)
      seen.add(entry.id)
    }
  }

  for (const entry of entries) {
    if (!seen.has(entry.id)) {
      ordered.push(entry)
    }
  }

  return ordered
}

function createLockedGalleryEntryProjection(entry: GalleryEntryDefinition): GalleryEntryProjectionDefinition {
  const presentation = entry.lockedPresentation
  return {
    id: entry.id,
    catalogId: entry.catalogId,
    title: presentation?.revealTitle === true
      ? entry.title
      : trimNonEmpty(presentation?.title) || 'Locked',
    summary: presentation?.revealSummary === true
      ? entry.summary
      : trimNonEmpty(presentation?.summary),
    description: presentation?.revealDescription === true
      ? entry.description
      : trimNonEmpty(presentation?.description),
    thumbnail: presentation?.revealThumbnail === true
      ? cloneStoryAssetRef(entry.thumbnail)
      : cloneStoryAssetRef(presentation?.thumbnail),
    poster: presentation?.revealPoster === true
      ? cloneStoryAssetRef(entry.poster)
      : cloneStoryAssetRef(presentation?.poster),
    tags: presentation?.revealTags === true
      ? (entry.tags ? [...entry.tags] : undefined)
      : (presentation?.tags ? [...presentation.tags] : undefined),
    contents: presentation?.revealContents === true
      ? entry.contents.map(cloneGalleryContentBlock)
      : (presentation?.contents ? presentation.contents.map(cloneGalleryContentBlock) : []),
    metadata: presentation?.revealMetadata === true
      ? cloneUnknownRecord(entry.metadata)
      : cloneUnknownRecord(presentation?.metadata),
    contentPackageId: entry.contentPackageId,
    requiredRuntimePackages: entry.requiredRuntimePackages ? [...entry.requiredRuntimePackages] : undefined,
  }
}

function orderCatalogEntryIds(catalog: GalleryCatalogDefinition, entries: readonly GalleryEntryDefinition[]): string[] {
  const actualIds = new Set(entries.map(entry => entry.id))
  const preferred = (dedupeStrings(catalog.entryIds) || []).filter(entryId => actualIds.has(entryId))
  const preferredIds = new Set(preferred)
  const remainder = entries
    .map(entry => entry.id)
    .filter(entryId => !preferredIds.has(entryId))
  return [...preferred, ...remainder]
}

function selectGalleryCatalogId(
  catalogs: readonly GalleryCatalogProjectionItem[],
  requested?: string,
): string | undefined {
  if (requested && catalogs.some(catalog => catalog.id === requested)) {
    return requested
  }
  return catalogs[0]?.id
}

function filterGalleryEntries(
  entries: readonly GalleryEntryProjectionItem[],
  selectedCatalogId: string | undefined,
  filter: GalleryFilterState,
): GalleryEntryProjectionItem[] {
  const search = filter.search?.toLowerCase()
  return entries.filter((entry) => {
    if (selectedCatalogId && entry.catalogId !== selectedCatalogId) {
      return false
    }
    if (filter.unlockedOnly && !entry.unlocked) {
      return false
    }
    if (filter.tags?.length) {
      const tagSet = new Set(entry.tags || [])
      if (!filter.tags.every(tag => tagSet.has(tag))) {
        return false
      }
    }
    if (filter.contentKinds?.length) {
      const kinds = new Set(entry.contents.map(content => content.kind))
      if (!filter.contentKinds.some(kind => kinds.has(kind))) {
        return false
      }
    }
    if (search) {
      const haystack = [
        entry.title,
        entry.summary,
        entry.description,
        ...(entry.tags || []),
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

function selectGalleryEntryId(
  filteredEntries: readonly GalleryEntryProjectionItem[],
  requested?: string,
): string | undefined {
  if (requested && filteredEntries.some(entry => entry.id === requested)) {
    return requested
  }
  return filteredEntries[0]?.id
}

function selectGalleryContentId(
  entry: GalleryEntryProjectionItem | undefined,
  requested?: string,
): string | undefined {
  if (!entry) {
    return undefined
  }
  if (requested && entry.contents.some(content => content.id === requested)) {
    return requested
  }
  return entry.contents[0]?.id
}

function collectActiveGalleryRequiredRuntimePackages(
  catalogs: readonly GalleryCatalogProjectionItem[],
  entries: readonly GalleryEntryProjectionItem[],
): string[] {
  return mergeRequiredRuntimePackages(
    ...catalogs.map(catalog => catalog.requiredRuntimePackages),
    ...entries.map(entry => entry.requiredRuntimePackages),
    ...entries.flatMap(entry => entry.contents.map(content => content.requiredRuntimePackages)),
  )
}

function normalizeGalleryCatalogDefinition(
  engine: QuaEngineInterface,
  catalog: GalleryCatalogDefinition,
): GalleryCatalogDefinition {
  const id = requireNonEmpty(catalog.id, 'Gallery catalog id must not be empty.')
  const title = requireNonEmpty(catalog.title, `Gallery catalog "${id}" title must not be empty.`)
  const packageId = resolveGalleryContentPackageId(engine, catalog.contentPackageId, catalog.metadata)
  const thumbnail = normalizeStoryAssetRef(catalog.thumbnail, packageId)
  return {
    id,
    title,
    summary: trimNonEmpty(catalog.summary),
    description: trimNonEmpty(catalog.description),
    thumbnail,
    entryIds: dedupeStrings(catalog.entryIds),
    metadata: cloneUnknownRecord(catalog.metadata),
    contentPackageId: packageId,
    requiredRuntimePackages: mergeRequiredRuntimePackages(
      catalog.requiredRuntimePackages,
      packageId ? [packageId] : [],
      thumbnail?.runtimePackageId ? [thumbnail.runtimePackageId] : [],
      getRequiredRuntimePackages(catalog.metadata),
      currentMetadataRuntimePackageDependencies(engine, catalog.metadata),
    ),
  }
}

function normalizeGalleryEntryDefinition(
  engine: QuaEngineInterface,
  entry: GalleryEntryDefinition,
): GalleryEntryDefinition {
  const id = requireNonEmpty(entry.id, 'Gallery entry id must not be empty.')
  const catalogId = requireNonEmpty(entry.catalogId, `Gallery entry "${id}" catalogId must not be empty.`)
  const title = requireNonEmpty(entry.title, `Gallery entry "${id}" title must not be empty.`)
  if (!Array.isArray(entry.contents) || entry.contents.length === 0) {
    throw new Error(`Gallery entry "${id}" must include at least one content block.`)
  }

  const packageId = resolveGalleryContentPackageId(engine, entry.contentPackageId, entry.metadata)
  const thumbnail = normalizeStoryAssetRef(entry.thumbnail, packageId)
  const poster = normalizeStoryAssetRef(entry.poster, packageId)
  const contents = entry.contents.map(content => normalizeGalleryContentBlock(content, packageId))
  const lockedPresentation = normalizeGalleryLockedPresentation(entry.lockedPresentation, packageId)
  return {
    id,
    catalogId,
    title,
    summary: trimNonEmpty(entry.summary),
    description: trimNonEmpty(entry.description),
    thumbnail,
    poster,
    tags: dedupeStrings(entry.tags),
    contents,
    lockedPresentation,
    metadata: cloneUnknownRecord(entry.metadata),
    contentPackageId: packageId,
    requiredRuntimePackages: mergeRequiredRuntimePackages(
      entry.requiredRuntimePackages,
      packageId ? [packageId] : [],
      thumbnail?.runtimePackageId ? [thumbnail.runtimePackageId] : [],
      poster?.runtimePackageId ? [poster.runtimePackageId] : [],
      getRequiredRuntimePackages(entry.metadata),
      currentMetadataRuntimePackageDependencies(engine, entry.metadata),
      ...contents.map(content => content.requiredRuntimePackages),
      lockedPresentation?.thumbnail?.runtimePackageId ? [lockedPresentation.thumbnail.runtimePackageId] : [],
      lockedPresentation?.poster?.runtimePackageId ? [lockedPresentation.poster.runtimePackageId] : [],
      ...((lockedPresentation?.contents || []).map(content => content.requiredRuntimePackages)),
    ),
  }
}

function normalizeGalleryLockedPresentation(
  presentation: GalleryLockedPresentation | undefined,
  ownerPackageId?: string,
): GalleryLockedPresentation | undefined {
  if (!presentation) {
    return undefined
  }
  return {
    title: trimNonEmpty(presentation.title),
    summary: trimNonEmpty(presentation.summary),
    description: trimNonEmpty(presentation.description),
    thumbnail: normalizeStoryAssetRef(presentation.thumbnail, ownerPackageId),
    poster: normalizeStoryAssetRef(presentation.poster, ownerPackageId),
    tags: dedupeStrings(presentation.tags),
    contents: presentation.contents?.map(content => normalizeGalleryContentBlock(content, ownerPackageId)),
    metadata: cloneUnknownRecord(presentation.metadata),
    revealTitle: presentation.revealTitle === true ? true : undefined,
    revealSummary: presentation.revealSummary === true ? true : undefined,
    revealDescription: presentation.revealDescription === true ? true : undefined,
    revealThumbnail: presentation.revealThumbnail === true ? true : undefined,
    revealPoster: presentation.revealPoster === true ? true : undefined,
    revealTags: presentation.revealTags === true ? true : undefined,
    revealContents: presentation.revealContents === true ? true : undefined,
    revealMetadata: presentation.revealMetadata === true ? true : undefined,
  }
}

function normalizeGalleryContentBlock(
  block: GalleryContentBlock,
  ownerPackageId?: string,
): GalleryContentBlock {
  const id = requireNonEmpty(block.id, 'Gallery content block id must not be empty.')
  const kind = requireNonEmpty(block.kind, `Gallery content block "${id}" kind must not be empty.`)
  const contentPackageId = trimNonEmpty(block.contentPackageId) || ownerPackageId
  const base = {
    ...block,
    id,
    kind,
    title: trimNonEmpty(block.title),
    summary: trimNonEmpty(block.summary),
    metadata: cloneUnknownRecord(block.metadata),
    contentPackageId,
  }

  switch (kind) {
    case 'image': {
      assertAssetRef((block as GalleryImageContentBlock).asset, `Gallery image content "${id}" requires an asset ref.`)
      const asset = normalizeStoryAssetRef((block as GalleryImageContentBlock).asset, contentPackageId)!
      return {
        ...base,
        kind: 'image',
        asset,
        requiredRuntimePackages: mergeRequiredRuntimePackages(
          block.requiredRuntimePackages,
          contentPackageId ? [contentPackageId] : [],
          asset.runtimePackageId ? [asset.runtimePackageId] : [],
          getRequiredRuntimePackages(block.metadata),
        ),
      }
    }
    case 'video': {
      assertAssetRef((block as GalleryVideoContentBlock).asset, `Gallery video content "${id}" requires an asset ref.`)
      const asset = normalizeStoryAssetRef((block as GalleryVideoContentBlock).asset, contentPackageId)!
      const poster = normalizeStoryAssetRef((block as GalleryVideoContentBlock).poster, contentPackageId)
      return {
        ...base,
        kind: 'video',
        asset,
        poster,
        requiredRuntimePackages: mergeRequiredRuntimePackages(
          block.requiredRuntimePackages,
          contentPackageId ? [contentPackageId] : [],
          asset.runtimePackageId ? [asset.runtimePackageId] : [],
          poster?.runtimePackageId ? [poster.runtimePackageId] : [],
          getRequiredRuntimePackages(block.metadata),
        ),
      }
    }
    case 'audio': {
      assertAssetRef((block as GalleryAudioContentBlock).asset, `Gallery audio content "${id}" requires an asset ref.`)
      const asset = normalizeStoryAssetRef((block as GalleryAudioContentBlock).asset, contentPackageId)!
      const poster = normalizeStoryAssetRef((block as GalleryAudioContentBlock).poster, contentPackageId)
      return {
        ...base,
        kind: 'audio',
        asset,
        poster,
        requiredRuntimePackages: mergeRequiredRuntimePackages(
          block.requiredRuntimePackages,
          contentPackageId ? [contentPackageId] : [],
          asset.runtimePackageId ? [asset.runtimePackageId] : [],
          poster?.runtimePackageId ? [poster.runtimePackageId] : [],
          getRequiredRuntimePackages(block.metadata),
        ),
      }
    }
    case 'text': {
      if (typeof (block as GalleryTextContentBlock).text !== 'string') {
        throw new TypeError(`Gallery text content "${id}" requires text.`)
      }
      return {
        ...base,
        kind: 'text',
        text: (block as GalleryTextContentBlock).text,
        requiredRuntimePackages: mergeRequiredRuntimePackages(
          block.requiredRuntimePackages,
          contentPackageId ? [contentPackageId] : [],
          getRequiredRuntimePackages(block.metadata),
        ),
      }
    }
    default: {
      const data = (block as GalleryCustomContentBlock).data
      assertJsonSerializable(data, `Gallery content block "${id}" data must be JSON-serializable.`)
      return {
        ...base,
        data: cloneJsonSerializable(data),
        requiredRuntimePackages: mergeRequiredRuntimePackages(
          block.requiredRuntimePackages,
          contentPackageId ? [contentPackageId] : [],
          getRequiredRuntimePackages(block.metadata),
        ),
      }
    }
  }
}

function normalizeStoryAssetRef(
  ref: StoryAssetRef | undefined,
  runtimePackageId?: string,
): StoryAssetRef | undefined {
  if (!ref) {
    return undefined
  }
  assertAssetRef(ref, 'Gallery asset refs must include non-empty type and name.')
  return {
    type: ref.type,
    name: ref.name.trim(),
    runtimePackageId: trimNonEmpty(ref.runtimePackageId) || runtimePackageId,
    alt: trimNonEmpty(ref.alt),
    focalPoint: ref.focalPoint ? { x: ref.focalPoint.x, y: ref.focalPoint.y } : undefined,
    metadata: cloneUnknownRecord(ref.metadata),
  }
}

function resolveGalleryContentPackageId(
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

function galleryCatalogRequiresRuntimePackage(catalog: GalleryCatalogDefinition, packageId: string): boolean {
  return galleryDefinitionRequiresRuntimePackage(catalog, packageId)
}

function galleryEntryRequiresRuntimePackage(entry: GalleryEntryDefinition, packageId: string): boolean {
  return galleryDefinitionRequiresRuntimePackage(entry, packageId)
    || entry.contents.some(content => galleryDefinitionRequiresRuntimePackage(content, packageId))
}

function galleryDefinitionRequiresRuntimePackage(
  definition: {
    contentPackageId?: string
    requiredRuntimePackages?: readonly string[]
    metadata?: Readonly<Record<string, unknown>>
  },
  packageId: string,
): boolean {
  return definition.contentPackageId === packageId
    || definition.requiredRuntimePackages?.includes(packageId) === true
    || contentPackageIdFromMetadata(definition.metadata) === packageId
    || getRequiredRuntimePackages(definition.metadata).includes(packageId)
}

function createGallerySceneState(projection: GalleryProjection): GallerySceneState {
  return {
    profileId: projection.profileId,
    selectedCatalogId: projection.selectedCatalogId,
    selectedEntryId: projection.selectedEntryId,
    selectedContentId: projection.selectedContentId,
    returnCheckpointId: projection.returnCheckpointId,
    fallbackTarget: cloneGalleryFallbackTarget(projection.fallbackTarget),
    overlayStack: projection.overlayStack,
    stackPriority: projection.stackPriority,
    zIndex: projection.zIndex,
    filter: {
      search: projection.filter.search,
      tags: projection.filter.tags ? [...projection.filter.tags] : undefined,
      contentKinds: projection.filter.contentKinds ? [...projection.filter.contentKinds] : undefined,
      unlockedOnly: projection.filter.unlockedOnly,
    },
  }
}

function normalizeGalleryFilterState(filter: Partial<GalleryFilterState> | undefined): GalleryFilterState {
  return {
    search: trimNonEmpty(filter?.search),
    tags: dedupeStrings(filter?.tags),
    contentKinds: dedupeStrings(filter?.contentKinds),
    unlockedOnly: filter?.unlockedOnly === true ? true : undefined,
  }
}

function normalizeGalleryFallbackTarget(value: unknown): GalleryFallbackTarget | undefined {
  if (typeof value === 'string') {
    return trimNonEmpty(value)
  }
  if (isPlainRecord(value) && typeof value.stepId === 'string') {
    return cloneStoryPoint(value as unknown as StoryPoint)
  }
  return undefined
}

function cloneGalleryProjection(projection: GalleryProjection): GalleryProjection {
  return {
    revision: projection.revision,
    sceneActive: projection.sceneActive,
    profileId: projection.profileId,
    catalogs: projection.catalogs.map(cloneGalleryCatalogProjectionItem),
    entries: projection.entries.map(cloneGalleryEntryProjectionItem),
    filteredEntryIds: [...projection.filteredEntryIds],
    selectedCatalogId: projection.selectedCatalogId,
    selectedEntryId: projection.selectedEntryId,
    selectedContentId: projection.selectedContentId,
    returnCheckpointId: projection.returnCheckpointId,
    fallbackTarget: cloneGalleryFallbackTarget(projection.fallbackTarget),
    overlayStack: projection.overlayStack,
    stackPriority: projection.stackPriority,
    zIndex: projection.zIndex,
    requiredRuntimePackages: [...projection.requiredRuntimePackages],
    filter: cloneGalleryFilterState(projection.filter),
  }
}

function cloneGalleryCatalogDefinition(catalog: GalleryCatalogDefinition): GalleryCatalogDefinition {
  return {
    id: catalog.id,
    title: catalog.title,
    summary: catalog.summary,
    description: catalog.description,
    thumbnail: cloneStoryAssetRef(catalog.thumbnail),
    entryIds: catalog.entryIds ? [...catalog.entryIds] : undefined,
    metadata: cloneUnknownRecord(catalog.metadata),
    contentPackageId: catalog.contentPackageId,
    requiredRuntimePackages: catalog.requiredRuntimePackages ? [...catalog.requiredRuntimePackages] : undefined,
  }
}

function cloneGalleryEntryDefinition(entry: GalleryEntryDefinition): GalleryEntryDefinition {
  return {
    id: entry.id,
    catalogId: entry.catalogId,
    title: entry.title,
    summary: entry.summary,
    description: entry.description,
    thumbnail: cloneStoryAssetRef(entry.thumbnail),
    poster: cloneStoryAssetRef(entry.poster),
    tags: entry.tags ? [...entry.tags] : undefined,
    contents: entry.contents.map(cloneGalleryContentBlock),
    lockedPresentation: cloneGalleryLockedPresentation(entry.lockedPresentation),
    metadata: cloneUnknownRecord(entry.metadata),
    contentPackageId: entry.contentPackageId,
    requiredRuntimePackages: entry.requiredRuntimePackages ? [...entry.requiredRuntimePackages] : undefined,
  }
}

function cloneGalleryEntryProjectionDefinition(
  entry: GalleryEntryProjectionDefinition,
): GalleryEntryProjectionDefinition {
  return {
    id: entry.id,
    catalogId: entry.catalogId,
    title: entry.title,
    summary: entry.summary,
    description: entry.description,
    thumbnail: cloneStoryAssetRef(entry.thumbnail),
    poster: cloneStoryAssetRef(entry.poster),
    tags: entry.tags ? [...entry.tags] : undefined,
    contents: entry.contents.map(cloneGalleryContentBlock),
    metadata: cloneUnknownRecord(entry.metadata),
    contentPackageId: entry.contentPackageId,
    requiredRuntimePackages: entry.requiredRuntimePackages ? [...entry.requiredRuntimePackages] : undefined,
  }
}

function cloneGalleryCatalogProjectionItem(item: GalleryCatalogProjectionItem): GalleryCatalogProjectionItem {
  return {
    ...cloneGalleryCatalogDefinition(item),
    entryIds: [...item.entryIds],
    totalEntries: item.totalEntries,
    unlockedEntries: item.unlockedEntries,
    lockedEntries: item.lockedEntries,
  }
}

function cloneGalleryEntryProjectionItem(item: GalleryEntryProjectionItem): GalleryEntryProjectionItem {
  return {
    ...cloneGalleryEntryProjectionDefinition(item),
    unlocked: item.unlocked,
  }
}

function cloneGalleryLockedPresentation(
  presentation: GalleryLockedPresentation | undefined,
): GalleryLockedPresentation | undefined {
  if (!presentation) {
    return undefined
  }
  return {
    title: presentation.title,
    summary: presentation.summary,
    description: presentation.description,
    thumbnail: cloneStoryAssetRef(presentation.thumbnail),
    poster: cloneStoryAssetRef(presentation.poster),
    tags: presentation.tags ? [...presentation.tags] : undefined,
    contents: presentation.contents?.map(cloneGalleryContentBlock),
    metadata: cloneUnknownRecord(presentation.metadata),
    revealTitle: presentation.revealTitle,
    revealSummary: presentation.revealSummary,
    revealDescription: presentation.revealDescription,
    revealThumbnail: presentation.revealThumbnail,
    revealPoster: presentation.revealPoster,
    revealTags: presentation.revealTags,
    revealContents: presentation.revealContents,
    revealMetadata: presentation.revealMetadata,
  }
}

function cloneGalleryContentBlock(block: GalleryContentBlock): GalleryContentBlock {
  const base = {
    ...block,
    metadata: cloneUnknownRecord(block.metadata),
    requiredRuntimePackages: block.requiredRuntimePackages ? [...block.requiredRuntimePackages] : undefined,
  }

  switch (block.kind) {
    case 'image':
      return {
        ...base,
        kind: 'image',
        asset: cloneStoryAssetRef((block as GalleryImageContentBlock).asset)!,
      }
    case 'video':
      return {
        ...base,
        kind: 'video',
        asset: cloneStoryAssetRef((block as GalleryVideoContentBlock).asset)!,
        poster: cloneStoryAssetRef((block as GalleryVideoContentBlock).poster),
      }
    case 'audio':
      return {
        ...base,
        kind: 'audio',
        asset: cloneStoryAssetRef((block as GalleryAudioContentBlock).asset)!,
        poster: cloneStoryAssetRef((block as GalleryAudioContentBlock).poster),
      }
    case 'text':
      return {
        ...base,
        kind: 'text',
        text: (block as GalleryTextContentBlock).text,
      }
    default:
      return {
        ...base,
        data: cloneJsonSerializable((block as GalleryCustomContentBlock).data),
      }
  }
}

function cloneGalleryProfileState(profile: GalleryProfileState): GalleryProfileState {
  return {
    profileId: profile.profileId,
    updatedAt: profile.updatedAt,
    unlockedEntries: Object.fromEntries(
      Object.entries(profile.unlockedEntries).map(([entryId, record]) => [entryId, cloneGalleryUnlockRecord(record)]),
    ),
  }
}

function cloneGalleryUnlockRecord(record: GalleryUnlockRecord): GalleryUnlockRecord {
  return {
    entryId: record.entryId,
    unlockedAt: record.unlockedAt,
    source: record.source,
    contentPackageId: record.contentPackageId,
    requiredRuntimePackages: record.requiredRuntimePackages ? [...record.requiredRuntimePackages] : undefined,
  }
}

function cloneGalleryFilterState(filter: GalleryFilterState): GalleryFilterState {
  return {
    search: filter.search,
    tags: filter.tags ? [...filter.tags] : undefined,
    contentKinds: filter.contentKinds ? [...filter.contentKinds] : undefined,
    unlockedOnly: filter.unlockedOnly,
  }
}

function cloneGalleryFallbackTarget(target: GalleryFallbackTarget | undefined): GalleryFallbackTarget | undefined {
  if (!target) {
    return undefined
  }
  return typeof target === 'string' ? target : cloneStoryPoint(target)
}

function cloneStoryPoint(point: StoryPoint): StoryPoint {
  return { ...point }
}

function cloneStoryAssetRef(ref: StoryAssetRef | undefined): StoryAssetRef | undefined {
  if (!ref) {
    return undefined
  }
  return {
    type: ref.type,
    name: ref.name,
    runtimePackageId: ref.runtimePackageId,
    alt: ref.alt,
    focalPoint: ref.focalPoint ? { x: ref.focalPoint.x, y: ref.focalPoint.y } : undefined,
    metadata: cloneUnknownRecord(ref.metadata),
  }
}

function cloneUnknownRecord(
  value: Readonly<Record<string, unknown>> | undefined,
): Record<string, unknown> | undefined {
  if (!value) {
    return undefined
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, cloneUnknownValue(item)]),
  )
}

function cloneUnknownValue<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map(item => cloneUnknownValue(item)) as T
  }
  if (isPlainRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, cloneUnknownValue(item)]),
    ) as T
  }
  return value
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

function isGalleryStoryMetadata(value: unknown): value is GalleryStoryMetadata {
  return isPlainRecord(value)
    && (
      value.unlock === undefined
      || typeof value.unlock === 'string'
      || Array.isArray(value.unlock)
    )
}

function isGalleryUnlockRecord(value: unknown): value is GalleryUnlockRecord {
  return isPlainRecord(value)
    && typeof value.entryId === 'string'
    && typeof value.unlockedAt === 'number'
}

function isGalleryProfileStoreState(value: unknown): value is GalleryProfileStoreState {
  return isPlainRecord(value) && isPlainRecord(value.profile)
}

function isGallerySceneState(value: unknown): value is GallerySceneState {
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
    )
}

function assertGalleryCatalogExists(runtimeState: GalleryRuntimeState, catalogId: string, entryId: string): void {
  if (!runtimeState.catalogs.has(catalogId)) {
    throw new Error(`Gallery entry "${entryId}" references unknown catalog "${catalogId}". Register the catalog first.`)
  }
}

function isGallerySceneOpen(engine: QuaEngineInterface, projection: GalleryProjection): boolean {
  return projection.sceneActive || engine.getCurrentSceneName() === GALLERY_SCENE_ID
}

function getSceneLoader(engine: QuaEngineInterface): QuaEngineInterface & {
  loadScene: (scene: Scene, transition?: SceneTransitionIntent, enterContext?: SceneEnterContext) => Promise<void>
} {
  return engine as QuaEngineInterface & {
    loadScene: (scene: Scene, transition?: SceneTransitionIntent, enterContext?: SceneEnterContext) => Promise<void>
  }
}

function getGalleryRuntimeKey(engine: QuaEngineInterface): object {
  return engine.getStore() as unknown as object
}
