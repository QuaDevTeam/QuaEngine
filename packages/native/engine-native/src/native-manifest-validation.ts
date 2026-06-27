import type {
  ExclusiveTargetBootstrapValidationResult,
  QuaNativeHostInfo,
  TargetBundleManifest,
  TargetBundleManifestValidationResult,
  TargetBundleNativeRendererInfo,
  TargetBundleNativeRuntimeInfo,
} from '@quajs/native-contracts'
import { validateExclusiveTargetBootstrap, validateTargetBundleManifest } from '@quajs/native-contracts'

export function checkNativeAppManifestCompatibility(
  hostInfo: QuaNativeHostInfo,
  manifest: TargetBundleManifest,
): string[] {
  const diagnostics: string[] = []
  if (manifest.app?.bundleId && manifest.app.bundleId !== hostInfo.app.bundleId) {
    diagnostics.push(
      `Native target bundle manifest app.bundleId "${manifest.app.bundleId}" does not match host app bundleId "${hostInfo.app.bundleId}".`,
    )
  }
  if (manifest.app?.version && manifest.app.version !== hostInfo.app.version) {
    diagnostics.push(
      `Native target bundle manifest app.version "${manifest.app.version}" does not match host app version "${hostInfo.app.version}".`,
    )
  }
  if (manifest.app?.buildNumber && manifest.app.buildNumber !== hostInfo.app.buildNumber) {
    diagnostics.push(
      `Native target bundle manifest app.buildNumber "${manifest.app.buildNumber}" does not match host app buildNumber "${hostInfo.app.buildNumber}".`,
    )
  }
  if (manifest.profile && manifest.profile !== hostInfo.app.profile) {
    diagnostics.push(
      `Native target bundle manifest profile "${manifest.profile}" does not match host app profile "${hostInfo.app.profile}".`,
    )
  }
  if (manifest.platform && manifest.platform !== hostInfo.app.platform) {
    diagnostics.push(
      `Native target bundle manifest platform "${manifest.platform}" does not match host app platform "${hostInfo.app.platform}".`,
    )
  }
  return diagnostics
}

export function checkNativeRendererManifestCompatibility(
  hostInfo: QuaNativeHostInfo,
  manifestRenderer?: TargetBundleNativeRendererInfo,
): string[] {
  const diagnostics: string[] = []
  if (!manifestRenderer)
    return diagnostics

  if (manifestRenderer.packageName && manifestRenderer.packageName !== hostInfo.renderer.packageName) {
    diagnostics.push(
      `Native target bundle manifest renderer package "${manifestRenderer.packageName}" does not match host renderer package "${hostInfo.renderer.packageName}".`,
    )
  }
  if (manifestRenderer.version && manifestRenderer.version !== hostInfo.renderer.version) {
    diagnostics.push(
      `Native target bundle manifest renderer version "${manifestRenderer.version}" does not match host renderer version "${hostInfo.renderer.version}".`,
    )
  }
  if (manifestRenderer.backend && manifestRenderer.backend !== hostInfo.renderer.backend) {
    diagnostics.push(
      `Native target bundle manifest renderer backend "${manifestRenderer.backend}" does not match host renderer backend "${hostInfo.renderer.backend}".`,
    )
  }
  if (
    manifestRenderer.backendVersion
    && manifestRenderer.backendVersion !== hostInfo.renderer.backendVersion
  ) {
    diagnostics.push(
      `Native target bundle manifest renderer backendVersion "${manifestRenderer.backendVersion}" does not match host renderer backendVersion "${hostInfo.renderer.backendVersion ?? '<none>'}".`,
    )
  }
  if (
    manifestRenderer.capabilityManifestHash
    && manifestRenderer.capabilityManifestHash !== hostInfo.renderer.capabilityManifestHash
  ) {
    diagnostics.push(
      `Native target bundle manifest renderer capability hash "${manifestRenderer.capabilityManifestHash}" does not match host renderer capability hash "${hostInfo.renderer.capabilityManifestHash}".`,
    )
  }

  const hostCapabilityIds = new Set(hostInfo.renderer.capabilities.map(capability => capability.id))
  for (const capabilityId of manifestRenderer.capabilityIds || []) {
    if (!hostCapabilityIds.has(capabilityId)) {
      diagnostics.push(
        `Native target bundle manifest renderer capability "${capabilityId}" is not provided by the native host.`,
      )
    }
  }
  return diagnostics
}

