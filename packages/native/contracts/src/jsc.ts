import { nativeBytesToWire } from './capabilities'
import {
  DEFAULT_FORBIDDEN_NATIVE_PAYLOAD_EXTENSIONS,
  isForbiddenNativeAssetReference,
  isForbiddenNativePayload,
} from './package-guard'

export type NativeJscRuntimeModuleKind = 'script' | 'scene' | 'enginePlugin' | 'storeMigration'

export const NATIVE_JSC_GAME_STEP_ENGINE_COMMAND_METHODS = [
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

export type NativeJscGameStepEngineCommandMethod = typeof NATIVE_JSC_GAME_STEP_ENGINE_COMMAND_METHODS[number]

export interface NativeJscGameStepCommand {
  target: 'engine'
  method: NativeJscGameStepEngineCommandMethod
  argsJson?: string
}

export interface NativeJscRuntimeModuleRecord {
  assetName: string
  bundleName: string
  packageId: string
  kind: NativeJscRuntimeModuleKind
  code: string
  bytes: number[]
}

export interface NativeJscSandboxLimits {
  maxModuleBytes: number
  /** CPU execution budget per entry into JSC. JSC manages heap and stack internally. */
  maxExecutionTimeMs: number
}

export interface NativeJscEvaluationRequest {
  module: NativeJscRuntimeModuleRecord
  moduleGraph?: NativeJscRuntimeModuleRecord[]
  limits: NativeJscSandboxLimits
}

export interface NativeJscEvaluationResponse {
  ok: boolean
  moduleNamespaceId?: string
  error?: NativeJscEvaluationError
}

export interface NativeJscModuleExportCallRequest {
  moduleNamespaceId: string
  exportName: string
  argsJson?: string
}

export interface NativeJscModuleExportCallResponse {
  ok: boolean
  valueJson?: string
  error?: NativeJscEvaluationError
}

export interface NativeJscGameStepFactoryCallRequest {
  moduleNamespaceId: string
  exportName: string
  scopeJson?: string
}

export interface NativeJscGameStepDescriptor {
  uuid: string
  runHandleId: string
  metadataJson?: string
}

export interface NativeJscGameStepFactoryCallResponse {
  ok: boolean
  steps?: NativeJscGameStepDescriptor[]
  error?: NativeJscEvaluationError
}

export interface NativeJscGameStepRunRequest {
  runHandleId: string
  ctxJson?: string
}

export interface NativeJscGameStepWaitRequest {
  resumeHandleId: string
  event: string
}

export interface NativeJscGameStepTranslationRequest {
  resumeHandleId: string
  key: string
  optionsJson?: string
}

export interface NativeJscGameStepPipelineEmitRequest {
  resumeHandleId: string
  event: string
  payloadJson?: string
}

export type NativeJscPipelineSubscriptionOperation = 'subscribe' | 'unsubscribe'

export interface NativeJscPipelineSubscriptionChange {
  op: NativeJscPipelineSubscriptionOperation
  subscriptionId: string
  moduleNamespaceId: string
  event: string
}

export interface NativeJscPipelineListenerDispatchRequest {
  subscriptionId: string
  contextJson: string
}

export interface NativeJscPipelineListenerDispatchResponse {
  ok: boolean
  commands?: NativeJscGameStepCommand[]
  pipelineSubscriptions?: NativeJscPipelineSubscriptionChange[]
  error?: NativeJscEvaluationError
}

export interface NativeJscGameStepHelperCallRequest {
  resumeHandleId: string
  module: string
  exportName: string
  argsJson?: string
}

export interface NativeJscGameStepResumeRequest {
  resumeHandleId: string
  payloadJson?: string
}

export interface NativeJscGameStepRunResponse {
  ok: boolean
  commands?: NativeJscGameStepCommand[]
  pendingWait?: NativeJscGameStepWaitRequest
  pendingTranslation?: NativeJscGameStepTranslationRequest
  pendingPipelineEmit?: NativeJscGameStepPipelineEmitRequest
  pendingHelperCall?: NativeJscGameStepHelperCallRequest
  pipelineSubscriptions?: NativeJscPipelineSubscriptionChange[]
  error?: NativeJscEvaluationError
}

export interface NativeJscModuleNamespaceRecord {
  id: string
  packageId: string
  bundleName: string
  assetName: string
  kind: NativeJscRuntimeModuleKind
  moduleBytes: number
  codeBytes: number
  revision: number
}

export interface NativeJscModuleNamespaceSummary {
  namespaceCount: number
  packageCount: number
  moduleBytes: number
  codeBytes: number
  totalBytes: number
}

export interface NativeJscReleaseNamespaceRequest {
  moduleNamespaceId: string
}

export interface NativeJscReleasePackageRequest {
  packageId: string
}

export type NativeJscEvaluationErrorCode
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

export interface NativeJscEvaluationError {
  code: NativeJscEvaluationErrorCode
  message: string
  assetName?: string
  detail?: string
}

export interface NativeJscEvaluationValidationResult {
  ok: boolean
  errors: NativeJscEvaluationError[]
}

export interface ValidateNativeJscEvaluationRequestOptions {
  forbiddenExtensions?: readonly string[] | ReadonlySet<string>
}

export const DEFAULT_NATIVE_JSC_SANDBOX_LIMITS: NativeJscSandboxLimits = {
  maxModuleBytes: 4 * 1024 * 1024,
  maxExecutionTimeMs: 1_000,
}

export interface CreateNativeJscEvaluationRequestInput {
  assetName: string
  bundleName: string
  packageId: string
  kind: NativeJscRuntimeModuleKind
  code: string
  bytes: Uint8Array
  moduleGraph?: readonly NativeJscRuntimeModuleRecord[]
  limits?: Partial<NativeJscSandboxLimits>
}

export function createNativeJscEvaluationRequest(
  input: CreateNativeJscEvaluationRequestInput,
): NativeJscEvaluationRequest {
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
      ...DEFAULT_NATIVE_JSC_SANDBOX_LIMITS,
      ...(input.limits || {}),
    },
  }
  assertNativeJscEvaluationRequest(request)
  return request
}

