import type { EngineContext } from '@quajs/engine'
import type {
  AnySettingsScopeContribution,
  SettingsApplyReason,
  SettingsBridge,
  SettingsProjection,
  SettingsRebuildOptions,
  SettingsStorageAdapter,
  SettingsUpdateOptions,
  SettingsUpdateResult,
  SettingsValidationIssue,
  SettingsValues,
} from '../contracts'
import type { SettingsScopeRegistry } from './registry'
import { emitLogicToRender, LogicToRenderEvents } from '@quajs/engine'
import { SETTINGS_PLUGIN_ID } from '../contracts'
import { createSettingsScopeProjection, validateSettingsPatch } from '../schema'
import { cloneSettingsValue, mergeSettingsValues, settingsValuesEqual } from './json'

export interface SettingsBridgeControllerOptions {
  profileId: string
  storage: SettingsStorageAdapter
  onError?: (error: unknown, context: SettingsBridgeErrorContext) => void
}

export interface SettingsBridgeErrorContext {
  scope?: string
  reason: SettingsApplyReason
}

export class SettingsBridgeController implements SettingsBridge {
  private revision = 0
  private projection: SettingsProjection
  private readonly playerOverrides = new Map<string, SettingsValues>()
  private readonly validationErrors = new Map<string, SettingsValidationIssue[]>()

  constructor(
    private readonly ctx: EngineContext,
    private readonly registry: SettingsScopeRegistry,
    private readonly options: SettingsBridgeControllerOptions,
  ) {
    this.projection = {
      revision: 0,
      profileId: options.profileId,
      updatedAt: Date.now(),
      scopes: {},
    }
  }

  async start(): Promise<void> {
    const stored = await this.loadStoredProfile()
    if (stored) {
      for (const [scope, values] of Object.entries(stored.scopes)) {
        this.playerOverrides.set(scope, cloneSettingsValue(values))
      }
      this.revision = stored.revision
    }
    await this.rebuildProjection({ reason: 'init', apply: true, persist: false })
  }

  registerScope(contribution: AnySettingsScopeContribution): () => void {
    return this.registry.registerScope(contribution)
  }

  getDeveloperValues<TValues extends SettingsValues = SettingsValues>(scope: string): TValues | undefined {
    const contribution = this.registry.getScope(scope)
    if (!contribution?.developer) {
      return undefined
    }
    return mergeSettingsValues(contribution.developer.defaults, contribution.developer.values) as TValues
  }

  getPlayerValues<TValues extends SettingsValues = SettingsValues>(scope: string): TValues | undefined {
    const contribution = this.registry.getScope(scope)
    if (!contribution?.player) {
      return undefined
    }
    return this.resolvePlayerValues(contribution) as TValues
  }

  async updatePlayerValues(scope: string, patch: SettingsValues, options: SettingsUpdateOptions = {}): Promise<SettingsUpdateResult> {
    const contribution = this.registry.getScope(scope)
    if (!contribution?.player) {
      return this.fail(scope, [{ path: scope, message: `Settings scope "${scope}" does not expose player settings.`, keyword: 'scope' }])
    }

    const issues = validateSettingsPatch(contribution.player.schema, patch, contribution.player.expose, contribution.player.ui)
    if (issues.length > 0) {
      this.validationErrors.set(scope, issues)
      await this.publishProjection()
      return {
        ok: false,
        scope,
        errors: issues,
        projection: this.getProjection(),
      }
    }

    const previous = this.resolvePlayerValues(contribution)
    const previousOverrides = cloneSettingsValue(this.playerOverrides.get(scope))
    const nextOverrides = mergeSettingsValues(this.playerOverrides.get(scope), patch)
    this.playerOverrides.set(scope, nextOverrides)
    const next = this.resolvePlayerValues(contribution)
    const changedKeys = Object.keys(patch).filter(key => !settingsValuesEqual(previous[key], next[key]))

    this.validationErrors.delete(scope)
    const applyErrors = await this.applyScope(contribution, previous, changedKeys, options.reason || 'update')
    if (applyErrors.length > 0) {
      this.restorePlayerOverrides(scope, previousOverrides)
      await this.publishProjection()
      return {
        ok: false,
        scope,
        errors: applyErrors,
        projection: this.getProjection(),
      }
    }

    if (options.persist !== false) {
      await this.persistProfile(options.reason || 'update')
    }
    await this.publishProjection()

    return {
      ok: true,
      scope,
      values: next,
      projection: this.getProjection(),
    }
  }

