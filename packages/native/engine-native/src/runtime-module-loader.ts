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
  record: NativeRuntimeModuleRecord
}

export type NativeRuntimeModuleKind = 'script' | 'scene' | 'engine-plugin' | 'store-migration'

export type NativeRuntimeModuleEvaluator = (
  ctx: NativeRuntimeModuleEvaluationContext,
) => unknown | Promise<unknown>

export interface NativeRuntimeModuleLoaderOptions {
  evaluator: NativeRuntimeModuleEvaluator
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
    const loaded = await options.evaluator({
      assetName,
      bundleName: ctx.bundle.bundleName,
      bytes: asset.data,
      code: new TextDecoder().decode(asset.data),
      kind,
      packageId: ctx.package.id,
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

function getNativeRuntimeModuleAssetName(record: NativeRuntimeModuleRecord, kind: NativeRuntimeModuleKind): string {
  if (!record.assetName) {
    throw new Error(`Native runtime ${kind} module loading requires an assetName declared in the runtime package manifest.`)
  }
  if (isForbiddenNativeModuleSpecifier(record.assetName)) {
    throw new Error(`Native runtime ${kind} module assetName "${record.assetName}" must be a package-relative script asset.`)
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
