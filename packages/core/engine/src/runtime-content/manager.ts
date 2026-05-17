import type {
  DynamicBundleRecord,
  RuntimePackageManifest,
  RuntimePackagePluginManifest,
  RuntimePackageStoreMigrationManifest,
} from '@quajs/assets'
import type { QuaSerializedState } from '@quajs/store'
import type { QuaEngine } from '../core/engine'
import type {
  QuaEngineInterface,
  RuntimeLoadedPluginModule,
  RuntimeLoadedScriptModule,
  RuntimeModuleLoader,
  RuntimePackageRegistry,
  RuntimePackageRegistryEntry,
  RuntimePackageLoadOptions,
  RuntimePackageStateRecord,
  RuntimePackageUnloadOptions,
  RuntimeScriptModuleRecord,
  RuntimeStoreMigrationHandler,
  RuntimeTrustPolicy,
} from '../core/types'
import type { EnginePlugin } from '../plugins/core/types'
import { emitLogicToRender, LogicToRenderEvents } from '../events/events'
import { getPluginRegistry } from '../plugins'
import { resolveGameSteps } from '../core/script'

interface LoadedRuntimePackage {
  bundle: DynamicBundleRecord
  manifest: RuntimePackageManifest
  state: RuntimePackageStateRecord
  activatedEnginePluginNames: string[]
}

interface ActivationRollbackState {
  serializedState: QuaSerializedState
  runtimeState: RuntimePackageStateRecord
  activatedEnginePluginCount: number
}

type RuntimePackageScopedEngine = QuaEngineInterface & Pick<QuaEngine,
  | 'useRuntimePlugin'
  | 'notifyRuntimePackageActivate'
  | 'notifyRuntimePackageUnload'
  | 'notifyRuntimePackageMigrate'
  | 'clearRuntimePackageViewState'
>

export class RuntimeContentManager {
  private readonly packages = new Map<string, LoadedRuntimePackage>()
  private readonly scripts = new Map<string, RuntimeScriptModuleRecord>()
  private readonly loadedScriptModules = new Map<string, RuntimeLoadedScriptModule>()
  private readonly activatingPackages = new Set<string>()

  constructor(
    private readonly engine: QuaEngine,
    private readonly loader?: RuntimeModuleLoader,
    private readonly trustPolicy: RuntimeTrustPolicy = {},
    private readonly registry?: RuntimePackageRegistry,
  ) {}

  async loadRuntimePackage(source: string, options: RuntimePackageLoadOptions = {}): Promise<RuntimePackageStateRecord> {
    const bundle = await this.engine.getAssets().loadDynamicBundle(source, {
      bundleName: options.bundleName,
      priority: options.priority,
    })
    const manifest = bundle.manifest.runtimePackage
    if (!manifest) {
      throw new Error(`Runtime package metadata missing for bundle "${bundle.bundleName}".`)
    }

    try {
      await this.verifyPackage(bundle, manifest)
    }
    catch (error) {
      await this.engine.getAssets().unloadDynamicBundle(bundle.bundleName).catch(() => {})
      throw error
    }

    const existing = this.packages.get(manifest.id)
    if (existing && existing.state.state !== 'unloaded') {
      await this.engine.getAssets().unloadDynamicBundle(bundle.bundleName).catch(() => {})
      throw new Error(`Runtime package "${manifest.id}" is already ${existing.state.state}. Unload it before loading a replacement.`)
    }
    try {
      this.assertPackageScriptIdsAvailable(manifest)
    }
    catch (error) {
      await this.engine.getAssets().unloadDynamicBundle(bundle.bundleName).catch(() => {})
      throw error
    }

    const state = createPackageState(bundle, manifest, 'loaded')
    this.packages.set(manifest.id, {
      bundle,
      manifest,
      state,
      activatedEnginePluginNames: [],
    })
    this.engine.getStore().commit('upsertRuntimePackage', state)
    this.registerPackageScripts(bundle, manifest)

    if (options.activate !== false) {
      try {
        return await this.activateRuntimePackage(manifest.id)
      }
      catch (error) {
        await this.unloadRuntimePackage(manifest.id, { force: true }).catch(() => {})
        throw error
      }
    }
    return { ...state }
  }

