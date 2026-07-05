import type { QuaTargetBootstrap } from './bootstrap'
import type { TargetBundleManifest } from './target-bundle'

export interface TargetBundleNativeRendererDiagnostic {
  code:
    | 'TARGET_BUNDLE_NATIVE_RENDERER_MISSING'
    | 'TARGET_BUNDLE_NATIVE_RENDERER_UNEXPECTED'
    | 'TARGET_BUNDLE_NATIVE_RENDERER_PACKAGE_MISMATCH'
    | 'TARGET_BUNDLE_NATIVE_RENDERER_BACKEND_MISMATCH'
    | 'TARGET_BUNDLE_NATIVE_RENDERER_VERSION_MISSING'
    | 'TARGET_BUNDLE_NATIVE_RENDERER_VERSION_INVALID'
    | 'TARGET_BUNDLE_NATIVE_RENDERER_VERSION_EMPTY'
    | 'TARGET_BUNDLE_NATIVE_RENDERER_CAPABILITY_MANIFEST_HASH_MISSING'
    | 'TARGET_BUNDLE_NATIVE_RENDERER_CAPABILITY_MANIFEST_HASH_INVALID'
    | 'TARGET_BUNDLE_NATIVE_RENDERER_CAPABILITY_MANIFEST_HASH_EMPTY'
    | 'TARGET_BUNDLE_NATIVE_RENDERER_CAPABILITY_IDS_MISSING'
    | 'TARGET_BUNDLE_NATIVE_RENDERER_CAPABILITY_IDS_INVALID'
    | 'TARGET_BUNDLE_NATIVE_RENDERER_CAPABILITY_ID_EMPTY'
  target: QuaTargetBootstrap
  packageName?: string
  backend?: string
  value?: string
  message: string
}

export function checkTargetBundleNativeRendererInfo(
  manifest: TargetBundleManifest,
  target: QuaTargetBootstrap = manifest.target,
): TargetBundleNativeRendererDiagnostic[] {
  const nativeRenderer = manifest.nativeRenderer
  if (target !== 'native') {
    return nativeRenderer
      ? [{
          code: 'TARGET_BUNDLE_NATIVE_RENDERER_UNEXPECTED',
          target,
          message: `Target bundle manifest for "${target}" must not include native renderer metadata.`,
        }]
      : []
  }

  if (!nativeRenderer) {
    return [{
      code: 'TARGET_BUNDLE_NATIVE_RENDERER_MISSING',
      target,
      message: 'Native target bundle manifest must include native renderer version and capability metadata.',
    }]
  }

  const diagnostics: TargetBundleNativeRendererDiagnostic[] = []
  if (nativeRenderer.packageName !== '@quajs/native-renderer') {
    diagnostics.push({
      code: 'TARGET_BUNDLE_NATIVE_RENDERER_PACKAGE_MISMATCH',
      target,
      packageName: nativeRenderer.packageName,
      message: `Native target bundle manifest must use native renderer package "@quajs/native-renderer", got "${nativeRenderer.packageName}".`,
    })
  }
  if (nativeRenderer.backend !== 'wgpu') {
    diagnostics.push({
      code: 'TARGET_BUNDLE_NATIVE_RENDERER_BACKEND_MISMATCH',
      target,
      backend: nativeRenderer.backend,
      message: `Native target bundle manifest must use native renderer backend "wgpu", got "${nativeRenderer.backend}".`,
    })
  }
  const version = (nativeRenderer as unknown as Record<string, unknown>).version
  if (version === undefined) {
    diagnostics.push({
      code: 'TARGET_BUNDLE_NATIVE_RENDERER_VERSION_MISSING',
      target,
      message: 'Native target bundle manifest must include native renderer version.',
    })
  }
  else if (typeof version !== 'string') {
    diagnostics.push({
      code: 'TARGET_BUNDLE_NATIVE_RENDERER_VERSION_INVALID',
      target,
      message: 'Native target bundle manifest nativeRenderer.version must be a string.',
    })
  }
  else if (version.trim() === '') {
    diagnostics.push({
      code: 'TARGET_BUNDLE_NATIVE_RENDERER_VERSION_EMPTY',
      target,
      value: version,
      message: 'Native target bundle manifest nativeRenderer.version must not be empty.',
    })
  }

  const capabilityManifestHash = (nativeRenderer as unknown as Record<string, unknown>).capabilityManifestHash
  if (capabilityManifestHash === undefined) {
    diagnostics.push({
      code: 'TARGET_BUNDLE_NATIVE_RENDERER_CAPABILITY_MANIFEST_HASH_MISSING',
      target,
      message: 'Native target bundle manifest must include a native renderer capability manifest hash.',
    })
  }
  else if (typeof capabilityManifestHash !== 'string') {
    diagnostics.push({
      code: 'TARGET_BUNDLE_NATIVE_RENDERER_CAPABILITY_MANIFEST_HASH_INVALID',
      target,
      message: 'Native target bundle manifest nativeRenderer.capabilityManifestHash must be a string.',
    })
  }
  else if (capabilityManifestHash.trim() === '') {
    diagnostics.push({
      code: 'TARGET_BUNDLE_NATIVE_RENDERER_CAPABILITY_MANIFEST_HASH_EMPTY',
      target,
      value: capabilityManifestHash,
      message: 'Native target bundle manifest nativeRenderer.capabilityManifestHash must not be empty.',
    })
  }

  const capabilityIds = (nativeRenderer as unknown as Record<string, unknown>).capabilityIds
  if (capabilityIds === undefined || (Array.isArray(capabilityIds) && capabilityIds.length === 0)) {
    diagnostics.push({
      code: 'TARGET_BUNDLE_NATIVE_RENDERER_CAPABILITY_IDS_MISSING',
      target,
      message: 'Native target bundle manifest must include at least one native renderer capability id.',
    })
  }
  else if (!Array.isArray(capabilityIds) || capabilityIds.some(capabilityId => typeof capabilityId !== 'string')) {
    diagnostics.push({
      code: 'TARGET_BUNDLE_NATIVE_RENDERER_CAPABILITY_IDS_INVALID',
      target,
      message: 'Native target bundle manifest nativeRenderer.capabilityIds must be an array of strings.',
    })
  }
  else if (capabilityIds.some(capabilityId => capabilityId.trim() === '')) {
    diagnostics.push({
      code: 'TARGET_BUNDLE_NATIVE_RENDERER_CAPABILITY_ID_EMPTY',
      target,
      message: 'Native target bundle manifest nativeRenderer.capabilityIds must not include empty values.',
    })
  }
  return diagnostics
}
