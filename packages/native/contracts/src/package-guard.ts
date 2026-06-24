export type NativeRuntimePackageGuardSeverity = 'warning' | 'error'

export type NativeRuntimePackageGuardDiagnosticCode
  = | 'NATIVE_PACKAGE_NATIVE_CODE_REQUESTED'
    | 'NATIVE_PACKAGE_NATIVE_PAYLOAD_FORBIDDEN'
    | 'NATIVE_PACKAGE_NATIVE_PLUGIN_FORBIDDEN'
    | 'NATIVE_PACKAGE_ASSET_REFERENCE_FORBIDDEN'

export interface NativeRuntimePackageGuardDiagnostic {
  code: NativeRuntimePackageGuardDiagnosticCode
  severity: NativeRuntimePackageGuardSeverity
  message: string
  packageId?: string
  assetName?: string
  pluginId?: string
  field?: string
}

export interface NativeRuntimePackageGuardResult {
  ok: boolean
  diagnostics: NativeRuntimePackageGuardDiagnostic[]
}

export interface CheckNativeRuntimePackageGuardOptions {
  package: NativeGuardRuntimePackageManifest
  bundle?: NativeGuardDynamicBundleRecord
  forbiddenExtensions?: readonly string[]
}

export interface NativeGuardDynamicBundleRecord {
  manifest: NativeGuardBundleManifest
  [key: string]: unknown
}

export interface NativeGuardBundleManifest {
  assets?: Partial<Record<string, Record<string, NativeGuardAssetInfo>>>
  [key: string]: unknown
}

export interface NativeGuardAssetInfo {
  name: string
  path: string
  relativePath: string
  variants?: Record<string, {
    path: string
    relativePath: string
    [key: string]: unknown
  }>
  [key: string]: unknown
}

export interface NativeGuardRuntimePackageManifest {
  id: string
  scripts?: NativeGuardRuntimePackageScriptManifest[]
  scenes?: NativeGuardRuntimePackageSceneManifest[]
  plugins?: NativeGuardRuntimePackagePluginManifest[]
  storeMigrations?: NativeGuardRuntimePackageStoreMigrationManifest[]
  metadata?: Record<string, unknown>
  [key: string]: unknown
}

export interface NativeGuardRuntimePackageScriptManifest {
  assetName: string
  variants?: Record<string, { assetName: string }>
  [key: string]: unknown
}

export interface NativeGuardRuntimePackageSceneManifest {
  assetName: string
  module?: string
  [key: string]: unknown
}

export interface NativeGuardRuntimePackagePluginManifest {
  id: string
  assetName?: string
  module?: string
  metadata?: Record<string, unknown>
  [key: string]: unknown
}

export interface NativeGuardRuntimePackageStoreMigrationManifest {
  assetName: string
  [key: string]: unknown
}

export const DEFAULT_FORBIDDEN_NATIVE_PAYLOAD_EXTENSIONS = [
  '.dylib',
  '.so',
  '.dll',
  '.framework',
  '.bundle',
  '.node',
  '.wasm',
  '.wasi',
  '.exe',
  '.msi',
  '.app',
  '.pkg',
  '.deb',
  '.rpm',
  '.appimage',
  '.jar',
  '.class',
] as const

