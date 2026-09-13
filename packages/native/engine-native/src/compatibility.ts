import type {
  CheckNativeCompatibilityOptions,
  NativeCompatibilityResult,
  QuaNativeHostInfo,
  RuntimePackageNativeRendererCompatibility,
} from '@quajs/native-contracts'
import { checkNativeCompatibility as checkNativeCompatibilityContract } from '@quajs/native-contracts'

export interface NativeRuntimePackageCompatibilityInput {
  pluginId?: string
  nativeRenderer?: RuntimePackageNativeRendererCompatibility
}

export function checkNativeRuntimePackageCompatibility(
  hostInfo: QuaNativeHostInfo,
  input: NativeRuntimePackageCompatibilityInput,
): NativeCompatibilityResult {
  const options: CheckNativeCompatibilityOptions = {
    hostInfo,
    pluginId: input.pluginId,
    compatibility: input.nativeRenderer,
  }
  return checkNativeCompatibilityContract(options)
}

export function assertNativeRuntimePackageCompatibility(
  hostInfo: QuaNativeHostInfo,
  input: NativeRuntimePackageCompatibilityInput,
): void {
  const result = checkNativeRuntimePackageCompatibility(hostInfo, input)
  if (!result.ok) {
    const message = result.diagnostics
      .filter(diagnostic => diagnostic.severity === 'error')
      .map(diagnostic => diagnostic.message)
      .join('; ')
    throw new Error(message || 'Native runtime package compatibility check failed.')
  }
}