export function assertNativeJscEvaluationResponse(
  response: NativeJscEvaluationResponse,
): string {
  if (!response.ok) {
    throw new Error(response.error?.message || 'Native JavaScriptCore module evaluation failed.')
  }
  if (!response.moduleNamespaceId) {
    throw new Error('Native JavaScriptCore module evaluation succeeded without a module namespace id.')
  }
  return response.moduleNamespaceId
}

export function assertNativeJscModuleExportCallResponse(
  response: NativeJscModuleExportCallResponse,
): string | undefined {
  if (!response.ok) {
    throw new Error(response.error?.message || 'Native JavaScriptCore module export call failed.')
  }
  return response.valueJson
}

export function parseNativeJscModuleExportCallResponse(
  response: NativeJscModuleExportCallResponse,
): unknown {
  const valueJson = assertNativeJscModuleExportCallResponse(response)
  return valueJson === undefined ? undefined : JSON.parse(valueJson)
}

export function assertNativeJscGameStepFactoryCallResponse(
  response: NativeJscGameStepFactoryCallResponse,
): NativeJscGameStepDescriptor[] {
  if (!response.ok) {
    throw new Error(response.error?.message || 'Native JavaScriptCore GameStep factory call failed.')
  }
  if (!Array.isArray(response.steps)) {
    throw new TypeError('Native JavaScriptCore GameStep factory call succeeded without step descriptors.')
  }
  return response.steps
}

export function assertNativeJscGameStepRunResponse(
  response: NativeJscGameStepRunResponse,
): NativeJscGameStepRunResponse {
  if (!response.ok) {
    throw new Error(response.error?.message || 'Native JavaScriptCore GameStep run failed.')
  }
  const commands = response.commands || []
  if (!Array.isArray(commands)) {
    throw new TypeError('Native JavaScriptCore GameStep run commands must be an array.')
  }
  commands.forEach(assertNativeJscGameStepCommand)
  if (response.pendingWait !== undefined) {
    assertNativeJscGameStepWaitRequest(response.pendingWait)
  }
  if (response.pendingTranslation !== undefined) {
    assertNativeJscGameStepTranslationRequest(response.pendingTranslation)
  }
  if (response.pendingPipelineEmit !== undefined) {
    assertNativeJscGameStepPipelineEmitRequest(response.pendingPipelineEmit)
  }
  if (response.pendingHelperCall !== undefined) {
    assertNativeJscGameStepHelperCallRequest(response.pendingHelperCall)
  }
  const pipelineSubscriptions = response.pipelineSubscriptions || []
  if (!Array.isArray(pipelineSubscriptions)) {
    throw new TypeError('Native JavaScriptCore GameStep pipelineSubscriptions must be an array.')
  }
  pipelineSubscriptions.forEach(assertNativeJscPipelineSubscriptionChange)
  const pendingCount = Number(response.pendingWait !== undefined)
    + Number(response.pendingTranslation !== undefined)
    + Number(response.pendingPipelineEmit !== undefined)
    + Number(response.pendingHelperCall !== undefined)
  if (pendingCount > 1) {
    throw new Error('Native JavaScriptCore GameStep run response can only contain one pending continuation.')
  }
  return {
    ...response,
    commands,
    pipelineSubscriptions,
  }
}

