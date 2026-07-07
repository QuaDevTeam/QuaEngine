import { nativeBytesToWire } from './capabilities'
import {
  DEFAULT_FORBIDDEN_NATIVE_PAYLOAD_EXTENSIONS,
  isForbiddenNativeAssetReference,
  isForbiddenNativePayload,
} from './package-guard'

export type NativeQuickJsRuntimeModuleKind = 'script' | 'scene' | 'enginePlugin' | 'storeMigration'

export const NATIVE_QUICKJS_GAME_STEP_ENGINE_COMMAND_METHODS = [
  'showDialogue',
  'hideDialogue',
  'showChoices',
  'clearChoices',
  'jumpToChoice',
  'setBackgroundProjection',
  'setAnimationProjection',
  'removeAnimationProjection',
  'clearAnimationProjections',
  'showCharacter',
  'hideCharacter',
  'moveCharacter',
  'setCharacterExpression',
  'setCharacterSprite',
  'showUI',
  'hideUI',
  'updateUI',
  'setPluginProjection',
  'setLayoutProjection',
  'setFlowControlOptions',
  'setDialogueOptions',
  'setFlowControlMode',
  'setFlowControlPolicy',
  'resetFlowControlPolicy',
  'saveToSlot',
  'loadFromSlot',
  'quickSave',
  'quickLoad',
  'autoSave',
  'createRollbackAnchor',
  'markRollbackBoundary',
  'fixRollback',
  'startAuto',
  'stopAuto',
  'startSkip',
  'stopSkip',
  'startFastForward',
  'stopFastForward',
] as const

export type NativeQuickJsGameStepEngineCommandMethod = typeof NATIVE_QUICKJS_GAME_STEP_ENGINE_COMMAND_METHODS[number]

export interface NativeQuickJsGameStepCommand {
  target: 'engine'
  method: NativeQuickJsGameStepEngineCommandMethod
  argsJson?: string
}

export interface NativeQuickJsRuntimeModuleRecord {
  assetName: string
  bundleName: string
  packageId: string
  kind: NativeQuickJsRuntimeModuleKind
  code: string
  bytes: number[]
}

export interface NativeQuickJsSandboxLimits {
  maxHeapBytes: number
  maxStackBytes: number
  maxModuleBytes: number
  maxExecutionTicks: number
}

export interface NativeQuickJsEvaluationRequest {
  module: NativeQuickJsRuntimeModuleRecord
  moduleGraph?: NativeQuickJsRuntimeModuleRecord[]
  limits: NativeQuickJsSandboxLimits
}

export interface NativeQuickJsEvaluationResponse {
  ok: boolean
  moduleNamespaceId?: string
  error?: NativeQuickJsEvaluationError
}

export interface NativeQuickJsModuleExportCallRequest {
  moduleNamespaceId: string
  exportName: string
  argsJson?: string
}

export interface NativeQuickJsModuleExportCallResponse {
  ok: boolean
  valueJson?: string
  error?: NativeQuickJsEvaluationError
}

export interface NativeQuickJsGameStepFactoryCallRequest {
  moduleNamespaceId: string
  exportName: string
  scopeJson?: string
}

export interface NativeQuickJsGameStepDescriptor {
  uuid: string
  runHandleId: string
  metadataJson?: string
}

export interface NativeQuickJsGameStepFactoryCallResponse {
  ok: boolean
  steps?: NativeQuickJsGameStepDescriptor[]
  error?: NativeQuickJsEvaluationError
}

export interface NativeQuickJsGameStepRunRequest {
  runHandleId: string
  ctxJson?: string
}

export interface NativeQuickJsGameStepWaitRequest {
  resumeHandleId: string
  event: string
}

export interface NativeQuickJsGameStepTranslationRequest {
  resumeHandleId: string
  key: string
  optionsJson?: string
}

export interface NativeQuickJsGameStepPipelineEmitRequest {
  resumeHandleId: string
  event: string
  payloadJson?: string
}

export interface NativeQuickJsGameStepHelperCallRequest {
  resumeHandleId: string
  module: string
  exportName: string
  argsJson?: string
}

export interface NativeQuickJsGameStepResumeRequest {
  resumeHandleId: string
  payloadJson?: string
}