  async activateRuntimePackage(packageId: string): Promise<RuntimePackageStateRecord> {
    const record = this.requirePackage(packageId)
    if (record.state.state === 'active') {
      return { ...record.state }
    }
    if (this.activatingPackages.has(packageId)) {
      throw new Error(`Runtime package dependency cycle detected while activating "${packageId}".`)
    }

    this.activatingPackages.add(packageId)
    let rollback: ActivationRollbackState | undefined
    try {
      await this.ensureRuntimePackages(record.manifest.dependencies || [])
      rollback = this.createActivationRollbackState(record)

      await this.engine.withRuntimePackageContext(packageId, async (engine) => {
        const scopedEngine = engine as RuntimePackageScopedEngine
        await this.activateEnginePlugins(record, scopedEngine)
        await this.applyStoryGraphDeltas(record, engine)
        await this.applyStoreMigrations(record, engine)
      })

      record.state = {
        ...record.state,
        state: 'active',
        activatedAt: Date.now(),
      }
      this.engine.getStore().commit('upsertRuntimePackage', record.state)
      await this.engine.withRuntimePackageContext(packageId, async (engine) => {
        await (engine as RuntimePackageScopedEngine).notifyRuntimePackageActivate(record.manifest, record.bundle.bundleName)
      })
      await emitLogicToRender(this.engine.getPipeline(), LogicToRenderEvents.RUNTIME_PACKAGE_PLUGIN, {
        packageId,
        plugins: (record.manifest.plugins || []).filter(plugin => plugin.kind === 'renderer'),
      })
      return { ...record.state }
    }
    catch (error) {
      if (rollback) {
        await this.rollbackActivation(record, rollback)
        await this.rollbackStoryGraphDeltas(record)
      }
      throw error
    }
    finally {
      this.activatingPackages.delete(packageId)
    }
  }

  async unloadRuntimePackage(packageId: string, options: RuntimePackageUnloadOptions = {}): Promise<void> {
    const record = this.requirePackage(packageId)
    if (record.state.state === 'unloaded') {
      return
    }
    const dependents = Array.from(this.packages.values())
      .filter(candidate =>
        candidate.manifest.id !== packageId
        && candidate.state.state === 'active'
        && (candidate.manifest.dependencies || []).includes(packageId),
      )
      .map(candidate => candidate.manifest.id)
    if (dependents.length > 0) {
      throw new Error(`Cannot unload runtime package "${packageId}" because active packages depend on it: ${dependents.join(', ')}`)
    }
    if (!options.force) {
      this.assertPackageNotReferencedByCurrentRuntimeState(packageId)
    }

    await this.engine.notifyRuntimePackageUnload(record.manifest, record.bundle.bundleName)
    await this.engine.clearRuntimePackageViewState(packageId)

    for (const pluginName of record.activatedEnginePluginNames.reverse()) {
      await this.engine.unuse(pluginName)
    }
    record.activatedEnginePluginNames = []
    for (const [moduleId, moduleRecord] of this.scripts.entries()) {
      if (moduleRecord.packageId === packageId) {
        this.scripts.delete(moduleId)
        this.loadedScriptModules.delete(moduleId)
      }
    }

    await emitLogicToRender(this.engine.getPipeline(), LogicToRenderEvents.RUNTIME_PACKAGE_UNLOAD, {
      packageId,
      bundleName: record.bundle.bundleName,
    })

    await this.engine.getAssets().unloadDynamicBundle(record.bundle.bundleName)
    record.state = {
      ...record.state,
      state: 'unloaded',
    }
    this.engine.getStore().commit('upsertRuntimePackage', record.state)
  }

  getRuntimePackages(): RuntimePackageStateRecord[] {
    return Array.from(this.packages.values()).map(record => ({ ...record.state }))
  }

  registerScriptModule(record: RuntimeScriptModuleRecord): void {
    const existing = this.scripts.get(record.id)
    if (existing && existing.packageId !== record.packageId) {
      throw new Error(`Runtime script module "${record.id}" is already registered by package "${existing.packageId}".`)
    }
    this.scripts.set(record.id, { ...record })
  }