export function checkNativeRuntimeManifestCompatibility(
  hostInfo: QuaNativeHostInfo,
  manifestRuntime?: TargetBundleNativeRuntimeInfo,
): string[] {
  const diagnostics: string[] = []
  if (!manifestRuntime)
    return diagnostics

  if (manifestRuntime.quickjsVersion !== hostInfo.runtime.quickjsVersion) {
    diagnostics.push(
      `Native target bundle manifest QuickJS version "${manifestRuntime.quickjsVersion}" does not match host QuickJS version "${hostInfo.runtime.quickjsVersion}".`,
    )
  }
  if (manifestRuntime.nativeRuntimeVersion !== hostInfo.runtime.nativeRuntimeVersion) {
    diagnostics.push(
      `Native target bundle manifest native runtime version "${manifestRuntime.nativeRuntimeVersion}" does not match host native runtime version "${hostInfo.runtime.nativeRuntimeVersion}".`,
    )
  }
  if (manifestRuntime.assetAdapterVersion !== hostInfo.runtime.assetAdapterVersion) {
    diagnostics.push(
      `Native target bundle manifest asset adapter version "${manifestRuntime.assetAdapterVersion}" does not match host asset adapter version "${hostInfo.runtime.assetAdapterVersion}".`,
    )
  }
  if (manifestRuntime.storeAdapterVersion !== hostInfo.runtime.storeAdapterVersion) {
    diagnostics.push(
      `Native target bundle manifest store adapter version "${manifestRuntime.storeAdapterVersion}" does not match host store adapter version "${hostInfo.runtime.storeAdapterVersion}".`,
    )
  }
  return diagnostics
}

export function checkNativeTargetBootstrap(
  packageNames: readonly string[],
): ExclusiveTargetBootstrapValidationResult {
  return validateExclusiveTargetBootstrap(packageNames, {
    expectedTarget: 'native',
  })
}

export function assertNativeTargetBootstrap(
  packageNames: readonly string[],
): ExclusiveTargetBootstrapValidationResult {
  const result = checkNativeTargetBootstrap(packageNames)
  if (!result.ok)
    throw new Error(formatNativeTargetBootstrapError(result))
  return result
}

export function checkNativeTargetBundleManifest(
  manifest: TargetBundleManifest,
): TargetBundleManifestValidationResult {
  return validateTargetBundleManifest(manifest, {
    expectedTarget: 'native',
  })
}

export function assertNativeTargetBundleManifest(
  manifest: TargetBundleManifest,
): TargetBundleManifestValidationResult {
  const result = checkNativeTargetBundleManifest(manifest)
  if (!result.ok)
    throw new Error(formatNativeTargetBundleManifestError(result))
  return result
}

export function formatNativeTargetBootstrapError(result: ExclusiveTargetBootstrapValidationResult): string {
  const diagnostics = [
    ...result.diagnostics,
    ...(result.targetValidation?.diagnostics || []),
  ].map(diagnostic => diagnostic.message)

  return [
    'Native target bootstrap validation failed.',
    ...diagnostics,
  ].join(' ')
}

export function formatNativeTargetBundleManifestError(result: TargetBundleManifestValidationResult): string {
  const diagnostics = result.diagnostics.map(diagnostic => diagnostic.message)

  return [
    'Native target bundle manifest validation failed.',
    ...diagnostics,
  ].join(' ')
}

export function formatNativeManifestCompatibilityError(diagnostics: readonly string[]): string {
  return [
    'Native manifest compatibility validation failed.',
    ...diagnostics,
  ].join(' ')
}