  async resetPlayerValues(scope: string, options: SettingsUpdateOptions = {}): Promise<SettingsUpdateResult> {
    const contribution = this.registry.getScope(scope)
    if (!contribution?.player) {
      return this.fail(scope, [{ path: scope, message: `Settings scope "${scope}" does not expose player settings.`, keyword: 'scope' }])
    }

    const previous = this.resolvePlayerValues(contribution)
    const previousOverrides = cloneSettingsValue(this.playerOverrides.get(scope))
    this.playerOverrides.delete(scope)
    this.validationErrors.delete(scope)
    const next = this.resolvePlayerValues(contribution)
    const changedKeys = Object.keys({ ...previous, ...next }).filter(key => !settingsValuesEqual(previous[key], next[key]))

    const applyErrors = await this.applyScope(contribution, previous, changedKeys, options.reason || 'reset')
    if (applyErrors.length > 0) {
      this.restorePlayerOverrides(scope, previousOverrides)
      await this.publishProjection()
      return {
        ok: false,
        scope,
        errors: applyErrors,
        projection: this.getProjection(),
      }
    }

    if (options.persist !== false) {
      await this.persistProfile(options.reason || 'reset')
    }
    await this.publishProjection()

    return {
      ok: true,
      scope,
      values: next,
      projection: this.getProjection(),
    }
  }

  async resetAllPlayerValues(options: SettingsUpdateOptions = {}): Promise<SettingsUpdateResult> {
    const previousValues = new Map<string, SettingsValues>()
    const previousOverrides = new Map<string, SettingsValues | undefined>()
    for (const contribution of this.registry.getScopes()) {
      if (contribution.player) {
        previousValues.set(contribution.scope, this.resolvePlayerValues(contribution))
        previousOverrides.set(contribution.scope, cloneSettingsValue(this.playerOverrides.get(contribution.scope)))
      }
    }

    this.playerOverrides.clear()
    this.validationErrors.clear()

    for (const contribution of this.registry.getScopes()) {
      if (!contribution.player) {
        continue
      }
      const previous = previousValues.get(contribution.scope)
      const next = this.resolvePlayerValues(contribution)
      const changedKeys = previous
        ? Object.keys({ ...previous, ...next }).filter(key => !settingsValuesEqual(previous[key], next[key]))
        : Object.keys(next)
      const applyErrors = await this.applyScope(contribution, previous, changedKeys, options.reason || 'reset')
      if (applyErrors.length > 0) {
        for (const [scope, overrides] of previousOverrides) {
          this.restorePlayerOverrides(scope, overrides)
        }
        await this.publishProjection()
        return {
          ok: false,
          scope: contribution.scope,
          errors: applyErrors,
          projection: this.getProjection(),
        }
      }
    }

    if (options.persist !== false) {
      await this.persistProfile(options.reason || 'reset')
    }

    await this.publishProjection()
    return {
      ok: true,
      projection: this.getProjection(),
    }
  }

  async rebuildProjection(options: SettingsRebuildOptions = {}): Promise<SettingsProjection> {
    let hasApplyErrors = false
    if (options.apply !== false) {
      for (const contribution of this.registry.getScopes()) {
        const applyErrors = await this.applyScope(contribution, undefined, [], options.reason || 'rebuild')
        hasApplyErrors = hasApplyErrors || applyErrors.length > 0
      }
    }

    if (options.persist && !hasApplyErrors) {
      await this.persistProfile(options.reason || 'rebuild')
    }

    await this.publishProjection()
    return this.getProjection()
  }

  getProjection(): SettingsProjection {
    return cloneSettingsValue(this.projection)
  }

  private resolvePlayerDefaults(contribution: AnySettingsScopeContribution): SettingsValues {
    return mergeSettingsValues(contribution.player?.defaults, contribution.player?.values)
  }