  async runScriptModule<TScope>(moduleId: string, scope?: TScope): Promise<void> {
    const record = this.scripts.get(moduleId)
    if (!record) {
      throw new Error(`Runtime script module "${moduleId}" is not registered.`)
    }

    await this.ensureRuntimePackages([record.packageId])

    const factory = await this.resolveScriptFactory(record)
    const steps = resolveGameSteps(factory as any, scope)
    await this.engine.dialogue(steps.map(step => ({
      ...step,
      metadata: {
        ...step.metadata,
        point: {
          ...(step.metadata?.point || {}),
          contentPackageId: record.packageId,
          scriptModuleId: record.id,
          scriptModuleVersion: record.version,
        },
        runtimePackage: {
          packageId: record.packageId,
          scriptModuleId: record.id,
          scriptModuleVersion: record.version,
        },
        requiredRuntimePackages: unique([
          record.packageId,
          ...(step.metadata?.requiredRuntimePackages || []),
        ]),
      },
    })))
  }

  async ensureRuntimePackages(packageIds: readonly string[]): Promise<void> {
    for (const packageId of unique(packageIds)) {
      const record = this.packages.get(packageId)
      if (record?.state.state === 'active') {
        continue
      }
      if (record && record.state.state !== 'unloaded') {
        await this.activateRuntimePackage(packageId)
        continue
      }
      if (await this.loadRequiredPackageFromRegistry(packageId)) {
        continue
      }
      throw new Error(`Required runtime package "${packageId}" is not active.`)
    }
  }

  async destroy(): Promise<void> {
    const pending = new Set(Array.from(this.packages.values())
      .filter(record => record.state.state !== 'unloaded')
      .map(record => record.manifest.id))

    while (pending.size > 0) {
      const unloadable = Array.from(pending).filter(packageId =>
        !Array.from(pending).some(otherPackageId => {
          if (otherPackageId === packageId) {
            return false
          }
          const other = this.packages.get(otherPackageId)
          return other?.state.state === 'active' && (other.manifest.dependencies || []).includes(packageId)
        }),
      )
      if (unloadable.length === 0) {
        throw new Error(`Runtime package dependency cycle prevents unload: ${Array.from(pending).join(', ')}`)
      }
      for (const packageId of unloadable) {
        await this.unloadRuntimePackage(packageId, { force: true })
        pending.delete(packageId)
      }
    }
  }

  private async verifyPackage(bundle: DynamicBundleRecord, manifest: RuntimePackageManifest): Promise<void> {
    const isProduction = (globalThis as typeof globalThis & {
      process?: { env?: { NODE_ENV?: string } }
    }).process?.env?.NODE_ENV === 'production'
    const requireSignature = isProduction
      ? true
      : this.trustPolicy.requireSignature ?? this.trustPolicy.allowUnsignedInDevelopment !== true

    if (requireSignature && !manifest.signature?.value) {
      throw new Error(`Runtime package "${manifest.id}" is missing a required signature.`)
    }
    if (requireSignature && !manifest.integrity?.hash) {
      throw new Error(`Runtime package "${manifest.id}" is missing required integrity metadata.`)
    }
    if (manifest.integrity?.hash) {
      this.verifyPackageIntegrity(bundle, manifest)
    }
    if (requireSignature && !this.trustPolicy.verifyPackage) {
      throw new Error(`Runtime package "${manifest.id}" requires a trust policy verifier.`)
    }
    const verified = await this.trustPolicy.verifyPackage?.({ package: manifest, bundle })
    if (verified === false) {
      throw new Error(`Runtime package "${manifest.id}" failed trust verification.`)
    }
  }

