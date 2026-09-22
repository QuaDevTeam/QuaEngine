import type {
  GameStep,
  RuntimeLoadedMigrationModule,
  RuntimeLoadedPluginModule,
  RuntimeLoadedSceneModule,
  RuntimeLoadedScriptModule,
  RuntimeModuleLoadContext,
  RuntimeModuleLoader,
  RuntimePackagePluginManifest,
  RuntimePackageSceneManifest,
  RuntimePackageStoreMigrationManifest,
  RuntimeScriptModuleRecord,
  StepContext,
} from '@quajs/engine'
import type {
  NativeJscEvaluationRequest,
  NativeJscEvaluationResponse,
  NativeJscGameStepCommand,
  NativeJscGameStepDescriptor,
  NativeJscGameStepFactoryCallRequest,
  NativeJscGameStepFactoryCallResponse,
  NativeJscGameStepHelperCallRequest,
  NativeJscGameStepResumeRequest,
  NativeJscGameStepRunRequest,
  NativeJscGameStepRunResponse,
  NativeJscModuleExportCallRequest,
  NativeJscModuleExportCallResponse,
  NativeJscModuleNamespaceRecord,
  NativeJscModuleNamespaceSummary,
  NativeJscPipelineListenerDispatchRequest,
  NativeJscPipelineListenerDispatchResponse,
  NativeJscPipelineSubscriptionChange,
  NativeJscRuntimeModuleKind,
  NativeJscSandboxLimits,
  QuaNativeHostApi,
} from '@quajs/native-contracts'
import {
  assertNativeJscEvaluationRequest,
  assertNativeJscEvaluationResponse,
  assertNativeJscGameStepCommand,
  assertNativeJscGameStepFactoryCallResponse,
  assertNativeJscGameStepHelperCallRequest,
  assertNativeJscGameStepRunResponse,
  assertNativeJscPipelineListenerDispatchResponse,
  createNativeJscEvaluationRequest,
  createNativeJscGameStepFactoryCallRequest,
  createNativeJscGameStepResumeRequest,
  createNativeJscGameStepRunRequest,
  createNativeJscModuleExportCallRequest,
  createNativeJscPipelineListenerDispatchRequest,
  isForbiddenNativeAssetReference,
  isForbiddenNativePayload,
  parseNativeJscModuleExportCallResponse,
} from '@quajs/native-contracts'

declare const TextDecoder: {
  new(): { decode: (input: Uint8Array) => string }
}

export type NativeRuntimeModuleRecord
  = | RuntimeScriptModuleRecord
    | RuntimePackageSceneManifest
    | RuntimePackagePluginManifest
    | RuntimePackageStoreMigrationManifest

interface NativeRuntimeModuleVariantRecord {
  assetName?: string
  module?: string
  name?: string
  path?: string
  relativePath?: string
}

interface NativeRuntimeModuleRecordWithVariants {
  variants?: Record<string, NativeRuntimeModuleVariantRecord>
}

interface NativeRuntimeModuleRecordWithNativeJscMetadata {
  metadata?: {
    nativeJsc?: {
      imports?: readonly (string | { assetName?: string, module?: string, path?: string, relativePath?: string })[]
    }
  }
}

export interface NativeRuntimeModuleEvaluationContext {
  assetName: string
  bundleName: string
  bytes: Uint8Array
  code: string
  kind: NativeRuntimeModuleKind
  packageId: string
  request: NativeJscEvaluationRequest
  record: NativeRuntimeModuleRecord
}

export type NativeRuntimeModuleKind = 'script' | 'scene' | 'engine-plugin' | 'store-migration'

export type NativeRuntimeModuleEvaluator = (
  ctx: NativeRuntimeModuleEvaluationContext,
) => unknown | Promise<unknown>

export interface NativeRuntimeModuleLoaderOptions {
  evaluator: NativeRuntimeModuleEvaluator
  limits?: Partial<NativeJscSandboxLimits>
  moduleKinds?: readonly NativeRuntimeModuleKind[]
}

export type NativeJscModuleNamespaceResolver = (
  moduleNamespaceId: string,
  ctx: NativeRuntimeModuleEvaluationContext,
  response: NativeJscEvaluationResponse,
) => unknown | Promise<unknown>