export interface NativeQuickJsGameStepRunResponse {
  ok: boolean
  commands?: NativeQuickJsGameStepCommand[]
  pendingWait?: NativeQuickJsGameStepWaitRequest
  pendingTranslation?: NativeQuickJsGameStepTranslationRequest
  pendingPipelineEmit?: NativeQuickJsGameStepPipelineEmitRequest
  pendingHelperCall?: NativeQuickJsGameStepHelperCallRequest
  error?: NativeQuickJsEvaluationError
}

export interface NativeQuickJsModuleNamespaceRecord {
  id: string
  packageId: string
  bundleName: string
  assetName: string
  kind: NativeQuickJsRuntimeModuleKind
  moduleBytes: number
  codeBytes: number
  revision: number
}

export interface NativeQuickJsModuleNamespaceSummary {
  namespaceCount: number
  packageCount: number
  moduleBytes: number
  codeBytes: number
  totalBytes: number
}

export interface NativeQuickJsReleaseNamespaceRequest {
  moduleNamespaceId: string
}

export interface NativeQuickJsReleasePackageRequest {
  packageId: string
}

export type NativeQuickJsEvaluationErrorCode
  = | 'missingAssetName'
    | 'forbiddenAssetName'
    | 'forbiddenNativePayload'
    | 'unsupportedModuleAsset'
    | 'moduleTooLarge'
    | 'missingModuleNamespace'
    | 'missingExportName'
    | 'missingExport'
    | 'exportNotCallable'
    | 'invalidArguments'
    | 'invalidScope'
    | 'invalidStepContext'
    | 'invalidStepFactoryResult'
    | 'invalidStepDescriptor'
    | 'missingRunHandle'
    | 'missingResumeHandle'
    | 'invalidWaitEvent'
    | 'invalidTranslationRequest'
    | 'invalidPipelineRequest'
    | 'invalidHelperCallRequest'
    | 'invalidResumePayload'
    | 'stepRunFailed'
    | 'unsupportedStepContextCommand'
    | 'unsupportedReturnValue'
    | 'evaluationFailed'
    | 'unsupportedRuntime'

export interface NativeQuickJsEvaluationError {
  code: NativeQuickJsEvaluationErrorCode
  message: string
  assetName?: string
  detail?: string
}

export interface NativeQuickJsEvaluationValidationResult {
  ok: boolean
  errors: NativeQuickJsEvaluationError[]
}

export interface ValidateNativeQuickJsEvaluationRequestOptions {
  forbiddenExtensions?: readonly string[] | ReadonlySet<string>
}

export const DEFAULT_NATIVE_QUICKJS_SANDBOX_LIMITS: NativeQuickJsSandboxLimits = {
  maxHeapBytes: 64 * 1024 * 1024,
  maxStackBytes: 2 * 1024 * 1024,
  maxModuleBytes: 4 * 1024 * 1024,
  maxExecutionTicks: 1_000_000,
}

export interface CreateNativeQuickJsEvaluationRequestInput {
  assetName: string
  bundleName: string
  packageId: string
  kind: NativeQuickJsRuntimeModuleKind
  code: string
  bytes: Uint8Array
  moduleGraph?: readonly NativeQuickJsRuntimeModuleRecord[]
  limits?: Partial<NativeQuickJsSandboxLimits>
}

export function createNativeQuickJsEvaluationRequest(
  input: CreateNativeQuickJsEvaluationRequestInput,
): NativeQuickJsEvaluationRequest {
  const request = {
    module: {
      assetName: input.assetName,
      bundleName: input.bundleName,
      packageId: input.packageId,
      kind: input.kind,
      code: input.code,
      bytes: nativeBytesToWire(input.bytes),
    },
    ...(input.moduleGraph?.length ? { moduleGraph: input.moduleGraph.map(module => ({ ...module })) } : {}),
    limits: {
      ...DEFAULT_NATIVE_QUICKJS_SANDBOX_LIMITS,
      ...(input.limits || {}),
    },
  }
  assertNativeQuickJsEvaluationRequest(request)
  return request
}