  private resolvePlayerValues(contribution: AnySettingsScopeContribution): SettingsValues {
    return mergeSettingsValues(this.resolvePlayerDefaults(contribution), this.playerOverrides.get(contribution.scope))
  }

  private async applyScope(
    contribution: AnySettingsScopeContribution,
    previousPlayer: SettingsValues | undefined,
    changedKeys: readonly string[],
    reason: SettingsApplyReason,
  ): Promise<SettingsValidationIssue[]> {
    if (!contribution.apply) {
      return []
    }

    try {
      await contribution.apply({
        engineContext: this.ctx,
        engine: this.ctx.engine,
        scope: contribution.scope,
        developer: mergeSettingsValues(contribution.developer?.defaults, contribution.developer?.values),
        player: contribution.player ? this.resolvePlayerValues(contribution) : {},
        previousPlayer,
        changedKeys,
        reason,
        revision: this.revision,
      })
      return []
    }
    catch (error) {
      const issue = {
        path: contribution.scope,
        message: error instanceof Error ? error.message : 'Settings apply hook failed.',
        keyword: 'apply',
      }
      this.validationErrors.set(contribution.scope, [issue])
      this.reportError(error, { scope: contribution.scope, reason })
      return [issue]
    }
  }

  private restorePlayerOverrides(scope: string, overrides: SettingsValues | undefined): void {
    if (overrides) {
      this.playerOverrides.set(scope, overrides)
    }
    else {
      this.playerOverrides.delete(scope)
    }
  }

  private async loadStoredProfile(): Promise<Awaited<ReturnType<SettingsStorageAdapter['loadProfile']>>> {
    try {
      return await this.options.storage.loadProfile(this.options.profileId)
    }
    catch (error) {
      this.reportError(error, { reason: 'init' })
      return undefined
    }
  }

  private async persistProfile(reason: SettingsApplyReason): Promise<void> {
    this.revision += 1
    const scopes: Record<string, SettingsValues> = {}
    for (const [scope, values] of this.playerOverrides.entries()) {
      scopes[scope] = cloneSettingsValue(values)
    }
    for (const contribution of this.registry.getScopes()) {
      if (contribution.player) {
        scopes[contribution.scope] = cloneSettingsValue(this.playerOverrides.get(contribution.scope) || {})
      }
    }
    try {
      await this.options.storage.saveProfile({
        profileId: this.options.profileId,
        revision: this.revision,
        updatedAt: Date.now(),
        scopes,
      })
    }
    catch (error) {
      this.reportError(error, { reason })
    }
  }

  private reportError(error: unknown, context: SettingsBridgeErrorContext): void {
    try {
      this.options.onError?.(error, context)
    }
    catch {
      // Settings error observers must not block in-memory settings updates.
    }
  }

  private async publishProjection(): Promise<void> {
    const scopes: Record<string, ReturnType<typeof createSettingsScopeProjection>> = {}
    for (const contribution of this.registry.getScopes()) {
      const projection = createSettingsScopeProjection({
        contribution,
        defaults: this.resolvePlayerDefaults(contribution),
        values: contribution.player ? this.resolvePlayerValues(contribution) : {},
        errors: this.validationErrors.get(contribution.scope),
      })
      if (projection) {
        scopes[contribution.scope] = projection
      }
    }

    const projectionScopes: SettingsProjection['scopes'] = Object.fromEntries(
      Object.entries(scopes).filter((entry): entry is [string, NonNullable<typeof entry[1]>] => Boolean(entry[1])),
    )

    this.projection = {
      revision: this.revision,
      profileId: this.options.profileId,
      updatedAt: Date.now(),
      scopes: projectionScopes,
    }

    this.ctx.store.commit('setPluginProjection', {
      pluginId: SETTINGS_PLUGIN_ID,
      projection: this.projection,
    })
    await emitLogicToRender(this.ctx.pipeline, LogicToRenderEvents.VIEW_UPDATE, { view: this.ctx.engine.getViewState() })
  }

  private async fail(scope: string, errors: SettingsValidationIssue[]): Promise<SettingsUpdateResult> {
    this.validationErrors.set(scope, errors)
    await this.publishProjection()
    return {
      ok: false,
      scope,
      errors,
      projection: this.getProjection(),
    }
  }
}
