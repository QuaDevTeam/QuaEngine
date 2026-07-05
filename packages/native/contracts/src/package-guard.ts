import {
  collectRuntimePackageAssetNames,
  DEFAULT_FORBIDDEN_NATIVE_PAYLOAD_EXTENSIONS,
  isForbiddenNativeAssetReference,
  isForbiddenNativePayload,
} from './package-guard-assets'
import {
  collectNativeCodeDeclarations,
  collectNativePluginDeclarations,
} from './package-guard-native-code'
import { collectTargetCoreDependencyDeclarations } from './package-guard-target-core'

export {
  DEFAULT_FORBIDDEN_NATIVE_PAYLOAD_EXTENSIONS,
  isForbiddenNativeAssetReference,
  isForbiddenNativePayload,
} from './package-guard-assets'

export type NativeRuntimePackageGuardSeverity = 'warning' | 'error'

export type NativeRuntimePackageGuardDiagnosticCode
  = | 'NATIVE_PACKAGE_NATIVE_CODE_REQUESTED'
    | 'NATIVE_PACKAGE_NATIVE_PAYLOAD_FORBIDDEN'
    | 'NATIVE_PACKAGE_NATIVE_PLUGIN_FORBIDDEN'
    | 'NATIVE_PACKAGE_ASSET_REFERENCE_FORBIDDEN'
    | 'NATIVE_PACKAGE_TARGET_CORE_DEPENDENCY_FORBIDDEN'

export interface NativeRuntimePackageGuardDiagnostic {
  code: NativeRuntimePackageGuardDiagnosticCode
  severity: NativeRuntimePackageGuardSeverity
  message: string
  packageId?: string
  packageName?: string
  assetName?: string
  pluginId?: string
  field?: string
}

export interface NativeRuntimePackageGuardResult {
  ok: boolean
  diagnostics: NativeRuntimePackageGuardDiagnostic[]
}

export interface CheckNativeRuntimePackageGuardOptions {
  package: NativeGuardRuntimePackageManifest
  bundle?: NativeGuardDynamicBundleRecord
  forbiddenExtensions?: readonly string[]
}

export interface NativeGuardDynamicBundleRecord {
  manifest: NativeGuardBundleManifest
  [key: string]: unknown
}

export interface NativeGuardBundleManifest {
  assets?: Partial<Record<string, Record<string, NativeGuardAssetInfo>>>
  [key: string]: unknown
}

export interface NativeGuardAssetInfo {
  name: string
  path: string
  relativePath: string
  variants?: Record<string, {
    name?: string
    path: string
    relativePath: string
    [key: string]: unknown
  }>
  [key: string]: unknown
}

export interface NativeGuardRuntimePackageManifest {
  id: string
  executableDependencies?: NativeGuardPackageReference[]
  rendererEntries?: NativeGuardPackageReference[]
  scripts?: NativeGuardRuntimePackageScriptManifest[]
  scenes?: NativeGuardRuntimePackageSceneManifest[]
  plugins?: NativeGuardRuntimePackagePluginManifest[]
  storeMigrations?: NativeGuardRuntimePackageStoreMigrationManifest[]
  metadata?: Record<string, unknown>
  [key: string]: unknown
}

export type NativeGuardPackageReference = string | {
  specifier?: string
  packageName?: string
  [key: string]: unknown
}

export interface NativeGuardRuntimePackageScriptManifest {
  assetName: string
  variants?: Record<string, NativeGuardRuntimePackageModuleVariantManifest>
  [key: string]: unknown
}

export interface NativeGuardRuntimePackageModuleVariantManifest {
  assetName?: string
  module?: string
  [key: string]: unknown
}

export interface NativeGuardRuntimePackageSceneManifest {
  assetName: string
  module?: string
  variants?: Record<string, NativeGuardRuntimePackageModuleVariantManifest>
  [key: string]: unknown
}

export interface NativeGuardRuntimePackagePluginManifest {
  id: string
  assetName?: string
  module?: string
  variants?: Record<string, NativeGuardRuntimePackageModuleVariantManifest>
  metadata?: Record<string, unknown>
  [key: string]: unknown
}

export interface NativeGuardRuntimePackageStoreMigrationManifest {
  assetName: string
  variants?: Record<string, NativeGuardRuntimePackageModuleVariantManifest>
  [key: string]: unknown
}

export function checkNativeRuntimePackageGuard(options: CheckNativeRuntimePackageGuardOptions): NativeRuntimePackageGuardResult {
  const diagnostics: NativeRuntimePackageGuardDiagnostic[] = []
  const runtimePackage = options.package
  const forbiddenExtensions = new Set((options.forbiddenExtensions || DEFAULT_FORBIDDEN_NATIVE_PAYLOAD_EXTENSIONS)
    .map(extension => extension.toLowerCase()))

  collectNativeCodeDeclarations(runtimePackage, diagnostics)
  collectTargetCoreDependencyDeclarations(runtimePackage, diagnostics)
  collectNativePluginDeclarations(runtimePackage, diagnostics)

  for (const assetName of collectRuntimePackageAssetNames(runtimePackage, options.bundle?.manifest)) {
    if (isForbiddenNativeAssetReference(assetName)) {
      diagnostics.push({
        code: 'NATIVE_PACKAGE_ASSET_REFERENCE_FORBIDDEN',
        severity: 'error',
        packageId: runtimePackage.id,
        assetName,
        message: `Native runtime package "${runtimePackage.id}" contains forbidden asset reference "${assetName}".`,
      })
    }
    if (isForbiddenNativePayload(assetName, forbiddenExtensions)) {
      diagnostics.push({
        code: 'NATIVE_PACKAGE_NATIVE_PAYLOAD_FORBIDDEN',
        severity: 'error',
        packageId: runtimePackage.id,
        assetName,
        message: `Native runtime package "${runtimePackage.id}" contains forbidden native payload "${assetName}".`,
      })
    }
  }

  return {
    ok: diagnostics.every(diagnostic => diagnostic.severity !== 'error'),
    diagnostics,
  }
}

export function assertNativeRuntimePackageGuard(options: CheckNativeRuntimePackageGuardOptions): void {
  const result = checkNativeRuntimePackageGuard(options)
  if (!result.ok) {
    const message = result.diagnostics
      .filter(diagnostic => diagnostic.severity === 'error')
      .map(diagnostic => diagnostic.message)
      .join('; ')
    throw new Error(message || 'Native runtime package guard failed.')
  }
}
