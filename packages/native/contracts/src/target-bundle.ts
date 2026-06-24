import type {
  ExclusiveTargetBootstrapDiagnostic,
  ExclusiveTargetBootstrapValidationResult,
  QuaTargetBootstrap,
  TargetBootstrapDiagnostic,
  TargetCorePluginFamily,
} from './bootstrap'
import type {
  QuaNativePlatform,
} from './capabilities'
import type {
  TargetBundleNativeRendererDiagnostic,
} from './target-bundle-native-renderer-validation'
import {
  collectTargetCoreAdapterRoots,
  getPackageTargetCorePluginFamily,
  getTargetCorePluginFamily,
  normalizePackageSpecifier,
  TARGET_BOOTSTRAP_MANIFESTS,
  validateExclusiveTargetBootstrap,
} from './bootstrap'
import { checkTargetBundleNativeRendererInfo } from './target-bundle-native-renderer-validation'

export type TargetBundleProfile = 'debug' | 'release'

const TARGET_BUNDLE_PROFILES = new Set(['debug', 'release'] as const)
const NATIVE_TARGET_BUNDLE_PLATFORMS = new Set<QuaNativePlatform>(['macos', 'windows', 'linux'])

export interface TargetBundleAppInfo {
  bundleId?: string
  version?: string
  buildNumber?: string
  icon?: string
}

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
  nativeRenderer?: TargetBundleNativeRendererInfo
  targetCoreResolver: TargetCoreResolverId
  selectedCorePluginFamily: TargetCorePluginFamily
  selectedCoreAdapters: readonly TargetBundlePackageReference[]
  dependencies?: readonly (TargetBundlePackageReference | TargetBundleDependencyReference)[]
  rendererEntries?: readonly (TargetBundlePackageReference | TargetBundleRendererEntryReference)[]
  runtimePackages?: readonly TargetBundleRuntimePackageRecord[]
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

export interface TargetBundleTargetDiagnostic {
  code: 'TARGET_BUNDLE_TARGET_MISMATCH'
  target: QuaTargetBootstrap
  expectedTarget: QuaTargetBootstrap
  message: string
}

export interface TargetBundleArtifactMetadataDiagnostic {
  code:
    | 'TARGET_BUNDLE_PROFILE_MISSING'
    | 'TARGET_BUNDLE_PROFILE_INVALID'
    | 'TARGET_BUNDLE_PLATFORM_MISSING'
    | 'TARGET_BUNDLE_PLATFORM_EMPTY'
    | 'TARGET_BUNDLE_PLATFORM_INVALID'
  target: QuaTargetBootstrap
  field: 'profile' | 'platform'
  value?: string
  message: string
}

