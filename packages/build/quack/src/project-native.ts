import type { AssetBundleTarget } from './core/types'
import type {
  NormalizedQuaProjectConfig,
  QuaProjectLayoutInput,
  QuaProjectNativePlatform,
  QuaProjectNativeProfile,
} from './project'
import { join } from 'node:path'

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

function sanitizePathSegment(value: string): string {
  return value.trim().replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '') || 'unknown'
}
