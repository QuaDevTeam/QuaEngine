import type { RuntimeModuleLoader, RuntimeTrustPolicy } from '@quajs/engine'
import type { QuaNativeHostApi } from '@quajs/native-contracts'

export interface NativeRuntimeAdapters {
  host: QuaNativeHostApi
  runtimeModuleLoader?: RuntimeModuleLoader
  trustPolicy?: RuntimeTrustPolicy
}

export function createNativeRuntimeAdapters(host: QuaNativeHostApi): NativeRuntimeAdapters {
  return {
    host,
  }
}