export function assertNativeQuickJsEvaluationResponse(
  response: NativeQuickJsEvaluationResponse,
): string {
  if (!response.ok) {
    throw new Error(response.error?.message || 'Native QuickJS module evaluation failed.')
  }
  if (!response.moduleNamespaceId) {
    throw new Error('Native QuickJS module evaluation succeeded without a module namespace id.')
  }
  return response.moduleNamespaceId
}

export function assertNativeQuickJsModuleExportCallResponse(
  response: NativeQuickJsModuleExportCallResponse,
): string | undefined {
  if (!response.ok) {
    throw new Error(response.error?.message || 'Native QuickJS module export call failed.')
  }
  return response.valueJson
}

export function parseNativeQuickJsModuleExportCallResponse(
  response: NativeQuickJsModuleExportCallResponse,
): unknown {
  const valueJson = assertNativeQuickJsModuleExportCallResponse(response)
  return valueJson === undefined ? undefined : JSON.parse(valueJson)
}

export function assertNativeQuickJsGameStepFactoryCallResponse(
  response: NativeQuickJsGameStepFactoryCallResponse,
): NativeQuickJsGameStepDescriptor[] {
  if (!response.ok) {
    throw new Error(response.error?.message || 'Native QuickJS GameStep factory call failed.')
  }
  if (!Array.isArray(response.steps)) {
    throw new Error('Native QuickJS GameStep factory call succeeded without step descriptors.')
  }
  return response.steps
}

export function assertNativeQuickJsGameStepRunResponse(
  response: NativeQuickJsGameStepRunResponse,
): NativeQuickJsGameStepRunResponse {
  if (!response.ok) {
    throw new Error(response.error?.message || 'Native QuickJS GameStep run failed.')
  }
  const commands = response.commands || []
  if (!Array.isArray(commands)) {
    throw new Error('Native QuickJS GameStep run commands must be an array.')
  }
  commands.forEach(assertNativeQuickJsGameStepCommand)
  if (response.pendingWait !== undefined) {
    assertNativeQuickJsGameStepWaitRequest(response.pendingWait)
  }
  if (response.pendingTranslation !== undefined) {
    assertNativeQuickJsGameStepTranslationRequest(response.pendingTranslation)
  }
  if (response.pendingPipelineEmit !== undefined) {
    assertNativeQuickJsGameStepPipelineEmitRequest(response.pendingPipelineEmit)
  }
  if (response.pendingHelperCall !== undefined) {
    assertNativeQuickJsGameStepHelperCallRequest(response.pendingHelperCall)
  }
  const pendingCount = Number(response.pendingWait !== undefined)
    + Number(response.pendingTranslation !== undefined)
    + Number(response.pendingPipelineEmit !== undefined)
    + Number(response.pendingHelperCall !== undefined)
  if (pendingCount > 1) {
    throw new Error('Native QuickJS GameStep run response can only contain one pending continuation.')
  }
  return {
    ...response,
    commands,
  }
}

export function createNativeQuickJsModuleExportCallRequest(input: {
  moduleNamespaceId: string
  exportName: string
  args?: readonly unknown[]
}): NativeQuickJsModuleExportCallRequest {
  const request = {
    moduleNamespaceId: input.moduleNamespaceId,
    exportName: input.exportName,
    argsJson: input.args ? JSON.stringify(input.args) : undefined,
  }
  assertNativeQuickJsModuleExportCallRequest(request)
  return request
}

export function createNativeQuickJsGameStepFactoryCallRequest(input: {
  moduleNamespaceId: string
  exportName?: string
  scope?: unknown
}): NativeQuickJsGameStepFactoryCallRequest {
  const scopeJson = stringifyOptionalJsonObject(input.scope, 'Native QuickJS GameStep factory scope')
  const request = {
    moduleNamespaceId: input.moduleNamespaceId,
    exportName: input.exportName || 'default',
    ...(scopeJson !== undefined ? { scopeJson } : {}),
  }
  assertNativeQuickJsGameStepFactoryCallRequest(request)
  return request
}