export type NativeJscJsonExportFunction = (...args: readonly unknown[]) => Promise<unknown>

export type NativeJscGameStepFactoryFunction = (scope?: unknown) => Promise<GameStep[]>

export type NativeJscStepContextSerializer = (ctx: StepContext) => Record<string, unknown> | undefined

export type NativeJscStepCommandExecutor = (
  ctx: StepContext,
  command: NativeJscGameStepCommand,
) => Promise<void>

export type NativeJscHelperFunction = (
  engine: StepContext['engine'],
  ...args: readonly unknown[]
) => unknown | Promise<unknown>

export type NativeJscHelperModuleRegistry = Readonly<Record<string, Readonly<Record<string, NativeJscHelperFunction>>>>

export type NativeJscHelperCallExecutor = (
  ctx: StepContext,
  request: NativeJscGameStepHelperCallRequest,
) => Promise<unknown>

export type NativeJscPipelineListenerDispatcher = (
  request: NativeJscPipelineListenerDispatchRequest,
) => Promise<NativeJscPipelineListenerDispatchResponse>

interface NativeJscPipelineSubscriptionRecord {
  event: string
  listener: (context: any) => Promise<void>
  moduleNamespaceId: string
  pipeline: StepContext['pipeline']
}

export interface NativeJscPipelineSubscriptionBridge {
  apply: (
    ctx: StepContext,
    changes: readonly NativeJscPipelineSubscriptionChange[] | undefined,
  ) => void
  releaseModuleNamespace: (moduleNamespaceId: string) => void
  dispose: () => void
}

export function createNativeHostJscModuleEvaluator(
  host: Pick<QuaNativeHostApi, 'evaluateJscModule'>,
  resolveModuleNamespace: NativeJscModuleNamespaceResolver,
): NativeRuntimeModuleEvaluator {
  return async (ctx) => {
    if (!host.evaluateJscModule) {
      throw new Error('Native host does not provide JavaScriptCore module evaluation.')
    }
    assertNativeJscEvaluationRequest(ctx.request)
    const response = await host.evaluateJscModule(ctx.request)
    const moduleNamespaceId = assertNativeJscEvaluationResponse(response)
    return await resolveModuleNamespace(moduleNamespaceId, ctx, response)
  }
}

export async function callNativeJscModuleExport(
  host: Pick<QuaNativeHostApi, 'callJscModuleExport'>,
  request: NativeJscModuleExportCallRequest,
): Promise<unknown> {
  if (!host.callJscModuleExport) {
    throw new Error('Native host does not provide JavaScriptCore module export calls.')
  }
  const response: NativeJscModuleExportCallResponse = await host.callJscModuleExport(request)
  return parseNativeJscModuleExportCallResponse(response)
}

export async function callNativeJscGameStepFactory(
  host: Pick<QuaNativeHostApi, 'callJscGameStepFactory'>,
  request: NativeJscGameStepFactoryCallRequest,
): Promise<NativeJscGameStepDescriptor[]> {
  if (!host.callJscGameStepFactory) {
    throw new Error('Native host does not provide JavaScriptCore GameStep factory calls.')
  }
  const response: NativeJscGameStepFactoryCallResponse = await host.callJscGameStepFactory(request)
  return assertNativeJscGameStepFactoryCallResponse(response)
}

export async function callNativeJscGameStepRun(
  host: Pick<QuaNativeHostApi, 'callJscGameStepRun'>,
  request: NativeJscGameStepRunRequest,
): Promise<NativeJscGameStepRunResponse> {
  if (!host.callJscGameStepRun) {
    throw new Error('Native host does not provide JavaScriptCore GameStep run calls.')
  }
  const response: NativeJscGameStepRunResponse = await host.callJscGameStepRun(request)
  return assertNativeJscGameStepRunResponse(response)
}

export async function callNativeJscGameStepResume(
  host: Pick<QuaNativeHostApi, 'resumeJscGameStepRun'>,
  request: NativeJscGameStepResumeRequest,
): Promise<NativeJscGameStepRunResponse> {
  if (!host.resumeJscGameStepRun) {
    throw new Error('Native host does not provide JavaScriptCore GameStep continuation resume calls.')
  }
  const response: NativeJscGameStepRunResponse = await host.resumeJscGameStepRun(request)
  return assertNativeJscGameStepRunResponse(response)
}

