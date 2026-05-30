import type {
  DynamicBundleRecord,
  RuntimePackageManifest,
  RuntimePackagePluginManifest,
  RuntimePackageSceneManifest,
  RuntimePackageScriptVariantManifest,
  RuntimePackageStoreMigrationManifest,
} from '@quajs/assets'
import type { QuaSerializedState } from '@quajs/store'
import type { QuaEngine } from '../core/engine'
import type {
  ChoiceTarget,
  EnsureLocalePacksOptions,
  GameStep,
  QuaEngineInterface,
  RollbackEntry,
  RuntimeLoadedPluginModule,
  RuntimeLoadedSceneModule,
  RuntimeLoadedScriptModule,
  RuntimeModuleLoader,
  RuntimePackageLoadOptions,
  RuntimePackageRegistry,
  RuntimePackageRegistryEntry,
  RuntimePackageStateRecord,
  RuntimePackageUnloadOptions,
  RuntimeScriptModuleRecord,
  RuntimeScriptModuleRunFromOptions,
  RuntimeScriptModuleRunOptions,
  RuntimeStoreMigrationHandler,
  RuntimeTrustPolicy,
  Scene,
  SceneFactory,
  StoryTargetResolveContext,
} from '../core/types'
import type { EnginePlugin } from '../plugins/core/types'
import { assertCompatibleGameVersion, createLocaleFallbackChain, normalizeLocale } from '@quajs/assets'
import { resolveGameSteps } from '../core/script'
import { getPluginRegistry } from '../plugins'

interface LoadedRuntimePackage {
  bundle: DynamicBundleRecord
  manifest: RuntimePackageManifest
  state: RuntimePackageStateRecord
  activatedEnginePluginNames: string[]
  sceneDisposers: Array<() => void>
}

interface ActivationRollbackState {
  serializedState: QuaSerializedState
  runtimeState: RuntimePackageStateRecord
  activatedEnginePluginCount: number
  sceneDisposerCount: number
}

interface ResolvedScriptVariant {
  locale: string
  record: RuntimeScriptModuleRecord
  packageId: string
}

