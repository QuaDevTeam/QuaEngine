import type { EngineContext, QuaEngineInterface } from '@quajs/engine'
import type { Pipeline, PipelineContext } from '@quajs/pipeline'

export const SETTINGS_PLUGIN_ID = 'settings' as const
export const SETTINGS_WEB_RENDERER_ENTRY = '@quajs/renderer-web/plugins/settings' as const
export const SETTINGS_VUE_RENDERER_ENTRY = '@quajs/renderer-vue/plugins/settings' as const
export const BASE_SETTINGS_SCOPE = '@quajs/plugin-settings' as const

export type SettingsPlane = 'developer' | 'player'
export type SettingsApplyReason = 'init' | 'rebuild' | 'update' | 'reset' | 'load' | 'jump' | 'runtime-package-unload'

export type SettingsJsonPrimitive = string | number | boolean | null
export type SettingsJsonValue = SettingsJsonPrimitive | SettingsJsonValue[] | { [key: string]: SettingsJsonValue }
export type SettingsValues = Record<string, unknown>

export type SettingsJsonSchemaType = 'null' | 'boolean' | 'object' | 'array' | 'number' | 'integer' | 'string'

export interface SettingsUiOption {
  label?: string
  value: SettingsJsonValue
  description?: string
}

export type SettingsUiControlKind
  = | 'text'
    | 'textarea'
    | 'number'
    | 'slider'
    | 'switch'
    | 'checkbox'
    | 'select'
    | 'radio'
    | 'color'
    | 'range'
    | 'group'
    | 'custom'

export interface SettingsUiControlHint {
  control?: SettingsUiControlKind
  label?: string
  description?: string
  group?: string
  order?: number
  min?: number
  max?: number
  step?: number
  placeholder?: string
  options?: readonly SettingsUiOption[]
  readonly?: boolean
  hidden?: boolean
  component?: string
  props?: Readonly<Record<string, SettingsJsonValue>>
}

export interface SettingsUiGroupHint {
  label?: string
  description?: string
  order?: number
}

export interface SettingsUiHints {
  label?: string
  description?: string
  order?: number
  icon?: string
  groups?: Readonly<Record<string, SettingsUiGroupHint>>
  controls?: Readonly<Record<string, SettingsUiControlHint>>
}

export interface SettingsJsonSchema {
  '$id'?: string
  '$schema'?: string
  'title'?: string
  'description'?: string
  'type'?: SettingsJsonSchemaType | readonly SettingsJsonSchemaType[]
  'enum'?: readonly SettingsJsonValue[]
  'const'?: SettingsJsonValue
  'default'?: SettingsJsonValue
  'examples'?: readonly SettingsJsonValue[]
  'properties'?: Readonly<Record<string, SettingsJsonSchema>>
  'items'?: SettingsJsonSchema | readonly SettingsJsonSchema[]
  'required'?: readonly string[]
  'additionalProperties'?: boolean | SettingsJsonSchema
  'minimum'?: number
  'maximum'?: number
  'exclusiveMinimum'?: number
  'exclusiveMaximum'?: number
  'multipleOf'?: number
  'minLength'?: number
  'maxLength'?: number
  'pattern'?: string
  'minItems'?: number
  'maxItems'?: number
  'uniqueItems'?: boolean
  'readOnly'?: boolean
  'writeOnly'?: boolean
  'format'?: string
  'x-qua-ui'?: SettingsUiControlHint
  'x-qua-expose'?: boolean
  [extension: `x-${string}`]: unknown
}

export interface SettingsExposure {
  include?: readonly string[]
  exclude?: readonly string[]
  readonly?: readonly string[]
}

export interface SettingsDeveloperDefinition<TDeveloper extends object = SettingsValues> {
  schema?: SettingsJsonSchema
  defaults?: Partial<TDeveloper>
  values?: Partial<TDeveloper>
  metadata?: Readonly<Record<string, SettingsJsonValue>>
}

export interface SettingsPlayerDefinition<TPlayer extends object = SettingsValues> {
  schema: SettingsJsonSchema
  defaults?: Partial<TPlayer>
  values?: Partial<TPlayer>
  expose?: boolean | SettingsExposure
  ui?: SettingsUiHints
  metadata?: Readonly<Record<string, SettingsJsonValue>>
}

export interface SettingsScopeContribution<
  TDeveloper extends object = SettingsValues,
  TPlayer extends object = SettingsValues,
> {
  scope: string
  version?: number | string
  packageId?: string
  title?: string
  description?: string
  developer?: SettingsDeveloperDefinition<TDeveloper>
  player?: SettingsPlayerDefinition<TPlayer>
  apply?: (ctx: SettingsApplyContext<TDeveloper, TPlayer>) => void | Promise<void>
}