export async function callNativeJscPipelineListenerDispatch(
  host: Pick<QuaNativeHostApi, 'dispatchJscPipelineListener'>,
  request: NativeJscPipelineListenerDispatchRequest,
): Promise<NativeJscPipelineListenerDispatchResponse> {
  if (!host.dispatchJscPipelineListener) {
    throw new Error('Native host does not provide JavaScriptCore pipeline listener dispatch calls.')
  }
  const response: NativeJscPipelineListenerDispatchResponse = await host.dispatchJscPipelineListener(request)
  return assertNativeJscPipelineListenerDispatchResponse(response)
}

export function createNativeJscJsonExportFunction(
  host: Pick<QuaNativeHostApi, 'callJscModuleExport'>,
  moduleNamespaceId: string,
  exportName: string,
): NativeJscJsonExportFunction {
  return async (...args: readonly unknown[]) => {
    return await callNativeJscModuleExport(host, createNativeJscModuleExportCallRequest({
      moduleNamespaceId,
      exportName,
      args,
    }))
  }
}

export function createNativeHostJscJsonModuleNamespaceResolver(
  host: Pick<QuaNativeHostApi, 'callJscModuleExport'>,
): NativeJscModuleNamespaceResolver {
  return (moduleNamespaceId) => {
    return new Proxy(Object.create(null), {
      get(_target, property) {
        if (property === Symbol.toStringTag)
          return 'NativeJscJsonModuleNamespace'
        if (property === 'then')
          return undefined
        if (typeof property !== 'string')
          return undefined
        return createNativeJscJsonExportFunction(host, moduleNamespaceId, property)
      },
      has(_target, property) {
        return typeof property === 'string' && property !== 'then'
      },
    })
  }
}

export interface CreateNativeHostJscGameStepModuleNamespaceResolverOptions {
  executeStepCommand?: NativeJscStepCommandExecutor
  executeHelperCall?: NativeJscHelperCallExecutor
  helperModules?: NativeJscHelperModuleRegistry
  pipelineSubscriptionBridge?: NativeJscPipelineSubscriptionBridge
  serializeStepContext?: NativeJscStepContextSerializer
}

export function createNativeJscGameStepFactoryFunction(
  host: Pick<QuaNativeHostApi, 'callJscGameStepFactory' | 'callJscGameStepRun' | 'resumeJscGameStepRun'>,
  moduleNamespaceId: string,
  exportName: string,
  options: CreateNativeHostJscGameStepModuleNamespaceResolverOptions = {},
): NativeJscGameStepFactoryFunction {
  return async (scope?: unknown) => {
    const descriptors = await callNativeJscGameStepFactory(host, createNativeJscGameStepFactoryCallRequest({
      moduleNamespaceId,
      exportName,
      scope,
    }))
    return descriptors.map(descriptor => createNativeJscGameStepProxy(host, descriptor, options))
  }
}

export function createNativeHostJscGameStepModuleNamespaceResolver(
  host: Pick<QuaNativeHostApi, 'callJscGameStepFactory' | 'callJscGameStepRun' | 'resumeJscGameStepRun'>,
  options: CreateNativeHostJscGameStepModuleNamespaceResolverOptions = {},
): NativeJscModuleNamespaceResolver {
  return (moduleNamespaceId, ctx) => {
    if (ctx.kind !== 'script') {
      throw new Error(`Native JavaScriptCore GameStep namespace resolver can only load script modules, not ${ctx.kind} modules.`)
    }
    return new Proxy(Object.create(null), {
      get(_target, property) {
        if (property === Symbol.toStringTag)
          return 'NativeJscGameStepModuleNamespace'
        if (property === 'then')
          return undefined
        if (typeof property !== 'string')
          return undefined
        return createNativeJscGameStepFactoryFunction(host, moduleNamespaceId, property, options)
      },
      has(_target, property) {
        return typeof property === 'string' && property !== 'then'
      },
    })
  }
}