export function assertNativeJscPipelineListenerDispatchResponse(
  response: NativeJscPipelineListenerDispatchResponse,
): NativeJscPipelineListenerDispatchResponse {
  if (!response.ok) {
    throw new Error(response.error?.message || 'Native JavaScriptCore pipeline listener dispatch failed.')
  }
  const commands = response.commands || []
  if (!Array.isArray(commands)) {
    throw new TypeError('Native JavaScriptCore pipeline listener dispatch commands must be an array.')
  }
  commands.forEach(assertNativeJscGameStepCommand)
  const pipelineSubscriptions = response.pipelineSubscriptions || []
  if (!Array.isArray(pipelineSubscriptions)) {
    throw new TypeError('Native JavaScriptCore pipeline listener dispatch pipelineSubscriptions must be an array.')
  }
  pipelineSubscriptions.forEach(assertNativeJscPipelineSubscriptionChange)
  return {
    ...response,
    commands,
    pipelineSubscriptions,
  }
}

export function createNativeJscModuleExportCallRequest(input: {
  moduleNamespaceId: string
  exportName: string
  args?: readonly unknown[]
}): NativeJscModuleExportCallRequest {
  const request = {
    moduleNamespaceId: input.moduleNamespaceId,
    exportName: input.exportName,
    argsJson: input.args ? JSON.stringify(input.args) : undefined,
  }
  assertNativeJscModuleExportCallRequest(request)
  return request
}

export function createNativeJscGameStepFactoryCallRequest(input: {
  moduleNamespaceId: string
  exportName?: string
  scope?: unknown
}): NativeJscGameStepFactoryCallRequest {
  const scopeJson = stringifyOptionalJsonObject(input.scope, 'Native JavaScriptCore GameStep factory scope')
  const request = {
    moduleNamespaceId: input.moduleNamespaceId,
    exportName: input.exportName || 'default',
    ...(scopeJson !== undefined ? { scopeJson } : {}),
  }
  assertNativeJscGameStepFactoryCallRequest(request)
  return request
}

export function createNativeJscGameStepRunRequest(input: {
  runHandleId: string
  ctx?: unknown
}): NativeJscGameStepRunRequest {
  const ctxJson = stringifyOptionalJsonObject(input.ctx, 'Native JavaScriptCore GameStep run context')
  const request = {
    runHandleId: input.runHandleId,
    ...(ctxJson !== undefined ? { ctxJson } : {}),
  }
  assertNativeJscGameStepRunRequest(request)
  return request
}

export function createNativeJscGameStepResumeRequest(input: {
  resumeHandleId: string
  payload?: unknown
}): NativeJscGameStepResumeRequest {
  const payloadJson = stringifyOptionalJsonValue(input.payload, 'Native JavaScriptCore GameStep resume payload')
  const request = {
    resumeHandleId: input.resumeHandleId,
    ...(payloadJson !== undefined ? { payloadJson } : {}),
  }
  assertNativeJscGameStepResumeRequest(request)
  return request
}

export function createNativeJscPipelineListenerDispatchRequest(input: {
  subscriptionId: string
  context: unknown
}): NativeJscPipelineListenerDispatchRequest {
  const contextJson = stringifyOptionalJsonObject(input.context, 'Native JavaScriptCore pipeline listener context')
  const request = {
    subscriptionId: input.subscriptionId,
    contextJson: contextJson || '{}',
  }
  assertNativeJscPipelineListenerDispatchRequest(request)
  return request
}

