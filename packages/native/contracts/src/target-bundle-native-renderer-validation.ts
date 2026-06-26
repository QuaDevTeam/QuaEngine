import type { QuaTargetBootstrap } from './bootstrap'
import type { TargetBundleManifest } from './target-bundle'

export interface TargetBundleNativeRendererDiagnostic {
  code:
    | 'TARGET_BUNDLE_NATIVE_RENDERER_MISSING'
    | 'TARGET_BUNDLE_NATIVE_RENDERER_UNEXPECTED'
    | 'TARGET_BUNDLE_NATIVE_RENDERER_PACKAGE_MISMATCH'
    | 'TARGET_BUNDLE_NATIVE_RENDERER_BACKEND_MISMATCH'
    | 'TARGET_BUNDLE_NATIVE_RENDERER_VERSION_MISSING'
    | 'TARGET_BUNDLE_NATIVE_RENDERER_CAPABILITY_MANIFEST_HASH_MISSING'
    | 'TARGET_BUNDLE_NATIVE_RENDERER_CAPABILITY_IDS_MISSING'
  target: QuaTargetBootstrap
  packageName?: string
  backend?: string
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
  if (!nativeRenderer.version) {
    diagnostics.push({
      code: 'TARGET_BUNDLE_NATIVE_RENDERER_VERSION_MISSING',
      target,
      message: 'Native target bundle manifest must include native renderer version.',
    })
  }
  if (!nativeRenderer.capabilityManifestHash) {
    diagnostics.push({
      code: 'TARGET_BUNDLE_NATIVE_RENDERER_CAPABILITY_MANIFEST_HASH_MISSING',
      target,
      message: 'Native target bundle manifest must include a native renderer capability manifest hash.',
    })
  }
  if (!nativeRenderer.capabilityIds?.length) {
    diagnostics.push({
      code: 'TARGET_BUNDLE_NATIVE_RENDERER_CAPABILITY_IDS_MISSING',
      target,
      message: 'Native target bundle manifest must include at least one native renderer capability id.',
    })
  }
  return diagnostics
}
