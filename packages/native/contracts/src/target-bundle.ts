import type {
  ExclusiveTargetBootstrapDiagnostic,
  ExclusiveTargetBootstrapValidationResult,
  QuaTargetBootstrap,
  TargetBootstrapDiagnostic,
  TargetCorePluginFamily,
} from './bootstrap'
import type {
  TargetBundleAppInfo,
  TargetBundleAppMetadataDiagnostic,
  TargetBundleArtifactMetadataDiagnostic,
  TargetBundleProfile,
} from './target-bundle-metadata'
import type {
  TargetBundleDependencyReference,
  TargetBundlePackageReference,
  TargetBundleProjectGraphRecord,
  TargetBundleRendererEntryReference,
  TargetBundleRuntimePackageRecord,
} from './target-bundle-references'
import type {
  TargetBundleNativeRendererDiagnostic,
} from './target-bundle-native-renderer-validation'
import type {
  TargetBundleCorePluginFamilyDiagnostic,
  TargetBundleCoreResolverDiagnostic,
  TargetBundleSelectedCoreAdapterDiagnostic,
  TargetCoreResolverId,
} from './target-bundle-core-validation'
import type {
  TargetBundleProjectGraphDiagnostic,
  TargetBundleRendererEntryTargetDiagnostic,
  TargetBundleRuntimePackageDiagnostic,
} from './target-bundle-target-validation'
import {
  normalizePackageSpecifier,
  validateExclusiveTargetBootstrap,
} from './bootstrap'
import {
  checkCorePluginFamily,
  checkCoreResolver,
  checkSelectedCoreAdapters,
} from './target-bundle-core-validation'
import {
  checkAppMetadata,
  checkArtifactMetadata,
} from './target-bundle-metadata'
import {
  collectPackageReferenceSpecifiers,
} from './target-bundle-references'
import { checkTargetBundleNativeRendererInfo } from './target-bundle-native-renderer-validation'
import {
  checkProjectGraphTargetCoreAdapters,
  checkRendererEntryTargets,
  checkRuntimePackageTargetCoreAdapters,
} from './target-bundle-target-validation'

export type {
  TargetBundleAppInfo,
  TargetBundleAppMetadataDiagnostic,
  TargetBundleArtifactMetadataDiagnostic,
  TargetBundleProfile,
} from './target-bundle-metadata'

export type {
  TargetBundleDependencyReference,
  TargetBundlePackageGraphReference,
  TargetBundlePackageReference,
  TargetBundleProjectGraphKind,
  TargetBundleProjectGraphRecord,
  TargetBundleRendererEntryReference,
  TargetBundleRuntimePackageRecord,
} from './target-bundle-references'

export type {
  TargetBundleCorePluginFamilyDiagnostic,
  TargetBundleCoreResolverDiagnostic,
  TargetBundleSelectedCoreAdapterDiagnostic,
  TargetCoreResolverId,
  TargetCoreSelection,
} from './target-bundle-core-validation'

export {
  createTargetCoreSelection,
  getTargetCoreResolverId,
} from './target-bundle-core-validation'

export type {
  TargetBundleProjectGraphDiagnostic,
  TargetBundleRendererEntryTargetDiagnostic,
  TargetBundleRuntimePackageDiagnostic,
} from './target-bundle-target-validation'

export interface TargetBundleNativeRendererInfo {
  packageName?: string
  version?: string
  backend?: string
  backendVersion?: string
  capabilityIds?: readonly string[]
  capabilityManifestHash?: string
}

export interface TargetBundleManifest {
  schemaVersion?: 1
  target: QuaTargetBootstrap
  profile: TargetBundleProfile
  platform?: string
  app?: TargetBundleAppInfo
  nativeRenderer?: TargetBundleNativeRendererInfo
  targetCoreResolver: TargetCoreResolverId
  selectedCorePluginFamily: TargetCorePluginFamily
  selectedCoreAdapters: readonly TargetBundlePackageReference[]
  dependencies?: readonly (TargetBundlePackageReference | TargetBundleDependencyReference)[]
  rendererEntries?: readonly (TargetBundlePackageReference | TargetBundleRendererEntryReference)[]
  runtimePackages?: readonly TargetBundleRuntimePackageRecord[]
  projectGraphs?: readonly TargetBundleProjectGraphRecord[]
}

export type TargetBundleManifestDiagnostic
  = | ExclusiveTargetBootstrapDiagnostic
    | TargetBootstrapDiagnostic
    | TargetBundleTargetDiagnostic
    | TargetBundleArtifactMetadataDiagnostic
    | TargetBundleNativeRendererDiagnostic
    | TargetBundleAppMetadataDiagnostic
    | TargetBundleCoreResolverDiagnostic
    | TargetBundleCorePluginFamilyDiagnostic
    | TargetBundleSelectedCoreAdapterDiagnostic
    | TargetBundleRendererEntryTargetDiagnostic
    | TargetBundleRuntimePackageDiagnostic
    | TargetBundleProjectGraphDiagnostic

