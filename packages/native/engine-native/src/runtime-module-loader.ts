import type {
  GameStep,
  StepContext,
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
} from '@quajs/engine'
import type {
  NativeQuickJsEvaluationRequest,
  NativeQuickJsEvaluationResponse,
  NativeQuickJsGameStepCommand,
  NativeQuickJsGameStepDescriptor,
  NativeQuickJsGameStepFactoryCallRequest,
  NativeQuickJsGameStepFactoryCallResponse,
  NativeQuickJsGameStepRunRequest,
  NativeQuickJsGameStepRunResponse,
  NativeQuickJsGameStepResumeRequest,
  NativeQuickJsModuleExportCallRequest,
  NativeQuickJsModuleExportCallResponse,
  NativeQuickJsModuleNamespaceRecord,
  NativeQuickJsModuleNamespaceSummary,
  NativeQuickJsRuntimeModuleKind,
  NativeQuickJsSandboxLimits,
  QuaNativeHostApi,
} from '@quajs/native-contracts'
import {
  assertNativeQuickJsEvaluationResponse,
  assertNativeQuickJsEvaluationRequest,
  assertNativeQuickJsGameStepCommand,
  assertNativeQuickJsGameStepFactoryCallResponse,
  assertNativeQuickJsGameStepRunResponse,
  createNativeQuickJsGameStepFactoryCallRequest,
  createNativeQuickJsGameStepResumeRequest,
  createNativeQuickJsGameStepRunRequest,
  createNativeQuickJsModuleExportCallRequest,
  createNativeQuickJsEvaluationRequest,
  isForbiddenNativeAssetReference,
  isForbiddenNativePayload,
  parseNativeQuickJsModuleExportCallResponse,
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

export interface NativeRuntimeModuleEvaluationContext {
  assetName: string
  bundleName: string
  bytes: Uint8Array
  code: string
  kind: NativeRuntimeModuleKind
  packageId: string
  request: NativeQuickJsEvaluationRequest
  record: NativeRuntimeModuleRecord
}

export type NativeRuntimeModuleKind = 'script' | 'scene' | 'engine-plugin' | 'store-migration'

export type NativeRuntimeModuleEvaluator = (
  ctx: NativeRuntimeModuleEvaluationContext,
) => unknown | Promise<unknown>

export interface NativeRuntimeModuleLoaderOptions {
  evaluator: NativeRuntimeModuleEvaluator
  limits?: Partial<NativeQuickJsSandboxLimits>
  moduleKinds?: readonly NativeRuntimeModuleKind[]
}

export type NativeQuickJsModuleNamespaceResolver = (
  moduleNamespaceId: string,
  ctx: NativeRuntimeModuleEvaluationContext,
  response: NativeQuickJsEvaluationResponse,
) => unknown | Promise<unknown>

export type NativeQuickJsJsonExportFunction = (...args: readonly unknown[]) => Promise<unknown>

export type NativeQuickJsGameStepFactoryFunction = (scope?: unknown) => Promise<GameStep[]>

export type NativeQuickJsStepContextSerializer = (ctx: StepContext) => Record<string, unknown> | undefined

export type NativeQuickJsStepCommandExecutor = (
  ctx: StepContext,
  command: NativeQuickJsGameStepCommand,
) => Promise<void>

export function createNativeHostQuickJsModuleEvaluator(
  host: Pick<QuaNativeHostApi, 'evaluateQuickJsModule'>,
  resolveModuleNamespace: NativeQuickJsModuleNamespaceResolver,
): NativeRuntimeModuleEvaluator {
  return async (ctx) => {
    if (!host.evaluateQuickJsModule) {
      throw new Error('Native host does not provide QuickJS module evaluation.')
    }
    assertNativeQuickJsEvaluationRequest(ctx.request)
    const response = await host.evaluateQuickJsModule(ctx.request)
    const moduleNamespaceId = assertNativeQuickJsEvaluationResponse(response)
    return await resolveModuleNamespace(moduleNamespaceId, ctx, response)
  }
}

export async function callNativeQuickJsModuleExport(
  host: Pick<QuaNativeHostApi, 'callQuickJsModuleExport'>,
  request: NativeQuickJsModuleExportCallRequest,
): Promise<unknown> {
  if (!host.callQuickJsModuleExport) {
    throw new Error('Native host does not provide QuickJS module export calls.')
  }
  const response: NativeQuickJsModuleExportCallResponse = await host.callQuickJsModuleExport(request)
  return parseNativeQuickJsModuleExportCallResponse(response)
}

export async function callNativeQuickJsGameStepFactory(
  host: Pick<QuaNativeHostApi, 'callQuickJsGameStepFactory'>,
  request: NativeQuickJsGameStepFactoryCallRequest,
): Promise<NativeQuickJsGameStepDescriptor[]> {
  if (!host.callQuickJsGameStepFactory) {
    throw new Error('Native host does not provide QuickJS GameStep factory calls.')
  }
  const response: NativeQuickJsGameStepFactoryCallResponse = await host.callQuickJsGameStepFactory(request)
  return assertNativeQuickJsGameStepFactoryCallResponse(response)
}

export async function callNativeQuickJsGameStepRun(
  host: Pick<QuaNativeHostApi, 'callQuickJsGameStepRun'>,
  request: NativeQuickJsGameStepRunRequest,
): Promise<NativeQuickJsGameStepRunResponse> {
  if (!host.callQuickJsGameStepRun) {
    throw new Error('Native host does not provide QuickJS GameStep run calls.')
  }
  const response: NativeQuickJsGameStepRunResponse = await host.callQuickJsGameStepRun(request)
  return assertNativeQuickJsGameStepRunResponse(response)
}

export async function callNativeQuickJsGameStepResume(
  host: Pick<QuaNativeHostApi, 'resumeQuickJsGameStepRun'>,
  request: NativeQuickJsGameStepResumeRequest,
): Promise<NativeQuickJsGameStepRunResponse> {
  if (!host.resumeQuickJsGameStepRun) {
    throw new Error('Native host does not provide QuickJS GameStep continuation resume calls.')
  }
  const response: NativeQuickJsGameStepRunResponse = await host.resumeQuickJsGameStepRun(request)
  return assertNativeQuickJsGameStepRunResponse(response)
}

export function createNativeQuickJsJsonExportFunction(
  host: Pick<QuaNativeHostApi, 'callQuickJsModuleExport'>,
  moduleNamespaceId: string,
  exportName: string,
): NativeQuickJsJsonExportFunction {
  return async (...args: readonly unknown[]) => {
    return await callNativeQuickJsModuleExport(host, createNativeQuickJsModuleExportCallRequest({
      moduleNamespaceId,
      exportName,
      args,
    }))
  }
}

export function createNativeHostQuickJsJsonModuleNamespaceResolver(
  host: Pick<QuaNativeHostApi, 'callQuickJsModuleExport'>,
): NativeQuickJsModuleNamespaceResolver {
  return (moduleNamespaceId) => {
    return new Proxy(Object.create(null), {
      get(_target, property) {
        if (property === Symbol.toStringTag)
          return 'NativeQuickJsJsonModuleNamespace'
        if (property === 'then')
          return undefined
        if (typeof property !== 'string')
          return undefined
        return createNativeQuickJsJsonExportFunction(host, moduleNamespaceId, property)
      },
      has(_target, property) {
        return typeof property === 'string' && property !== 'then'
      },
    })
  }
}

export interface CreateNativeHostQuickJsGameStepModuleNamespaceResolverOptions {
  executeStepCommand?: NativeQuickJsStepCommandExecutor
  serializeStepContext?: NativeQuickJsStepContextSerializer
}

export function createNativeQuickJsGameStepFactoryFunction(
  host: Pick<QuaNativeHostApi, 'callQuickJsGameStepFactory' | 'callQuickJsGameStepRun' | 'resumeQuickJsGameStepRun'>,
  moduleNamespaceId: string,
  exportName: string,
  options: CreateNativeHostQuickJsGameStepModuleNamespaceResolverOptions = {},
): NativeQuickJsGameStepFactoryFunction {
  return async (scope?: unknown) => {
    const descriptors = await callNativeQuickJsGameStepFactory(host, createNativeQuickJsGameStepFactoryCallRequest({
      moduleNamespaceId,
      exportName,
      scope,
    }))
    return descriptors.map(descriptor => createNativeQuickJsGameStepProxy(host, descriptor, options))
  }
}

export function createNativeHostQuickJsGameStepModuleNamespaceResolver(
  host: Pick<QuaNativeHostApi, 'callQuickJsGameStepFactory' | 'callQuickJsGameStepRun' | 'resumeQuickJsGameStepRun'>,
  options: CreateNativeHostQuickJsGameStepModuleNamespaceResolverOptions = {},
): NativeQuickJsModuleNamespaceResolver {
  return (moduleNamespaceId, ctx) => {
    if (ctx.kind !== 'script') {
      throw new Error(`Native QuickJS GameStep namespace resolver can only load script modules, not ${ctx.kind} modules.`)
    }
    return new Proxy(Object.create(null), {
      get(_target, property) {
        if (property === Symbol.toStringTag)
          return 'NativeQuickJsGameStepModuleNamespace'
        if (property === 'then')
          return undefined
        if (typeof property !== 'string')
          return undefined
        return createNativeQuickJsGameStepFactoryFunction(host, moduleNamespaceId, property, options)
      },
      has(_target, property) {
        return typeof property === 'string' && property !== 'then'
      },
    })
  }
}

function createNativeQuickJsGameStepProxy(
  host: Pick<QuaNativeHostApi, 'callQuickJsGameStepRun' | 'resumeQuickJsGameStepRun'>,
  descriptor: NativeQuickJsGameStepDescriptor,
  options: CreateNativeHostQuickJsGameStepModuleNamespaceResolverOptions,
): GameStep {
  if (!descriptor.uuid || typeof descriptor.uuid !== 'string') {
    throw new TypeError('Native QuickJS GameStep descriptor requires a uuid.')
  }
  if (!descriptor.runHandleId || typeof descriptor.runHandleId !== 'string') {
    throw new TypeError(`Native QuickJS GameStep descriptor "${descriptor.uuid}" requires a runHandleId.`)
  }
  return {
    uuid: descriptor.uuid,
    ...(descriptor.metadataJson !== undefined ? { metadata: JSON.parse(descriptor.metadataJson) } : {}),
    run: async (ctx) => {
      let response = await callNativeQuickJsGameStepRun(host, createNativeQuickJsGameStepRunRequest({
        runHandleId: descriptor.runHandleId,
        ctx: (options.serializeStepContext || defaultNativeQuickJsStepContextSerializer)(ctx),
      }))
      const executeStepCommand = options.executeStepCommand || executeNativeQuickJsGameStepCommand
      while (true) {
        for (const command of response.commands || []) {
          await executeStepCommand(ctx, command)
        }
        if (!response.pendingWait) {
          if (response.pendingTranslation) {
            const options = response.pendingTranslation.optionsJson === undefined
              ? undefined
              : JSON.parse(response.pendingTranslation.optionsJson)
            const payload = await ctx.t(response.pendingTranslation.key, options)
            response = await callNativeQuickJsGameStepResume(host, createNativeQuickJsGameStepResumeRequest({
              resumeHandleId: response.pendingTranslation.resumeHandleId,
              payload,
            }))
            continue
          }
          return
        }
        const payload = await ctx.engine.waitFor(response.pendingWait.event as never)
        response = await callNativeQuickJsGameStepResume(host, createNativeQuickJsGameStepResumeRequest({
          resumeHandleId: response.pendingWait.resumeHandleId,
          payload,
        }))
      }
    },
  }
}

export async function executeNativeQuickJsGameStepCommand(
  ctx: StepContext,
  command: NativeQuickJsGameStepCommand,
): Promise<void> {
  assertNativeQuickJsGameStepCommand(command)
  const args = command.argsJson === undefined ? [] : JSON.parse(command.argsJson)
  if (!Array.isArray(args)) {
    throw new Error(`Native QuickJS GameStep command ${command.target}.${command.method} argsJson must be a JSON array.`)
  }
  const method = ctx.engine?.[command.method as keyof typeof ctx.engine]
  if (typeof method !== 'function') {
    throw new Error(`Native QuickJS GameStep command ${command.target}.${command.method} is not available on StepContext.`)
  }
  await (method as (...args: unknown[]) => unknown).apply(ctx.engine, args)
}

function defaultNativeQuickJsStepContextSerializer(ctx: StepContext): Record<string, unknown> {
  return {
    stepId: ctx.stepId,
    ...(ctx.previousStepId ? { previousStepId: ctx.previousStepId } : {}),
  }
}

export async function releaseNativeQuickJsModuleNamespace(
  host: Pick<QuaNativeHostApi, 'releaseQuickJsModuleNamespace'>,
  moduleNamespaceId: string,
): Promise<NativeQuickJsModuleNamespaceRecord | undefined> {
  return await host.releaseQuickJsModuleNamespace?.(moduleNamespaceId)
}

export async function releaseNativeQuickJsPackageNamespaces(
  host: Pick<QuaNativeHostApi, 'releaseQuickJsPackageNamespaces'>,
  packageId: string,
): Promise<NativeQuickJsModuleNamespaceRecord[]> {
  return await host.releaseQuickJsPackageNamespaces?.(packageId) || []
}

export async function getNativeQuickJsNamespaceSummary(
  host: Pick<QuaNativeHostApi, 'getQuickJsNamespaceSummary'>,
): Promise<NativeQuickJsModuleNamespaceSummary | undefined> {
  return await host.getQuickJsNamespaceSummary?.()
}

export async function getNativeQuickJsPackageNamespaceSummary(
  host: Pick<QuaNativeHostApi, 'getQuickJsPackageNamespaceSummary'>,
  packageId: string,
): Promise<NativeQuickJsModuleNamespaceSummary | undefined> {
  return await host.getQuickJsPackageNamespaceSummary?.(packageId)
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
    const request = createNativeQuickJsEvaluationRequest({
      assetName,
      bundleName: ctx.bundle.bundleName,
      bytes: asset.data,
      code,
      kind: toQuickJsRuntimeModuleKind(kind),
      limits: options.limits,
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

function toQuickJsRuntimeModuleKind(kind: NativeRuntimeModuleKind): NativeQuickJsRuntimeModuleKind {
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
