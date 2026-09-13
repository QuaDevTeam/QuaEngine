import {
  getPackageTargetCorePluginFamily,
  TARGET_BOOTSTRAP_MANIFESTS,
} from './target-bootstrap-manifests'
import { normalizePackageSpecifier } from './target-core-specifiers'

export {
  COCOS_TARGET_BOOTSTRAP,
  collectTargetCoreAdapterRoots,
  getPackageTargetCorePluginFamily,
  getTargetCorePluginFamily,
  NATIVE_TARGET_BOOTSTRAP,
  TARGET_BOOTSTRAP_MANIFESTS,
  WEB_TARGET_BOOTSTRAP,
} from './target-bootstrap-manifests'
export { normalizePackageSpecifier } from './target-core-specifiers'

export type QuaTargetBootstrap = 'web' | 'cocos' | 'native'
export type TargetCorePluginFamily = 'web-core' | 'cocos-core' | 'native-core'

export interface TargetBootstrapManifest {
  target: QuaTargetBootstrap
  corePluginFamily: TargetCorePluginFamily
  coreAdapters: readonly string[]
  corePluginFamilyRoots: readonly string[]
  forbiddenCoreAdapters: readonly string[]
}

export interface TargetBootstrapValidationResult {
  ok: boolean
  missing: string[]
  forbidden: string[]
  diagnostics: TargetBootstrapDiagnostic[]
}

export type TargetBootstrapDiagnosticCode
  = | 'TARGET_CORE_ADAPTER_MISSING'
    | 'TARGET_CORE_ADAPTER_FORBIDDEN'

export interface TargetBootstrapDiagnostic {
  code: TargetBootstrapDiagnosticCode
  target: QuaTargetBootstrap
  packageName: string
  message: string
}

export interface ValidateTargetBootstrapOptions {
  requireCoreAdapters?: boolean
}

export interface TargetBootstrapRegistration {
  target: QuaTargetBootstrap
  presentCoreAdapters: string[]
  missingCoreAdapters: string[]
  complete: boolean
}

export type ExclusiveTargetBootstrapDiagnosticCode
  = | 'TARGET_BOOTSTRAP_NONE'
    | 'TARGET_BOOTSTRAP_MIXED'
    | 'TARGET_BOOTSTRAP_UNEXPECTED'

export type OrdinaryPluginListDiagnosticCode = 'ORDINARY_PLUGIN_TARGET_CORE_ADAPTER'

export interface ExclusiveTargetBootstrapDiagnostic {
  code: ExclusiveTargetBootstrapDiagnosticCode
  targets: QuaTargetBootstrap[]
  expectedTarget?: QuaTargetBootstrap
  packageNames: string[]
  message: string
}

export interface ExclusiveTargetBootstrapValidationResult {
  ok: boolean
  selectedTargets: QuaTargetBootstrap[]
  registrations: TargetBootstrapRegistration[]
  diagnostics: ExclusiveTargetBootstrapDiagnostic[]
  targetValidation?: TargetBootstrapValidationResult
}

export interface ValidateExclusiveTargetBootstrapOptions extends ValidateTargetBootstrapOptions {
  expectedTarget?: QuaTargetBootstrap
}

export type OrdinaryPluginReference = string | {
  specifier?: string
  packageName?: string
}

export interface ValidateOrdinaryPluginListTargetIsolationOptions {
  target?: QuaTargetBootstrap
  fieldName?: string
}

export interface OrdinaryPluginListDiagnostic {
  code: OrdinaryPluginListDiagnosticCode
  target?: QuaTargetBootstrap
  fieldName: string
  specifier: string
  packageName: string
  corePluginFamily: TargetCorePluginFamily
  message: string
}

export interface OrdinaryPluginListTargetIsolationValidationResult {
  ok: boolean
  packageNames: string[]
  diagnostics: OrdinaryPluginListDiagnostic[]
}

export function validateTargetBootstrap(
  target: QuaTargetBootstrap,
  packageNames: readonly string[],
  options: ValidateTargetBootstrapOptions = {},
): TargetBootstrapValidationResult {
  const manifest = TARGET_BOOTSTRAP_MANIFESTS[target]
  const packageNameSet = new Set(packageNames.map(normalizePackageSpecifier))
  const requireCoreAdapters = options.requireCoreAdapters !== false
  const missing = requireCoreAdapters
    ? manifest.coreAdapters.filter(packageName => !packageNameSet.has(packageName))
    : []
  const forbidden = manifest.forbiddenCoreAdapters.filter(packageName => packageNameSet.has(packageName))
  const diagnostics: TargetBootstrapDiagnostic[] = [
    ...missing.map(packageName => ({
      code: 'TARGET_CORE_ADAPTER_MISSING' as const,
      target,
      packageName,
      message: `Target "${target}" bootstrap is missing required core adapter "${packageName}".`,
    })),
    ...forbidden.map(packageName => ({
      code: 'TARGET_CORE_ADAPTER_FORBIDDEN' as const,
      target,
      packageName,
      message: `Target "${target}" bootstrap must not include core adapter "${packageName}".`,
    })),
  ]
  return {
    ok: missing.length === 0 && forbidden.length === 0,
    missing,
    forbidden,
    diagnostics,
  }
}

