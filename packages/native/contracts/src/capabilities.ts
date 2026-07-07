import type {
  NativeQuickJsEvaluationRequest,
  NativeQuickJsEvaluationResponse,
  NativeQuickJsGameStepFactoryCallRequest,
  NativeQuickJsGameStepFactoryCallResponse,
  NativeQuickJsGameStepRunRequest,
  NativeQuickJsGameStepRunResponse,
  NativeQuickJsGameStepResumeRequest,
  NativeQuickJsModuleExportCallRequest,
  NativeQuickJsModuleExportCallResponse,
  NativeQuickJsModuleNamespaceRecord,
  NativeQuickJsModuleNamespaceSummary,
  NativeQuickJsReleaseNamespaceRequest,
  NativeQuickJsReleasePackageRequest,
} from './quickjs'

export {
  createNativeHostApiFromBridge,
  createNativeHostApiRequest,
  createNativeSignatureVerifyWireRequest,
  nativeBytesToWire,
  nativeWireBytesToUint8Array,
} from './native-host-bridge'

export type QuaRendererTarget = 'web' | 'cocos' | 'native'

export type QuaNativePlatform = 'macos' | 'windows' | 'linux'

export type QuaNativeProfile = 'debug' | 'release'

export type RendererCapabilityFallback = 'render-empty' | 'warn-once' | 'reject-package' | 'no-op'

export interface RendererTargetCapability {
  id: string
  target: QuaRendererTarget
  version: string
  ownerPackage: string
  projectionKeys: readonly string[]
  intentEvents?: readonly string[]
  assetKinds?: readonly string[]
  qssFeatures?: readonly string[]
  quiComponents?: readonly string[]
  fallback: RendererCapabilityFallback
}

export interface QuaNativeAppInfo {
  name: string
  bundleId: string
  version: string
  buildNumber: string
  profile: QuaNativeProfile
  platform: QuaNativePlatform
  arch: string
}

export interface QuaNativeRendererInfo {
  packageName: '@quajs/native-renderer'
  version: string
  backend: 'wgpu'
  backendVersion?: string
  capabilityManifestHash: string
  capabilities: readonly RendererTargetCapability[]
}

export interface QuaNativeRuntimeInfo {
  quickjsVersion: string
  nativeRuntimeVersion: string
  assetAdapterVersion: string
  storeAdapterVersion: string
}

export interface QuaNativeHostInfo {
  app: QuaNativeAppInfo
  renderer: QuaNativeRendererInfo
  runtime: QuaNativeRuntimeInfo
}

export interface NativeMountedBundleInfo {
  name: string
  logicalName?: string
  version?: number
  hash?: string
  runtimePackageId?: string
}

export interface NativeAssetReadRequest {
  url: string
  bundleName?: string
  assetId?: string
}

export interface NativeSignatureVerifyRequest {
  bytes: Uint8Array
  signature: Uint8Array
  keyId?: string
  algorithm?: string
}

export interface NativeSignatureVerifyWireRequest {
  bytes: number[]
  signature: number[]
  keyId?: string
  algorithm?: string
}

export interface NativeRendererIntent {
  type: string
  payloadJson?: string
}

export interface NativeRendererIntentInput {
  type: string
  payload?: unknown
  payloadJson?: string
}

export type NativeHostApiRequest =
  | { method: 'getHostInfo' }
  | { method: 'readAssetBytes', params: NativeAssetReadRequest }
  | { method: 'listMountedBundles' }
  | { method: 'readStorage', params: NativeHostApiStorageKeyRequest }
  | { method: 'writeStorage', params: NativeHostApiWriteStorageRequest }
  | { method: 'deleteStorage', params: NativeHostApiStorageKeyRequest }
  | { method: 'listStorageKeys', params: NativeHostApiListStorageKeysRequest }
  | { method: 'hashBytes', params: NativeHostApiHashBytesRequest }
  | { method: 'verifySignature', params: NativeSignatureVerifyWireRequest }
  | { method: 'evaluateQuickJsModule', params: NativeQuickJsEvaluationRequest }
  | { method: 'callQuickJsModuleExport', params: NativeQuickJsModuleExportCallRequest }
  | { method: 'callQuickJsGameStepFactory', params: NativeQuickJsGameStepFactoryCallRequest }
  | { method: 'callQuickJsGameStepRun', params: NativeQuickJsGameStepRunRequest }
  | { method: 'resumeQuickJsGameStepRun', params: NativeQuickJsGameStepResumeRequest }
  | { method: 'releaseQuickJsModuleNamespace', params: NativeQuickJsReleaseNamespaceRequest }
  | { method: 'releaseQuickJsPackageNamespaces', params: NativeQuickJsReleasePackageRequest }
  | { method: 'getQuickJsNamespaceSummary' }
  | { method: 'getQuickJsPackageNamespaceSummary', params: NativeQuickJsReleasePackageRequest }
  | { method: 'emitRendererIntent', params: NativeRendererIntent }

export interface NativeHostApiStorageKeyRequest {
  key: string
}

export interface NativeHostApiWriteStorageRequest {
  key: string
  value: number[]
}

export interface NativeHostApiListStorageKeysRequest {
  prefix: string
}

export interface NativeHostApiHashBytesRequest {
  bytes: number[]
  algorithm: string
}

