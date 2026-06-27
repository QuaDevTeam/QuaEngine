import type {
  TargetBundleDependencyReference,
  TargetBundleManifest,
  TargetBundleNativeRendererInfo,
  TargetBundlePackageReference,
  TargetBundleProjectGraphRecord,
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
import type { EmittedQuaTargetBundleManifest } from './project-target-bundle'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { createTargetCoreSelection } from '@quajs/native-contracts'
import {
  emitQuaTargetBundleManifest,
  QUA_TARGET_BUNDLE_MANIFEST_FILE,
} from './project-target-bundle'

export const QUA_NATIVE_TARGET_BUNDLE_MANIFEST_FILE = QUA_TARGET_BUNDLE_MANIFEST_FILE

export interface QuaProjectNativeArtifactPlan {
  target: 'native'
  platform: QuaProjectNativePlatform
  profile: QuaProjectNativeProfile
  outputDir: string
  versionSegment: string
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
  projectGraphs?: readonly TargetBundleProjectGraphRecord[]
  rendererEntries?: readonly (TargetBundlePackageReference | TargetBundleRendererEntryReference)[]
  runtimePackages?: readonly TargetBundleRuntimePackageRecord[]
}

export interface EmitQuaProjectNativeTargetBundleManifestOptions
  extends QuaProjectNativeTargetBundleManifestOptions {
  manifestPath?: string
}

export type EmittedQuaProjectNativeTargetBundleManifest = EmittedQuaTargetBundleManifest

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
        versionSegment,
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
  const dependencies = options.dependencies || []
  const rendererEntries = options.rendererEntries || []
  const runtimePackages = options.runtimePackages || []
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
    dependencies,
    rendererEntries,
    runtimePackages,
    projectGraphs: createNativeProjectGraphs(plan, {
      dependencies,
      projectGraphs: options.projectGraphs || [],
      rendererEntries,
      runtimePackages,
    }),
  }
}

export async function emitQuaProjectNativeTargetBundleManifest(
  plan: QuaProjectNativeArtifactPlan,
  options: EmitQuaProjectNativeTargetBundleManifestOptions,
): Promise<EmittedQuaProjectNativeTargetBundleManifest> {
  const manifest = createQuaProjectNativeTargetBundleManifest(plan, options)
  const manifestPath = options.manifestPath || join(plan.artifactDir, QUA_NATIVE_TARGET_BUNDLE_MANIFEST_FILE)
  await assertNativeReleaseManifestWritable(plan, manifest, manifestPath)
  return emitQuaTargetBundleManifest({
    artifactDir: plan.artifactDir,
    expectedTarget: 'native',
    manifest,
    manifestPath,
  })
}

function sanitizePathSegment(value: string): string {
  return value.trim().replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '') || 'unknown'
}

async function assertNativeReleaseManifestWritable(
  plan: QuaProjectNativeArtifactPlan,
  manifest: TargetBundleManifest,
  manifestPath: string,
): Promise<void> {
  if (plan.profile !== 'release') {
    return
  }

  let existingJson: string
  try {
    existingJson = await readFile(manifestPath, 'utf8')
  }
  catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') {
      return
    }
    throw error
  }

  let existingManifest: unknown
  try {
    existingManifest = JSON.parse(existingJson)
  }
  catch (error) {
    throw new Error(
      `Native release artifact "${plan.artifactDir}" already contains an unreadable ${QUA_NATIVE_TARGET_BUNDLE_MANIFEST_FILE}; refusing to overwrite release ${plan.versionSegment}/${plan.platform}.`,
      { cause: error },
    )
  }

  if (isDeepStrictEqual(existingManifest, manifest)) {
    return
  }

  throw new Error(
    `Native release artifact "${plan.artifactDir}" already contains a different ${QUA_NATIVE_TARGET_BUNDLE_MANIFEST_FILE}; refusing to overwrite release ${plan.versionSegment}/${plan.platform}. Use a new app version/buildNumber or clean the release artifact deliberately.`,
  )
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error
}

function createNativeProjectGraphs(
  plan: QuaProjectNativeArtifactPlan,
  options: {
    dependencies: NonNullable<TargetBundleManifest['dependencies']>
    projectGraphs: readonly TargetBundleProjectGraphRecord[]
    rendererEntries: NonNullable<TargetBundleManifest['rendererEntries']>
    runtimePackages: readonly TargetBundleRuntimePackageRecord[]
  },
): readonly TargetBundleProjectGraphRecord[] {
  return [
    ...options.projectGraphs,
    {
      id: `native.${plan.profile}.${plan.platform}.post-bundle`,
      kind: 'post-bundle',
      references: [
        ...options.dependencies,
        ...options.rendererEntries,
        ...options.runtimePackages.flatMap(runtimePackage => [
          ...(runtimePackage.executableDependencies || []),
          ...(runtimePackage.rendererEntries || []),
        ]),
      ],
    },
  ]
}
