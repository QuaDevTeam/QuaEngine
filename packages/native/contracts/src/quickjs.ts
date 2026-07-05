import { nativeBytesToWire } from './capabilities'
import {
  DEFAULT_FORBIDDEN_NATIVE_PAYLOAD_EXTENSIONS,
  isForbiddenNativeAssetReference,
  isForbiddenNativePayload,
} from './package-guard'

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

export interface NativeQuickJsModuleNamespaceRecord {
  id: string
  packageId: string
  bundleName: string
  assetName: string
  kind: NativeQuickJsRuntimeModuleKind
  moduleBytes: number
  codeBytes: number
  revision: number
}

export interface NativeQuickJsModuleNamespaceSummary {
  namespaceCount: number
  packageCount: number
  moduleBytes: number
  codeBytes: number
  totalBytes: number
}

export interface NativeQuickJsReleaseNamespaceRequest {
  moduleNamespaceId: string
}

export interface NativeQuickJsReleasePackageRequest {
  packageId: string
}

export type NativeQuickJsEvaluationErrorCode
  = | 'missingAssetName'
    | 'forbiddenAssetName'
    | 'forbiddenNativePayload'
    | 'unsupportedModuleAsset'
    | 'moduleTooLarge'
    | 'evaluationFailed'
    | 'unsupportedRuntime'

export interface NativeQuickJsEvaluationError {
  code: NativeQuickJsEvaluationErrorCode
  message: string
  assetName?: string
  detail?: string
}

export interface NativeQuickJsEvaluationValidationResult {
  ok: boolean
  errors: NativeQuickJsEvaluationError[]
}

export interface ValidateNativeQuickJsEvaluationRequestOptions {
  forbiddenExtensions?: readonly string[] | ReadonlySet<string>
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
  const request = {
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
  assertNativeQuickJsEvaluationRequest(request)
  return request
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

export function validateNativeQuickJsEvaluationRequest(
  request: NativeQuickJsEvaluationRequest,
  options: ValidateNativeQuickJsEvaluationRequestOptions = {},
): NativeQuickJsEvaluationValidationResult {
  const errors: NativeQuickJsEvaluationError[] = []
  const assetName = request.module.assetName
  const forbiddenExtensions = normalizeForbiddenNativePayloadExtensions(options.forbiddenExtensions)

  if (!assetName) {
    errors.push({
      code: 'missingAssetName',
      message: 'Native QuickJS module evaluation requires a package-relative assetName.',
    })
  }
  else {
    if (isForbiddenNativeQuickJsModuleAssetName(assetName)) {
      errors.push({
        code: 'forbiddenAssetName',
        assetName,
        message: `Native QuickJS module assetName "${assetName}" must be package-relative and use forward-slash package paths.`,
      })
    }
    if (isForbiddenNativePayload(assetName, forbiddenExtensions)) {
      errors.push({
        code: 'forbiddenNativePayload',
        assetName,
        message: `Native QuickJS module assetName "${assetName}" must not reference a native payload.`,
      })
    }
    if (!isNativeQuickJsModuleAsset(assetName)) {
      errors.push({
        code: 'unsupportedModuleAsset',
        assetName,
        message: `Native QuickJS module assetName "${assetName}" must reference a JavaScript module asset (.js, .mjs, or .cjs).`,
      })
    }
  }

  const maxModuleBytes = request.limits.maxModuleBytes
  collectQuickJsModuleByteLimitErrors(errors, assetName, 'module bytes', request.module.bytes.length, maxModuleBytes)
  collectQuickJsModuleByteLimitErrors(errors, assetName, 'code bytes', utf8ByteLength(request.module.code), maxModuleBytes)

  return {
    ok: errors.length === 0,
    errors,
  }
}

export function assertNativeQuickJsEvaluationRequest(
  request: NativeQuickJsEvaluationRequest,
  options: ValidateNativeQuickJsEvaluationRequestOptions = {},
): void {
  const result = validateNativeQuickJsEvaluationRequest(request, options)
  if (!result.ok) {
    throw new Error(result.errors.map(error => error.message).join('; '))
  }
}

function normalizeForbiddenNativePayloadExtensions(
  forbiddenExtensions: readonly string[] | ReadonlySet<string> | undefined,
): ReadonlySet<string> {
  return new Set(Array.from(forbiddenExtensions || DEFAULT_FORBIDDEN_NATIVE_PAYLOAD_EXTENSIONS)
    .map(extension => extension.toLowerCase()))
}

function isForbiddenNativeQuickJsModuleAssetName(assetName: string): boolean {
  return assetName.includes('\\') || isForbiddenNativeAssetReference(assetName)
}

function isNativeQuickJsModuleAsset(assetName: string): boolean {
  const normalized = stripAssetReferenceSuffix(assetName).toLowerCase().split(/[\\/]/).pop() || ''
  return normalized.endsWith('.js')
    || normalized.endsWith('.mjs')
    || normalized.endsWith('.cjs')
}

function stripAssetReferenceSuffix(assetName: string): string {
  const suffixIndex = assetName.search(/[?#]/)
  return suffixIndex >= 0 ? assetName.slice(0, suffixIndex) : assetName
}

function collectQuickJsModuleByteLimitErrors(
  errors: NativeQuickJsEvaluationError[],
  assetName: string,
  field: string,
  actualBytes: number,
  maxModuleBytes: number,
): void {
  if (actualBytes <= maxModuleBytes)
    return
  errors.push({
    code: 'moduleTooLarge',
    assetName,
    detail: `${field}: ${actualBytes}; maxModuleBytes: ${maxModuleBytes}`,
    message: `Native QuickJS module "${assetName || '<missing>'}" ${field} length ${actualBytes} exceeds maxModuleBytes ${maxModuleBytes}.`,
  })
}

function utf8ByteLength(input: string): number {
  let bytes = 0
  for (let index = 0; index < input.length; index += 1) {
    const code = input.charCodeAt(index)
    if (code < 0x80) {
      bytes += 1
    }
    else if (code < 0x800) {
      bytes += 2
    }
    else if (code >= 0xD800 && code <= 0xDBFF) {
      const next = input.charCodeAt(index + 1)
      if (next >= 0xDC00 && next <= 0xDFFF) {
        bytes += 4
        index += 1
      }
      else {
        bytes += 3
      }
    }
    else {
      bytes += 3
    }
  }
  return bytes
}
