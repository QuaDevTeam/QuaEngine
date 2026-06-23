export type QuaTargetBootstrap = 'web' | 'cocos' | 'native'

export interface TargetBootstrapManifest {
  target: QuaTargetBootstrap
  coreAdapters: readonly string[]
  forbiddenCoreAdapters: readonly string[]
}

export const WEB_TARGET_BOOTSTRAP: TargetBootstrapManifest = {
  target: 'web',
  coreAdapters: ['@quajs/assets-web', '@quajs/renderer-web'],
  forbiddenCoreAdapters: [
    '@quajs/assets-cocos',
    '@quajs/store-cocos',
    '@quajs/cocos-host',
    '@quajs/renderer-cocos',
    '@quajs/engine-native',
    '@quajs/assets-native',
    '@quajs/store-native',
    '@quajs/native-contracts',
    'quajs_native_runtime',
    'quajs_wgpu_renderer',
    'quajs_native_app',
  ],
}

export const COCOS_TARGET_BOOTSTRAP: TargetBootstrapManifest = {
  target: 'cocos',
  coreAdapters: ['@quajs/cocos-host', '@quajs/assets-cocos', '@quajs/renderer-cocos'],
  forbiddenCoreAdapters: [
    '@quajs/assets-web',
    '@quajs/store-web',
    '@quajs/renderer-web',
    '@quajs/renderer-vue',
    '@quajs/renderer-react',
    '@quajs/renderer-svelte',
    '@quajs/engine-native',
    '@quajs/assets-native',
    '@quajs/store-native',
    '@quajs/native-contracts',
    'quajs_native_runtime',
    'quajs_wgpu_renderer',
    'quajs_native_app',
  ],
}

export const NATIVE_TARGET_BOOTSTRAP: TargetBootstrapManifest = {
  target: 'native',
  coreAdapters: ['@quajs/engine-native', '@quajs/assets-native', '@quajs/store-native', '@quajs/native-contracts'],
  forbiddenCoreAdapters: [
    '@quajs/assets-web',
    '@quajs/store-web',
    '@quajs/renderer-web',
    '@quajs/renderer-vue',
    '@quajs/renderer-react',
    '@quajs/renderer-svelte',
    '@quajs/assets-cocos',
    '@quajs/store-cocos',
    '@quajs/cocos-host',
    '@quajs/renderer-cocos',
  ],
}

export const TARGET_BOOTSTRAP_MANIFESTS: Record<QuaTargetBootstrap, TargetBootstrapManifest> = {
  web: WEB_TARGET_BOOTSTRAP,
  cocos: COCOS_TARGET_BOOTSTRAP,
  native: NATIVE_TARGET_BOOTSTRAP,
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

export function normalizePackageSpecifier(specifier: string): string {
  if (!specifier.startsWith('@')) {
    const pathRoot = specifier.split('/')[0] || specifier
    return pathRoot.split('::')[0] || pathRoot
  }
  const [scope, packageName] = specifier.split('/')
  return scope && packageName ? `${scope}/${packageName}` : specifier
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
