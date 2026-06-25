import type {
  TargetBundleDependencyReference,
  TargetBundleManifest,
  TargetBundleManifestValidationResult,
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
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { assertTargetBundleManifest, createTargetCoreSelection } from '@quajs/native-contracts'

export const QUA_NATIVE_TARGET_BUNDLE_MANIFEST_FILE = 'target-bundle-manifest.json'

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

export interface EmitQuaProjectNativeTargetBundleManifestOptions
  extends QuaProjectNativeTargetBundleManifestOptions {
  manifestPath?: string
}

export interface EmittedQuaProjectNativeTargetBundleManifest {
  artifactDir: string
  manifest: TargetBundleManifest
  manifestPath: string
  validation: TargetBundleManifestValidationResult
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

export async function emitQuaProjectNativeTargetBundleManifest(
  plan: QuaProjectNativeArtifactPlan,
  options: EmitQuaProjectNativeTargetBundleManifestOptions,
): Promise<EmittedQuaProjectNativeTargetBundleManifest> {
  const manifest = createQuaProjectNativeTargetBundleManifest(plan, options)
  const validation = assertTargetBundleManifest(manifest, { expectedTarget: 'native' })
  const manifestPath = options.manifestPath || join(plan.artifactDir, QUA_NATIVE_TARGET_BUNDLE_MANIFEST_FILE)
  await mkdir(dirname(manifestPath), { recursive: true })
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  return {
    artifactDir: plan.artifactDir,
    manifest,
    manifestPath,
    validation,
  }
}

function sanitizePathSegment(value: string): string {
  return value.trim().replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '') || 'unknown'
}
