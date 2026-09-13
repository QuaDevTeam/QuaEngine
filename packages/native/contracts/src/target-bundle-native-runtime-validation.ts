import type { QuaTargetBootstrap } from './bootstrap'
import type { TargetBundleManifest } from './target-bundle'

export interface TargetBundleNativeRuntimeInfo {
  quickjsVersion: string
  nativeRuntimeVersion: string
  assetAdapterVersion: string
  storeAdapterVersion: string
}

export interface TargetBundleNativeRuntimeDiagnostic {
  code:
    | 'TARGET_BUNDLE_NATIVE_RUNTIME_MISSING'
    | 'TARGET_BUNDLE_NATIVE_RUNTIME_UNEXPECTED'
    | 'TARGET_BUNDLE_NATIVE_RUNTIME_FIELD_MISSING'
    | 'TARGET_BUNDLE_NATIVE_RUNTIME_FIELD_INVALID'
    | 'TARGET_BUNDLE_NATIVE_RUNTIME_FIELD_EMPTY'
  target: QuaTargetBootstrap
  field?: keyof TargetBundleNativeRuntimeInfo
  value?: string
  message: string
}

const NATIVE_RUNTIME_FIELDS = [
  'quickjsVersion',
  'nativeRuntimeVersion',
  'assetAdapterVersion',
  'storeAdapterVersion',
] as const satisfies readonly (keyof TargetBundleNativeRuntimeInfo)[]

export function checkTargetBundleNativeRuntimeInfo(
  manifest: TargetBundleManifest,
  target: QuaTargetBootstrap = manifest.target,
): TargetBundleNativeRuntimeDiagnostic[] {
  const nativeRuntime = manifest.nativeRuntime
  if (target !== 'native') {
    return nativeRuntime
      ? [{
          code: 'TARGET_BUNDLE_NATIVE_RUNTIME_UNEXPECTED',
          target,
          message: `Target bundle manifest for "${target}" must not include native runtime metadata.`,
        }]
      : []
  }

  if (!nativeRuntime) {
    return [{
      code: 'TARGET_BUNDLE_NATIVE_RUNTIME_MISSING',
      target,
      message: 'Native target bundle manifest must include native runtime, QuickJS, asset adapter, and store adapter version metadata.',
    }]
  }

  const diagnostics: TargetBundleNativeRuntimeDiagnostic[] = []
  for (const field of NATIVE_RUNTIME_FIELDS) {
    const value = (nativeRuntime as unknown as Record<string, unknown>)[field]
    if (value === undefined) {
      diagnostics.push({
        code: 'TARGET_BUNDLE_NATIVE_RUNTIME_FIELD_MISSING',
        target,
        field,
        message: `Native target bundle manifest must include nativeRuntime.${field}.`,
      })
    }
    else if (typeof value !== 'string') {
      diagnostics.push({
        code: 'TARGET_BUNDLE_NATIVE_RUNTIME_FIELD_INVALID',
        target,
        field,
        message: `Native target bundle manifest nativeRuntime.${field} must be a string.`,
      })
    }
    else if (value.trim() === '') {
      diagnostics.push({
        code: 'TARGET_BUNDLE_NATIVE_RUNTIME_FIELD_EMPTY',
        target,
        field,
        value,
        message: `Native target bundle manifest nativeRuntime.${field} must not be empty.`,
      })
    }
  }
  return diagnostics
}
