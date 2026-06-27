import type { RendererTargetCapability } from './capabilities'
import type { RuntimePackageNativeRendererCompatibility } from './compatibility'
import { isCapabilityCompatible } from './capabilities'

export function normalizeNativeRendererCompatibility(
  compatibility: RuntimePackageNativeRendererCompatibility | undefined,
): RuntimePackageNativeRendererCompatibility | undefined {
  if (!compatibility)
    return undefined

  return {
    ...compatibility,
    packageName: compatibility.packageName || compatibility.rendererPackage || compatibility.renderer,
    versionRange: compatibility.versionRange || compatibility.rendererVersion || compatibility.version,
    capabilities: uniqueStrings([
      ...(compatibility.capabilities || []),
      ...(compatibility.capabilityIds || []),
    ]),
    optionalCapabilities: uniqueStrings([
      ...(compatibility.optionalCapabilities || []),
      ...(compatibility.optionalCapabilityIds || []),
    ]),
  }
}

export function hasCompatibleCapability(capabilities: readonly RendererTargetCapability[], required: string): boolean {
  return capabilities.some(capability => isCapabilityCompatible(required, capability.id))
}

export function collectRequiredQssFeatures(compatibility: RuntimePackageNativeRendererCompatibility): string[] {
  return uniqueStrings([
    ...(compatibility.qssFeatures || []),
    ...(compatibility.qssTargets || []),
  ])
}

export function collectRequiredQuiComponents(compatibility: RuntimePackageNativeRendererCompatibility): string[] {
  return uniqueStrings([
    ...(compatibility.quiComponents || []),
    ...(compatibility.uiSurfaces || []),
  ])
}

export function uniqueStrings(values: readonly string[]): string[] {
  return Array.from(new Set(values))
}

export function hasCapabilityFieldValue(
  capabilities: readonly RendererTargetCapability[],
  field: 'assetKinds' | 'qssFeatures' | 'quiComponents',
  required: string,
): boolean {
  return capabilities.some(capability => (capability[field] || []).includes(required))
}

export function satisfiesNativeRendererVersionRange(version: string, range: string): boolean {
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
