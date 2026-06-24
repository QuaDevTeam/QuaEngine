import type {
  NativeQuickJsEvaluationRequest,
  NativeQuickJsEvaluationResponse,
  NativeQuickJsModuleNamespaceRecord,
  NativeQuickJsModuleNamespaceSummary,
  NativeQuickJsReleaseNamespaceRequest,
  NativeQuickJsReleasePackageRequest,
} from './quickjs'

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

export function createNativeSignatureVerifyWireRequest(
  request: NativeSignatureVerifyRequest,
): NativeSignatureVerifyWireRequest {
  return {
    bytes: Array.from(request.bytes),
    signature: Array.from(request.signature),
    ...(request.keyId !== undefined ? { keyId: request.keyId } : {}),
    ...(request.algorithm !== undefined ? { algorithm: request.algorithm } : {}),
  }
}

export function createNativeHostApiRequest(request: NativeHostApiRequest): NativeHostApiRequest {
  return request
}

export function nativeBytesToWire(bytes: Uint8Array): number[] {
  return Array.from(bytes)
}

export function nativeWireBytesToUint8Array(bytes: readonly number[] | null | undefined): Uint8Array | undefined {
  return bytes == null ? undefined : new Uint8Array(bytes)
}

export function createNativeHostApiFromBridge(dispatch: NativeHostBridgeDispatch): QuaNativeHostApi {
  const call = async <TPayload extends NativeHostApiResponsePayload['type']>(
    request: NativeHostApiRequest,
    expectedType: TPayload,
  ): Promise<NativeHostApiResponseValueByType[TPayload]> => {
    const response = await dispatch(request)
    if (!response.ok)
      throw nativeHostBridgeError(response.error)
    if (response.payload?.type !== expectedType)
      throw new Error(`Native host bridge returned unexpected payload for "${request.method}".`)
    return response.payload.value as NativeHostApiResponseValueByType[TPayload]
  }

  return {
    getHostInfo: () => call({ method: 'getHostInfo' }, 'hostInfo'),
    async readAssetBytes(request) {
      return nativeWireBytesToUint8Array(await call({ method: 'readAssetBytes', params: request }, 'assetBytes'))!
    },
    listMountedBundles: () => call({ method: 'listMountedBundles' }, 'mountedBundles'),
    async readStorage(key) {
      return nativeWireBytesToUint8Array(await call({ method: 'readStorage', params: { key } }, 'storageBytes'))
    },
    async writeStorage(key, value) {
      await callVoid(dispatch, {
        method: 'writeStorage',
        params: {
          key,
          value: nativeBytesToWire(value),
        },
      })
    },
    async deleteStorage(key) {
      await callVoid(dispatch, { method: 'deleteStorage', params: { key } })
    },
    listStorageKeys: prefix => call({ method: 'listStorageKeys', params: { prefix } }, 'storageKeys'),
    hashBytes: (bytes, algorithm) => call({
      method: 'hashBytes',
      params: {
        bytes: nativeBytesToWire(bytes),
        algorithm,
      },
    }, 'hash'),
    verifySignature: request => call({
      method: 'verifySignature',
      params: createNativeSignatureVerifyWireRequest(request),
    }, 'signatureValid'),
    evaluateQuickJsModule: request => call({
      method: 'evaluateQuickJsModule',
      params: request,
    }, 'quickJsEvaluation'),
    releaseQuickJsModuleNamespace: moduleNamespaceId => call({
      method: 'releaseQuickJsModuleNamespace',
      params: { moduleNamespaceId },
    }, 'quickJsNamespace').then(value => value ?? undefined),
    releaseQuickJsPackageNamespaces: packageId => call({
      method: 'releaseQuickJsPackageNamespaces',
      params: { packageId },
    }, 'quickJsNamespaces'),
    getQuickJsNamespaceSummary: () => call({
      method: 'getQuickJsNamespaceSummary',
    }, 'quickJsNamespaceSummary'),
    getQuickJsPackageNamespaceSummary: packageId => call({
      method: 'getQuickJsPackageNamespaceSummary',
      params: { packageId },
    }, 'quickJsNamespaceSummary'),
    emitRendererIntent(event) {
      void callVoid(dispatch, { method: 'emitRendererIntent', params: event })
    },
  }
}

async function callVoid(dispatch: NativeHostBridgeDispatch, request: NativeHostApiRequest): Promise<void> {
  const response = await dispatch(request)
  if (!response.ok)
    throw nativeHostBridgeError(response.error)
  if (response.payload !== undefined)
    throw new Error(`Native host bridge returned unexpected payload for "${request.method}".`)
}

function nativeHostBridgeError(error: NativeHostApiErrorInfo | undefined): Error {
  if (!error)
    return new Error('Native host bridge request failed.')
  return new Error(error.message)
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
