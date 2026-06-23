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

export interface NativeRendererIntent {
  type: string
  payload?: unknown
}

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
  emitRendererIntent?: (event: NativeRendererIntent) => void
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

