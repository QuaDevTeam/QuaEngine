import type {
  QuaTargetBootstrap,
  TargetCorePluginFamily,
} from './bootstrap'
import type {
  TargetBundlePackageGraphReference,
  TargetBundlePackageReference,
  TargetBundleProjectGraphKind,
  TargetBundleRendererEntryReference,
} from './target-bundle-references'
import type { TargetBundleManifest } from './target-bundle'
import {
  collectTargetCoreAdapterRoots,
  getPackageTargetCorePluginFamily,
  getTargetCorePluginFamily,
  normalizePackageSpecifier,
} from './bootstrap'
import {
  collectPackageReferenceSpecifiers,
  packageReferenceSpecifier,
  rendererEntryReferencePluginId,
  rendererEntryReferenceTarget,
} from './target-bundle-references'

export interface TargetBundleRendererEntryTargetDiagnostic {
  code: 'TARGET_BUNDLE_RENDERER_ENTRY_TARGET_MISSING' | 'TARGET_BUNDLE_RENDERER_ENTRY_TARGET_MISMATCH'
  target: QuaTargetBootstrap
  rendererTarget?: QuaTargetBootstrap
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

export interface TargetBundleProjectGraphDiagnostic {
  code: 'TARGET_BUNDLE_PROJECT_GRAPH_CORE_ADAPTER'
  target: QuaTargetBootstrap
  packageName: string
  packageCorePluginFamily: TargetCorePluginFamily
  expectedCorePluginFamily: TargetCorePluginFamily
  projectGraphId: string
  projectGraphKind: TargetBundleProjectGraphKind
  message: string
}

export function checkRendererEntryTargets(
  manifest: TargetBundleManifest,
  expectedTarget: QuaTargetBootstrap = manifest.target,
): TargetBundleRendererEntryTargetDiagnostic[] {
  const diagnostics: TargetBundleRendererEntryTargetDiagnostic[] = []

  for (const reference of manifest.rendererEntries || [])
    pushRendererEntryTargetDiagnostic(diagnostics, expectedTarget, reference)

  for (const runtimePackage of manifest.runtimePackages || []) {
    for (const reference of runtimePackage.rendererEntries || [])
      pushRendererEntryTargetDiagnostic(diagnostics, expectedTarget, reference, runtimePackage.id)
  }

  return diagnostics
}

export function checkRuntimePackageTargetCoreAdapters(
  manifest: TargetBundleManifest,
  expectedTarget: QuaTargetBootstrap = manifest.target,
): TargetBundleRuntimePackageDiagnostic[] {
  const targetAdapterRoots = collectTargetCoreAdapterRoots()
  const diagnostics: TargetBundleRuntimePackageDiagnostic[] = []

  for (const runtimePackage of manifest.runtimePackages || []) {
    pushRuntimePackageTargetCoreAdapterDiagnostics(
      diagnostics,
      expectedTarget,
      runtimePackage.id,
      'executableDependencies',
      runtimePackage.executableDependencies || [],
      targetAdapterRoots,
    )
    pushRuntimePackageTargetCoreAdapterDiagnostics(
      diagnostics,
      expectedTarget,
      runtimePackage.id,
      'rendererEntries',
      runtimePackage.rendererEntries || [],
      targetAdapterRoots,
    )
  }

  return diagnostics
}

export function checkProjectGraphTargetCoreAdapters(
  manifest: TargetBundleManifest,
  expectedTarget: QuaTargetBootstrap = manifest.target,
): TargetBundleProjectGraphDiagnostic[] {
  const expectedCorePluginFamily = getTargetCorePluginFamily(expectedTarget)
  const diagnostics: TargetBundleProjectGraphDiagnostic[] = []

  for (const projectGraph of manifest.projectGraphs || []) {
    const packageNames = collectPackageReferenceSpecifiers(projectGraph.references || [])
      .map(normalizePackageSpecifier)

    for (const packageName of packageNames) {
      const packageCorePluginFamily = getPackageTargetCorePluginFamily(packageName)
      if (!packageCorePluginFamily)
        continue

      if (projectGraph.kind === 'post-bundle' && packageCorePluginFamily === expectedCorePluginFamily)
        continue

      diagnostics.push({
        code: 'TARGET_BUNDLE_PROJECT_GRAPH_CORE_ADAPTER',
        target: expectedTarget,
        packageName,
        packageCorePluginFamily,
        expectedCorePluginFamily,
        projectGraphId: projectGraph.id,
        projectGraphKind: projectGraph.kind,
        message: projectGraph.kind === 'post-bundle'
          ? `Post-bundle project graph "${projectGraph.id}" for target "${expectedTarget}" must not include inactive target core adapter "${packageName}" from "${packageCorePluginFamily}".`
          : `Project graph "${projectGraph.id}" (${projectGraph.kind}) for target "${expectedTarget}" must not declare target core adapter "${packageName}" from "${packageCorePluginFamily}". Target core wiring belongs only in the active target-core resolver.`,
      })
    }
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
  if (!rendererTarget) {
    const packageName = normalizePackageSpecifier(packageReferenceSpecifier(reference) || 'unknown')
    diagnostics.push({
      code: 'TARGET_BUNDLE_RENDERER_ENTRY_TARGET_MISSING',
      target,
      packageName,
      pluginId: rendererEntryReferencePluginId(reference),
      runtimePackageId,
      message: runtimePackageId
        ? `Runtime package "${runtimePackageId}" renderer entry "${packageName}" must declare target "${target}".`
        : `Renderer entry "${packageName}" must declare target "${target}".`,
    })
    return
  }

  if (rendererTarget === target)
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