function createNativeJscGameStepProxy(
  host: Pick<QuaNativeHostApi, 'callJscGameStepRun' | 'resumeJscGameStepRun'>,
  descriptor: NativeJscGameStepDescriptor,
  options: CreateNativeHostJscGameStepModuleNamespaceResolverOptions,
): GameStep {
  if (!descriptor.uuid || typeof descriptor.uuid !== 'string') {
    throw new TypeError('Native JavaScriptCore GameStep descriptor requires a uuid.')
  }
  if (!descriptor.runHandleId || typeof descriptor.runHandleId !== 'string') {
    throw new TypeError(`Native JavaScriptCore GameStep descriptor "${descriptor.uuid}" requires a runHandleId.`)
  }
  return {
    uuid: descriptor.uuid,
    ...(descriptor.metadataJson !== undefined ? { metadata: JSON.parse(descriptor.metadataJson) } : {}),
    run: async (ctx) => {
      let response = await callNativeJscGameStepRun(host, createNativeJscGameStepRunRequest({
        runHandleId: descriptor.runHandleId,
        ctx: (options.serializeStepContext || defaultNativeJscStepContextSerializer)(ctx),
      }))
      const executeStepCommand = options.executeStepCommand || executeNativeJscGameStepCommand
      const executeHelperCall = options.executeHelperCall
        || ((ctx, request) => executeNativeJscGameStepHelperCall(ctx, request, options.helperModules))
      const pipelineSubscriptions = options.pipelineSubscriptionBridge
      while (true) {
        for (const command of response.commands || []) {
          await executeStepCommand(ctx, command)
        }
        if (response.pipelineSubscriptions?.length) {
          if (!pipelineSubscriptions) {
            throw new Error('Native JavaScriptCore GameStep returned pipeline subscription changes, but no pipeline subscription bridge is installed.')
          }
          pipelineSubscriptions.apply(ctx, response.pipelineSubscriptions)
        }
        if (response.pendingWait) {
          const payload = await ctx.engine.waitFor(response.pendingWait.event as never)
          response = await callNativeJscGameStepResume(host, createNativeJscGameStepResumeRequest({
            resumeHandleId: response.pendingWait.resumeHandleId,
            payload,
          }))
          continue
        }
        if (response.pendingTranslation) {
          const options = response.pendingTranslation.optionsJson === undefined
            ? undefined
            : JSON.parse(response.pendingTranslation.optionsJson)
          const payload = await ctx.t(response.pendingTranslation.key, options)
          response = await callNativeJscGameStepResume(host, createNativeJscGameStepResumeRequest({
            resumeHandleId: response.pendingTranslation.resumeHandleId,
            payload,
          }))
          continue
        }
        if (response.pendingPipelineEmit) {
          const payload = response.pendingPipelineEmit.payloadJson === undefined
            ? undefined
            : JSON.parse(response.pendingPipelineEmit.payloadJson)
          await ctx.pipeline.emit(response.pendingPipelineEmit.event, payload)
          response = await callNativeJscGameStepResume(host, createNativeJscGameStepResumeRequest({
            resumeHandleId: response.pendingPipelineEmit.resumeHandleId,
          }))
          continue
        }
        if (response.pendingHelperCall) {
          const payload = await executeHelperCall(ctx, response.pendingHelperCall)
          response = await callNativeJscGameStepResume(host, createNativeJscGameStepResumeRequest({
            resumeHandleId: response.pendingHelperCall.resumeHandleId,
            payload,
          }))
          continue
        }
        return
      }
    },
  }
}

