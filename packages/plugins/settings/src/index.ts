import type { EngineContext, QuaEngineInterface } from '@quajs/engine'
import type {
  BaseSettingsScopeOptions,
} from './builtin'
import type {
  SettingsBridge,
  SettingsProjection,
  SettingsStorageAdapter,
  SettingsUpdateOptions,
  SettingsUpdateResult,
  SettingsValues,
} from './contracts'
import type { SettingsBridgeErrorContext } from './runtime/bridge'
import { BaseEnginePlugin, emitLogicToRender, LogicToRenderEvents } from '@quajs/engine'
import { createBaseSettingsScope } from './builtin'
import {
  BASE_SETTINGS_SCOPE,
  onSettingsRenderToLogic,
  SETTINGS_PLUGIN_ID,
  SettingsRenderToLogicEvents,
} from './contracts'
import { SettingsBridgeController } from './runtime/bridge'
import {
  getSettingsBridge,
  getSettingsScopeRegistry,
  registerSettingsScope,
} from './runtime/registry'
import { createMemorySettingsStorage } from './storage'

export {
  baseDeveloperSettingsDefaults,
  basePlayerSettingsDefaults,
  createBaseSettingsScope,
} from './builtin'

export type {
  BaseDeveloperSettings,
  BasePlayerSettings,
  BaseSettingsScopeOptions,
} from './builtin'

export {
  BASE_SETTINGS_SCOPE,
  emitSettingsRenderToLogic,
  onSettingsRenderToLogic,
  SETTINGS_PLUGIN_ID,
  SettingsRenderToLogicEvents,
} from './contracts'

export type {
  AnySettingsScopeContribution,
  SettingsApplyContext,
  SettingsApplyReason,
  SettingsBridge,
  SettingsDeveloperDefinition,
  SettingsExposure,
  SettingsJsonPrimitive,
  SettingsJsonSchema,
  SettingsJsonSchemaType,
  SettingsJsonValue,
  SettingsPlane,
  SettingsPlayerDefinition,
  SettingsProjection,
  SettingsRebuildOptions,
  SettingsRenderToLogicEvent,
  SettingsRenderToLogicEventPayloadMap,
  SettingsResetScopeRequestPayload,
  SettingsScopeContribution,
  SettingsScopeProjection,
  SettingsStorageAdapter,
  SettingsStoredProfile,
  SettingsUiControlHint,
  SettingsUiControlKind,
  SettingsUiGroupHint,
  SettingsUiHints,
  SettingsUiOption,
  SettingsUpdateOptions,
  SettingsUpdateRequestPayload,
  SettingsUpdateResult,
  SettingsValidationIssue,
  SettingsValues,
} from './contracts'

export {
  getSettingsBridge,
  getSettingsScopeRegistry,
  registerSettingsScope,
} from './runtime/registry'

export {
  createSettingsScopeProjection,
  createSettingsUiHints,
  getVisibleSettingsFields,
  normalizeObjectSchema,
  validateSettingsPatch,
} from './schema'

export {
  createMemorySettingsStorage,
  MemorySettingsStorage,
} from './storage'

export interface SettingsPluginOptions {
  profileId?: string
  storage?: SettingsStorageAdapter
  builtin?: boolean | BaseSettingsScopeOptions
  onError?: (error: unknown, context: SettingsBridgeErrorContext) => void
}

export class SettingsPlugin extends BaseEnginePlugin {
  readonly name = '@quajs/plugin-settings'
  readonly id = SETTINGS_PLUGIN_ID
  readonly version = '0.1.0'
  readonly description = 'Scoped developer/player settings bridge and renderer projection'
  private bridge?: SettingsBridgeController
  private disposers: Array<() => void> = []

  protected override async setup(ctx: EngineContext): Promise<void> {
    const options = this.getOptions()
    const registry = getSettingsScopeRegistry(ctx)
    const builtin = normalizeBuiltinOptions(options.builtin)

    if (builtin.enabled && !registry.getScope(BASE_SETTINGS_SCOPE)) {
      this.disposers.push(registry.registerScope(createBaseSettingsScope(builtin.options)))
    }

    const bridge = new SettingsBridgeController(ctx, registry, {
      profileId: options.profileId || 'default',
      storage: options.storage || createMemorySettingsStorage(),
      onError: options.onError,
    })
    this.bridge = bridge
    registry.setBridge(bridge)

    this.disposers.push(registry.subscribe(() => {
      void bridge.rebuildProjection({ reason: 'rebuild', apply: true, persist: false })
    }))
    this.disposers.push(
      onSettingsRenderToLogic(ctx.pipeline, SettingsRenderToLogicEvents.UPDATE_REQUEST, async (payload) => {
        await bridge.updatePlayerValues(payload.scope, payload.patch)
      }),
    )
    this.disposers.push(
      onSettingsRenderToLogic(ctx.pipeline, SettingsRenderToLogicEvents.RESET_SCOPE_REQUEST, async (payload) => {
        await bridge.resetPlayerValues(payload.scope)
      }),
    )
    this.disposers.push(
      onSettingsRenderToLogic(ctx.pipeline, SettingsRenderToLogicEvents.RESET_ALL_REQUEST, async () => {
        await bridge.resetAllPlayerValues()
      }),
    )

    await bridge.start()
  }

