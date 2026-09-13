import type { NativeCapabilityManifestSha256 } from './capability-manifest'
import type { QuaNativeRendererInfo, RendererTargetCapability } from './capabilities'
import type { TargetBundleNativeRendererInfo } from './target-bundle'
import { createNativeCapabilityManifestHash } from './capability-manifest'

export interface CreateTargetBundleNativeRendererInfoInput {
  packageName?: '@quajs/native-renderer'
  version: string
  backend?: 'wgpu'
  backendVersion?: string
  capabilities: readonly RendererTargetCapability[]
}

export function createTargetBundleNativeRendererInfo(
  input: CreateTargetBundleNativeRendererInfoInput | QuaNativeRendererInfo,
  sha256: NativeCapabilityManifestSha256,
): TargetBundleNativeRendererInfo {
  return {
    packageName: input.packageName || '@quajs/native-renderer',
    version: input.version,
    backend: input.backend || 'wgpu',
    ...(input.backendVersion ? { backendVersion: input.backendVersion } : {}),
    capabilityIds: input.capabilities.map(capability => capability.id),
    capabilityManifestHash: createNativeCapabilityManifestHash(input.capabilities, sha256),
  }
}