export function createNativeJscPipelineSubscriptionBridge(
  host: Pick<QuaNativeHostApi, 'dispatchJscPipelineListener'>,
  options: {
    executeStepCommand?: NativeJscStepCommandExecutor
    serializePipelineContext?: (context: any) => Record<string, unknown>
  } = {},
): NativeJscPipelineSubscriptionBridge {
  const subscriptions = new Map<string, NativeJscPipelineSubscriptionRecord>()
  const executeStepCommand = options.executeStepCommand || executeNativeJscGameStepCommand
  const serializePipelineContext = options.serializePipelineContext || defaultNativeJscPipelineContextSerializer

  const unsubscribe = (subscriptionId: string): void => {
    const existing = subscriptions.get(subscriptionId)
    if (!existing)
      return
    existing.pipeline.off(existing.event, existing.listener as any)
    subscriptions.delete(subscriptionId)
  }

  const applyChanges = (
    ctx: StepContext,
    changes: readonly NativeJscPipelineSubscriptionChange[] | undefined,
  ): void => {
    if (!changes?.length)
      return
    for (const change of changes) {
      unsubscribe(change.subscriptionId)
      if (change.op === 'unsubscribe') {
        continue
      }
      const listener = async (context: any) => {
        const response = await callNativeJscPipelineListenerDispatch(
          host,
          createNativeJscPipelineListenerDispatchRequest({
            subscriptionId: change.subscriptionId,
            context: serializePipelineContext(context),
          }),
        )
        for (const command of response.commands || []) {
          await executeStepCommand(ctx, command)
        }
        applyChanges(ctx, response.pipelineSubscriptions)
      }
      subscriptions.set(change.subscriptionId, {
        event: change.event,
        listener,
        moduleNamespaceId: change.moduleNamespaceId,
        pipeline: ctx.pipeline,
      })
      ctx.pipeline.on(change.event, listener as any)
    }
  }

  return {
    apply(ctx, changes) {
      applyChanges(ctx, changes)
    },
    releaseModuleNamespace(moduleNamespaceId) {
      for (const [subscriptionId, record] of subscriptions) {
        if (record.moduleNamespaceId === moduleNamespaceId) {
          record.pipeline.off(record.event, record.listener as any)
          subscriptions.delete(subscriptionId)
        }
      }
    },
    dispose() {
      for (const record of subscriptions.values()) {
        record.pipeline.off(record.event, record.listener as any)
      }
      subscriptions.clear()
    },
  }
}

export async function executeNativeJscGameStepCommand(
  ctx: StepContext,
  command: NativeJscGameStepCommand,
): Promise<void> {
  assertNativeJscGameStepCommand(command)
  const args = command.argsJson === undefined ? [] : JSON.parse(command.argsJson)
  if (!Array.isArray(args)) {
    throw new TypeError(`Native JavaScriptCore GameStep command ${command.target}.${command.method} argsJson must be a JSON array.`)
  }
  const method = ctx.engine?.[command.method as keyof typeof ctx.engine]
  if (typeof method !== 'function') {
    throw new TypeError(`Native JavaScriptCore GameStep command ${command.target}.${command.method} is not available on StepContext.`)
  }
  await (method as (...args: unknown[]) => unknown).apply(ctx.engine, args)
}

export function createNativeJscHelperCallExecutor(
  helperModules: NativeJscHelperModuleRegistry,
): NativeJscHelperCallExecutor {
  return (ctx, request) => executeNativeJscGameStepHelperCall(ctx, request, helperModules)
}

export async function executeNativeJscGameStepHelperCall(
  ctx: StepContext,
  request: NativeJscGameStepHelperCallRequest,
  helperModules: NativeJscHelperModuleRegistry = {},
): Promise<unknown> {
  assertNativeJscGameStepHelperCallRequest(request)
  const helperModule = helperModules[request.module]
  const helper = helperModule?.[request.exportName]
  if (typeof helper !== 'function') {
    throw new TypeError(`Native JavaScriptCore helper ${request.module}.${request.exportName} is not registered in the host helper resolver.`)
  }
  const args = request.argsJson === undefined ? [] : JSON.parse(request.argsJson)
  if (!Array.isArray(args)) {
    throw new TypeError(`Native JavaScriptCore helper ${request.module}.${request.exportName} argsJson must be a JSON array.`)
  }
  return await helper(ctx.engine, ...args)
}

function defaultNativeJscStepContextSerializer(ctx: StepContext): Record<string, unknown> {
  return {
    stepId: ctx.stepId,
    ...(ctx.previousStepId ? { previousStepId: ctx.previousStepId } : {}),
  }
}

function defaultNativeJscPipelineContextSerializer(context: any): Record<string, unknown> {
  return {
    event: {
      type: context.event?.type,
      payload: context.event?.payload,
      timestamp: context.event?.timestamp,
      id: context.event?.id,
    },
    handled: context.handled === true,
    stopPropagation: context.stopPropagation === true,
  }
}

export async function releaseNativeJscModuleNamespace(
  host: Pick<QuaNativeHostApi, 'releaseJscModuleNamespace'>,
  moduleNamespaceId: string,
): Promise<NativeJscModuleNamespaceRecord | undefined> {
  return await host.releaseJscModuleNamespace?.(moduleNamespaceId)
}