type RuntimePackageScopedEngine = QuaEngineInterface & Pick<QuaEngine, | 'useRuntimePlugin'
  | 'notifyRuntimePackageActivate'
  | 'notifyRuntimePackageUnload'
  | 'notifyRuntimePackageMigrate'
  | 'clearRuntimePackageViewState'>

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
      appVersion: this.engine.getAppVersion(),
    })
    const manifest = bundle.manifest.runtimePackage
    if (!manifest) {
      throw new Error(`Runtime package metadata missing for bundle "${bundle.bundleName}".`)
    }
    const existing = this.packages.get(manifest.id)

    try {
      this.assertCompatibleRuntimePackage(manifest)
      await this.verifyPackage(bundle, manifest)
    }
    catch (error) {
      if (!isSameLoadedBundle(existing, bundle)) {
        await this.engine.getAssets().unloadDynamicBundle(bundle.bundleVersionKey || bundle.bundleName).catch(() => {})
      }
      throw error
    }

    if (existing && existing.state.state !== 'unloaded') {
      if (!isSameLoadedBundle(existing, bundle)) {
        await this.engine.getAssets().unloadDynamicBundle(bundle.bundleVersionKey || bundle.bundleName).catch(() => {})
      }
      throw new Error(`Runtime package "${manifest.id}" is already ${existing.state.state}. Unload it before loading a replacement.`)
    }
    try {
      if (manifest.localePack) {
        await this.ensureRuntimePackages(manifest.dependencies || [])
      }
    }
    catch (error) {
      await this.engine.getAssets().unloadDynamicBundle(bundle.bundleVersionKey || bundle.bundleName).catch(() => {})
      throw error
    }
    try {
      this.assertPackageScriptIdsAvailable(manifest)
    }
    catch (error) {
      await this.engine.getAssets().unloadDynamicBundle(bundle.bundleVersionKey || bundle.bundleName).catch(() => {})
      throw error
    }

    let record: LoadedRuntimePackage | undefined
    try {
      this.validatePackageScriptsCanRegister(manifest)
      const state = createPackageState(bundle, manifest, 'loaded')
      record = {
        bundle,
        manifest,
        state,
        activatedEnginePluginNames: [],
        sceneDisposers: [],
      }
      this.registerPackageScripts(bundle, manifest)
      this.packages.set(manifest.id, record)
      this.engine.getStore().commit('upsertRuntimePackage', state)
    }
    catch (error) {
      this.rollbackLoadedPackageRegistration(manifest.id, record, bundle)
      await this.engine.getAssets().unloadDynamicBundle(bundle.bundleVersionKey || bundle.bundleName).catch(() => {})
      throw error
    }

    if (options.activate !== false) {
      try {
        return await this.activateRuntimePackage(manifest.id)
      }
      catch (error) {
        await this.unloadRuntimePackage(manifest.id, { force: true }).catch(() => {})
        throw error
      }
    }
    return { ...record.state }
  }

  async activateRuntimePackage(packageId: string): Promise<RuntimePackageStateRecord> {
    const record = this.requirePackage(packageId)
    if (record.state.state === 'active') {
      return { ...record.state }
    }
    this.assertCompatibleRuntimePackage(record.manifest)
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
        await this.activateSceneFactories(record, scopedEngine)
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
      await this.engine.emitRuntimePackageRendererPlugins(
        packageId,
        (record.manifest.plugins || []).filter(plugin => plugin.kind === 'renderer'),
      )
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
    if (dependents.length > 0 && !options.force) {
      throw new Error(`Cannot unload runtime package "${packageId}" because active packages depend on it: ${dependents.join(', ')}`)
    }
    for (const dependentPackageId of dependents) {
      await this.unloadRuntimePackage(dependentPackageId, { force: true })
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
    this.disposeSceneFactories(record)
    this.removeRegisteredPackageScripts(packageId, record.bundle.bundleName)

    await this.engine.emitRuntimePackageUnload(packageId, record.bundle.bundleName)

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

  async runScriptModule<TScope>(moduleId: string, scope?: TScope, options: RuntimeScriptModuleRunOptions = {}): Promise<void> {
    const record = this.scripts.get(moduleId)
    if (!record) {
      throw new Error(`Runtime script module "${moduleId}" is not registered.`)
    }

    await this.ensureRuntimePackages([record.packageId])

    const scriptVariant = this.resolveScriptVariant(record, options.locale || this.engine.getAssets().getLocale())
    await this.ensureRuntimePackages(unique([record.packageId, scriptVariant.packageId]))
    const factory = await this.resolveScriptFactory(scriptVariant.record, scriptVariant.locale, scriptVariant.packageId)
    const steps = resolveGameSteps(factory as any, scope)
    const requiredPackages = unique([
      record.packageId,
      scriptVariant.packageId,
    ])
    await this.engine.dialogue(steps.map(step => ({
      ...step,
      metadata: {
        ...step.metadata,
        point: {
          ...(step.metadata?.point || {}),
          contentPackageId: record.packageId,
          scriptModuleId: record.id,
          scriptModuleVersion: scriptVariant.record.version,
          scriptModuleLocale: scriptVariant.locale,
        },
        runtimePackage: {
          packageId: record.packageId,
          scriptModuleId: record.id,
          scriptModuleVersion: scriptVariant.record.version,
          scriptModuleLocale: scriptVariant.locale,
        },
        requiredRuntimePackages: unique([
          ...requiredPackages,
          ...(step.metadata?.requiredRuntimePackages || []),
        ]),
      },
    })))
  }

  async runScriptModuleFrom<TScope>(moduleId: string, options: RuntimeScriptModuleRunFromOptions<TScope> = {}): Promise<void> {
    const record = this.scripts.get(moduleId)
    if (!record) {
      throw new Error(`Runtime script module "${moduleId}" is not registered.`)
    }
    if (options.packageId && record.packageId !== options.packageId) {
      await this.ensureRuntimePackages([options.packageId])
    }

    await this.ensureRuntimePackages([record.packageId])
    const scriptVariant = this.resolveScriptVariant(record, options.locale || this.engine.getAssets().getLocale())
    await this.ensureRuntimePackages(unique([record.packageId, scriptVariant.packageId, ...(options.packageId ? [options.packageId] : [])]))
    const factory = await this.resolveScriptFactory(scriptVariant.record, scriptVariant.locale, scriptVariant.packageId)
    const steps = this.sliceScriptSteps(resolveGameSteps(factory as any, options.scope), options)
    const requiredPackages = unique([
      record.packageId,
      scriptVariant.packageId,
      ...(options.packageId ? [options.packageId] : []),
    ])
    await this.engine.dialogue(steps.map(step => ({
      ...step,
      metadata: {
        ...step.metadata,
        point: {
          ...(step.metadata?.point || {}),
          contentPackageId: record.packageId,
          scriptModuleId: record.id,
          scriptModuleVersion: scriptVariant.record.version,
          scriptModuleLocale: scriptVariant.locale,
        },
        runtimePackage: {
          packageId: record.packageId,
          scriptModuleId: record.id,
          scriptModuleVersion: scriptVariant.record.version,
          scriptModuleLocale: scriptVariant.locale,
        },
        requiredRuntimePackages: unique([
          ...requiredPackages,
          ...(step.metadata?.requiredRuntimePackages || []),
        ]),
      },
    })))
  }

  async resolveStoryTargetFromRegistry(target: ChoiceTarget, context: StoryTargetResolveContext): Promise<boolean> {
    if (!this.registry?.resolveStoryTarget) {
      return false
    }

    const resolved = await this.registry.resolveStoryTarget(target, {
      engine: this.engine,
      assets: this.engine.getAssets(),
      target,
      currentPoint: context.currentPoint,
      currentSceneId: context.currentSceneId,
      activePackageIds: Array.from(this.packages.values())
        .filter(record => record.state.state === 'active')
        .map(record => record.manifest.id),
    })
    if (!resolved) {
      return false
    }

    const entries = Array.isArray(resolved) ? resolved : [resolved]
    for (const entryValue of entries) {
      const entry = normalizeRegistryEntry(entryValue)
      await this.loadRuntimePackage(entry.source, {
        ...entry.options,
        activate: true,
      })
    }
    return entries.length > 0
  }

  async resolveRollbackStep(entry: RollbackEntry): Promise<GameStep | undefined> {
    const moduleId = entry.source?.scriptModuleId
    if (!moduleId) {
      return undefined
    }
    const record = this.scripts.get(moduleId)
    if (!record) {
      return undefined
    }

    await this.ensureRuntimePackages([record.packageId])
    const scriptVariant = this.resolveScriptVariant(record, entry.source?.scriptModuleLocale || this.engine.getAssets().getLocale())
    await this.ensureRuntimePackages(unique([record.packageId, scriptVariant.packageId]))
    if (
      entry.source?.scriptModuleVersion
      && scriptVariant.record.version
      && entry.source.scriptModuleVersion !== scriptVariant.record.version
    ) {
      throw new Error(`Rollback step "${entry.stepId}" requires script module "${moduleId}" version "${entry.source.scriptModuleVersion}", but "${scriptVariant.record.version}" is available.`)
    }
    const factory = await this.resolveScriptFactory(scriptVariant.record, scriptVariant.locale, scriptVariant.packageId)
    const step = resolveGameSteps(factory as any).find(candidate => candidate.uuid === entry.stepId)
    if (!step) {
      return undefined
    }
    return {
      ...step,
      metadata: {
        ...step.metadata,
        point: {
          ...(step.metadata?.point || {}),
          contentPackageId: record.packageId,
          scriptModuleId: record.id,
          scriptModuleVersion: scriptVariant.record.version,
          scriptModuleLocale: scriptVariant.locale,
        },
        runtimePackage: {
          packageId: record.packageId,
          scriptModuleId: record.id,
          scriptModuleVersion: scriptVariant.record.version,
          scriptModuleLocale: scriptVariant.locale,
        },
        requiredRuntimePackages: unique([
          record.packageId,
          scriptVariant.packageId,
          ...(step.metadata?.requiredRuntimePackages || []),
        ]),
      },
    }
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

  async ensureLocalePacks(locale: string, options: EnsureLocalePacksOptions = {}): Promise<RuntimePackageStateRecord[]> {
    const normalizedLocale = normalizeLocale(locale)
    const fallbackChain = createLocaleFallbackChain(normalizedLocale)
    const targetPackageIds = new Set(options.targetPackageIds || [])
    if (!this.registry?.resolveLocalePacks) {
      return this.getActiveLocalePackRecords(normalizedLocale, options).map(record => ({ ...record.state }))
    }

    const activePackageIds = Array.from(this.packages.values())
      .filter(record => record.state.state === 'active')
      .map(record => record.manifest.id)
    const resolved = await this.registry.resolveLocalePacks(normalizedLocale, {
      engine: this.engine,
      assets: this.engine.getAssets(),
      locale: normalizedLocale,
      activePackageIds,
      targetPackageIds: options.targetPackageIds ? [...options.targetPackageIds] : undefined,
    })
    const entries = resolved || []
    const loaded: RuntimePackageStateRecord[] = []
    const loadedThisCall: string[] = []
    try {
      for (const entryValue of entries) {
        const entry = normalizeRegistryEntry(entryValue)
        const state = await this.loadRuntimePackage(entry.source, {
          ...entry.options,
          activate: true,
        })
        loadedThisCall.push(state.id)
        const record = this.requirePackage(state.id)
        if (!record.manifest.localePack) {
          await this.unloadRuntimePackage(state.id, { force: true }).catch(() => {})
          loadedThisCall.pop()
          throw new Error(`Runtime package registry resolved locale "${normalizedLocale}" to non-locale package "${state.id}".`)
        }
        if (!fallbackChain.includes(normalizeLocale(record.manifest.localePack.locale))) {
          await this.unloadRuntimePackage(state.id, { force: true }).catch(() => {})
          loadedThisCall.pop()
          throw new Error(`Runtime package registry resolved locale "${normalizedLocale}" to locale "${record.manifest.localePack.locale}".`)
        }
        if (
          targetPackageIds.size > 0
          && !record.manifest.localePack.targets.some(target =>
            target.kind === 'runtimePackage'
            && targetPackageIds.has(target.id),
          )
        ) {
          await this.unloadRuntimePackage(state.id, { force: true }).catch(() => {})
          loadedThisCall.pop()
          throw new Error(`Runtime package registry resolved locale "${normalizedLocale}" to package "${state.id}" that does not target the requested runtime package.`)
        }
        loaded.push(state)
      }
    }
    catch (error) {
      for (const packageId of loadedThisCall.reverse()) {
        await this.unloadRuntimePackage(packageId, { force: true }).catch(() => {})
      }
      throw error
    }
    return uniqueRecords([
      ...this.getActiveLocalePackRecords(normalizedLocale, options).map(record => record.state),
      ...loaded,
    ])
  }

  getActiveLocalePackIds(locale: string, options: EnsureLocalePacksOptions = {}): string[] {
    return this.getActiveLocalePackRecords(locale, options).map(record => record.manifest.id)
  }

  async destroy(): Promise<void> {
    const pending = new Set(Array.from(this.packages.values())
      .filter(record => record.state.state !== 'unloaded')
      .map(record => record.manifest.id))

    while (pending.size > 0) {
      const unloadable = Array.from(pending).filter(packageId =>
        !Array.from(pending).some((otherPackageId) => {
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

  private assertCompatibleRuntimePackage(manifest: RuntimePackageManifest): void {
    assertCompatibleGameVersion(
      manifest.compatibility,
      this.engine.getAppVersion(),
      `Runtime package "${manifest.id}"`,
    )
  }

  private registerPackageScripts(bundle: DynamicBundleRecord, manifest: RuntimePackageManifest): void {
    if (manifest.localePack) {
      this.registerLocalePackScriptVariants(bundle, manifest)
      return
    }
    for (const script of manifest.scripts || []) {
      this.registerScriptModule({
        ...script,
        packageId: manifest.id,
        bundleName: bundle.bundleName,
      })
    }
  }

  private validatePackageScriptsCanRegister(manifest: RuntimePackageManifest): void {
    if (!manifest.localePack) {
      return
    }
    for (const script of manifest.scripts || []) {
      const existing = this.scripts.get(script.id)
      if (!existing) {
        throw new Error(`Locale pack "${manifest.id}" declares script variant "${script.id}", but the base script is not registered.`)
      }
    }
  }

  private rollbackLoadedPackageRegistration(
    packageId: string,
    record: LoadedRuntimePackage | undefined,
    bundle: DynamicBundleRecord,
  ): void {
    if (record) {
      this.disposeSceneFactories(record)
    }
    this.packages.delete(packageId)
    this.engine.getStore().commit('removeRuntimePackage', packageId)
    this.removeRegisteredPackageScripts(packageId, bundle.bundleName)
  }

  private removeRegisteredPackageScripts(packageId: string, bundleName?: string): void {
    for (const [moduleId, moduleRecord] of this.scripts.entries()) {
      if (moduleRecord.packageId === packageId) {
        this.scripts.delete(moduleId)
        this.deleteLoadedScriptModuleCache(moduleId)
        continue
      }
      const nextVariants = removeScriptVariantsOwnedByPackage(moduleRecord.variants, packageId)
      if (nextVariants !== moduleRecord.variants) {
        this.scripts.set(moduleId, {
          ...moduleRecord,
          variants: nextVariants,
        })
        this.deleteLoadedScriptModuleCache(moduleId, packageId, bundleName)
      }
    }
  }

  private deleteLoadedScriptModuleCache(moduleId: string, packageId?: string, bundleName?: string): void {
    for (const cacheKey of this.loadedScriptModules.keys()) {
      if (cacheKey === moduleId || cacheKey.startsWith(`${moduleId}::`)) {
        if (!packageId || cacheKey.includes(`::${packageId}::`) || (bundleName && cacheKey.includes(`::${bundleName}::`))) {
          this.loadedScriptModules.delete(cacheKey)
        }
      }
    }
  }

  private registerLocalePackScriptVariants(bundle: DynamicBundleRecord, manifest: RuntimePackageManifest): void {
    const localePack = manifest.localePack
    if (!localePack) {
      return
    }
    const locale = normalizeLocale(localePack.locale)
    for (const script of manifest.scripts || []) {
      const existing = this.scripts.get(script.id)
      if (!existing) {
        throw new Error(`Locale pack "${manifest.id}" declares script variant "${script.id}", but the base script is not registered.`)
      }
      const variant: RuntimePackageScriptVariantManifest = {
        assetName: script.assetName,
        version: script.version || manifest.version,
        exportName: script.exportName,
        runtimePackageId: manifest.id,
        bundleName: bundle.bundleName,
        metadata: {
          ...(script.metadata || {}),
          localePackPackageId: manifest.id,
          localePackBundleName: bundle.bundleName,
        },
      }
      this.scripts.set(script.id, {
        ...existing,
        variants: {
          ...(existing.variants || {}),
          [locale]: variant,
        },
      })
    }
  }

  private assertPackageScriptIdsAvailable(manifest: RuntimePackageManifest): void {
    const seen = new Set<string>()
    const localePackTargetPackageIds = getLocalePackRuntimeTargetIds(manifest)
    for (const script of manifest.scripts || []) {
      if (seen.has(script.id)) {
        throw new Error(`Runtime package "${manifest.id}" declares duplicate script module "${script.id}".`)
      }
      seen.add(script.id)
      const existing = this.scripts.get(script.id)
      if (manifest.localePack && existing && localePackTargetPackageIds.includes(existing.packageId)) {
        continue
      }
      if (existing && existing.packageId !== manifest.id) {
        throw new Error(`Runtime script module "${script.id}" is already registered by package "${existing.packageId}".`)
      }
    }
  }

  private assertPackageSceneIdsAvailable(record: LoadedRuntimePackage): void {
    const seen = new Set<string>()
    for (const scene of record.manifest.scenes || []) {
      if (seen.has(scene.id)) {
        throw new Error(`Runtime package "${record.manifest.id}" declares duplicate scene "${scene.id}".`)
      }
      seen.add(scene.id)
      if (this.isSceneOwnedByAnotherActivePackage(scene.id, record.manifest.id)) {
        throw new Error(`Runtime scene "${scene.id}" is already registered by another active runtime package.`)
      }
      if (this.engine.hasScene(scene.id)) {
        throw new Error(`Runtime scene "${scene.id}" conflicts with an already registered scene factory.`)
      }
    }
  }

  private isSceneOwnedByAnotherActivePackage(sceneId: string, packageId: string): boolean {
    return Array.from(this.packages.values()).some(candidate =>
      candidate.manifest.id !== packageId
      && candidate.state.state === 'active'
      && (candidate.manifest.scenes || []).some(scene => scene.id === sceneId),
    )
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

  private async activateSceneFactories(record: LoadedRuntimePackage, engine: RuntimePackageScopedEngine = this.engine): Promise<void> {
    this.assertPackageSceneIdsAvailable(record)
    for (const scene of record.manifest.scenes || []) {
      const loaded = await this.loadSceneModule(scene, record)
      const sceneExport = selectExport(loaded, scene.exportName, ['createScene', 'Scene', 'default'])
      const factory = createSceneFactory(scene, sceneExport)
      if (!factory) {
        throw new Error(`Runtime package scene "${scene.id}" did not export a Scene or Scene factory.`)
      }
      record.sceneDisposers.push(engine.registerScene(scene.id, factory))
    }
  }

  private disposeSceneFactories(record: LoadedRuntimePackage, fromIndex = 0): void {
    const disposers = record.sceneDisposers.splice(fromIndex).reverse()
    for (const dispose of disposers) {
      dispose()
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
      sceneDisposerCount: record.sceneDisposers.length,
    }
  }

  private async rollbackActivation(record: LoadedRuntimePackage, rollback: ActivationRollbackState): Promise<void> {
    this.disposeSceneFactories(record, rollback.sceneDisposerCount)
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

  private async loadSceneModule(
    scene: RuntimePackageSceneManifest,
    record: LoadedRuntimePackage,
  ): Promise<RuntimeLoadedSceneModule> {
    if (!this.loader?.loadSceneModule) {
      throw new Error(`Runtime scene "${scene.id}" requires a runtime module loader.`)
    }
    return await this.loader.loadSceneModule(scene, {
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
      throw new TypeError('Runtime package includes story graph deltas, but @quajs/story-graph is not installed.')
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
      throw new TypeError(`Runtime migration "${migration.id}" did not export a migration handler.`)
    }
    return handler as RuntimeStoreMigrationHandler
  }

  private resolveScriptVariant(
    record: RuntimeScriptModuleRecord,
    preferredLocale: string,
  ): ResolvedScriptVariant {
    const variants = Object.fromEntries(
      Object.entries(record.variants || {}).map(([locale, variant]) => [normalizeLocale(locale), variant]),
    )
    for (const locale of createLocaleFallbackChain(preferredLocale)) {
      const variant = variants[locale]
      if (!variant) {
        continue
      }
      return {
        locale,
        packageId: variant.runtimePackageId || record.packageId,
        record: {
          ...record,
          packageId: variant.runtimePackageId || record.packageId,
          bundleName: variant.bundleName || record.bundleName,
          assetName: variant.assetName,
          exportName: variant.exportName || record.exportName,
          version: variant.version || record.version,
          metadata: {
            ...(record.metadata || {}),
            ...(variant.metadata || {}),
          },
        },
      }
    }

    return {
      locale: 'default',
      packageId: record.packageId,
      record,
    }
  }

  private sliceScriptSteps<TScope>(steps: GameStep[], options: RuntimeScriptModuleRunFromOptions<TScope>): GameStep[] {
    const startIndex = this.findScriptStepIndex(steps, options)
    return startIndex === -1 ? steps : steps.slice(startIndex)
  }

  private findScriptStepIndex<TScope>(steps: GameStep[], options: RuntimeScriptModuleRunFromOptions<TScope>): number {
    if (options.stepId) {
      return steps.findIndex(step => step.uuid === options.stepId || step.metadata?.point?.stepId === options.stepId)
    }
    if (options.nodeId) {
      return steps.findIndex(step => step.metadata?.point?.nodeId === options.nodeId)
    }
    if (options.labelId) {
      return steps.findIndex(step => step.metadata?.point?.labelId === options.labelId || step.metadata?.point?.nodeId === options.labelId)
    }
    if (options.entryId) {
      return steps.findIndex(step => step.metadata?.point?.entryId === options.entryId || step.metadata?.point?.nodeId === options.entryId)
    }
    return 0
  }

  private async resolveScriptFactory(record: RuntimeScriptModuleRecord, locale = 'default', packageId = record.packageId) {
    if (record.factory) {
      return record.factory
    }
    if (record.module) {
      return selectScriptFactory(record, record.module)
    }

    const cacheKey = createScriptModuleCacheKey(record.id, locale, packageId, record.version)
    const cached = this.loadedScriptModules.get(cacheKey)
    if (cached) {
      return selectScriptFactory(record, cached)
    }
    if (!this.loader?.loadScriptModule) {
      throw new Error(`Runtime script module "${record.id}" requires a runtime module loader.`)
    }

    const packageRecord = this.requirePackage(packageId)
    const loaded = await this.loader.loadScriptModule(record, {
      assets: this.engine.getAssets(),
      package: packageRecord.manifest,
      bundle: packageRecord.bundle,
      locale,
    })
    this.loadedScriptModules.set(cacheKey, loaded)
    return selectScriptFactory(record, loaded)
  }

  private requirePackage(packageId: string): LoadedRuntimePackage {
    const record = this.packages.get(packageId)
    if (!record) {
      throw new Error(`Runtime package "${packageId}" is not loaded.`)
    }
    return record
  }

  private getActiveLocalePackRecords(locale: string, options: EnsureLocalePacksOptions = {}): LoadedRuntimePackage[] {
    const fallbackChain = createLocaleFallbackChain(locale)
    const targetPackageIds = new Set(options.targetPackageIds || [])
    return Array.from(this.packages.values()).filter((record) => {
      const localePack = record.manifest.localePack
      if (record.state.state !== 'active' || !localePack) {
        return false
      }
      if (!fallbackChain.includes(normalizeLocale(localePack.locale))) {
        return false
      }
      if (targetPackageIds.size === 0) {
        return true
      }
      return localePack.targets.some(target =>
        target.kind === 'runtimePackage'
        && targetPackageIds.has(target.id),
      )
    })
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

    if (this.engine.getRuntimeStateSnapshot().activeLocalePackIds.includes(packageId)) {
      references.push('current locale')
    }

    if (references.length > 0) {
      throw new Error(`Cannot unload runtime package "${packageId}" because it is referenced by ${references.join(' and ')}. Pass force: true only after moving runtime state away from that package.`)
    }
  }
}

function normalizeRegistryEntry(entry: string | RuntimePackageRegistryEntry): RuntimePackageRegistryEntry {
  return typeof entry === 'string' ? { source: entry } : entry
}

function uniqueRecords(records: RuntimePackageStateRecord[]): RuntimePackageStateRecord[] {
  const byId = new Map<string, RuntimePackageStateRecord>()
  for (const record of records) {
    byId.set(record.id, { ...record })
  }
  return Array.from(byId.values())
}

function getLocalePackRuntimeTargetIds(manifest: RuntimePackageManifest): string[] {
  return (manifest.localePack?.targets || [])
    .filter(target => target.kind === 'runtimePackage')
    .map(target => target.id)
}

function removeScriptVariantsOwnedByPackage(
  variants: RuntimeScriptModuleRecord['variants'],
  packageId: string,
): RuntimeScriptModuleRecord['variants'] {
  if (!variants) {
    return variants
  }
  let changed = false
  const next: NonNullable<RuntimeScriptModuleRecord['variants']> = {}
  for (const [locale, variant] of Object.entries(variants)) {
    if (variant.runtimePackageId === packageId) {
      changed = true
      continue
    }
    next[locale] = variant
  }
  return changed ? next : variants
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
    compatibility: manifest.compatibility || bundle.compatibility,
    priority: bundle.priority,
    loadedAt: bundle.loadedAt,
    dependencies: [...(manifest.dependencies || [])],
    scriptModuleIds: (manifest.scripts || []).map(script => script.id),
    sceneIds: (manifest.scenes || []).map(scene => scene.id),
    pluginIds: (manifest.plugins || []).map(plugin => plugin.id),
    migrationIds: (manifest.storeMigrations || []).map(migration => createMigrationKey(manifest.id, migration)),
    localePack: manifest.localePack ? { ...manifest.localePack, targets: [...manifest.localePack.targets], resourceTypes: [...manifest.localePack.resourceTypes], fallbackLocales: manifest.localePack.fallbackLocales ? [...manifest.localePack.fallbackLocales] : undefined } : undefined,
  }
}

function selectScriptFactory(record: RuntimeScriptModuleRecord, loaded: Record<string, unknown>) {
  const factory = selectExport(loaded, record.exportName, ['default'])
  if (typeof factory !== 'function') {
    throw new TypeError(`Runtime script module "${record.id}" did not export a GameStep factory.`)
  }
  return factory
}

function isSameLoadedBundle(
  existing: LoadedRuntimePackage | undefined,
  bundle: DynamicBundleRecord,
): boolean {
  if (!existing || existing.state.state === 'unloaded') {
    return false
  }
  const existingKey = existing.bundle.bundleVersionKey || existing.bundle.bundleName
  const loadedKey = bundle.bundleVersionKey || bundle.bundleName
  return existingKey === loadedKey
}

function createSceneFactory(scene: RuntimePackageSceneManifest, value: unknown): SceneFactory | undefined {
  if (isSceneInstance(value)) {
    return () => value
  }
  if (typeof value !== 'function') {
    return undefined
  }
  return async () => {
    const created = isClassLike(value)
      ? new (value as new () => Scene)()
      : await (value as () => Scene | Promise<Scene>)()
    if (!isSceneInstance(created)) {
      throw new Error(`Runtime scene "${scene.id}" factory did not create a Scene.`)
    }
    return created
  }
}

function isSceneInstance(value: unknown): value is Scene {
  return typeof value === 'object'
    && value !== null
    && typeof (value as Scene).name === 'string'
    && typeof (value as Scene).init === 'function'
    && typeof (value as Scene).run === 'function'
}

function isClassLike(value: object): boolean {
  return /^class\s/.test(Function.prototype.toString.call(value))
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

function createScriptModuleCacheKey(moduleId: string, locale: string, packageId: string, version?: string): string {
  return `${moduleId}::${normalizeLocale(locale || 'default')}::${packageId}::${version || '0'}`
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values.filter(Boolean))]
}

function storyPointRequiresPackage(point: { contentPackageId?: string, requiredRuntimePackages?: readonly string[] } | undefined, packageId: string): boolean {
  return point?.contentPackageId === packageId
    || point?.requiredRuntimePackages?.includes(packageId) === true
}

function metadataRequiresPackage(metadata: Record<string, unknown> | undefined, packageId: string): boolean {
  const required = metadata?.requiredRuntimePackages
  return metadata?.contentPackageId === packageId
    || (Array.isArray(required) && required.includes(packageId))
}