  override async onAfterJump(): Promise<void> {
    await this.bridge?.rebuildProjection({ reason: 'jump', apply: true, persist: false })
  }

  override async destroy(): Promise<void> {
    while (this.disposers.length > 0) {
      this.disposers.pop()?.()
    }
    if (this.ctx) {
      getSettingsScopeRegistry(this.ctx.engine).setBridge(undefined)
      this.ctx.store.commit('setPluginProjection', {
        pluginId: SETTINGS_PLUGIN_ID,
        projection: undefined,
      })
      await emitLogicToRender(this.ctx.pipeline, LogicToRenderEvents.VIEW_UPDATE, { view: this.ctx.engine.getViewState() })
    }
    this.bridge = undefined
    await super.destroy?.()
  }

  registerAPIs() {
    return {
      pluginName: this.name,
      apis: [
        { name: 'registerSettingsScope', fn: registerSettingsScope, module: this.name },
        { name: 'getSettingsBridge', fn: getSettingsBridge, module: this.name },
        { name: 'getSettingsProjection', fn: getSettingsProjection, module: this.name },
        { name: 'updatePlayerSettingsWithEngine', fn: updatePlayerSettingsWithEngine, module: this.name },
        { name: 'resetPlayerSettingsWithEngine', fn: resetPlayerSettingsWithEngine, module: this.name },
        { name: 'resetAllPlayerSettingsWithEngine', fn: resetAllPlayerSettingsWithEngine, module: this.name },
      ],
      decorators: {},
    }
  }

  private getOptions(): SettingsPluginOptions {
    return this.options as SettingsPluginOptions
  }
}

export function getSettingsProjection(engine: QuaEngineInterface): SettingsProjection | undefined {
  return engine.getPluginProjection<SettingsProjection>(SETTINGS_PLUGIN_ID)
}

export function getSettingsDeveloperValues<TValues extends SettingsValues = SettingsValues>(
  target: EngineContext | QuaEngineInterface,
  scope: string,
): TValues | undefined {
  return getSettingsBridge(target)?.getDeveloperValues<TValues>(scope)
}

export function getSettingsPlayerValues<TValues extends SettingsValues = SettingsValues>(
  target: EngineContext | QuaEngineInterface,
  scope: string,
): TValues | undefined {
  return getSettingsBridge(target)?.getPlayerValues<TValues>(scope)
}

export async function updatePlayerSettingsWithEngine(
  engine: QuaEngineInterface,
  scope: string,
  patch: SettingsValues,
  options?: SettingsUpdateOptions,
): Promise<SettingsUpdateResult> {
  const bridge = getRequiredSettingsBridge(engine)
  return await bridge.updatePlayerValues(scope, patch, options)
}

export async function resetPlayerSettingsWithEngine(
  engine: QuaEngineInterface,
  scope: string,
  options?: SettingsUpdateOptions,
): Promise<SettingsUpdateResult> {
  const bridge = getRequiredSettingsBridge(engine)
  return await bridge.resetPlayerValues(scope, options)
}

export async function resetAllPlayerSettingsWithEngine(
  engine: QuaEngineInterface,
  options?: SettingsUpdateOptions,
): Promise<SettingsUpdateResult> {
  const bridge = getRequiredSettingsBridge(engine)
  return await bridge.resetAllPlayerValues(options)
}

function getRequiredSettingsBridge(engine: QuaEngineInterface): SettingsBridge {
  const bridge = getSettingsBridge(engine)
  if (!bridge) {
    throw new Error('@quajs/plugin-settings must be installed before settings can be updated.')
  }
  return bridge
}

function normalizeBuiltinOptions(input: SettingsPluginOptions['builtin']): { enabled: boolean, options?: BaseSettingsScopeOptions } {
  if (input === false) {
    return { enabled: false }
  }
  if (input === true || input === undefined) {
    return { enabled: true }
  }
  return { enabled: true, options: input }
}

export const metadata = {
  name: '@quajs/plugin-settings',
  version: '0.1.0',
  description: 'Scoped developer/player settings bridge and renderer projection',
  category: 'ui',
} as const

export const Plugin = SettingsPlugin
export const decorators = {}