  private verifyPackageIntegrity(bundle: DynamicBundleRecord, manifest: RuntimePackageManifest): void {
    const algorithm = manifest.integrity?.algorithm || 'sha256'
    if (algorithm !== 'sha256') {
      throw new Error(`Runtime package "${manifest.id}" uses unsupported integrity algorithm "${algorithm}".`)
    }
    if (!bundle.manifest.merkleRoot) {
      throw new Error(`Runtime package "${manifest.id}" is missing bundle merkle root integrity metadata.`)
    }
    if (manifest.integrity?.hash !== bundle.manifest.merkleRoot) {
      throw new Error(`Runtime package "${manifest.id}" integrity hash mismatch.`)
    }
  }

  private registerPackageScripts(bundle: DynamicBundleRecord, manifest: RuntimePackageManifest): void {
    for (const script of manifest.scripts || []) {
      this.registerScriptModule({
        ...script,
        packageId: manifest.id,
        bundleName: bundle.bundleName,
      })
    }
  }

  private assertPackageScriptIdsAvailable(manifest: RuntimePackageManifest): void {
    const seen = new Set<string>()
    for (const script of manifest.scripts || []) {
      if (seen.has(script.id)) {
        throw new Error(`Runtime package "${manifest.id}" declares duplicate script module "${script.id}".`)
      }
      seen.add(script.id)
      const existing = this.scripts.get(script.id)
      if (existing && existing.packageId !== manifest.id) {
        throw new Error(`Runtime script module "${script.id}" is already registered by package "${existing.packageId}".`)
      }
    }
  }

  private async activateEnginePlugins(record: LoadedRuntimePackage, engine: RuntimePackageScopedEngine = this.engine): Promise<void> {
    for (const plugin of record.manifest.plugins || []) {
      if (plugin.kind !== 'engine') {
        continue
      }

      const loaded = await this.loadEnginePluginModule(plugin, record)
      const pluginExport = selectExport(loaded, plugin.exportName, ['Plugin', 'default'])
      const pluginInstance = instantiateEnginePlugin(pluginExport)
      if (!pluginInstance) {
        throw new Error(`Runtime package plugin "${plugin.id}" did not export an engine plugin.`)
      }
      const registered = await engine.useRuntimePlugin(pluginInstance)
      if (!registered) {
        throw new Error(`Runtime package plugin "${plugin.id}" conflicts with already registered engine plugin "${pluginInstance.name}".`)
      }
      record.activatedEnginePluginNames.push(pluginInstance.name)
    }
  }

  private async rollbackActivatedEnginePlugins(record: LoadedRuntimePackage, fromIndex: number): Promise<void> {
    const pluginNames = record.activatedEnginePluginNames.splice(fromIndex).reverse()
    for (const pluginName of pluginNames) {
      await this.engine.unuse(pluginName)
    }
  }

  private createActivationRollbackState(record: LoadedRuntimePackage): ActivationRollbackState {
    return {
      serializedState: this.engine.getStore().serializeState(),
      runtimeState: { ...record.state },
      activatedEnginePluginCount: record.activatedEnginePluginNames.length,
    }
  }

  private async rollbackActivation(record: LoadedRuntimePackage, rollback: ActivationRollbackState): Promise<void> {
    await this.rollbackActivatedEnginePlugins(record, rollback.activatedEnginePluginCount)
    this.engine.getStore().restoreSerializedState(rollback.serializedState)
    record.state = {
      ...rollback.runtimeState,
      state: 'loaded',
      activatedAt: undefined,
    }
    this.engine.getStore().commit('upsertRuntimePackage', record.state)
  }

  private async rollbackStoryGraphDeltas(record: LoadedRuntimePackage): Promise<void> {
    const storyGraphModule = getPluginRegistry().getPluginModule('@quajs/story-graph')
    const removePackageContent = storyGraphModule?.removeRuntimePackageStoryGraphContentWithEngine
    if (typeof removePackageContent === 'function') {
      await removePackageContent(this.engine, record.manifest.id)
    }
  }

  private async loadEnginePluginModule(
    plugin: RuntimePackagePluginManifest,
    record: LoadedRuntimePackage,
  ): Promise<RuntimeLoadedPluginModule> {
    if (!this.loader?.loadEnginePluginModule) {
      throw new Error(`Runtime plugin "${plugin.id}" requires a runtime module loader.`)
    }
    return await this.loader.loadEnginePluginModule(plugin, {
      assets: this.engine.getAssets(),
      package: record.manifest,
      bundle: record.bundle,
    })
  }