export async function releaseNativeJscPackageNamespaces(
  host: Pick<QuaNativeHostApi, 'releaseJscPackageNamespaces'>,
  packageId: string,
): Promise<NativeJscModuleNamespaceRecord[]> {
  return await host.releaseJscPackageNamespaces?.(packageId) || []
}

export async function getNativeJscNamespaceSummary(
  host: Pick<QuaNativeHostApi, 'getJscNamespaceSummary'>,
): Promise<NativeJscModuleNamespaceSummary | undefined> {
  return await host.getJscNamespaceSummary?.()
}

export async function getNativeJscPackageNamespaceSummary(
  host: Pick<QuaNativeHostApi, 'getJscPackageNamespaceSummary'>,
  packageId: string,
): Promise<NativeJscModuleNamespaceSummary | undefined> {
  return await host.getJscPackageNamespaceSummary?.(packageId)
}

export function createNativeRuntimeModuleLoader(options: NativeRuntimeModuleLoaderOptions): RuntimeModuleLoader {
  const enabledKinds = new Set<NativeRuntimeModuleKind>(
    options.moduleKinds || ['script', 'scene', 'engine-plugin', 'store-migration'],
  )
  const loadModule = async <TLoaded>(
    kind: NativeRuntimeModuleKind,
    record: NativeRuntimeModuleRecord,
    ctx: RuntimeModuleLoadContext,
  ): Promise<TLoaded> => {
    const assetName = getNativeRuntimeModuleAssetName(record, kind)
    const asset = await ctx.assets.getAsset('scripts', assetName, {
      bundleName: ctx.bundle.bundleName,
      targetPackageId: ctx.package.id,
      locale: ctx.locale,
    })
    const code = new TextDecoder().decode(asset.data)
    const moduleGraph = await loadNativeJscModuleGraph(record, kind, ctx)
    const request = createNativeJscEvaluationRequest({
      assetName,
      bundleName: ctx.bundle.bundleName,
      bytes: asset.data,
      code,
      kind: toJscRuntimeModuleKind(kind),
      limits: options.limits,
      moduleGraph,
      packageId: ctx.package.id,
    })
    const loaded = await options.evaluator({
      assetName,
      bundleName: ctx.bundle.bundleName,
      bytes: asset.data,
      code,
      kind,
      packageId: ctx.package.id,
      request,
      record,
    })
    return normalizeLoadedNativeModule<TLoaded>(loaded, assetName, kind)
  }

  return {
    ...(enabledKinds.has('engine-plugin')
      ? { loadEnginePluginModule: (record, ctx) => loadModule<RuntimeLoadedPluginModule>('engine-plugin', record, ctx) }
      : {}),
    ...(enabledKinds.has('scene')
      ? { loadSceneModule: (record, ctx) => loadModule<RuntimeLoadedSceneModule>('scene', record, ctx) }
      : {}),
    ...(enabledKinds.has('script')
      ? { loadScriptModule: (record, ctx) => loadModule<RuntimeLoadedScriptModule>('script', record, ctx) }
      : {}),
    ...(enabledKinds.has('store-migration')
      ? { loadStoreMigrationModule: (record, ctx) => loadModule<RuntimeLoadedMigrationModule>('store-migration', record, ctx) }
      : {}),
  }
}

async function loadNativeJscModuleGraph(
  record: NativeRuntimeModuleRecord,
  kind: NativeRuntimeModuleKind,
  ctx: RuntimeModuleLoadContext,
): Promise<NativeJscEvaluationRequest['moduleGraph']> {
  const assetNames = getNativeJscModuleGraphAssetNames(record, kind)
  if (assetNames.length === 0) {
    return undefined
  }
  const modules: NonNullable<NativeJscEvaluationRequest['moduleGraph']> = []
  const seen = new Set<string>()
  for (const assetName of assetNames) {
    if (seen.has(assetName))
      continue
    seen.add(assetName)
    const asset = await ctx.assets.getAsset('scripts', assetName, {
      bundleName: ctx.bundle.bundleName,
      targetPackageId: ctx.package.id,
      locale: ctx.locale,
    })
    modules.push({
      assetName,
      bundleName: ctx.bundle.bundleName,
      packageId: ctx.package.id,
      kind: toJscRuntimeModuleKind(kind),
      code: new TextDecoder().decode(asset.data),
      bytes: Array.from(asset.data),
    })
  }
  return modules
}

