import type {
  TargetBundleDependencyReference,
  TargetBundleManifest,
  TargetBundleNativeRendererInfo,
  TargetBundlePackageReference,
  TargetBundleRendererEntryReference,
  TargetBundleRuntimePackageRecord,
} from '@quajs/native-contracts'
import type { AssetBundleTarget } from './core/types'
import type {
  NormalizedQuaProjectConfig,
  QuaProjectLayoutInput,
  QuaProjectNativePlatform,
  QuaProjectNativeProfile,
} from './project'
import { join } from 'node:path'
import { createTargetCoreSelection } from '@quajs/native-contracts'

export interface QuaProjectNativeArtifactPlan {
  target: 'native'
  platform: QuaProjectNativePlatform
  profile: QuaProjectNativeProfile
  outputDir: string
  artifactDir: string
  app: {
    bundleId: string
    version: string
    buildNumber: string
    icon?: string
  }
  layout: QuaProjectLayoutInput
  assetTarget?: AssetBundleTarget
  build: Record<string, unknown>
}

export interface QuaProjectNativeTargetBundleManifestOptions {
  dependencies?: readonly (TargetBundlePackageReference | TargetBundleDependencyReference)[]
  nativeRenderer: TargetBundleNativeRendererInfo
  rendererEntries?: readonly (TargetBundlePackageReference | TargetBundleRendererEntryReference)[]
  runtimePackages?: readonly TargetBundleRuntimePackageRecord[]
}

export function createQuaProjectNativeArtifactPlans(
  project: NormalizedQuaProjectConfig,
): QuaProjectNativeArtifactPlan[] {
  const native = project.targets.native
  if (!native?.enabled) {
    return []
  }

  const versionSegment = `${sanitizePathSegment(native.app.version)}-${sanitizePathSegment(native.app.buildNumber)}`
  const plans: QuaProjectNativeArtifactPlan[] = []
  for (const profile of native.profiles) {
    for (const platform of native.platforms) {
      plans.push({
        target: 'native',
        platform,
        profile,
        outputDir: native.outputDir,
        artifactDir: join(native.outputDir, profile, versionSegment, platform),
        app: { ...native.app },
        layout: native.layout,
        assetTarget: native.assetTarget ? { ...native.assetTarget } : undefined,
        build: { ...native.build },
      })
    }
  }
  return plans
}

export function createQuaProjectNativeTargetBundleManifest(
  plan: QuaProjectNativeArtifactPlan,
  options: QuaProjectNativeTargetBundleManifestOptions,
): TargetBundleManifest {
  const targetCore = createTargetCoreSelection('native')
  return {
    schemaVersion: 1,
    target: 'native',
    profile: plan.profile,
    platform: plan.platform,
    app: { ...plan.app },
    nativeRenderer: { ...options.nativeRenderer },
    targetCoreResolver: targetCore.targetCoreResolver,
    selectedCorePluginFamily: targetCore.selectedCorePluginFamily,
    selectedCoreAdapters: targetCore.selectedCoreAdapters,
    dependencies: options.dependencies || [],
    rendererEntries: options.rendererEntries || [],
    runtimePackages: options.runtimePackages || [],
  }
}

function sanitizePathSegment(value: string): string {
  return value.trim().replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '') || 'unknown'
}