export interface TargetBundleAppMetadataDiagnostic {
  code: 'TARGET_BUNDLE_APP_METADATA_MISSING' | 'TARGET_BUNDLE_APP_METADATA_EMPTY'
  target: QuaTargetBootstrap
  field: 'bundleId' | 'version' | 'buildNumber' | 'icon'
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
  field: 'executableDependencies' | 'rendererEntries'
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
  const artifactMetadataDiagnostics = checkArtifactMetadata(manifest)
  const appMetadataDiagnostics = checkAppMetadata(manifest)
  const nativeRendererDiagnostics = checkTargetBundleNativeRendererInfo(manifest)
  const coreResolverDiagnostics = checkCoreResolver(manifest)
  const corePluginFamilyDiagnostics = checkCorePluginFamily(manifest, packageNames)
  const selectedCoreAdapterDiagnostics = checkSelectedCoreAdapters(manifest)
  const rendererEntryTargetDiagnostics = checkRendererEntryTargets(manifest)
  const runtimePackageDiagnostics = checkRuntimePackageTargetCoreAdapters(manifest)
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
      && runtimePackageDiagnostics.length === 0,
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

function checkArtifactMetadata(manifest: TargetBundleManifest): TargetBundleArtifactMetadataDiagnostic[] {
  if (manifest.target !== 'native')
    return []

  const diagnostics: TargetBundleArtifactMetadataDiagnostic[] = []
  const profile = (manifest as { profile?: unknown }).profile
  const platform = (manifest as { platform?: unknown }).platform

  if (profile === undefined) {
    diagnostics.push({
      code: 'TARGET_BUNDLE_PROFILE_MISSING',
      target: manifest.target,
      field: 'profile',
      message: 'Native target bundle manifest must include profile.',
    })
  }
  else if (typeof profile !== 'string' || !TARGET_BUNDLE_PROFILES.has(profile as TargetBundleProfile)) {
    diagnostics.push({
      code: 'TARGET_BUNDLE_PROFILE_INVALID',
      target: manifest.target,
      field: 'profile',
      value: typeof profile === 'string' ? profile : undefined,
      message: 'Native target bundle manifest profile must be "debug" or "release".',
    })
  }

  if (platform === undefined) {
    diagnostics.push({
      code: 'TARGET_BUNDLE_PLATFORM_MISSING',
      target: manifest.target,
      field: 'platform',
      message: 'Native target bundle manifest must include platform.',
    })
  }
  else if (typeof platform !== 'string' || platform.trim() === '') {
    diagnostics.push({
      code: 'TARGET_BUNDLE_PLATFORM_EMPTY',
      target: manifest.target,
      field: 'platform',
      value: typeof platform === 'string' ? platform : undefined,
      message: 'Native target bundle manifest platform must not be empty.',
    })
  }
  else if (!NATIVE_TARGET_BUNDLE_PLATFORMS.has(platform as QuaNativePlatform)) {
    diagnostics.push({
      code: 'TARGET_BUNDLE_PLATFORM_INVALID',
      target: manifest.target,
      field: 'platform',
      value: platform,
      message: 'Native target bundle manifest platform must be "macos", "windows", or "linux".',
    })
  }

  return diagnostics
}

function checkAppMetadata(manifest: TargetBundleManifest): TargetBundleAppMetadataDiagnostic[] {
  if (manifest.target !== 'native')
    return []

  const diagnostics: TargetBundleAppMetadataDiagnostic[] = []
  for (const field of ['bundleId', 'version', 'buildNumber', 'icon'] as const) {
    const value = manifest.app?.[field]
    if (value === undefined) {
      diagnostics.push({
        code: 'TARGET_BUNDLE_APP_METADATA_MISSING',
        target: manifest.target,
        field,
        message: `Native target bundle manifest must include app.${field}.`,
      })
    }
    else if (value.trim() === '') {
      diagnostics.push({
        code: 'TARGET_BUNDLE_APP_METADATA_EMPTY',
        target: manifest.target,
        field,
        message: `Native target bundle manifest app.${field} must not be empty.`,
      })
    }
  }
  return diagnostics
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

function checkCoreResolver(manifest: TargetBundleManifest): TargetBundleCoreResolverDiagnostic[] {
  const expectedTargetCoreResolver = getTargetCoreResolverId(manifest.target)
  const targetCoreResolver = (manifest as { targetCoreResolver?: unknown }).targetCoreResolver

  if (targetCoreResolver === undefined) {
    return [{
      code: 'TARGET_BUNDLE_CORE_RESOLVER_MISSING',
      target: manifest.target,
      expectedTargetCoreResolver,
      message: `Target bundle manifest for "${manifest.target}" must record targetCoreResolver "${expectedTargetCoreResolver}".`,
    }]
  }

  if (targetCoreResolver !== expectedTargetCoreResolver) {
    return [{
      code: 'TARGET_BUNDLE_CORE_RESOLVER_MISMATCH',
      target: manifest.target,
      targetCoreResolver: typeof targetCoreResolver === 'string' ? targetCoreResolver : undefined,
      expectedTargetCoreResolver,
      message: `Target bundle manifest for "${manifest.target}" was produced by targetCoreResolver "${String(targetCoreResolver)}", but expected "${expectedTargetCoreResolver}".`,
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
  ]

  return Array.from(new Set(specifiers.map(normalizePackageSpecifier)))
}

function checkCorePluginFamily(
  manifest: TargetBundleManifest,
  packageNames: readonly string[],
): TargetBundleCorePluginFamilyDiagnostic[] {
  const expectedCorePluginFamily = getTargetCorePluginFamily(manifest.target)
  const diagnostics: TargetBundleCorePluginFamilyDiagnostic[] = []

  if (!manifest.selectedCorePluginFamily) {
    diagnostics.push({
      code: 'TARGET_BUNDLE_CORE_PLUGIN_FAMILY_MISSING',
      target: manifest.target,
      expectedCorePluginFamily,
      message: `Target bundle manifest for "${manifest.target}" must record selected core plugin family "${expectedCorePluginFamily}".`,
    })
  }
  else if (manifest.selectedCorePluginFamily !== expectedCorePluginFamily) {
    diagnostics.push({
      code: 'TARGET_BUNDLE_CORE_PLUGIN_FAMILY_MISMATCH',
      target: manifest.target,
      selectedCorePluginFamily: manifest.selectedCorePluginFamily,
      expectedCorePluginFamily,
      message: `Target bundle manifest for "${manifest.target}" selected core plugin family "${manifest.selectedCorePluginFamily}", but expected "${expectedCorePluginFamily}".`,
    })
  }

  for (const packageName of packageNames) {
    const packageCorePluginFamily = getPackageTargetCorePluginFamily(packageName)
    if (!packageCorePluginFamily || packageCorePluginFamily === expectedCorePluginFamily)
      continue

    diagnostics.push({
      code: 'TARGET_BUNDLE_CORE_PLUGIN_FAMILY_LEAK',
      target: manifest.target,
      selectedCorePluginFamily: manifest.selectedCorePluginFamily,
      expectedCorePluginFamily,
      packageName,
      packageCorePluginFamily,
      message: `Target bundle manifest for "${manifest.target}" must not include "${packageName}" from core plugin family "${packageCorePluginFamily}".`,
    })
  }

  return diagnostics
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
  const targetAdapterRoots = collectTargetCoreAdapterRoots()
  const diagnostics: TargetBundleRuntimePackageDiagnostic[] = []

  for (const runtimePackage of manifest.runtimePackages || []) {
    pushRuntimePackageTargetCoreAdapterDiagnostics(
      diagnostics,
      manifest.target,
      runtimePackage.id,
      'executableDependencies',
      runtimePackage.executableDependencies || [],
      targetAdapterRoots,
    )
    pushRuntimePackageTargetCoreAdapterDiagnostics(
      diagnostics,
      manifest.target,
      runtimePackage.id,
      'rendererEntries',
      runtimePackage.rendererEntries || [],
      targetAdapterRoots,
    )
  }

  return diagnostics
}

function pushRuntimePackageTargetCoreAdapterDiagnostics(
  diagnostics: TargetBundleRuntimePackageDiagnostic[],
  target: QuaTargetBootstrap,
  runtimePackageId: string,
  field: 'executableDependencies' | 'rendererEntries',
  references: readonly TargetBundlePackageGraphReference[],
  targetAdapterRoots: ReadonlySet<string>,
): void {
  const packageNames = collectPackageReferenceSpecifiers(references).map(normalizePackageSpecifier)

  for (const packageName of packageNames) {
    if (!targetAdapterRoots.has(packageName))
      continue

    diagnostics.push({
      code: 'TARGET_BUNDLE_RUNTIME_PACKAGE_CORE_ADAPTER',
      target,
      packageName,
      runtimePackageId,
      field,
      message: `Runtime package "${runtimePackageId}" must not include target core adapter "${packageName}" through "${field}".`,
    })
  }
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