export function assertNativeJscModuleExportCallRequest(
  request: NativeJscModuleExportCallRequest,
): void {
  if (!isSafeJscBridgeHandle(request.moduleNamespaceId)) {
    throw new Error('Native JavaScriptCore module export call requires a safe moduleNamespaceId.')
  }
  if (!isSafeJscBridgeHandle(request.exportName)) {
    throw new Error('Native JavaScriptCore module export call requires a safe exportName.')
  }
  if (['__proto__', 'prototype', 'constructor'].includes(request.exportName)) {
    throw new Error(`Native JavaScriptCore module export "${request.exportName}" is blocked at the bridge boundary.`)
  }
  if (request.argsJson !== undefined) {
    const trimmed = request.argsJson.trim()
    if (!trimmed.startsWith('[')) {
      throw new Error('Native JavaScriptCore module export call argsJson must be a JSON array.')
    }
    const parsed = JSON.parse(trimmed)
    if (!Array.isArray(parsed)) {
      throw new TypeError('Native JavaScriptCore module export call argsJson must be a JSON array.')
    }
  }
}

export function assertNativeJscGameStepFactoryCallRequest(
  request: NativeJscGameStepFactoryCallRequest,
): void {
  assertSafeJscBridgeHandle(request.moduleNamespaceId, 'Native JavaScriptCore GameStep factory call requires a safe moduleNamespaceId.')
  assertSafeJscBridgeHandle(request.exportName, 'Native JavaScriptCore GameStep factory call requires a safe exportName.')
  if (['__proto__', 'prototype', 'constructor'].includes(request.exportName)) {
    throw new Error(`Native JavaScriptCore GameStep factory export "${request.exportName}" is blocked at the bridge boundary.`)
  }
  assertOptionalJsonObject(request.scopeJson, 'Native JavaScriptCore GameStep factory scopeJson')
}

export function assertNativeJscGameStepRunRequest(
  request: NativeJscGameStepRunRequest,
): void {
  assertSafeJscBridgeHandle(request.runHandleId, 'Native JavaScriptCore GameStep run requires a safe runHandleId.')
  assertOptionalJsonObject(request.ctxJson, 'Native JavaScriptCore GameStep run ctxJson')
}

export function assertNativeJscGameStepResumeRequest(
  request: NativeJscGameStepResumeRequest,
): void {
  assertSafeJscBridgeHandle(request.resumeHandleId, 'Native JavaScriptCore GameStep resume requires a safe resumeHandleId.')
  assertOptionalJsonValue(request.payloadJson, 'Native JavaScriptCore GameStep resume payloadJson')
}

export function assertNativeJscGameStepWaitRequest(
  request: NativeJscGameStepWaitRequest,
): void {
  assertSafeJscBridgeHandle(request.resumeHandleId, 'Native JavaScriptCore GameStep pending wait requires a safe resumeHandleId.')
  if (!isSafeJscBridgeText(request.event)) {
    throw new Error('Native JavaScriptCore GameStep pending wait requires a safe event name.')
  }
}

export function assertNativeJscGameStepTranslationRequest(
  request: NativeJscGameStepTranslationRequest,
): void {
  assertSafeJscBridgeHandle(request.resumeHandleId, 'Native JavaScriptCore GameStep pending translation requires a safe resumeHandleId.')
  if (!isSafeJscBridgeText(request.key)) {
    throw new Error('Native JavaScriptCore GameStep pending translation requires a safe translation key.')
  }
  assertOptionalJsonObjectOrArray(request.optionsJson, 'Native JavaScriptCore GameStep pending translation optionsJson')
}

export function assertNativeJscGameStepPipelineEmitRequest(
  request: NativeJscGameStepPipelineEmitRequest,
): void {
  assertSafeJscBridgeHandle(request.resumeHandleId, 'Native JavaScriptCore GameStep pending pipeline emit requires a safe resumeHandleId.')
  if (!isSafeJscBridgeText(request.event)) {
    throw new Error('Native JavaScriptCore GameStep pending pipeline emit requires a safe event name.')
  }
  assertOptionalJsonValue(request.payloadJson, 'Native JavaScriptCore GameStep pending pipeline emit payloadJson')
}

export function assertNativeJscPipelineSubscriptionChange(
  change: NativeJscPipelineSubscriptionChange,
): void {
  if (change.op !== 'subscribe' && change.op !== 'unsubscribe') {
    throw new Error('Native JavaScriptCore pipeline subscription change requires op "subscribe" or "unsubscribe".')
  }
  assertSafeJscBridgeHandle(change.subscriptionId, 'Native JavaScriptCore pipeline subscription change requires a safe subscriptionId.')
  assertSafeJscBridgeHandle(change.moduleNamespaceId, 'Native JavaScriptCore pipeline subscription change requires a safe moduleNamespaceId.')
  if (!isSafeJscBridgeText(change.event)) {
    throw new Error('Native JavaScriptCore pipeline subscription change requires a safe event name.')
  }
}

