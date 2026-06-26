export type QuaTargetBootstrap = 'web' | 'cocos' | 'native'
export type TargetCorePluginFamily = 'web-core' | 'cocos-core' | 'native-core'

export interface TargetBootstrapManifest {
  target: QuaTargetBootstrap
  corePluginFamily: TargetCorePluginFamily
  coreAdapters: readonly string[]
  corePluginFamilyRoots: readonly string[]
  forbiddenCoreAdapters: readonly string[]
}

export const WEB_TARGET_BOOTSTRAP: TargetBootstrapManifest = {
  target: 'web',
  corePluginFamily: 'web-core',
  coreAdapters: ['@quajs/assets-web', '@quajs/renderer-web'],
  corePluginFamilyRoots: [
    '@quajs/assets-web',
    '@quajs/store-web',
    '@quajs/renderer-web',
    '@quajs/renderer-vue',
    '@quajs/renderer-react',
    '@quajs/renderer-svelte',
  ],
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
  corePluginFamily: 'cocos-core',
  coreAdapters: ['@quajs/cocos-host', '@quajs/assets-cocos', '@quajs/renderer-cocos'],
  corePluginFamilyRoots: [
    '@quajs/cocos-host',
    '@quajs/assets-cocos',
    '@quajs/store-cocos',
    '@quajs/renderer-cocos',
  ],
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
  corePluginFamily: 'native-core',
  coreAdapters: ['@quajs/engine-native', '@quajs/assets-native', '@quajs/store-native', '@quajs/native-contracts'],
  corePluginFamilyRoots: [
    '@quajs/engine-native',
    '@quajs/assets-native',
    '@quajs/store-native',
    '@quajs/native-contracts',
    'quajs_native_runtime',
    'quajs_wgpu_renderer',
    'quajs_native_app',
  ],
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

export function normalizePackageSpecifier(specifier: string): string {
  const normalized = stripReferenceSuffix(specifier.trim().replace(/\\/g, '/').replace(/^\0+/, ''))
  const pathPackageRoot = packageRootFromDependencyPath(normalized)
  if (pathPackageRoot)
    return pathPackageRoot

  const packageSpecifier = normalized.startsWith('npm:')
    ? normalized.slice('npm:'.length)
    : normalized

  if (!packageSpecifier.startsWith('@')) {
    const pathRoot = packageSpecifier.split('/')[0] || packageSpecifier
    return pathRoot.split('::')[0] || pathRoot
  }
  const [scope, packageName] = packageSpecifier.split('/')
  return scope && packageName ? `${scope}/${packageName}` : packageSpecifier
}

function stripReferenceSuffix(specifier: string): string {
  const queryIndex = specifier.indexOf('?')
  const hashIndex = specifier.indexOf('#')
  const suffixIndexes = [queryIndex, hashIndex].filter(index => index >= 0)
  const suffixIndex = suffixIndexes.length > 0 ? Math.min(...suffixIndexes) : -1
  return suffixIndex >= 0 ? specifier.slice(0, suffixIndex) : specifier
}

function packageRootFromDependencyPath(specifier: string): string | undefined {
  const segments = specifier.split('/').filter(Boolean)
  for (let index = segments.length - 1; index >= 0; index--) {
    if (segments[index] !== 'node_modules')
      continue

    if (segments[index + 1] === '.pnpm') {
      const pnpmRoot = packageRootFromPnpmSegment(segments[index + 2])
      if (pnpmRoot)
        return pnpmRoot
    }

    return packageRootFromPathSegments(segments, index + 1)
  }

  const pnpmIndex = segments.lastIndexOf('.pnpm')
  if (pnpmIndex >= 0)
    return packageRootFromPnpmSegment(segments[pnpmIndex + 1])

  return undefined
}

function packageRootFromPathSegments(segments: string[], startIndex: number): string | undefined {
  const first = segments[startIndex]
  if (!first)
    return undefined

  if (first.startsWith('@')) {
    const second = segments[startIndex + 1]
    return second ? `${first}/${second}` : first
  }

  return first.split('::')[0] || first
}

function packageRootFromPnpmSegment(segment: string | undefined): string | undefined {
  if (!segment)
    return undefined

  if (segment.startsWith('@')) {
    const match = /^(@[^+]+)\+([^@]+)@/.exec(segment)
    return match ? `${match[1]}/${match[2]}` : undefined
  }

  const match = /^([^@]+)@/.exec(segment)
  return match?.[1]
}

export function getTargetCorePluginFamily(target: QuaTargetBootstrap): TargetCorePluginFamily {
  return TARGET_BOOTSTRAP_MANIFESTS[target].corePluginFamily
}

export function getPackageTargetCorePluginFamily(specifier: string): TargetCorePluginFamily | undefined {
  const packageName = normalizePackageSpecifier(specifier)
  for (const manifest of Object.values(TARGET_BOOTSTRAP_MANIFESTS)) {
    const familyRoots = new Set(
      [
        ...manifest.coreAdapters,
        ...manifest.corePluginFamilyRoots,
      ].map(normalizePackageSpecifier),
    )
    if (familyRoots.has(packageName))
      return manifest.corePluginFamily
  }
  return undefined
}

export function collectTargetCoreAdapterRoots(): ReadonlySet<string> {
  return new Set(Object.values(TARGET_BOOTSTRAP_MANIFESTS)
    .flatMap(manifest => [
      ...manifest.coreAdapters,
      ...manifest.corePluginFamilyRoots,
      ...manifest.forbiddenCoreAdapters,
    ])
    .map(normalizePackageSpecifier))
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