function getNativeJscModuleGraphAssetNames(
  record: NativeRuntimeModuleRecord,
  kind: NativeRuntimeModuleKind,
): string[] {
  const imports = (record as NativeRuntimeModuleRecordWithNativeJscMetadata).metadata?.nativeJsc?.imports || []
  return imports.map((entry, index) => {
    const assetName = typeof entry === 'string'
      ? entry
      : entry.assetName || entry.module || entry.path || entry.relativePath || ''
    assertNativeRuntimeModuleAssetName(assetName, kind, `metadata.nativeJsc.imports.${index}`)
    return assetName
  })
}

function toJscRuntimeModuleKind(kind: NativeRuntimeModuleKind): NativeJscRuntimeModuleKind {
  switch (kind) {
    case 'engine-plugin':
      return 'enginePlugin'
    case 'store-migration':
      return 'storeMigration'
    case 'scene':
    case 'script':
      return kind
  }
}

function getNativeRuntimeModuleAssetName(record: NativeRuntimeModuleRecord, kind: NativeRuntimeModuleKind): string {
  if (!record.assetName) {
    throw new Error(`Native runtime ${kind} module loading requires an assetName declared in the runtime package manifest.`)
  }
  assertNativeRuntimeModuleAssetName(record.assetName, kind, 'assetName')
  assertNativeRuntimeModuleVariants(record, kind)
  return record.assetName
}

function assertNativeRuntimeModuleVariants(record: NativeRuntimeModuleRecord, kind: NativeRuntimeModuleKind): void {
  const variants = (record as NativeRuntimeModuleRecordWithVariants).variants
  for (const [variantName, variant] of Object.entries(variants || {})) {
    if (variant.assetName)
      assertNativeRuntimeModuleAssetName(variant.assetName, kind, `variants.${variantName}.assetName`)
    if (variant.module)
      assertNativeRuntimeModuleAssetName(variant.module, kind, `variants.${variantName}.module`)
    if (variant.name)
      assertNativeRuntimeModuleAssetName(variant.name, kind, `variants.${variantName}.name`)
    if (variant.path)
      assertNativeRuntimeModuleAssetName(variant.path, kind, `variants.${variantName}.path`)
    if (variant.relativePath)
      assertNativeRuntimeModuleAssetName(variant.relativePath, kind, `variants.${variantName}.relativePath`)
  }
}

function assertNativeRuntimeModuleAssetName(assetName: string, kind: NativeRuntimeModuleKind, field: string): void {
  if (isForbiddenNativeModuleSpecifier(assetName)) {
    throw new Error(`Native runtime ${kind} module ${field} "${assetName}" must be a package-relative script asset.`)
  }
  if (isForbiddenNativePayload(assetName)) {
    throw new Error(`Native runtime ${kind} module ${field} "${assetName}" must not reference a native payload.`)
  }
  if (!isNativeScriptModuleAsset(assetName)) {
    throw new Error(`Native runtime ${kind} module ${field} "${assetName}" must reference a JavaScript module asset.`)
  }
}

function isForbiddenNativeModuleSpecifier(assetName: string): boolean {
  return assetName.includes('\\') || isForbiddenNativeAssetReference(assetName)
}

function isNativeScriptModuleAsset(assetName: string): boolean {
  const normalized = stripAssetReferenceSuffix(assetName).toLowerCase().split(/[\\/]/).pop() || ''
  return normalized.endsWith('.js')
    || normalized.endsWith('.mjs')
    || normalized.endsWith('.cjs')
}

function stripAssetReferenceSuffix(assetName: string): string {
  const suffixIndex = assetName.search(/[?#]/)
  return suffixIndex >= 0 ? assetName.slice(0, suffixIndex) : assetName
}

function normalizeLoadedNativeModule<TLoaded>(
  loaded: unknown,
  assetName: string,
  kind: NativeRuntimeModuleKind,
): TLoaded {
  if (!loaded || typeof loaded !== 'object') {
    throw new TypeError(`Native runtime ${kind} module "${assetName}" did not evaluate to a module namespace object.`)
  }
  return loaded as TLoaded
}