export function assertNativeJscPipelineListenerDispatchRequest(
  request: NativeJscPipelineListenerDispatchRequest,
): void {
  assertSafeJscBridgeHandle(request.subscriptionId, 'Native JavaScriptCore pipeline listener dispatch requires a safe subscriptionId.')
  assertOptionalJsonObject(request.contextJson, 'Native JavaScriptCore pipeline listener dispatch contextJson')
}

export function assertNativeJscGameStepHelperCallRequest(
  request: NativeJscGameStepHelperCallRequest,
): void {
  assertSafeJscBridgeHandle(request.resumeHandleId, 'Native JavaScriptCore GameStep pending helper call requires a safe resumeHandleId.')
  if (!isSafeJscBridgeText(request.module)) {
    throw new Error('Native JavaScriptCore GameStep pending helper call requires a safe module name.')
  }
  if (!isSafeJscBridgeHandle(request.exportName)) {
    throw new Error('Native JavaScriptCore GameStep pending helper call requires a safe exportName.')
  }
  if (['__proto__', 'prototype', 'constructor'].includes(request.exportName)) {
    throw new Error(`Native JavaScriptCore GameStep helper export "${request.exportName}" is blocked at the bridge boundary.`)
  }
  assertOptionalJsonArray(request.argsJson, 'Native JavaScriptCore GameStep pending helper call argsJson')
}

export function assertNativeJscGameStepCommand(
  command: NativeJscGameStepCommand,
): void {
  if (!command || typeof command !== 'object') {
    throw new Error('Native JavaScriptCore GameStep command must be an object.')
  }
  if (command.target !== 'engine') {
    throw new Error('Native JavaScriptCore GameStep command target must be "engine".')
  }
  if (!isNativeJscGameStepEngineCommandMethod(command.method)) {
    throw new Error(`Native JavaScriptCore GameStep command method "${String(command.method)}" is not allowlisted.`)
  }
  assertOptionalJsonArray(command.argsJson, `Native JavaScriptCore GameStep command ${command.method} argsJson`)
}

export function isNativeJscGameStepEngineCommandMethod(
  value: unknown,
): value is NativeJscGameStepEngineCommandMethod {
  return typeof value === 'string'
    && (NATIVE_JSC_GAME_STEP_ENGINE_COMMAND_METHODS as readonly string[]).includes(value)
}