export interface SettingsApplyContext<
  TDeveloper extends object = SettingsValues,
  TPlayer extends object = SettingsValues,
> {
  engineContext: EngineContext
  engine: QuaEngineInterface
  scope: string
  developer: Readonly<TDeveloper>
  player: Readonly<TPlayer>
  previousPlayer?: Readonly<TPlayer>
  changedKeys: readonly string[]
  reason: SettingsApplyReason
  revision: number
}

export type AnySettingsScopeContribution = SettingsScopeContribution<any, any>

export interface SettingsValidationIssue {
  path: string
  message: string
  keyword?: string
}

export interface SettingsScopeProjection {
  version?: number | string
  packageId?: string
  title?: string
  description?: string
  schema: SettingsJsonSchema
  ui?: SettingsUiHints
  defaults: SettingsValues
  values: SettingsValues
  metadata?: Readonly<Record<string, SettingsJsonValue>>
  errors?: readonly SettingsValidationIssue[]
}

export interface SettingsProjection {
  revision: number
  profileId: string
  updatedAt: number
  scopes: Readonly<Record<string, SettingsScopeProjection>>
}

export interface SettingsStoredProfile {
  profileId: string
  revision: number
  updatedAt: number
  scopes: Record<string, SettingsValues>
}

export interface SettingsStorageAdapter {
  loadProfile: (profileId: string) => Promise<SettingsStoredProfile | undefined>
  saveProfile: (profile: SettingsStoredProfile) => Promise<void>
  deleteProfile?: (profileId: string) => Promise<void>
}

export interface SettingsUpdateOptions {
  reason?: SettingsApplyReason
  persist?: boolean
}

export interface SettingsUpdateResult {
  ok: boolean
  scope?: string
  values?: SettingsValues
  errors?: readonly SettingsValidationIssue[]
  projection: SettingsProjection
}

export interface SettingsBridge {
  registerScope: (contribution: AnySettingsScopeContribution) => () => void
  getDeveloperValues: <TValues extends SettingsValues = SettingsValues>(scope: string) => TValues | undefined
  getPlayerValues: <TValues extends SettingsValues = SettingsValues>(scope: string) => TValues | undefined
  updatePlayerValues: (scope: string, patch: SettingsValues, options?: SettingsUpdateOptions) => Promise<SettingsUpdateResult>
  resetPlayerValues: (scope: string, options?: SettingsUpdateOptions) => Promise<SettingsUpdateResult>
  resetAllPlayerValues: (options?: SettingsUpdateOptions) => Promise<SettingsUpdateResult>
  rebuildProjection: (options?: SettingsRebuildOptions) => Promise<SettingsProjection>
  getProjection: () => SettingsProjection
}

export interface SettingsRebuildOptions {
  reason?: SettingsApplyReason
  apply?: boolean
  persist?: boolean
}

export interface SettingsUpdateRequestPayload {
  scope: string
  patch: SettingsValues
}

export interface SettingsResetScopeRequestPayload {
  scope: string
}

export const SettingsRenderToLogicEvents = {
  UPDATE_REQUEST: 'settings/update_request',
  RESET_SCOPE_REQUEST: 'settings/reset_scope_request',
  RESET_ALL_REQUEST: 'settings/reset_all_request',
} as const

export type SettingsRenderToLogicEvent = typeof SettingsRenderToLogicEvents[keyof typeof SettingsRenderToLogicEvents]

export interface SettingsRenderToLogicEventPayloadMap {
  [SettingsRenderToLogicEvents.UPDATE_REQUEST]: SettingsUpdateRequestPayload
  [SettingsRenderToLogicEvents.RESET_SCOPE_REQUEST]: SettingsResetScopeRequestPayload
  [SettingsRenderToLogicEvents.RESET_ALL_REQUEST]: Record<string, never>
}

export function emitSettingsRenderToLogic<T extends SettingsRenderToLogicEvent>(
  pipeline: Pipeline,
  type: T,
  payload: SettingsRenderToLogicEventPayloadMap[T],
): Promise<void> {
  return pipeline.emit(type, payload)
}

export function onSettingsRenderToLogic<T extends SettingsRenderToLogicEvent>(
  pipeline: Pipeline,
  type: T,
  handler: (payload: SettingsRenderToLogicEventPayloadMap[T], context: PipelineContext<SettingsRenderToLogicEventPayloadMap[T]>) => void | Promise<void>,
): () => void {
  const listener = async (context: PipelineContext<SettingsRenderToLogicEventPayloadMap[T]>) => {
    await handler(context.event.payload, context)
  }
  pipeline.on(type, listener)
  return () => pipeline.off(type, listener)
}
