import { nativeBytesToWire } from './capabilities'

export type NativeQuickJsRuntimeModuleKind = 'script' | 'scene' | 'enginePlugin' | 'storeMigration'

export interface NativeQuickJsRuntimeModuleRecord {
  assetName: string
  bundleName: string
  packageId: string
  kind: NativeQuickJsRuntimeModuleKind
  code: string
  bytes: number[]
}

export interface NativeQuickJsSandboxLimits {
  maxHeapBytes: number
  maxStackBytes: number
  maxModuleBytes: number
  maxExecutionTicks: number
}

export interface NativeQuickJsEvaluationRequest {
  module: NativeQuickJsRuntimeModuleRecord
  limits: NativeQuickJsSandboxLimits
}

export interface NativeQuickJsEvaluationResponse {
  ok: boolean
  moduleNamespaceId?: string
  error?: NativeQuickJsEvaluationError
}

export type NativeQuickJsEvaluationErrorCode
  = | 'missingAssetName'
    | 'forbiddenAssetName'
    | 'moduleTooLarge'
    | 'evaluationFailed'
    | 'unsupportedRuntime'

export interface NativeQuickJsEvaluationError {
  code: NativeQuickJsEvaluationErrorCode
  message: string
  assetName?: string
  detail?: string
}

export const DEFAULT_NATIVE_QUICKJS_SANDBOX_LIMITS: NativeQuickJsSandboxLimits = {
  maxHeapBytes: 64 * 1024 * 1024,
  maxStackBytes: 2 * 1024 * 1024,
  maxModuleBytes: 4 * 1024 * 1024,
  maxExecutionTicks: 1_000_000,
}

export interface CreateNativeQuickJsEvaluationRequestInput {
  assetName: string
  bundleName: string
  packageId: string
  kind: NativeQuickJsRuntimeModuleKind
  code: string
  bytes: Uint8Array
  limits?: Partial<NativeQuickJsSandboxLimits>
}

export function createNativeQuickJsEvaluationRequest(
  input: CreateNativeQuickJsEvaluationRequestInput,
): NativeQuickJsEvaluationRequest {
  return {
    module: {
      assetName: input.assetName,
      bundleName: input.bundleName,
      packageId: input.packageId,
      kind: input.kind,
      code: input.code,
      bytes: nativeBytesToWire(input.bytes),
    },
    limits: {
      ...DEFAULT_NATIVE_QUICKJS_SANDBOX_LIMITS,
      ...(input.limits || {}),
    },
  }
}

export function assertNativeQuickJsEvaluationResponse(
  response: NativeQuickJsEvaluationResponse,
): string {
  if (!response.ok) {
    throw new Error(response.error?.message || 'Native QuickJS module evaluation failed.')
  }
  if (!response.moduleNamespaceId) {
    throw new Error('Native QuickJS module evaluation succeeded without a module namespace id.')
  }
  return response.moduleNamespaceId
}