export function validateNativeJscEvaluationRequest(
  request: NativeJscEvaluationRequest,
  options: ValidateNativeJscEvaluationRequestOptions = {},
): NativeJscEvaluationValidationResult {
  const errors: NativeJscEvaluationError[] = []
  const assetName = request.module.assetName
  const forbiddenExtensions = normalizeForbiddenNativePayloadExtensions(options.forbiddenExtensions)

  if (!assetName) {
    errors.push({
      code: 'missingAssetName',
      message: 'Native JavaScriptCore module evaluation requires a package-relative assetName.',
    })
  }
  else {
    if (isForbiddenNativeJscModuleAssetName(assetName)) {
      errors.push({
        code: 'forbiddenAssetName',
        assetName,
        message: `Native JavaScriptCore module assetName "${assetName}" must be package-relative and use forward-slash package paths.`,
      })
    }
    if (isForbiddenNativePayload(assetName, forbiddenExtensions)) {
      errors.push({
        code: 'forbiddenNativePayload',
        assetName,
        message: `Native JavaScriptCore module assetName "${assetName}" must not reference a native payload.`,
      })
    }
    if (!isNativeJscModuleAsset(assetName)) {
      errors.push({
        code: 'unsupportedModuleAsset',
        assetName,
        message: `Native JavaScriptCore module assetName "${assetName}" must reference a JavaScript module asset (.js, .mjs, or .cjs).`,
      })
    }
  }

  if (!Number.isSafeInteger(request.limits.maxExecutionTimeMs) || request.limits.maxExecutionTimeMs <= 0 || request.limits.maxExecutionTimeMs > 60_000) {
    errors.push({ code: 'invalidArguments', assetName, message: 'Native JavaScriptCore maxExecutionTimeMs must be an integer between 1 and 60000.' })
  }

  const maxModuleBytes = request.limits.maxModuleBytes
  collectJscModuleByteLimitErrors(errors, assetName, 'module bytes', request.module.bytes.length, maxModuleBytes)
  collectJscModuleByteLimitErrors(errors, assetName, 'code bytes', utf8ByteLength(request.module.code), maxModuleBytes)

  const moduleGraph = request.moduleGraph || []
  const seenGraphAssets = new Set<string>()
  for (const graphModule of moduleGraph) {
    const graphAssetName = graphModule.assetName
    if (seenGraphAssets.has(graphAssetName)) {
      errors.push({
        code: 'forbiddenAssetName',
        assetName: graphAssetName,
        message: `Native JavaScriptCore module graph contains duplicate assetName "${graphAssetName}".`,
      })
    }
    seenGraphAssets.add(graphAssetName)
    if (stripAssetReferenceSuffix(graphAssetName) === stripAssetReferenceSuffix(assetName)) {
      errors.push({
        code: 'forbiddenAssetName',
        assetName: graphAssetName,
        message: `Native JavaScriptCore module graph asset "${graphAssetName}" must not duplicate the entry module assetName.`,
      })
    }
    if (graphModule.packageId !== request.module.packageId || graphModule.bundleName !== request.module.bundleName) {
      errors.push({
        code: 'forbiddenAssetName',
        assetName: graphAssetName,
        message: `Native JavaScriptCore module graph asset "${graphAssetName}" must belong to the same runtime package and bundle as the entry module.`,
      })
    }
    if (!graphAssetName) {
      errors.push({
        code: 'missingAssetName',
        message: 'Native JavaScriptCore module graph entries require package-relative assetName values.',
      })
    }
    else {
      if (isForbiddenNativeJscModuleAssetName(graphAssetName)) {
        errors.push({
          code: 'forbiddenAssetName',
          assetName: graphAssetName,
          message: `Native JavaScriptCore module graph assetName "${graphAssetName}" must be package-relative and use forward-slash package paths.`,
        })
      }
      if (isForbiddenNativePayload(graphAssetName, forbiddenExtensions)) {
        errors.push({
          code: 'forbiddenNativePayload',
          assetName: graphAssetName,
          message: `Native JavaScriptCore module graph assetName "${graphAssetName}" must not reference a native payload.`,
        })
      }
      if (!isNativeJscModuleAsset(graphAssetName)) {
        errors.push({
          code: 'unsupportedModuleAsset',
          assetName: graphAssetName,
          message: `Native JavaScriptCore module graph assetName "${graphAssetName}" must reference a JavaScript module asset (.js, .mjs, or .cjs).`,
        })
      }
    }
    collectJscModuleByteLimitErrors(errors, graphAssetName, 'module graph bytes', graphModule.bytes.length, maxModuleBytes)
    collectJscModuleByteLimitErrors(errors, graphAssetName, 'module graph code bytes', utf8ByteLength(graphModule.code), maxModuleBytes)
  }

  return {
    ok: errors.length === 0,
    errors,
  }
}

export function assertNativeJscEvaluationRequest(
  request: NativeJscEvaluationRequest,
  options: ValidateNativeJscEvaluationRequestOptions = {},
): void {
  const result = validateNativeJscEvaluationRequest(request, options)
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

function isForbiddenNativeJscModuleAssetName(assetName: string): boolean {
  return assetName.includes('\\') || isForbiddenNativeAssetReference(assetName)
}

function isNativeJscModuleAsset(assetName: string): boolean {
  const normalized = stripAssetReferenceSuffix(assetName).toLowerCase().split(/[\\/]/).pop() || ''
  return normalized.endsWith('.js')
    || normalized.endsWith('.mjs')
    || normalized.endsWith('.cjs')
}

function stripAssetReferenceSuffix(assetName: string): string {
  const suffixIndex = assetName.search(/[?#]/)
  return suffixIndex >= 0 ? assetName.slice(0, suffixIndex) : assetName
}

function collectJscModuleByteLimitErrors(
  errors: NativeJscEvaluationError[],
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
    message: `Native JavaScriptCore module "${assetName || '<missing>'}" ${field} length ${actualBytes} exceeds maxModuleBytes ${maxModuleBytes}.`,
  })
}

function isSafeJscBridgeHandle(value: string): boolean {
  return isSafeJscBridgeText(value)
}

function isSafeJscBridgeText(value: string): boolean {
  return value.trim() === value
    && value.length > 0
    && value.length <= 256
    // eslint-disable-next-line no-control-regex
    && !/[\u0000-\u001F\u007F]/.test(value)
}

function assertSafeJscBridgeHandle(value: string, message: string): void {
  if (!isSafeJscBridgeHandle(value)) {
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
    throw new TypeError(`${label} must be a JSON array.`)
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