export function createNativeQuickJsGameStepRunRequest(input: {
  runHandleId: string
  ctx?: unknown
}): NativeQuickJsGameStepRunRequest {
  const ctxJson = stringifyOptionalJsonObject(input.ctx, 'Native QuickJS GameStep run context')
  const request = {
    runHandleId: input.runHandleId,
    ...(ctxJson !== undefined ? { ctxJson } : {}),
  }
  assertNativeQuickJsGameStepRunRequest(request)
  return request
}

export function createNativeQuickJsGameStepResumeRequest(input: {
  resumeHandleId: string
  payload?: unknown
}): NativeQuickJsGameStepResumeRequest {
  const payloadJson = stringifyOptionalJsonValue(input.payload, 'Native QuickJS GameStep resume payload')
  const request = {
    resumeHandleId: input.resumeHandleId,
    ...(payloadJson !== undefined ? { payloadJson } : {}),
  }
  assertNativeQuickJsGameStepResumeRequest(request)
  return request
}

export function assertNativeQuickJsModuleExportCallRequest(
  request: NativeQuickJsModuleExportCallRequest,
): void {
  if (!isSafeQuickJsBridgeHandle(request.moduleNamespaceId)) {
    throw new Error('Native QuickJS module export call requires a safe moduleNamespaceId.')
  }
  if (!isSafeQuickJsBridgeHandle(request.exportName)) {
    throw new Error('Native QuickJS module export call requires a safe exportName.')
  }
  if (['__proto__', 'prototype', 'constructor'].includes(request.exportName)) {
    throw new Error(`Native QuickJS module export "${request.exportName}" is blocked at the bridge boundary.`)
  }
  if (request.argsJson !== undefined) {
    const trimmed = request.argsJson.trim()
    if (!trimmed.startsWith('[')) {
      throw new Error('Native QuickJS module export call argsJson must be a JSON array.')
    }
    const parsed = JSON.parse(trimmed)
    if (!Array.isArray(parsed)) {
      throw new Error('Native QuickJS module export call argsJson must be a JSON array.')
    }
  }
}

export function assertNativeQuickJsGameStepFactoryCallRequest(
  request: NativeQuickJsGameStepFactoryCallRequest,
): void {
  assertSafeQuickJsBridgeHandle(request.moduleNamespaceId, 'Native QuickJS GameStep factory call requires a safe moduleNamespaceId.')
  assertSafeQuickJsBridgeHandle(request.exportName, 'Native QuickJS GameStep factory call requires a safe exportName.')
  if (['__proto__', 'prototype', 'constructor'].includes(request.exportName)) {
    throw new Error(`Native QuickJS GameStep factory export "${request.exportName}" is blocked at the bridge boundary.`)
  }
  assertOptionalJsonObject(request.scopeJson, 'Native QuickJS GameStep factory scopeJson')
}

export function assertNativeQuickJsGameStepRunRequest(
  request: NativeQuickJsGameStepRunRequest,
): void {
  assertSafeQuickJsBridgeHandle(request.runHandleId, 'Native QuickJS GameStep run requires a safe runHandleId.')
  assertOptionalJsonObject(request.ctxJson, 'Native QuickJS GameStep run ctxJson')
}

export function assertNativeQuickJsGameStepResumeRequest(
  request: NativeQuickJsGameStepResumeRequest,
): void {
  assertSafeQuickJsBridgeHandle(request.resumeHandleId, 'Native QuickJS GameStep resume requires a safe resumeHandleId.')
  assertOptionalJsonValue(request.payloadJson, 'Native QuickJS GameStep resume payloadJson')
}

export function assertNativeQuickJsGameStepWaitRequest(
  request: NativeQuickJsGameStepWaitRequest,
): void {
  assertSafeQuickJsBridgeHandle(request.resumeHandleId, 'Native QuickJS GameStep pending wait requires a safe resumeHandleId.')
  if (!isSafeQuickJsBridgeText(request.event)) {
    throw new Error('Native QuickJS GameStep pending wait requires a safe event name.')
  }
}

export function assertNativeQuickJsGameStepTranslationRequest(
  request: NativeQuickJsGameStepTranslationRequest,
): void {
  assertSafeQuickJsBridgeHandle(request.resumeHandleId, 'Native QuickJS GameStep pending translation requires a safe resumeHandleId.')
  if (!isSafeQuickJsBridgeText(request.key)) {
    throw new Error('Native QuickJS GameStep pending translation requires a safe translation key.')
  }
  assertOptionalJsonObjectOrArray(request.optionsJson, 'Native QuickJS GameStep pending translation optionsJson')
}