export function validateExclusiveTargetBootstrap(
  packageNames: readonly string[],
  options: ValidateExclusiveTargetBootstrapOptions = {},
): ExclusiveTargetBootstrapValidationResult {
  const packageNameSet = new Set(packageNames.map(normalizePackageSpecifier))
  const registrations = Object.values(TARGET_BOOTSTRAP_MANIFESTS)
    .map(manifest => createTargetBootstrapRegistration(manifest, packageNameSet))
  const selectedRegistrations = registrations.filter(registration => registration.presentCoreAdapters.length > 0)
  const selectedTargets = selectedRegistrations.map(registration => registration.target)
  const diagnostics: ExclusiveTargetBootstrapDiagnostic[] = []
  const selectedCoreAdapters = selectedRegistrations.flatMap(registration => registration.presentCoreAdapters)

  if (selectedTargets.length === 0) {
    diagnostics.push({
      code: 'TARGET_BOOTSTRAP_NONE',
      targets: [],
      expectedTarget: options.expectedTarget,
      packageNames: [],
      message: options.expectedTarget
        ? `Target "${options.expectedTarget}" bootstrap is not registered by any core adapter.`
        : 'No Web, Cocos, or native target bootstrap core adapter is registered.',
    })
  }
  else if (selectedTargets.length > 1) {
    diagnostics.push({
      code: 'TARGET_BOOTSTRAP_MIXED',
      targets: selectedTargets,
      expectedTarget: options.expectedTarget,
      packageNames: selectedCoreAdapters,
      message: `Package output mixes target bootstrap core adapters for ${selectedTargets.join(', ')}.`,
    })
  }

  if (
    options.expectedTarget
    && selectedTargets.length === 1
    && selectedTargets[0] !== options.expectedTarget
  ) {
    diagnostics.push({
      code: 'TARGET_BOOTSTRAP_UNEXPECTED',
      targets: selectedTargets,
      expectedTarget: options.expectedTarget,
      packageNames: selectedCoreAdapters,
      message: `Expected target "${options.expectedTarget}" bootstrap, but found "${selectedTargets[0]}".`,
    })
  }

  const targetToValidate = options.expectedTarget
    || (selectedTargets.length === 1 ? selectedTargets[0] : undefined)
  const targetValidation = targetToValidate
    ? validateTargetBootstrap(targetToValidate, packageNames, options)
    : undefined

  return {
    ok: diagnostics.length === 0 && (targetValidation?.ok ?? true),
    selectedTargets,
    registrations,
    diagnostics,
    targetValidation,
  }
}

export function validateOrdinaryPluginListTargetIsolation(
  pluginSpecifiers: readonly OrdinaryPluginReference[],
  options: ValidateOrdinaryPluginListTargetIsolationOptions = {},
): OrdinaryPluginListTargetIsolationValidationResult {
  const fieldName = options.fieldName || 'plugins'
  const packageNames = pluginSpecifiers
    .flatMap(ordinaryPluginReferenceSpecifiers)
    .map(normalizePackageSpecifier)
  const diagnostics: OrdinaryPluginListDiagnostic[] = []

  for (const reference of pluginSpecifiers) {
    for (const specifier of ordinaryPluginReferenceSpecifiers(reference)) {
      const packageName = normalizePackageSpecifier(specifier)
      const corePluginFamily = getPackageTargetCorePluginFamily(packageName)
      if (!corePluginFamily)
        continue

      diagnostics.push({
        code: 'ORDINARY_PLUGIN_TARGET_CORE_ADAPTER',
        target: options.target,
        fieldName,
        specifier,
        packageName,
        corePluginFamily,
        message: options.target
          ? `Target "${options.target}" ordinary plugin list "${fieldName}" must not include target core adapter "${packageName}" from "${corePluginFamily}". Select target bootstrap through the target-core resolver before resolving ordinary plugins.`
          : `Ordinary plugin list "${fieldName}" must not include target core adapter "${packageName}" from "${corePluginFamily}". Select Web, Cocos, or native bootstrap through a target-core resolver before resolving ordinary plugins.`,
      })
    }
  }

  return {
    ok: diagnostics.length === 0,
    packageNames: Array.from(new Set(packageNames)),
    diagnostics,
  }
}

function ordinaryPluginReferenceSpecifiers(reference: OrdinaryPluginReference): string[] {
  if (typeof reference === 'string')
    return [reference]

  return Array.from(new Set(
    [reference.specifier, reference.packageName]
      .filter((specifier): specifier is string => Boolean(specifier)),
  ))
}

function createTargetBootstrapRegistration(
  manifest: TargetBootstrapManifest,
  packageNameSet: ReadonlySet<string>,
): TargetBootstrapRegistration {
  const presentCoreAdapters = manifest.coreAdapters.filter(packageName => packageNameSet.has(packageName))
  const missingCoreAdapters = manifest.coreAdapters.filter(packageName => !packageNameSet.has(packageName))
  return {
    target: manifest.target,
    presentCoreAdapters,
    missingCoreAdapters,
    complete: missingCoreAdapters.length === 0,
  }
}