  private async applyStoryGraphDeltas(record: LoadedRuntimePackage, engine: QuaEngineInterface = this.engine): Promise<void> {
    const deltas = record.manifest.storyGraphDeltas || []
    if (deltas.length === 0) {
      return
    }

    const storyGraphModule = getPluginRegistry().getPluginModule('@quajs/story-graph')
    const applyDelta = storyGraphModule?.registerStoryGraphDeltaWithEngine
    if (typeof applyDelta !== 'function') {
      throw new Error('Runtime package includes story graph deltas, but @quajs/story-graph is not installed.')
    }

    for (const delta of deltas) {
      await applyDelta(engine, delta, { packageId: record.manifest.id })
    }
  }

  private async applyStoreMigrations(record: LoadedRuntimePackage, engine: QuaEngineInterface = this.engine): Promise<void> {
    const applied = new Set(engine.getRuntimeStateSnapshot().appliedRuntimeMigrations)
    for (const migration of record.manifest.storeMigrations || []) {
      const migrationKey = createMigrationKey(record.manifest.id, migration)
      if (applied.has(migrationKey)) {
        continue
      }
      const handler = await this.resolveMigrationHandler(migration, record)
      await (engine as RuntimePackageScopedEngine).notifyRuntimePackageMigrate(record.manifest, record.bundle.bundleName, migration)
      await handler({
        engine,
        store: engine.getStore(),
        assets: engine.getAssets(),
        pipeline: engine.getPipeline(),
        package: record.manifest,
        migration,
      })
      engine.getStore().commit('markRuntimeMigrationApplied', migrationKey)
      applied.add(migrationKey)
    }
  }

  private async resolveMigrationHandler(
    migration: RuntimePackageStoreMigrationManifest,
    record: LoadedRuntimePackage,
  ): Promise<RuntimeStoreMigrationHandler> {
    if (!this.loader?.loadStoreMigrationModule) {
      throw new Error(`Runtime migration "${migration.id}" requires a runtime module loader.`)
    }
    const loaded = await this.loader.loadStoreMigrationModule(migration, {
      assets: this.engine.getAssets(),
      package: record.manifest,
      bundle: record.bundle,
    })
    const handler = selectExport(loaded, migration.exportName, ['default'])
    if (typeof handler !== 'function') {
      throw new Error(`Runtime migration "${migration.id}" did not export a migration handler.`)
    }
    return handler as RuntimeStoreMigrationHandler
  }

  private async resolveScriptFactory(record: RuntimeScriptModuleRecord) {
    if (record.factory) {
      return record.factory
    }
    if (record.module) {
      return selectScriptFactory(record, record.module)
    }

    const cached = this.loadedScriptModules.get(record.id)
    if (cached) {
      return selectScriptFactory(record, cached)
    }
    if (!this.loader?.loadScriptModule) {
      throw new Error(`Runtime script module "${record.id}" requires a runtime module loader.`)
    }

    const packageRecord = this.requirePackage(record.packageId)
    const loaded = await this.loader.loadScriptModule(record, {
      assets: this.engine.getAssets(),
      package: packageRecord.manifest,
      bundle: packageRecord.bundle,
    })
    this.loadedScriptModules.set(record.id, loaded)
    return selectScriptFactory(record, loaded)
  }

  private requirePackage(packageId: string): LoadedRuntimePackage {
    const record = this.packages.get(packageId)
    if (!record) {
      throw new Error(`Runtime package "${packageId}" is not loaded.`)
    }
    return record
  }

  private async loadRequiredPackageFromRegistry(packageId: string): Promise<boolean> {
    if (!this.registry) {
      return false
    }

    const resolved = await this.registry.resolvePackage(packageId, {
      engine: this.engine,
      assets: this.engine.getAssets(),
      requestedPackageId: packageId,
    })
    if (!resolved) {
      return false
    }

    const entry = normalizeRegistryEntry(resolved)
    const loaded = await this.loadRuntimePackage(entry.source, {
      ...entry.options,
      activate: true,
    })
    if (loaded.id !== packageId) {
      await this.unloadRuntimePackage(loaded.id, { force: true }).catch(() => {})
      throw new Error(`Runtime package registry resolved "${packageId}" to package "${loaded.id}".`)
    }
    return this.packages.get(packageId)?.state.state === 'active'
  }