export interface NativeHostApiErrorInfo {
  code: 'assetNotFound' | 'storageKeyNotFound' | 'unsupportedOperation' | 'invalidRequest'
  message: string
  assetUrl?: string
  storageKey?: string
  detail?: string
}

export interface NativeHostApiResponseValueByType {
  hostInfo: QuaNativeHostInfo
  assetBytes: number[]
  mountedBundles: NativeMountedBundleInfo[]
  storageBytes: number[] | null | undefined
  storageKeys: string[]
  hash: string
  signatureValid: boolean
  quickJsEvaluation: NativeQuickJsEvaluationResponse
  quickJsExportCall: NativeQuickJsModuleExportCallResponse
  quickJsGameStepFactoryCall: NativeQuickJsGameStepFactoryCallResponse
  quickJsGameStepRun: NativeQuickJsGameStepRunResponse
  quickJsNamespace: NativeQuickJsModuleNamespaceRecord | null | undefined
  quickJsNamespaces: NativeQuickJsModuleNamespaceRecord[]
  quickJsNamespaceSummary: NativeQuickJsModuleNamespaceSummary
}

export type NativeHostApiResponsePayload = {
  [TType in keyof NativeHostApiResponseValueByType]: {
    type: TType
    value: NativeHostApiResponseValueByType[TType]
  }
}[keyof NativeHostApiResponseValueByType]

export interface NativeHostApiResponse {
  ok: boolean
  payload?: NativeHostApiResponsePayload
  error?: NativeHostApiErrorInfo
}

export type NativeHostBridgeDispatch = (request: NativeHostApiRequest) => NativeHostApiResponse | Promise<NativeHostApiResponse>

export interface QuaNativeHostApi {
  getHostInfo: () => QuaNativeHostInfo | Promise<QuaNativeHostInfo>
  readAssetBytes: (request: NativeAssetReadRequest) => Promise<Uint8Array>
  listMountedBundles?: () => Promise<NativeMountedBundleInfo[]>
  readStorage: (key: string) => Promise<Uint8Array | undefined>
  writeStorage: (key: string, value: Uint8Array) => Promise<void>
  deleteStorage: (key: string) => Promise<void>
  listStorageKeys?: (prefix: string) => Promise<string[]>
  hashBytes: (bytes: Uint8Array, algorithm: 'sha256') => Promise<string>
  verifySignature?: (request: NativeSignatureVerifyRequest) => Promise<boolean>
  evaluateQuickJsModule?: (request: NativeQuickJsEvaluationRequest) => Promise<NativeQuickJsEvaluationResponse>
  callQuickJsModuleExport?: (request: NativeQuickJsModuleExportCallRequest) => Promise<NativeQuickJsModuleExportCallResponse>
  callQuickJsGameStepFactory?: (request: NativeQuickJsGameStepFactoryCallRequest) => Promise<NativeQuickJsGameStepFactoryCallResponse>
  callQuickJsGameStepRun?: (request: NativeQuickJsGameStepRunRequest) => Promise<NativeQuickJsGameStepRunResponse>
  resumeQuickJsGameStepRun?: (request: NativeQuickJsGameStepResumeRequest) => Promise<NativeQuickJsGameStepRunResponse>
  releaseQuickJsModuleNamespace?: (moduleNamespaceId: string) => Promise<NativeQuickJsModuleNamespaceRecord | undefined>
  releaseQuickJsPackageNamespaces?: (packageId: string) => Promise<NativeQuickJsModuleNamespaceRecord[]>
  getQuickJsNamespaceSummary?: () => Promise<NativeQuickJsModuleNamespaceSummary>
  getQuickJsPackageNamespaceSummary?: (packageId: string) => Promise<NativeQuickJsModuleNamespaceSummary>
  emitRendererIntent?: (event: NativeRendererIntent) => void
}

export function createNativeRendererIntent(input: NativeRendererIntentInput): NativeRendererIntent {
  if (input.payloadJson !== undefined) {
    return {
      type: input.type,
      payloadJson: input.payloadJson,
    }
  }

  if (!Object.prototype.hasOwnProperty.call(input, 'payload')) {
    return {
      type: input.type,
    }
  }

  const payloadJson = JSON.stringify(input.payload)
  return payloadJson === undefined
    ? { type: input.type }
    : { type: input.type, payloadJson }
}

export function parseNativeRendererIntentPayload<TPayload = unknown>(
  event: NativeRendererIntent,
): TPayload | undefined {
  if (event.payloadJson === undefined)
    return undefined
  return JSON.parse(event.payloadJson) as TPayload
}

export function getCapabilityMajorVersion(capability: string): number | undefined {
  const version = capability.split('@')[1]
  if (!version)
    return undefined
  const major = Number.parseInt(version.split('.')[0] || '', 10)
  return Number.isFinite(major) ? major : undefined
}

export function getCapabilityName(capability: string): string {
  return capability.split('@')[0] || capability
}

export function isCapabilityCompatible(required: string, available: string): boolean {
  if (getCapabilityName(required) !== getCapabilityName(available))
    return false
  const requiredMajor = getCapabilityMajorVersion(required)
  const availableMajor = getCapabilityMajorVersion(available)
  return requiredMajor === undefined || availableMajor === undefined || requiredMajor === availableMajor
}
