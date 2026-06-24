import type {
  ExclusiveTargetBootstrapDiagnostic,
  ExclusiveTargetBootstrapValidationResult,
  QuaTargetBootstrap,
  TargetBootstrapDiagnostic,
} from './bootstrap'
import {
  normalizePackageSpecifier,
  TARGET_BOOTSTRAP_MANIFESTS,
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

export type TargetBundlePackageGraphReference
  = | TargetBundlePackageReference
    | TargetBundleDependencyReference
    | TargetBundleRendererEntryReference

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
  rendererEntries?: readonly (TargetBundlePackageReference | TargetBundleRendererEntryReference)[]
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
    | TargetBundleSelectedCoreAdapterDiagnostic
    | TargetBundleRendererEntryTargetDiagnostic
    | TargetBundleRuntimePackageDiagnostic

export interface TargetBundleSelectedCoreAdapterDiagnostic {
  code: 'TARGET_BUNDLE_SELECTED_CORE_ADAPTER_MISSING' | 'TARGET_BUNDLE_SELECTED_CORE_ADAPTER_UNEXPECTED'
  target: QuaTargetBootstrap
  packageName: string
  message: string
}

export interface TargetBundleRendererEntryTargetDiagnostic {
  code: 'TARGET_BUNDLE_RENDERER_ENTRY_TARGET_MISMATCH'
  target: QuaTargetBootstrap
  rendererTarget: QuaTargetBootstrap
  packageName: string
  pluginId?: string
  runtimePackageId?: string
  message: string
}

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
  const selectedCoreAdapterDiagnostics = checkSelectedCoreAdapters(manifest)
  const rendererEntryTargetDiagnostics = checkRendererEntryTargets(manifest)
  const runtimePackageDiagnostics = checkRuntimePackageTargetCoreAdapters(manifest)
  const diagnostics: TargetBundleManifestDiagnostic[] = [
    ...bootstrapValidation.diagnostics,
    ...(bootstrapValidation.targetValidation?.diagnostics || []),
    ...selectedCoreAdapterDiagnostics,
    ...rendererEntryTargetDiagnostics,
    ...runtimePackageDiagnostics,
  ]

  return {
    ok: bootstrapValidation.ok
      && selectedCoreAdapterDiagnostics.length === 0
      && rendererEntryTargetDiagnostics.length === 0
      && runtimePackageDiagnostics.length === 0,
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

function checkSelectedCoreAdapters(manifest: TargetBundleManifest): TargetBundleSelectedCoreAdapterDiagnostic[] {
  const expectedCoreAdapters = new Set(
    TARGET_BOOTSTRAP_MANIFESTS[manifest.target].coreAdapters.map(normalizePackageSpecifier),
  )
  const selectedCoreAdapters = new Set(
    collectPackageReferenceSpecifiers(manifest.selectedCoreAdapters).map(normalizePackageSpecifier),
  )
  const diagnostics: TargetBundleSelectedCoreAdapterDiagnostic[] = []

  for (const packageName of expectedCoreAdapters) {
    if (selectedCoreAdapters.has(packageName))
      continue

    diagnostics.push({
      code: 'TARGET_BUNDLE_SELECTED_CORE_ADAPTER_MISSING',
      target: manifest.target,
      packageName,
      message: `Target bundle manifest for "${manifest.target}" must select required core adapter "${packageName}".`,
    })
  }

  for (const packageName of selectedCoreAdapters) {
    if (expectedCoreAdapters.has(packageName))
      continue

    diagnostics.push({
      code: 'TARGET_BUNDLE_SELECTED_CORE_ADAPTER_UNEXPECTED',
      target: manifest.target,
      packageName,
      message: `Target bundle manifest for "${manifest.target}" must not select core adapter "${packageName}".`,
    })
  }

  return diagnostics
}

function checkRendererEntryTargets(manifest: TargetBundleManifest): TargetBundleRendererEntryTargetDiagnostic[] {
  const diagnostics: TargetBundleRendererEntryTargetDiagnostic[] = []

  for (const reference of manifest.rendererEntries || [])
    pushRendererEntryTargetDiagnostic(diagnostics, manifest.target, reference)

  for (const runtimePackage of manifest.runtimePackages || []) {
    for (const reference of runtimePackage.rendererEntries || [])
      pushRendererEntryTargetDiagnostic(diagnostics, manifest.target, reference, runtimePackage.id)
  }

  return diagnostics
}

function pushRendererEntryTargetDiagnostic(
  diagnostics: TargetBundleRendererEntryTargetDiagnostic[],
  target: QuaTargetBootstrap,
  reference: TargetBundlePackageReference | TargetBundleRendererEntryReference,
  runtimePackageId?: string,
): void {
  const rendererTarget = rendererEntryReferenceTarget(reference)
  if (!rendererTarget || rendererTarget === target)
    return

  const packageName = normalizePackageSpecifier(packageReferenceSpecifier(reference) || 'unknown')
  diagnostics.push({
    code: 'TARGET_BUNDLE_RENDERER_ENTRY_TARGET_MISMATCH',
    target,
    rendererTarget,
    packageName,
    pluginId: rendererEntryReferencePluginId(reference),
    runtimePackageId,
    message: runtimePackageId
      ? `Runtime package "${runtimePackageId}" declares renderer entry "${packageName}" for target "${rendererTarget}", but the artifact target is "${target}".`
      : `Renderer entry "${packageName}" declares target "${rendererTarget}", but the artifact target is "${target}".`,
  })
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

function collectPackageReferenceSpecifiers(references: readonly TargetBundlePackageGraphReference[]): string[] {
  return references
    .map(packageReferenceSpecifier)
    .filter((specifier): specifier is string => Boolean(specifier))
}

function packageReferenceSpecifier(reference: TargetBundlePackageGraphReference): string | undefined {
  if (typeof reference === 'string')
    return reference

  if ('packageName' in reference && reference.packageName)
    return reference.packageName

  return reference.specifier
}

function rendererEntryReferenceTarget(
  reference: TargetBundlePackageReference | TargetBundleRendererEntryReference,
): QuaTargetBootstrap | undefined {
  return typeof reference === 'string' || !('target' in reference) ? undefined : reference.target
}

function rendererEntryReferencePluginId(
  reference: TargetBundlePackageReference | TargetBundleRendererEntryReference,
): string | undefined {
  return typeof reference === 'string' || !('pluginId' in reference) ? undefined : reference.pluginId
}

function collectKnownTargetAdapterRoots(): ReadonlySet<string> {
  return new Set(
    Object.values(TARGET_BOOTSTRAP_MANIFESTS).flatMap(manifest => [
      ...manifest.coreAdapters,
      ...manifest.forbiddenCoreAdapters,
    ]).map(normalizePackageSpecifier),
  )
}
