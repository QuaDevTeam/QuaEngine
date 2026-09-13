import type { QuaTargetBootstrap } from './bootstrap'
import type { QuaNativePlatform } from './capabilities'

export type TargetBundleProfile = 'debug' | 'release'

const TARGET_BUNDLE_PROFILES = new Set(['debug', 'release'] as const)
const NATIVE_TARGET_BUNDLE_PLATFORMS = new Set<QuaNativePlatform>(['macos', 'windows', 'linux'])

export interface TargetBundleAppInfo {
  bundleId?: string
  version?: string
  buildNumber?: string
  icon?: string
}

export interface TargetBundleMetadataManifest {
  target: QuaTargetBootstrap
  profile?: unknown
  platform?: unknown
  app?: TargetBundleAppInfo
}

export interface TargetBundleArtifactMetadataDiagnostic {
  code:
    | 'TARGET_BUNDLE_PROFILE_MISSING'
    | 'TARGET_BUNDLE_PROFILE_INVALID'
    | 'TARGET_BUNDLE_PLATFORM_MISSING'
    | 'TARGET_BUNDLE_PLATFORM_EMPTY'
    | 'TARGET_BUNDLE_PLATFORM_INVALID'
  target: QuaTargetBootstrap
  field: 'profile' | 'platform'
  value?: string
  message: string
}

export interface TargetBundleAppMetadataDiagnostic {
  code: 'TARGET_BUNDLE_APP_METADATA_MISSING' | 'TARGET_BUNDLE_APP_METADATA_EMPTY'
  target: QuaTargetBootstrap
  field: 'bundleId' | 'version' | 'buildNumber' | 'icon'
  message: string
}

export function checkArtifactMetadata(
  manifest: TargetBundleMetadataManifest,
  expectedTarget: QuaTargetBootstrap = manifest.target,
): TargetBundleArtifactMetadataDiagnostic[] {
  if (expectedTarget !== 'native')
    return []

  const diagnostics: TargetBundleArtifactMetadataDiagnostic[] = []
  const profile = manifest.profile
  const platform = manifest.platform

  if (profile === undefined) {
    diagnostics.push({
      code: 'TARGET_BUNDLE_PROFILE_MISSING',
      target: expectedTarget,
      field: 'profile',
      message: 'Native target bundle manifest must include profile.',
    })
  }
  else if (typeof profile !== 'string' || !TARGET_BUNDLE_PROFILES.has(profile as TargetBundleProfile)) {
    diagnostics.push({
      code: 'TARGET_BUNDLE_PROFILE_INVALID',
      target: expectedTarget,
      field: 'profile',
      value: typeof profile === 'string' ? profile : undefined,
      message: 'Native target bundle manifest profile must be "debug" or "release".',
    })
  }

  if (platform === undefined) {
    diagnostics.push({
      code: 'TARGET_BUNDLE_PLATFORM_MISSING',
      target: expectedTarget,
      field: 'platform',
      message: 'Native target bundle manifest must include platform.',
    })
  }
  else if (typeof platform !== 'string' || platform.trim() === '') {
    diagnostics.push({
      code: 'TARGET_BUNDLE_PLATFORM_EMPTY',
      target: expectedTarget,
      field: 'platform',
      value: typeof platform === 'string' ? platform : undefined,
      message: 'Native target bundle manifest platform must not be empty.',
    })
  }
  else if (!NATIVE_TARGET_BUNDLE_PLATFORMS.has(platform as QuaNativePlatform)) {
    diagnostics.push({
      code: 'TARGET_BUNDLE_PLATFORM_INVALID',
      target: expectedTarget,
      field: 'platform',
      value: platform,
      message: 'Native target bundle manifest platform must be "macos", "windows", or "linux".',
    })
  }

  return diagnostics
}

export function checkAppMetadata(
  manifest: TargetBundleMetadataManifest,
  expectedTarget: QuaTargetBootstrap = manifest.target,
): TargetBundleAppMetadataDiagnostic[] {
  if (expectedTarget !== 'native')
    return []

  const diagnostics: TargetBundleAppMetadataDiagnostic[] = []
  for (const field of ['bundleId', 'version', 'buildNumber', 'icon'] as const) {
    const value = manifest.app?.[field]
    if (value === undefined) {
      diagnostics.push({
        code: 'TARGET_BUNDLE_APP_METADATA_MISSING',
        target: expectedTarget,
        field,
        message: `Native target bundle manifest must include app.${field}.`,
      })
    }
    else if (value.trim() === '') {
      diagnostics.push({
        code: 'TARGET_BUNDLE_APP_METADATA_EMPTY',
        target: expectedTarget,
        field,
        message: `Native target bundle manifest app.${field} must not be empty.`,
      })
    }
  }
  return diagnostics
}
