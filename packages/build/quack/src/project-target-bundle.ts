import type {
  QuaTargetBootstrap,
  TargetBundleManifest,
  TargetBundleManifestValidationResult,
} from '@quajs/native-contracts'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { assertTargetBundleManifest } from '@quajs/native-contracts'

export const QUA_TARGET_BUNDLE_MANIFEST_FILE = 'target-bundle-manifest.json'

export interface EmitQuaTargetBundleManifestOptions {
  artifactDir: string
  expectedTarget: QuaTargetBootstrap
  manifest: TargetBundleManifest
  manifestPath?: string
}

export interface EmittedQuaTargetBundleManifest {
  artifactDir: string
  manifest: TargetBundleManifest
  manifestPath: string
  validation: TargetBundleManifestValidationResult
}

export async function emitQuaTargetBundleManifest(
  options: EmitQuaTargetBundleManifestOptions,
): Promise<EmittedQuaTargetBundleManifest> {
  const validation = assertTargetBundleManifest(options.manifest, {
    expectedTarget: options.expectedTarget,
  })
  const manifestPath = options.manifestPath || join(options.artifactDir, QUA_TARGET_BUNDLE_MANIFEST_FILE)
  await mkdir(dirname(manifestPath), { recursive: true })
  await writeFile(manifestPath, `${JSON.stringify(options.manifest, null, 2)}\n`, 'utf8')
  return {
    artifactDir: options.artifactDir,
    manifest: options.manifest,
    manifestPath,
    validation,
  }
}
