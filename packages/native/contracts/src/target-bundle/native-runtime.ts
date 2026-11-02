import type { QuaNativeRuntimeInfo } from '../host/capabilities'
import type { TargetBundleNativeRuntimeInfo } from './native-runtime-validation'

export interface CreateTargetBundleNativeRuntimeInfoInput {
  jscVersion: string
  nativeRuntimeVersion: string
  assetAdapterVersion: string
  storeAdapterVersion: string
}

export function createTargetBundleNativeRuntimeInfo(
  input: CreateTargetBundleNativeRuntimeInfoInput | QuaNativeRuntimeInfo,
): TargetBundleNativeRuntimeInfo {
  return {
    jscVersion: input.jscVersion,
    nativeRuntimeVersion: input.nativeRuntimeVersion,
    assetAdapterVersion: input.assetAdapterVersion,
    storeAdapterVersion: input.storeAdapterVersion,
  }
}
