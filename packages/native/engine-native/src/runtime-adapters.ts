import type { RuntimeModuleLoader, RuntimeTrustPolicy } from '@quajs/engine'
import type {
  NativeGuardDynamicBundleRecord,
  NativeGuardRuntimePackageManifest,
  QuaNativeHostApi,
  QuaNativeHostInfo,
  RuntimePackageNativeRendererCompatibility,
} from '@quajs/native-contracts'
import { assertNativeRuntimePackageGuard } from '@quajs/native-contracts'
import { assertNativeRuntimePackageCompatibility } from './compatibility'
import { createNativeHostQuickJsModuleEvaluator, createNativeRuntimeModuleLoader } from './runtime-module-loader'
import type { NativeQuickJsModuleNamespaceResolver, NativeRuntimeModuleEvaluator } from './runtime-module-loader'

declare const TextEncoder: {
  new(): { encode: (input: string) => Uint8Array }
}

export interface NativeRuntimeAdapters {
  host: QuaNativeHostApi
  runtimeModuleLoader?: RuntimeModuleLoader
  trustPolicy: RuntimeTrustPolicy
}

export interface NativeRuntimeAdaptersOptions {
  allowUnsignedInDevelopment?: boolean
  hostInfo?: QuaNativeHostInfo
  moduleEvaluator?: NativeRuntimeModuleEvaluator
  moduleNamespaceResolver?: NativeQuickJsModuleNamespaceResolver
  requireSignature?: boolean
  runtimeModuleLoader?: RuntimeModuleLoader
}

export function createNativeRuntimeAdapters(host: QuaNativeHostApi, options: NativeRuntimeAdaptersOptions = {}): NativeRuntimeAdapters {
  const moduleEvaluator = options.moduleEvaluator
    || (options.moduleNamespaceResolver
      ? createNativeHostQuickJsModuleEvaluator(host, options.moduleNamespaceResolver)
      : undefined)

  return {
    host,
    runtimeModuleLoader: options.runtimeModuleLoader || (moduleEvaluator
      ? createNativeRuntimeModuleLoader({ evaluator: moduleEvaluator })
      : undefined),
    trustPolicy: createNativeRuntimeTrustPolicy(host, options),
  }
}

export function createNativeRuntimeTrustPolicy(
  host: QuaNativeHostApi,
  options: Pick<NativeRuntimeAdaptersOptions, 'allowUnsignedInDevelopment' | 'hostInfo' | 'requireSignature'> = {},
): RuntimeTrustPolicy {
  let resolvedHostInfo = options.hostInfo
  const getHostInfo = async () => {
    resolvedHostInfo ||= await host.getHostInfo()
    return resolvedHostInfo
  }

  return {
    allowUnsignedInDevelopment: options.allowUnsignedInDevelopment,
    requireSignature: options.requireSignature,
    async verifyPackage(ctx) {
      const runtimePackage = ctx.package as unknown as NativeGuardRuntimePackageManifest
      assertNativeRuntimePackageGuard({
        package: runtimePackage,
        bundle: ctx.bundle as unknown as NativeGuardDynamicBundleRecord,
      })
      const nativeRenderer = getRuntimePackageNativeRendererCompatibility(runtimePackage)
      if (nativeRenderer) {
        assertNativeRuntimePackageCompatibility(await getHostInfo(), {
          pluginId: runtimePackage.id,
          nativeRenderer,
        })
      }
      if (!ctx.package.signature?.value)
        return true
      if (!host.verifySignature)
        throw new Error(`Runtime package "${ctx.package.id}" is signed but the native host does not provide signature verification.`)
      if (!ctx.package.integrity?.hash)
        throw new Error(`Runtime package "${ctx.package.id}" is signed but missing integrity metadata for native verification.`)
      const signature = decodeSignature(ctx.package.signature.value)
      const bytes = new TextEncoder().encode(ctx.package.integrity.hash)
      return await host.verifySignature({
        bytes,
        signature,
        keyId: ctx.package.signature.keyId,
        algorithm: ctx.package.signature.algorithm,
      })
    },
  }
}

function getRuntimePackageNativeRendererCompatibility(
  runtimePackage: NativeGuardRuntimePackageManifest,
): RuntimePackageNativeRendererCompatibility | undefined {
  const metadata = runtimePackage.metadata
  if (!metadata)
    return undefined
  if (isRecord(metadata.nativeRenderer))
    return metadata.nativeRenderer as RuntimePackageNativeRendererCompatibility
  if (isRecord(metadata.renderers) && isRecord(metadata.renderers.native))
    return metadata.renderers.native as RuntimePackageNativeRendererCompatibility
  return undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function decodeSignature(value: string): Uint8Array {
  if (value.startsWith('base64:'))
    return base64ToBytes(value.slice('base64:'.length))
  if (/^[0-9a-f]+$/i.test(value) && value.length % 2 === 0)
    return hexToBytes(value)
  return new TextEncoder().encode(value)
}

function hexToBytes(value: string): Uint8Array {
  const bytes = new Uint8Array(value.length / 2)
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16)
  }
  return bytes
}

function base64ToBytes(value: string): Uint8Array {
  const normalized = value.replace(/\s+/g, '')
  if (normalized.length % 4 !== 0)
    throw new Error('Invalid native package signature base64 payload.')
  const padding = normalized.endsWith('==') ? 2 : normalized.endsWith('=') ? 1 : 0
  const bytes = new Uint8Array((normalized.length / 4) * 3 - padding)
  let offset = 0
  for (let index = 0; index < normalized.length; index += 4) {
    const first = base64Value(normalized[index])
    const second = base64Value(normalized[index + 1])
    const third = normalized[index + 2] === '=' ? 0 : base64Value(normalized[index + 2])
    const fourth = normalized[index + 3] === '=' ? 0 : base64Value(normalized[index + 3])
    const chunk = (first << 18) | (second << 12) | (third << 6) | fourth
    if (offset < bytes.length)
      bytes[offset++] = (chunk >> 16) & 255
    if (offset < bytes.length)
      bytes[offset++] = (chunk >> 8) & 255
    if (offset < bytes.length)
      bytes[offset++] = chunk & 255
  }
  return bytes
}

function base64Value(char: string): number {
  const value = BASE64_ALPHABET.indexOf(char)
  if (value < 0)
    throw new Error('Invalid native package signature base64 character.')
  return value
}

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