export function checkNativeRuntimePackageGuard(options: CheckNativeRuntimePackageGuardOptions): NativeRuntimePackageGuardResult {
  const diagnostics: NativeRuntimePackageGuardDiagnostic[] = []
  const runtimePackage = options.package
  const forbiddenExtensions = new Set((options.forbiddenExtensions || DEFAULT_FORBIDDEN_NATIVE_PAYLOAD_EXTENSIONS)
    .map(extension => extension.toLowerCase()))

  collectNativeCodeDeclarations(runtimePackage, diagnostics)
  collectNativePluginDeclarations(runtimePackage, diagnostics)

  for (const assetName of collectRuntimePackageAssetNames(runtimePackage, options.bundle?.manifest)) {
    if (isForbiddenNativeAssetReference(assetName)) {
      diagnostics.push({
        code: 'NATIVE_PACKAGE_ASSET_REFERENCE_FORBIDDEN',
        severity: 'error',
        packageId: runtimePackage.id,
        assetName,
        message: `Native runtime package "${runtimePackage.id}" contains forbidden asset reference "${assetName}".`,
      })
    }
    if (isForbiddenNativePayload(assetName, forbiddenExtensions)) {
      diagnostics.push({
        code: 'NATIVE_PACKAGE_NATIVE_PAYLOAD_FORBIDDEN',
        severity: 'error',
        packageId: runtimePackage.id,
        assetName,
        message: `Native runtime package "${runtimePackage.id}" contains forbidden native payload "${assetName}".`,
      })
    }
  }

  return {
    ok: diagnostics.every(diagnostic => diagnostic.severity !== 'error'),
    diagnostics,
  }
}

export function assertNativeRuntimePackageGuard(options: CheckNativeRuntimePackageGuardOptions): void {
  const result = checkNativeRuntimePackageGuard(options)
  if (!result.ok) {
    const message = result.diagnostics
      .filter(diagnostic => diagnostic.severity === 'error')
      .map(diagnostic => diagnostic.message)
      .join('; ')
    throw new Error(message || 'Native runtime package guard failed.')
  }
}

export function isForbiddenNativePayload(assetName: string, forbiddenExtensions: ReadonlySet<string> = new Set(DEFAULT_FORBIDDEN_NATIVE_PAYLOAD_EXTENSIONS)): boolean {
  const normalized = assetName.toLowerCase().replace(/\\/g, '/')
  return Array.from(forbiddenExtensions).some(extension =>
    normalized.endsWith(extension) || normalized.includes(`${extension}/`))
}

export function isForbiddenNativeAssetReference(assetName: string): boolean {
  const normalized = assetName.replace(/\\/g, '/')
  return normalized.startsWith('/')
    || normalized.startsWith('\\')
    || /^[a-z][a-z0-9+.-]*:/i.test(normalized)
    || normalized.split('/').includes('..')
}

function collectNativeCodeDeclarations(
  runtimePackage: NativeGuardRuntimePackageManifest,
  diagnostics: NativeRuntimePackageGuardDiagnostic[],
): void {
  for (const field of findNativeCompatibilityBlocksWithoutExplicitOptOut(runtimePackage.metadata)) {
    diagnostics.push({
      code: 'NATIVE_PACKAGE_NATIVE_CODE_REQUESTED',
      severity: 'error',
      packageId: runtimePackage.id,
      field,
      message: `Native runtime package "${runtimePackage.id}" must explicitly declare nativeCode: false through "${field}".`,
    })
  }
  for (const [field] of findNativeCodeDeclarations(runtimePackage.metadata, 'metadata')) {
    diagnostics.push({
      code: 'NATIVE_PACKAGE_NATIVE_CODE_REQUESTED',
      severity: 'error',
      packageId: runtimePackage.id,
      field,
      message: `Native runtime package "${runtimePackage.id}" requests native code through "${field}".`,
    })
  }
}

function findNativeCompatibilityBlocksWithoutExplicitOptOut(metadata: Record<string, unknown> | undefined): string[] {
  if (!metadata)
    return []
  const fields: string[] = []
  if (isRecord(metadata.nativeRenderer) && metadata.nativeRenderer.nativeCode !== false)
    fields.push('metadata.nativeRenderer.nativeCode')
  if (
    isRecord(metadata.renderers)
    && isRecord(metadata.renderers.native)
    && metadata.renderers.native.nativeCode !== false
  ) {
    fields.push('metadata.renderers.native.nativeCode')
  }
  return fields
}

