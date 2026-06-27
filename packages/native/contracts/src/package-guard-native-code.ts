import type {
  NativeGuardRuntimePackageManifest,
  NativeGuardRuntimePackagePluginManifest,
  NativeRuntimePackageGuardDiagnostic,
} from './package-guard'

export function collectNativeCodeDeclarations(
  runtimePackage: NativeGuardRuntimePackageManifest,
  diagnostics: NativeRuntimePackageGuardDiagnostic[],
): void {
  for (const [field] of findNativeCodeDeclarations(runtimePackage, 'package', new Set(['metadata', 'plugins']))) {
    diagnostics.push({
      code: 'NATIVE_PACKAGE_NATIVE_CODE_REQUESTED',
      severity: 'error',
      packageId: runtimePackage.id,
      field,
      message: `Native runtime package "${runtimePackage.id}" requests native code through "${field}".`,
    })
  }
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

export function collectNativePluginDeclarations(
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
    for (const [field] of findNativeCodeDeclarations(plugin, `plugins.${plugin.id}`, new Set(['metadata']))) {
      diagnostics.push({
        code: 'NATIVE_PACKAGE_NATIVE_CODE_REQUESTED',
        severity: 'error',
        packageId: runtimePackage.id,
        pluginId: plugin.id,
        field,
        message: `Native runtime package "${runtimePackage.id}" plugin "${plugin.id}" requests native code through "${field}".`,
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
    for (const field of findNativeCompatibilityBlocksWithoutExplicitOptOut(plugin.metadata)) {
      diagnostics.push({
        code: 'NATIVE_PACKAGE_NATIVE_CODE_REQUESTED',
        severity: 'error',
        packageId: runtimePackage.id,
        pluginId: plugin.id,
        field: `plugins.${plugin.id}.${field}`,
        message: `Native runtime package "${runtimePackage.id}" plugin "${plugin.id}" must explicitly declare nativeCode: false through "plugins.${plugin.id}.${field}".`,
      })
    }
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

function findNativeCodeDeclarations(
  value: unknown,
  path: string,
  skipKeys: ReadonlySet<string> = new Set(),
): Array<[field: string, value: unknown]> {
  const matches: Array<[string, unknown]> = []
  visitNativeCodeDeclarations(value, path, matches, skipKeys)
  return matches
}

function visitNativeCodeDeclarations(
  value: unknown,
  path: string,
  matches: Array<[field: string, value: unknown]>,
  skipKeys: ReadonlySet<string>,
  seen = new Set<object>(),
): void {
  if (!value || typeof value !== 'object')
    return
  if (seen.has(value))
    return
  seen.add(value)
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (skipKeys.has(key))
      continue
    const field = `${path}.${key}`
    if (key === 'nativeCode' && entry !== false && entry !== undefined) {
      matches.push([field, entry])
      continue
    }
    if (key === 'nativePayloads' || key === 'nativeBinaries' || key === 'nativeEntry') {
      matches.push([field, entry])
      continue
    }
    visitNativeCodeDeclarations(entry, field, matches, skipKeys, seen)
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object')
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' ? value.toLowerCase() : undefined
}