export function assertNativeQuickJsGameStepPipelineEmitRequest(
  request: NativeQuickJsGameStepPipelineEmitRequest,
): void {
  assertSafeQuickJsBridgeHandle(request.resumeHandleId, 'Native QuickJS GameStep pending pipeline emit requires a safe resumeHandleId.')
  if (!isSafeQuickJsBridgeText(request.event)) {
    throw new Error('Native QuickJS GameStep pending pipeline emit requires a safe event name.')
  }
  assertOptionalJsonValue(request.payloadJson, 'Native QuickJS GameStep pending pipeline emit payloadJson')
}

export function assertNativeQuickJsGameStepHelperCallRequest(
  request: NativeQuickJsGameStepHelperCallRequest,
): void {
  assertSafeQuickJsBridgeHandle(request.resumeHandleId, 'Native QuickJS GameStep pending helper call requires a safe resumeHandleId.')
  if (!isSafeQuickJsBridgeText(request.module)) {
    throw new Error('Native QuickJS GameStep pending helper call requires a safe module name.')
  }
  if (!isSafeQuickJsBridgeHandle(request.exportName)) {
    throw new Error('Native QuickJS GameStep pending helper call requires a safe exportName.')
  }
  if (['__proto__', 'prototype', 'constructor'].includes(request.exportName)) {
    throw new Error(`Native QuickJS GameStep helper export "${request.exportName}" is blocked at the bridge boundary.`)
  }
  assertOptionalJsonArray(request.argsJson, 'Native QuickJS GameStep pending helper call argsJson')
}

export function assertNativeQuickJsGameStepCommand(
  command: NativeQuickJsGameStepCommand,
): void {
  if (!command || typeof command !== 'object') {
    throw new Error('Native QuickJS GameStep command must be an object.')
  }
  if (command.target !== 'engine') {
    throw new Error('Native QuickJS GameStep command target must be "engine".')
  }
  if (!isNativeQuickJsGameStepEngineCommandMethod(command.method)) {
    throw new Error(`Native QuickJS GameStep command method "${String(command.method)}" is not allowlisted.`)
  }
  assertOptionalJsonArray(command.argsJson, `Native QuickJS GameStep command ${command.method} argsJson`)
}

export function isNativeQuickJsGameStepEngineCommandMethod(
  value: unknown,
): value is NativeQuickJsGameStepEngineCommandMethod {
  return typeof value === 'string'
    && (NATIVE_QUICKJS_GAME_STEP_ENGINE_COMMAND_METHODS as readonly string[]).includes(value)
}