export interface TargetBundleTargetDiagnostic {
  code: 'TARGET_BUNDLE_TARGET_MISMATCH'
  target: QuaTargetBootstrap
  expectedTarget: QuaTargetBootstrap
  message: string
}

export interface TargetBundleManifestValidationResult {
  ok: boolean
  packageNames: string[]
  bootstrapValidation: ExclusiveTargetBootstrapValidationResult
  diagnostics: TargetBundleManifestDiagnostic[]
}

export interface ValidateTargetBundleManifestOptions {
  expectedTarget?: QuaTargetBootstrap
}

export function assertTargetBundleManifest(
  manifest: TargetBundleManifest,
  options: ValidateTargetBundleManifestOptions = {},
): TargetBundleManifestValidationResult {
  const result = validateTargetBundleManifest(manifest, options)
  if (!result.ok)
    throw new Error(formatTargetBundleManifestValidationError(manifest, result))
  return result
}

export function validateTargetBundleManifest(
  manifest: TargetBundleManifest,
  options: ValidateTargetBundleManifestOptions = {},
): TargetBundleManifestValidationResult {
  const expectedTarget = options.expectedTarget || manifest.target
  const packageNames = collectTargetBundlePackageNames(manifest)
  const bootstrapValidation = validateExclusiveTargetBootstrap(packageNames, {
    expectedTarget,
  })
  const targetDiagnostics = checkTarget(manifest, expectedTarget)
  const artifactMetadataDiagnostics = checkArtifactMetadata(manifest, expectedTarget)
  const appMetadataDiagnostics = checkAppMetadata(manifest, expectedTarget)
  const nativeRendererDiagnostics = checkTargetBundleNativeRendererInfo(manifest, expectedTarget)
  const coreResolverDiagnostics = checkCoreResolver(manifest, expectedTarget)
  const corePluginFamilyDiagnostics = checkCorePluginFamily(manifest, packageNames, expectedTarget)
  const selectedCoreAdapterDiagnostics = checkSelectedCoreAdapters(manifest, expectedTarget)
  const rendererEntryTargetDiagnostics = checkRendererEntryTargets(manifest, expectedTarget)
  const runtimePackageDiagnostics = checkRuntimePackageTargetCoreAdapters(manifest, expectedTarget)
  const projectGraphDiagnostics = checkProjectGraphTargetCoreAdapters(manifest, expectedTarget)
  const diagnostics: TargetBundleManifestDiagnostic[] = [
    ...bootstrapValidation.diagnostics,
    ...(bootstrapValidation.targetValidation?.diagnostics || []),
    ...targetDiagnostics,
    ...artifactMetadataDiagnostics,
    ...appMetadataDiagnostics,
    ...nativeRendererDiagnostics,
    ...coreResolverDiagnostics,
    ...corePluginFamilyDiagnostics,
    ...selectedCoreAdapterDiagnostics,
    ...rendererEntryTargetDiagnostics,
    ...runtimePackageDiagnostics,
    ...projectGraphDiagnostics,
  ]

  return {
    ok: bootstrapValidation.ok
      && targetDiagnostics.length === 0
      && artifactMetadataDiagnostics.length === 0
      && appMetadataDiagnostics.length === 0
      && nativeRendererDiagnostics.length === 0
      && coreResolverDiagnostics.length === 0
      && corePluginFamilyDiagnostics.length === 0
      && selectedCoreAdapterDiagnostics.length === 0
      && rendererEntryTargetDiagnostics.length === 0
      && runtimePackageDiagnostics.length === 0
      && projectGraphDiagnostics.length === 0,
    packageNames,
    bootstrapValidation,
    diagnostics,
  }
}

function checkTarget(
  manifest: TargetBundleManifest,
  expectedTarget: QuaTargetBootstrap,
): TargetBundleTargetDiagnostic[] {
  if (manifest.target === expectedTarget)
    return []

  return [{
    code: 'TARGET_BUNDLE_TARGET_MISMATCH',
    target: manifest.target,
    expectedTarget,
    message: `Target bundle manifest declares target "${manifest.target}", but expected "${expectedTarget}".`,
  }]
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
    ...(manifest.projectGraphs || []).flatMap(projectGraph =>
      collectPackageReferenceSpecifiers(projectGraph.references || []),
    ),
  ]

  return Array.from(new Set(specifiers.map(normalizePackageSpecifier)))
}

function formatTargetBundleManifestValidationError(
  manifest: TargetBundleManifest,
  result: TargetBundleManifestValidationResult,
): string {
  const artifact = [
    manifest.target,
    manifest.profile,
    manifest.platform,
    manifest.app?.bundleId,
    manifest.app?.version,
  ].filter(Boolean).join('/')
  const diagnostics = result.diagnostics.map(diagnostic => diagnostic.message)

  return [
    `Target bundle manifest validation failed for "${artifact}".`,
    ...diagnostics,
  ].join(' ')
}
