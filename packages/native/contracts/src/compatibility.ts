import type { QuaNativeHostInfo, RendererTargetCapability } from './capabilities'
import { isCapabilityCompatible } from './capabilities'

export type NativeCompatibilitySeverity = 'warning' | 'error'

export interface RuntimePackageNativeRendererCompatibility {
  packageName?: '@quajs/native-renderer'
  versionRange?: string
  capabilities?: readonly string[]
  optionalCapabilities?: readonly string[]
  quiComponents?: readonly string[]
  qssFeatures?: readonly string[]
  /** @deprecated Use quiComponents for required native QUI component names. */
  uiSurfaces?: readonly string[]
  /** @deprecated Use qssFeatures for required native QSS declaration names. */
  qssTargets?: readonly string[]
  nativeCode?: false
}

export interface NativeCompatibilityDiagnostic {
  code:
    | 'NATIVE_RENDERER_VERSION_MISMATCH'
    | 'NATIVE_REQUIRED_CAPABILITY_MISSING'
    | 'NATIVE_OPTIONAL_CAPABILITY_MISSING'
    | 'NATIVE_CODE_NOT_ALLOWED'
    | 'NATIVE_RENDERER_PACKAGE_MISMATCH'
    | 'NATIVE_REQUIRED_QSS_FEATURE_MISSING'
    | 'NATIVE_REQUIRED_QUI_COMPONENT_MISSING'
  severity: NativeCompatibilitySeverity
  message: string
  pluginId?: string
  required?: string
  actual?: string
}

export interface NativeCompatibilityResult {
  ok: boolean
  diagnostics: NativeCompatibilityDiagnostic[]
}

export interface CheckNativeCompatibilityOptions {
  pluginId?: string
  hostInfo: QuaNativeHostInfo
  compatibility?: RuntimePackageNativeRendererCompatibility
}

export function checkNativeCompatibility(options: CheckNativeCompatibilityOptions): NativeCompatibilityResult {
  const diagnostics: NativeCompatibilityDiagnostic[] = []
  const { compatibility, hostInfo, pluginId } = options
  if (!compatibility) {
    return { ok: true, diagnostics }
  }

  if (compatibility.nativeCode !== false && compatibility.nativeCode !== undefined) {
    diagnostics.push({
      code: 'NATIVE_CODE_NOT_ALLOWED',
      severity: 'error',
      message: 'Dynamic native runtime packages cannot request native code activation.',
      pluginId,
    })
  }

  if (compatibility.packageName && compatibility.packageName !== hostInfo.renderer.packageName) {
    diagnostics.push({
      code: 'NATIVE_RENDERER_PACKAGE_MISMATCH',
      severity: 'error',
      message: `Native renderer package "${hostInfo.renderer.packageName}" does not match required "${compatibility.packageName}".`,
      pluginId,
      required: compatibility.packageName,
      actual: hostInfo.renderer.packageName,
    })
  }

  if (compatibility.versionRange && !satisfiesMajorRange(hostInfo.renderer.version, compatibility.versionRange)) {
    diagnostics.push({
      code: 'NATIVE_RENDERER_VERSION_MISMATCH',
      severity: 'error',
      message: `Native renderer version "${hostInfo.renderer.version}" does not satisfy "${compatibility.versionRange}".`,
      pluginId,
      required: compatibility.versionRange,
      actual: hostInfo.renderer.version,
    })
  }

  for (const capability of compatibility.capabilities || []) {
    if (!hasCompatibleCapability(hostInfo.renderer.capabilities, capability)) {
      diagnostics.push({
        code: 'NATIVE_REQUIRED_CAPABILITY_MISSING',
        severity: 'error',
        message: `Required native capability "${capability}" is not available.`,
        pluginId,
        required: capability,
      })
    }
  }

  for (const capability of compatibility.optionalCapabilities || []) {
    if (!hasCompatibleCapability(hostInfo.renderer.capabilities, capability)) {
      diagnostics.push({
        code: 'NATIVE_OPTIONAL_CAPABILITY_MISSING',
        severity: 'warning',
        message: `Optional native capability "${capability}" is not available; fallback behavior must be used.`,
        pluginId,
        required: capability,
      })
    }
  }

  for (const qssFeature of collectRequiredQssFeatures(compatibility)) {
    if (!hasCapabilityFieldValue(hostInfo.renderer.capabilities, 'qssFeatures', qssFeature)) {
      diagnostics.push({
        code: 'NATIVE_REQUIRED_QSS_FEATURE_MISSING',
        severity: 'error',
        message: `Required native QSS feature "${qssFeature}" is not available.`,
        pluginId,
        required: qssFeature,
      })
    }
  }

  for (const quiComponent of collectRequiredQuiComponents(compatibility)) {
    if (!hasCapabilityFieldValue(hostInfo.renderer.capabilities, 'quiComponents', quiComponent)) {
      diagnostics.push({
        code: 'NATIVE_REQUIRED_QUI_COMPONENT_MISSING',
        severity: 'error',
        message: `Required native QUI component "${quiComponent}" is not available.`,
        pluginId,
        required: quiComponent,
      })
    }
  }

  return {
    ok: diagnostics.every(diagnostic => diagnostic.severity !== 'error'),
    diagnostics,
  }
}

export function hasCompatibleCapability(capabilities: readonly RendererTargetCapability[], required: string): boolean {
  return capabilities.some(capability => isCapabilityCompatible(required, capability.id))
}

function collectRequiredQssFeatures(compatibility: RuntimePackageNativeRendererCompatibility): string[] {
  return uniqueStrings([
    ...(compatibility.qssFeatures || []),
    ...(compatibility.qssTargets || []),
  ])
}

function collectRequiredQuiComponents(compatibility: RuntimePackageNativeRendererCompatibility): string[] {
  return uniqueStrings([
    ...(compatibility.quiComponents || []),
    ...(compatibility.uiSurfaces || []),
  ])
}

function uniqueStrings(values: readonly string[]): string[] {
  return Array.from(new Set(values))
}

function hasCapabilityFieldValue(
  capabilities: readonly RendererTargetCapability[],
  field: 'qssFeatures' | 'quiComponents',
  required: string,
): boolean {
  return capabilities.some(capability => (capability[field] || []).includes(required))
}

function satisfiesMajorRange(version: string, range: string): boolean {
  const normalized = range.trim()
  if (!normalized || normalized === '*')
    return true
  if (normalized.startsWith('^')) {
    return majorOf(version) === majorOf(normalized.slice(1))
  }
  if (normalized.startsWith('>=')) {
    return compareVersions(version, normalized.slice(2)) >= 0
  }
  return version === normalized
}

function majorOf(version: string): number {
  return Number.parseInt(version.split('.')[0] || '0', 10)
}

function compareVersions(left: string, right: string): number {
  const leftParts = left.split('.').map(part => Number.parseInt(part, 10) || 0)
  const rightParts = right.split('.').map(part => Number.parseInt(part, 10) || 0)
  const length = Math.max(leftParts.length, rightParts.length)
  for (let index = 0; index < length; index += 1) {
    const delta = (leftParts[index] || 0) - (rightParts[index] || 0)
    if (delta !== 0)
      return delta
  }
  return 0
}