export function validateNativeQuickJsEvaluationRequest(
  request: NativeQuickJsEvaluationRequest,
  options: ValidateNativeQuickJsEvaluationRequestOptions = {},
): NativeQuickJsEvaluationValidationResult {
  const errors: NativeQuickJsEvaluationError[] = []
  const assetName = request.module.assetName
  const forbiddenExtensions = normalizeForbiddenNativePayloadExtensions(options.forbiddenExtensions)

  if (!assetName) {
    errors.push({
      code: 'missingAssetName',
      message: 'Native QuickJS module evaluation requires a package-relative assetName.',
    })
  }
  else {
    if (isForbiddenNativeQuickJsModuleAssetName(assetName)) {
      errors.push({
        code: 'forbiddenAssetName',
        assetName,
        message: `Native QuickJS module assetName "${assetName}" must be package-relative and use forward-slash package paths.`,
      })
    }
    if (isForbiddenNativePayload(assetName, forbiddenExtensions)) {
      errors.push({
        code: 'forbiddenNativePayload',
        assetName,
        message: `Native QuickJS module assetName "${assetName}" must not reference a native payload.`,
      })
    }
    if (!isNativeQuickJsModuleAsset(assetName)) {
      errors.push({
        code: 'unsupportedModuleAsset',
        assetName,
        message: `Native QuickJS module assetName "${assetName}" must reference a JavaScript module asset (.js, .mjs, or .cjs).`,
      })
    }
  }

  const maxModuleBytes = request.limits.maxModuleBytes
  collectQuickJsModuleByteLimitErrors(errors, assetName, 'module bytes', request.module.bytes.length, maxModuleBytes)
  collectQuickJsModuleByteLimitErrors(errors, assetName, 'code bytes', utf8ByteLength(request.module.code), maxModuleBytes)

  const moduleGraph = request.moduleGraph || []
  const seenGraphAssets = new Set<string>()
  for (const graphModule of moduleGraph) {
    const graphAssetName = graphModule.assetName
    if (seenGraphAssets.has(graphAssetName)) {
      errors.push({
        code: 'forbiddenAssetName',
        assetName: graphAssetName,
        message: `Native QuickJS module graph contains duplicate assetName "${graphAssetName}".`,
      })
    }
    seenGraphAssets.add(graphAssetName)
    if (stripAssetReferenceSuffix(graphAssetName) === stripAssetReferenceSuffix(assetName)) {
      errors.push({
        code: 'forbiddenAssetName',
        assetName: graphAssetName,
        message: `Native QuickJS module graph asset "${graphAssetName}" must not duplicate the entry module assetName.`,
      })
    }
    if (graphModule.packageId !== request.module.packageId || graphModule.bundleName !== request.module.bundleName) {
      errors.push({
        code: 'forbiddenAssetName',
        assetName: graphAssetName,
        message: `Native QuickJS module graph asset "${graphAssetName}" must belong to the same runtime package and bundle as the entry module.`,
      })
    }
    if (!graphAssetName) {
      errors.push({
        code: 'missingAssetName',
        message: 'Native QuickJS module graph entries require package-relative assetName values.',
      })
    }
    else {
      if (isForbiddenNativeQuickJsModuleAssetName(graphAssetName)) {
        errors.push({
          code: 'forbiddenAssetName',
          assetName: graphAssetName,
          message: `Native QuickJS module graph assetName "${graphAssetName}" must be package-relative and use forward-slash package paths.`,
        })
      }
      if (isForbiddenNativePayload(graphAssetName, forbiddenExtensions)) {
        errors.push({
          code: 'forbiddenNativePayload',
          assetName: graphAssetName,
          message: `Native QuickJS module graph assetName "${graphAssetName}" must not reference a native payload.`,
        })
      }
      if (!isNativeQuickJsModuleAsset(graphAssetName)) {
        errors.push({
          code: 'unsupportedModuleAsset',
          assetName: graphAssetName,
          message: `Native QuickJS module graph assetName "${graphAssetName}" must reference a JavaScript module asset (.js, .mjs, or .cjs).`,
        })
      }
    }
    collectQuickJsModuleByteLimitErrors(errors, graphAssetName, 'module graph bytes', graphModule.bytes.length, maxModuleBytes)
    collectQuickJsModuleByteLimitErrors(errors, graphAssetName, 'module graph code bytes', utf8ByteLength(graphModule.code), maxModuleBytes)
  }

  return {
    ok: errors.length === 0,
    errors,
  }
}

export function assertNativeQuickJsEvaluationRequest(
  request: NativeQuickJsEvaluationRequest,
  options: ValidateNativeQuickJsEvaluationRequestOptions = {},
): void {
  const result = validateNativeQuickJsEvaluationRequest(request, options)
  if (!result.ok) {
    throw new Error(result.errors.map(error => error.message).join('; '))
  }
}

function normalizeForbiddenNativePayloadExtensions(
  forbiddenExtensions: readonly string[] | ReadonlySet<string> | undefined,
): ReadonlySet<string> {
  return new Set(Array.from(forbiddenExtensions || DEFAULT_FORBIDDEN_NATIVE_PAYLOAD_EXTENSIONS)
    .map(extension => extension.toLowerCase()))
}

function isForbiddenNativeQuickJsModuleAssetName(assetName: string): boolean {
  return assetName.includes('\\') || isForbiddenNativeAssetReference(assetName)
}

function isNativeQuickJsModuleAsset(assetName: string): boolean {
  const normalized = stripAssetReferenceSuffix(assetName).toLowerCase().split(/[\\/]/).pop() || ''
  return normalized.endsWith('.js')
    || normalized.endsWith('.mjs')
    || normalized.endsWith('.cjs')
}