function collectNativePluginDeclarations(
  runtimePackage: NativeGuardRuntimePackageManifest,
  diagnostics: NativeRuntimePackageGuardDiagnostic[],
): void {
  for (const plugin of runtimePackage.plugins || []) {
    if (isNativePluginDeclaration(plugin)) {
      diagnostics.push({
        code: 'NATIVE_PACKAGE_NATIVE_PLUGIN_FORBIDDEN',
        severity: 'error',
        packageId: runtimePackage.id,
        pluginId: plugin.id,
        field: 'plugins',
        message: `Native runtime package "${runtimePackage.id}" declares forbidden native plugin "${plugin.id}".`,
      })
    }
    for (const [field] of findNativeCodeDeclarations(plugin.metadata, `plugins.${plugin.id}.metadata`)) {
      diagnostics.push({
        code: 'NATIVE_PACKAGE_NATIVE_CODE_REQUESTED',
        severity: 'error',
        packageId: runtimePackage.id,
        pluginId: plugin.id,
        field,
        message: `Native runtime package "${runtimePackage.id}" plugin "${plugin.id}" requests native code through "${field}".`,
      })
    }
  }
}

function collectRuntimePackageAssetNames(runtimePackage: NativeGuardRuntimePackageManifest, bundleManifest?: NativeGuardBundleManifest): string[] {
  const names = new Set<string>()
  for (const script of runtimePackage.scripts || []) {
    addAssetName(names, script.assetName)
    for (const variant of Object.values(script.variants || {})) {
      addAssetName(names, variant.assetName)
    }
  }
  for (const scene of runtimePackage.scenes || []) {
    addAssetName(names, scene.assetName)
    addAssetName(names, scene.module)
  }
  for (const plugin of runtimePackage.plugins || []) {
    addAssetName(names, plugin.assetName)
    addAssetName(names, plugin.module)
  }
  for (const migration of runtimePackage.storeMigrations || []) {
    addAssetName(names, migration.assetName)
  }
  for (const assetsByName of Object.values(bundleManifest?.assets || {})) {
    for (const asset of Object.values(assetsByName || {})) {
      addAssetName(names, asset.path)
      addAssetName(names, asset.relativePath)
      addAssetName(names, asset.name)
      for (const variant of Object.values(asset.variants || {})) {
        addAssetName(names, variant.path)
        addAssetName(names, variant.relativePath)
      }
    }
  }
  return Array.from(names)
}

function addAssetName(names: Set<string>, value: string | undefined): void {
  if (value)
    names.add(value)
}

function isNativePluginDeclaration(plugin: NativeGuardRuntimePackagePluginManifest): boolean {
  const metadata = plugin.metadata || {}
  const target = stringValue(metadata.target || metadata.rendererTarget || metadata.platform)
  const kind = stringValue(metadata.kind || metadata.pluginKind || metadata.type)
  const nativeCode = metadata.nativeCode
  return nativeCode === true
    || target === 'native-code'
    || target === 'rust'
    || kind === 'native'
    || kind === 'native-code'
}

function findNativeCodeDeclarations(value: unknown, path: string): Array<[field: string, value: unknown]> {
  const matches: Array<[string, unknown]> = []
  visitNativeCodeDeclarations(value, path, matches)
  return matches
}

function visitNativeCodeDeclarations(
  value: unknown,
  path: string,
  matches: Array<[field: string, value: unknown]>,
  seen = new Set<object>(),
): void {
  if (!value || typeof value !== 'object')
    return
  if (seen.has(value))
    return
  seen.add(value)
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    const field = `${path}.${key}`
    if (key === 'nativeCode' && entry !== false && entry !== undefined) {
      matches.push([field, entry])
      continue
    }
    if (key === 'nativePayloads' || key === 'nativeBinaries' || key === 'nativeEntry') {
      matches.push([field, entry])
      continue
    }
    visitNativeCodeDeclarations(entry, field, matches, seen)
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object')
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' ? value.toLowerCase() : undefined
}
