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
  TargetBundleProjectGraphDiagnostic,
  TargetBundleRendererEntryTargetDiagnostic,
  TargetBundleRuntimePackageDiagnostic,
} from './target-bundle-target-validation'
import {
  getPackageTargetCorePluginFamily,
  getTargetCorePluginFamily,
  normalizePackageSpecifier,
  TARGET_BOOTSTRAP_MANIFESTS,
  validateExclusiveTargetBootstrap,
} from './bootstrap'
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

export type TargetCoreResolverId = 'web-core-resolver' | 'cocos-core-resolver' | 'native-core-resolver'

export interface TargetCoreSelection {
  target: QuaTargetBootstrap
  targetCoreResolver: TargetCoreResolverId
  selectedCorePluginFamily: TargetCorePluginFamily
  selectedCoreAdapters: readonly string[]
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

export interface TargetBundleCoreResolverDiagnostic {
  code: 'TARGET_BUNDLE_CORE_RESOLVER_MISSING' | 'TARGET_BUNDLE_CORE_RESOLVER_MISMATCH'
  target: QuaTargetBootstrap
  targetCoreResolver?: string
  expectedTargetCoreResolver: TargetCoreResolverId
  message: string
}

export interface TargetBundleCorePluginFamilyDiagnostic {
  code:
    | 'TARGET_BUNDLE_CORE_PLUGIN_FAMILY_MISSING'
    | 'TARGET_BUNDLE_CORE_PLUGIN_FAMILY_MISMATCH'
    | 'TARGET_BUNDLE_CORE_PLUGIN_FAMILY_LEAK'
  target: QuaTargetBootstrap
  selectedCorePluginFamily?: TargetCorePluginFamily
  expectedCorePluginFamily?: TargetCorePluginFamily
  packageName?: string
  packageCorePluginFamily?: TargetCorePluginFamily
  message: string
}

export interface TargetBundleSelectedCoreAdapterDiagnostic {
  code: 'TARGET_BUNDLE_SELECTED_CORE_ADAPTER_MISSING' | 'TARGET_BUNDLE_SELECTED_CORE_ADAPTER_UNEXPECTED'
  target: QuaTargetBootstrap
  packageName: string
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

export function getTargetCoreResolverId(target: QuaTargetBootstrap): TargetCoreResolverId {
  switch (target) {
    case 'web':
      return 'web-core-resolver'
    case 'cocos':
      return 'cocos-core-resolver'
    case 'native':
      return 'native-core-resolver'
  }
}

export function createTargetCoreSelection(target: QuaTargetBootstrap): TargetCoreSelection {
  const manifest = TARGET_BOOTSTRAP_MANIFESTS[target]
  return {
    target,
    targetCoreResolver: getTargetCoreResolverId(target),
    selectedCorePluginFamily: manifest.corePluginFamily,
    selectedCoreAdapters: [...manifest.coreAdapters],
  }
}

function checkCoreResolver(
  manifest: TargetBundleManifest,
  expectedTarget: QuaTargetBootstrap = manifest.target,
): TargetBundleCoreResolverDiagnostic[] {
  const expectedTargetCoreResolver = getTargetCoreResolverId(expectedTarget)
  const targetCoreResolver = (manifest as { targetCoreResolver?: unknown }).targetCoreResolver

  if (targetCoreResolver === undefined) {
    return [{
      code: 'TARGET_BUNDLE_CORE_RESOLVER_MISSING',
      target: expectedTarget,
      expectedTargetCoreResolver,
      message: `Target bundle manifest for "${expectedTarget}" must record targetCoreResolver "${expectedTargetCoreResolver}".`,
    }]
  }

  if (targetCoreResolver !== expectedTargetCoreResolver) {
    return [{
      code: 'TARGET_BUNDLE_CORE_RESOLVER_MISMATCH',
      target: expectedTarget,
      targetCoreResolver: typeof targetCoreResolver === 'string' ? targetCoreResolver : undefined,
      expectedTargetCoreResolver,
      message: `Target bundle manifest for "${expectedTarget}" was produced by targetCoreResolver "${String(targetCoreResolver)}", but expected "${expectedTargetCoreResolver}".`,
    }]
  }

  return []
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

function checkCorePluginFamily(
  manifest: TargetBundleManifest,
  packageNames: readonly string[],
  expectedTarget: QuaTargetBootstrap = manifest.target,
): TargetBundleCorePluginFamilyDiagnostic[] {
  const expectedCorePluginFamily = getTargetCorePluginFamily(expectedTarget)
  const diagnostics: TargetBundleCorePluginFamilyDiagnostic[] = []

  if (!manifest.selectedCorePluginFamily) {
    diagnostics.push({
      code: 'TARGET_BUNDLE_CORE_PLUGIN_FAMILY_MISSING',
      target: expectedTarget,
      expectedCorePluginFamily,
      message: `Target bundle manifest for "${expectedTarget}" must record selected core plugin family "${expectedCorePluginFamily}".`,
    })
  }
  else if (manifest.selectedCorePluginFamily !== expectedCorePluginFamily) {
    diagnostics.push({
      code: 'TARGET_BUNDLE_CORE_PLUGIN_FAMILY_MISMATCH',
      target: expectedTarget,
      selectedCorePluginFamily: manifest.selectedCorePluginFamily,
      expectedCorePluginFamily,
      message: `Target bundle manifest for "${expectedTarget}" selected core plugin family "${manifest.selectedCorePluginFamily}", but expected "${expectedCorePluginFamily}".`,
    })
  }

  for (const packageName of packageNames) {
    const packageCorePluginFamily = getPackageTargetCorePluginFamily(packageName)
    if (!packageCorePluginFamily || packageCorePluginFamily === expectedCorePluginFamily)
      continue

    diagnostics.push({
      code: 'TARGET_BUNDLE_CORE_PLUGIN_FAMILY_LEAK',
      target: expectedTarget,
      selectedCorePluginFamily: manifest.selectedCorePluginFamily,
      expectedCorePluginFamily,
      packageName,
      packageCorePluginFamily,
      message: `Target bundle manifest for "${expectedTarget}" must not include "${packageName}" from core plugin family "${packageCorePluginFamily}".`,
    })
  }

  return diagnostics
}

function checkSelectedCoreAdapters(
  manifest: TargetBundleManifest,
  expectedTarget: QuaTargetBootstrap = manifest.target,
): TargetBundleSelectedCoreAdapterDiagnostic[] {
  const expectedCoreAdapters = new Set(
    TARGET_BOOTSTRAP_MANIFESTS[expectedTarget].coreAdapters.map(normalizePackageSpecifier),
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
      target: expectedTarget,
      packageName,
      message: `Target bundle manifest for "${expectedTarget}" must select required core adapter "${packageName}".`,
    })
  }

  for (const packageName of selectedCoreAdapters) {
    if (expectedCoreAdapters.has(packageName))
      continue

    diagnostics.push({
      code: 'TARGET_BUNDLE_SELECTED_CORE_ADAPTER_UNEXPECTED',
      target: expectedTarget,
      packageName,
      message: `Target bundle manifest for "${expectedTarget}" must not select core adapter "${packageName}".`,
    })
  }

  return diagnostics
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
