import type {
  ExclusiveTargetBootstrapDiagnostic,
  ExclusiveTargetBootstrapValidationResult,
  QuaTargetBootstrap,
  TargetBootstrapDiagnostic,
} from './bootstrap'
import {
  TARGET_BOOTSTRAP_MANIFESTS,
  normalizePackageSpecifier,
  validateExclusiveTargetBootstrap,
} from './bootstrap'

export type TargetBundleProfile = 'debug' | 'release'

export interface TargetBundleAppInfo {
  bundleId?: string
  version?: string
  buildNumber?: string
  icon?: string
}

export type TargetBundlePackageReference = string | {
  specifier?: string
  packageName?: string
}

export interface TargetBundleDependencyReference {
  specifier: string
  runtime?: boolean
  optional?: boolean
  source?: 'static-import' | 'dynamic-import' | 'plugin-entry' | 'runtime-package' | 'native-binary' | 'unknown'
}

export interface TargetBundleRendererEntryReference {
  specifier: string
  pluginId?: string
  target?: QuaTargetBootstrap
}

export interface TargetBundleRuntimePackageRecord {
  id: string
  executableDependencies?: readonly TargetBundlePackageReference[]
  rendererEntries?: readonly TargetBundlePackageReference[]
}

export interface TargetBundleManifest {
  schemaVersion?: 1
  target: QuaTargetBootstrap
  profile: TargetBundleProfile
  platform?: string
  app?: TargetBundleAppInfo
  selectedCoreAdapters: readonly TargetBundlePackageReference[]
  dependencies?: readonly (TargetBundlePackageReference | TargetBundleDependencyReference)[]
  rendererEntries?: readonly (TargetBundlePackageReference | TargetBundleRendererEntryReference)[]
  runtimePackages?: readonly TargetBundleRuntimePackageRecord[]
}

export type TargetBundleManifestDiagnostic
  = | ExclusiveTargetBootstrapDiagnostic
    | TargetBootstrapDiagnostic
    | TargetBundleRuntimePackageDiagnostic

export interface TargetBundleRuntimePackageDiagnostic {
  code: 'TARGET_BUNDLE_RUNTIME_PACKAGE_CORE_ADAPTER'
  target: QuaTargetBootstrap
  packageName: string
  runtimePackageId: string
  message: string
}

export interface TargetBundleManifestValidationResult {
  ok: boolean
  packageNames: string[]
  bootstrapValidation: ExclusiveTargetBootstrapValidationResult
  diagnostics: TargetBundleManifestDiagnostic[]
}

export function validateTargetBundleManifest(manifest: TargetBundleManifest): TargetBundleManifestValidationResult {
  const packageNames = collectTargetBundlePackageNames(manifest)
  const bootstrapValidation = validateExclusiveTargetBootstrap(packageNames, {
    expectedTarget: manifest.target,
  })
  const runtimePackageDiagnostics = checkRuntimePackageTargetCoreAdapters(manifest)
  const diagnostics: TargetBundleManifestDiagnostic[] = [
    ...bootstrapValidation.diagnostics,
    ...(bootstrapValidation.targetValidation?.diagnostics || []),
    ...runtimePackageDiagnostics,
  ]

  return {
    ok: bootstrapValidation.ok && runtimePackageDiagnostics.length === 0,
    packageNames,
    bootstrapValidation,
    diagnostics,
  }
}

export function collectTargetBundlePackageNames(manifest: TargetBundleManifest): string[] {
  const specifiers = [
    ...collectPackageReferenceSpecifiers(manifest.selectedCoreAdapters),
    ...collectPackageReferenceSpecifiers(manifest.dependencies || []),
    ...collectPackageReferenceSpecifiers(manifest.rendererEntries || []),
    ...(manifest.runtimePackages || []).flatMap(runtimePackage => [
      ...collectPackageReferenceSpecifiers(runtimePackage.executableDependencies || []),
      ...collectPackageReferenceSpecifiers(runtimePackage.rendererEntries || []),
    ]),
  ]

  return Array.from(new Set(specifiers.map(normalizePackageSpecifier)))
}

function checkRuntimePackageTargetCoreAdapters(manifest: TargetBundleManifest): TargetBundleRuntimePackageDiagnostic[] {
  const targetAdapterRoots = collectKnownTargetAdapterRoots()
  const diagnostics: TargetBundleRuntimePackageDiagnostic[] = []

  for (const runtimePackage of manifest.runtimePackages || []) {
    const packageNames = [
      ...collectPackageReferenceSpecifiers(runtimePackage.executableDependencies || []),
      ...collectPackageReferenceSpecifiers(runtimePackage.rendererEntries || []),
    ].map(normalizePackageSpecifier)

    for (const packageName of packageNames) {
      if (!targetAdapterRoots.has(packageName))
        continue

      diagnostics.push({
        code: 'TARGET_BUNDLE_RUNTIME_PACKAGE_CORE_ADAPTER',
        target: manifest.target,
        packageName,
        runtimePackageId: runtimePackage.id,
        message: `Runtime package "${runtimePackage.id}" must not include target core adapter "${packageName}" as an executable dependency.`,
      })
    }
  }

  return diagnostics
}

function collectPackageReferenceSpecifiers(references: readonly TargetBundlePackageReference[]): string[] {
  return references
    .map(reference => typeof reference === 'string' ? reference : reference.specifier || reference.packageName)
    .filter((specifier): specifier is string => Boolean(specifier))
}

function collectKnownTargetAdapterRoots(): ReadonlySet<string> {
  return new Set(
    Object.values(TARGET_BOOTSTRAP_MANIFESTS).flatMap(manifest => [
      ...manifest.coreAdapters,
      ...manifest.forbiddenCoreAdapters,
    ]).map(normalizePackageSpecifier),
  )
}
