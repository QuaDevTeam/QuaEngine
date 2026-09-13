import type {
  QuaTargetBootstrap,
  TargetCorePluginFamily,
} from './bootstrap'
import type {
  TargetBundleManifest,
} from './target-bundle'
import {
  getPackageTargetCorePluginFamily,
  getTargetCorePluginFamily,
  TARGET_BOOTSTRAP_MANIFESTS,
} from './target-bootstrap-manifests'
import { normalizePackageSpecifier } from './target-core-specifiers'
import { collectPackageReferenceSpecifiers } from './target-bundle-references'

export type TargetCoreResolverId = 'web-core-resolver' | 'cocos-core-resolver' | 'native-core-resolver'

export interface TargetCoreSelection {
  target: QuaTargetBootstrap
  targetCoreResolver: TargetCoreResolverId
  selectedCorePluginFamily: TargetCorePluginFamily
  selectedCoreAdapters: readonly string[]
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

export function checkCoreResolver(
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

export function checkCorePluginFamily(
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

export function checkSelectedCoreAdapters(
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
