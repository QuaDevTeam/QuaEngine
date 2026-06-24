import type {
  NativeQuickJsEvaluationResponse,
  NativeQuickJsEvaluationRequest,
  NativeQuickJsModuleNamespaceRecord,
  NativeQuickJsModuleNamespaceSummary,
  NativeQuickJsRuntimeModuleKind,
  NativeQuickJsSandboxLimits,
  QuaNativeHostApi,
} from '@quajs/native-contracts'
import {
  assertNativeQuickJsEvaluationResponse,
  createNativeQuickJsEvaluationRequest,
  isForbiddenNativePayload,
} from '@quajs/native-contracts'
import type {
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

declare const TextDecoder: {
  new(): { decode: (input: Uint8Array) => string }
}

export type NativeRuntimeModuleRecord
  = | RuntimeScriptModuleRecord
    | RuntimePackageSceneManifest
    | RuntimePackagePluginManifest
    | RuntimePackageStoreMigrationManifest

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
}

export type NativeQuickJsModuleNamespaceResolver = (
  moduleNamespaceId: string,
  ctx: NativeRuntimeModuleEvaluationContext,
  response: NativeQuickJsEvaluationResponse,
) => unknown | Promise<unknown>

export function createNativeHostQuickJsModuleEvaluator(
  host: Pick<QuaNativeHostApi, 'evaluateQuickJsModule'>,
  resolveModuleNamespace: NativeQuickJsModuleNamespaceResolver,
): NativeRuntimeModuleEvaluator {
  return async (ctx) => {
    if (!host.evaluateQuickJsModule) {
      throw new Error('Native host does not provide QuickJS module evaluation.')
    }
    const response = await host.evaluateQuickJsModule(ctx.request)
    const moduleNamespaceId = assertNativeQuickJsEvaluationResponse(response)
    return await resolveModuleNamespace(moduleNamespaceId, ctx, response)
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
    loadEnginePluginModule: (record, ctx) => loadModule<RuntimeLoadedPluginModule>('engine-plugin', record, ctx),
    loadSceneModule: (record, ctx) => loadModule<RuntimeLoadedSceneModule>('scene', record, ctx),
    loadScriptModule: (record, ctx) => loadModule<RuntimeLoadedScriptModule>('script', record, ctx),
    loadStoreMigrationModule: (record, ctx) => loadModule<RuntimeLoadedMigrationModule>('store-migration', record, ctx),
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
  if (isForbiddenNativeModuleSpecifier(record.assetName)) {
    throw new Error(`Native runtime ${kind} module assetName "${record.assetName}" must be a package-relative script asset.`)
  }
  if (isForbiddenNativePayload(record.assetName)) {
    throw new Error(`Native runtime ${kind} module assetName "${record.assetName}" must not reference a native payload.`)
  }
  return record.assetName
}

function isForbiddenNativeModuleSpecifier(assetName: string): boolean {
  return assetName.startsWith('/')
    || assetName.startsWith('\\')
    || /^[a-z][a-z0-9+.-]*:/i.test(assetName)
    || assetName.split(/[\\/]/).includes('..')
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