function stripAssetReferenceSuffix(assetName: string): string {
  const suffixIndex = assetName.search(/[?#]/)
  return suffixIndex >= 0 ? assetName.slice(0, suffixIndex) : assetName
}

function collectQuickJsModuleByteLimitErrors(
  errors: NativeQuickJsEvaluationError[],
  assetName: string,
  field: string,
  actualBytes: number,
  maxModuleBytes: number,
): void {
  if (actualBytes <= maxModuleBytes)
    return
  errors.push({
    code: 'moduleTooLarge',
    assetName,
    detail: `${field}: ${actualBytes}; maxModuleBytes: ${maxModuleBytes}`,
    message: `Native QuickJS module "${assetName || '<missing>'}" ${field} length ${actualBytes} exceeds maxModuleBytes ${maxModuleBytes}.`,
  })
}

function isSafeQuickJsBridgeHandle(value: string): boolean {
  return isSafeQuickJsBridgeText(value)
}

function isSafeQuickJsBridgeText(value: string): boolean {
  return value.trim() === value
    && value.length > 0
    && value.length <= 256
    && !/[\u0000-\u001F\u007F]/.test(value)
}

function assertSafeQuickJsBridgeHandle(value: string, message: string): void {
  if (!isSafeQuickJsBridgeHandle(value)) {
    throw new Error(message)
  }
}

function stringifyOptionalJsonObject(value: unknown, label: string): string | undefined {
  if (value === undefined)
    return undefined
  const json = JSON.stringify(value)
  if (json === undefined) {
    throw new Error(`${label} must be JSON-serializable.`)
  }
  assertOptionalJsonObject(json, `${label} JSON`)
  return json
}

function stringifyOptionalJsonValue(value: unknown, label: string): string | undefined {
  if (value === undefined)
    return undefined
  const json = JSON.stringify(value)
  if (json === undefined) {
    throw new Error(`${label} must be JSON-serializable.`)
  }
  assertOptionalJsonValue(json, `${label} JSON`)
  return json
}

function assertOptionalJsonObject(json: string | undefined, label: string): void {
  if (json === undefined)
    return
  const trimmed = json.trim()
  if (!trimmed.startsWith('{')) {
    throw new Error(`${label} must be a JSON object.`)
  }
  const parsed = JSON.parse(trimmed)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${label} must be a JSON object.`)
  }
}

function assertOptionalJsonArray(json: string | undefined, label: string): void {
  if (json === undefined)
    return
  const trimmed = json.trim()
  if (!trimmed.startsWith('[')) {
    throw new Error(`${label} must be a JSON array.`)
  }
  const parsed = JSON.parse(trimmed)
  if (!Array.isArray(parsed)) {
    throw new Error(`${label} must be a JSON array.`)
  }
}

function assertOptionalJsonObjectOrArray(json: string | undefined, label: string): void {
  if (json === undefined)
    return
  const trimmed = json.trim()
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
    throw new Error(`${label} must be a JSON object or array.`)
  }
  const parsed = JSON.parse(trimmed)
  if (!parsed || typeof parsed !== 'object') {
    throw new Error(`${label} must be a JSON object or array.`)
  }
}

function assertOptionalJsonValue(json: string | undefined, label: string): void {
  if (json === undefined)
    return
  const trimmed = json.trim()
  if (!trimmed) {
    throw new Error(`${label} must be valid JSON.`)
  }
  JSON.parse(trimmed)
}

function utf8ByteLength(input: string): number {
  let bytes = 0
  for (let index = 0; index < input.length; index += 1) {
    const code = input.charCodeAt(index)
    if (code < 0x80) {
      bytes += 1
    }
    else if (code < 0x800) {
      bytes += 2
    }
    else if (code >= 0xD800 && code <= 0xDBFF) {
      const next = input.charCodeAt(index + 1)
      if (next >= 0xDC00 && next <= 0xDFFF) {
        bytes += 4
        index += 1
      }
      else {
        bytes += 3
      }
    }
    else {
      bytes += 3
    }
  }
  return bytes
}