  private assertPackageNotReferencedByCurrentRuntimeState(packageId: string): void {
    const references: string[] = []
    const point = this.engine.getStoryPoint()
    if (storyPointRequiresPackage(point, packageId)) {
      references.push('current story point')
    }

    const currentCheckpointId = this.engine.getRuntimeStateSnapshot().currentCheckpointId
    const currentCheckpoint = currentCheckpointId ? this.engine.getCheckpoint(currentCheckpointId) : undefined
    if (
      storyPointRequiresPackage(currentCheckpoint?.point, packageId)
      || metadataRequiresPackage(currentCheckpoint?.metadata, packageId)
    ) {
      references.push(`current checkpoint "${currentCheckpointId}"`)
    }

    if (this.engine.getRuntimeViewRequiredPackageIds().includes(packageId)) {
      references.push('current view projection')
    }

    if (references.length > 0) {
      throw new Error(`Cannot unload runtime package "${packageId}" because it is referenced by ${references.join(' and ')}. Pass force: true only after moving runtime state away from that package.`)
    }
  }
}

function normalizeRegistryEntry(entry: string | RuntimePackageRegistryEntry): RuntimePackageRegistryEntry {
  return typeof entry === 'string' ? { source: entry } : entry
}

function createPackageState(
  bundle: DynamicBundleRecord,
  manifest: RuntimePackageManifest,
  state: RuntimePackageStateRecord['state'],
): RuntimePackageStateRecord {
  return {
    id: manifest.id,
    version: manifest.version,
    state,
    bundleName: bundle.bundleName,
    priority: bundle.priority,
    loadedAt: bundle.loadedAt,
    dependencies: [...(manifest.dependencies || [])],
    scriptModuleIds: (manifest.scripts || []).map(script => script.id),
    pluginIds: (manifest.plugins || []).map(plugin => plugin.id),
    migrationIds: (manifest.storeMigrations || []).map(migration => createMigrationKey(manifest.id, migration)),
  }
}

function selectScriptFactory(record: RuntimeScriptModuleRecord, loaded: Record<string, unknown>) {
  const factory = selectExport(loaded, record.exportName, ['default'])
  if (typeof factory !== 'function') {
    throw new Error(`Runtime script module "${record.id}" did not export a GameStep factory.`)
  }
  return factory
}

function selectExport(moduleExports: Record<string, unknown>, preferred: string | undefined, fallbacks: string[]): unknown {
  if (preferred && preferred in moduleExports) {
    return moduleExports[preferred]
  }
  for (const fallback of fallbacks) {
    if (fallback in moduleExports) {
      return moduleExports[fallback]
    }
  }
  return undefined
}

function instantiateEnginePlugin(value: unknown): EnginePlugin | undefined {
  if (isEnginePlugin(value)) {
    return value
  }
  if (typeof value === 'function') {
    const plugin = new (value as new () => EnginePlugin)()
    return isEnginePlugin(plugin) ? plugin : undefined
  }
  return undefined
}

function isEnginePlugin(value: unknown): value is EnginePlugin {
  return typeof value === 'object'
    && value !== null
    && typeof (value as EnginePlugin).name === 'string'
    && typeof (value as EnginePlugin).init === 'function'
}

function createMigrationKey(packageId: string, migration: RuntimePackageStoreMigrationManifest): string {
  return `${packageId}:${migration.id}:${migration.version || '1'}`
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values.filter(Boolean))]
}

function storyPointRequiresPackage(point: { contentPackageId?: string } | undefined, packageId: string): boolean {
  return point?.contentPackageId === packageId
}

function metadataRequiresPackage(metadata: Record<string, unknown> | undefined, packageId: string): boolean {
  const required = metadata?.requiredRuntimePackages
  return Array.isArray(required) && required.includes(packageId)
}
