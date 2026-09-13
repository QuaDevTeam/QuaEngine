import type { QuaNativeRuntimeInfo } from './capabilities'
import type { TargetBundleNativeRuntimeInfo } from './target-bundle-native-runtime-validation'

export interface CreateTargetBundleNativeRuntimeInfoInput {
  quickjsVersion: string
  nativeRuntimeVersion: string
  assetAdapterVersion: string
  storeAdapterVersion: string
}

export function createTargetBundleNativeRuntimeInfo(
  input: CreateTargetBundleNativeRuntimeInfoInput | QuaNativeRuntimeInfo,
): TargetBundleNativeRuntimeInfo {
  return {
    quickjsVersion: input.quickjsVersion,
    nativeRuntimeVersion: input.nativeRuntimeVersion,
    assetAdapterVersion: input.assetAdapterVersion,
    storeAdapterVersion: input.storeAdapterVersion,
  }
}
