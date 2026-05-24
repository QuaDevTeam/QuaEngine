import type { AssetType, BundleManifest, DynamicBundleRecord, QuaAssets, RuntimePackageManifest } from '@quajs/assets'
import type {
  RuntimeLoadedMigrationModule,
  RuntimeLoadedPluginModule,
  RuntimeLoadedSceneModule,
  RuntimeLoadedScriptModule,
  RuntimeModuleLoader,
  RuntimePackagePluginManifest,
  RuntimeTrustPolicy,
} from '@quajs/engine'
import type { RendererPlugin } from '@quajs/render-core'

export const QUA_RUNTIME_SIGNATURE_ALGORITHM = 'ecdsa-p256-sha256'
export const QUA_RUNTIME_SIGNATURE_SCHEMA = 'quajs.runtime-package-signature.v1'

export type QuaCspMode = 'both' | 'hash' | 'nonce'
export type QuaRuntimeModuleUrlMode = 'blob-only' | 'same-origin-with-blob-fallback'

interface RuntimeWebModuleRecord {
  assetName?: string
  module?: unknown
}

export interface RuntimePackageSignaturePayload {
  schema: typeof QUA_RUNTIME_SIGNATURE_SCHEMA
  bundle: {
    bundleVersion?: number
    format: BundleManifest['format']
    merkleRoot?: string
  }
  runtimePackage: RuntimePackageManifest
}

export interface WebRuntimeTrustKey {
  id: string
  key: JsonWebKey | string | CryptoKey
}

export interface WebRuntimeTrustPolicyOptions {
  allowUnsignedInDevelopment?: boolean
  keys: readonly WebRuntimeTrustKey[]
  requireSignature?: boolean
}

export interface RuntimePackageSignatureVerifyOptions {
  keys: readonly WebRuntimeTrustKey[]
}

export interface QuaCspPolicyOptions {
  allowRuntimeBlobModules?: boolean
  connectSrc?: readonly string[]
  hashes?: {
    scripts?: readonly string[]
    styles?: readonly string[]
  }
  mode?: QuaCspMode
  nonce?: string
  reportUri?: string
  trustedTypes?: boolean
}

export type QuaCspPolicy = Record<string, string[]>

export interface WebRuntimeModuleLoaderOptions {
  allowBlobFallback?: boolean
  assets?: QuaAssets
  moduleUrlMode?: QuaRuntimeModuleUrlMode
  resolveBundleName?: (packageId: string) => string | Promise<string>
}

export interface WebRuntimeRendererPluginLoaderOptions extends WebRuntimeModuleLoaderOptions {}

interface ModuleUrlHandle {
  cleanup: () => void
  url: string
}

export function createWebRuntimeTrustPolicy(options: WebRuntimeTrustPolicyOptions): RuntimeTrustPolicy {
  return {
    allowUnsignedInDevelopment: options.allowUnsignedInDevelopment,
    requireSignature: options.requireSignature,
    verifyPackage: (ctx) => {
      if (
        !ctx.package.signature?.value
        && options.allowUnsignedInDevelopment === true
        && options.requireSignature !== true
        && !isProductionEnvironment()
      ) {
        return true
      }
      return verifyRuntimePackageSignature(ctx, { keys: options.keys })
    },
  }
}

export async function verifyRuntimePackageSignature(
  ctx: { bundle: DynamicBundleRecord, package: RuntimePackageManifest },
  options: RuntimePackageSignatureVerifyOptions,
): Promise<boolean> {
  const signature = ctx.package.signature
  if (!signature?.value) {
    return false
  }
  if (signature.algorithm && signature.algorithm !== QUA_RUNTIME_SIGNATURE_ALGORITHM) {
    return false
  }
  const keyRecord = options.keys.find(key => key.id === signature.keyId)
  if (!keyRecord) {
    return false
  }

  const manifest: BundleManifest = {
    ...ctx.bundle.manifest,
    runtimePackage: ctx.package,
  }
  const payload = createRuntimePackageSignaturePayload(manifest)
  const bytes = new TextEncoder().encode(canonicalJson(payload))
  const key = await importPublicKey(keyRecord.key)
  return await crypto.subtle.verify({
    name: 'ECDSA',
    hash: 'SHA-256',
  }, key, toArrayBuffer(base64UrlDecode(signature.value)), toArrayBuffer(bytes))
}

export function createWebRuntimeModuleLoader(options: WebRuntimeModuleLoaderOptions = {}): RuntimeModuleLoader {
  const loadModule = async <T>(record: RuntimeWebModuleRecord, ctx: { assets: QuaAssets, bundle: DynamicBundleRecord, package: RuntimePackageManifest }): Promise<T> => {
    const handle = await createModuleUrl(record, ctx, options)
    try {
      return await import(/* @vite-ignore */ handle.url) as T
    }
    finally {
      handle.cleanup()
    }
  }

  return {
    loadEnginePluginModule: (record, ctx) => loadModule<RuntimeLoadedPluginModule>(record, ctx),
    loadSceneModule: (record, ctx) => loadModule<RuntimeLoadedSceneModule>(record, ctx),
    loadScriptModule: (record, ctx) => loadModule<RuntimeLoadedScriptModule>(record, ctx),
    loadStoreMigrationModule: (record, ctx) => loadModule<RuntimeLoadedMigrationModule>(record, ctx),
  }
}

export function createWebRuntimeRendererPluginLoader(options: WebRuntimeRendererPluginLoaderOptions = {}) {
  const moduleLoader = createWebRuntimeModuleImporter(options)
  return async (pluginManifest: unknown, context: { packageId: string }): Promise<RendererPlugin | undefined> => {
    if (!isRuntimePackagePluginManifest(pluginManifest) || pluginManifest.kind !== 'renderer') {
      return undefined
    }
    const loaded = await moduleLoader<RuntimeLoadedPluginModule>(pluginManifest, context.packageId)
    const candidate = selectExport(loaded, pluginManifest.exportName, ['Plugin', 'default'])
    return isRendererPlugin(candidate) ? candidate : undefined
  }
}

export function createQuaCspPolicy(options: QuaCspPolicyOptions = {}): QuaCspPolicy {
  const mode = options.mode || 'hash'
  const scriptSrc = new Set<string>(['\'self\''])
  const styleSrc = new Set<string>(['\'self\''])
  const connectSrc = new Set<string>(['\'self\'', ...(options.connectSrc || [])])

  if (mode === 'nonce' || mode === 'both') {
    scriptSrc.add(`'nonce-${options.nonce || '__QUA_CSP_NONCE__'}'`)
    styleSrc.add(`'nonce-${options.nonce || '__QUA_CSP_NONCE__'}'`)
    scriptSrc.add('\'strict-dynamic\'')
  }
  if (mode === 'hash' || mode === 'both') {
    for (const hash of options.hashes?.scripts || []) {
      scriptSrc.add(hash)
    }
    for (const hash of options.hashes?.styles || []) {
      styleSrc.add(hash)
    }
  }
  if (options.allowRuntimeBlobModules) {
    scriptSrc.add('blob:')
  }

  const policy: QuaCspPolicy = {
    'base-uri': ['\'self\''],
    'connect-src': Array.from(connectSrc),
    'default-src': ['\'none\''],
    'font-src': ['\'self\'', 'blob:', 'data:'],
    'frame-ancestors': ['\'none\''],
    'img-src': ['\'self\'', 'blob:', 'data:'],
    'media-src': ['\'self\'', 'blob:', 'data:'],
    'object-src': ['\'none\''],
    'script-src': Array.from(scriptSrc),
    'style-src': Array.from(styleSrc),
  }
  if (options.trustedTypes) {
    policy['require-trusted-types-for'] = ['\'script\'']
    policy['trusted-types'] = ['quaengine']
  }
  if (options.reportUri) {
    policy['report-uri'] = [options.reportUri]
  }
  return policy
}

export function serializeCspPolicy(policy: QuaCspPolicy): string {
  return Object.entries(policy)
    .map(([directive, values]) => `${directive} ${values.join(' ')}`)
    .join('; ')
}

export function createRuntimePackageSignaturePayload(manifest: BundleManifest): RuntimePackageSignaturePayload {
  if (!manifest.runtimePackage) {
    throw new Error('Bundle manifest does not contain runtimePackage metadata.')
  }
  return {
    schema: QUA_RUNTIME_SIGNATURE_SCHEMA,
    bundle: {
      bundleVersion: manifest.bundleVersion,
      format: manifest.format,
      merkleRoot: manifest.merkleRoot,
    },
    runtimePackage: stripRuntimePackageSignature(manifest.runtimePackage),
  }
}

export function stripRuntimePackageSignature(runtimePackage: RuntimePackageManifest): RuntimePackageManifest {
  const { signature: _signature, ...rest } = runtimePackage
  return JSON.parse(canonicalJson(rest)) as RuntimePackageManifest
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortCanonical(value))
}

function createWebRuntimeModuleImporter(options: WebRuntimeModuleLoaderOptions) {
  return async <T>(record: RuntimeWebModuleRecord, packageId: string): Promise<T> => {
    if (!options.assets) {
      throw new Error('Runtime renderer plugin loading requires QuaAssets.')
    }
    const preferredBundleName = await options.resolveBundleName?.(packageId) || packageId
    const bundle = await options.assets.getBundleManifest(preferredBundleName)
      || (preferredBundleName === packageId ? undefined : await options.assets.getBundleManifest(packageId))
    const runtimePackage = bundle?.runtimePackage
    if (!runtimePackage) {
      throw new Error(`Runtime package "${packageId}" is not available to the Web renderer.`)
    }
    const handle = await createModuleUrl(record, {
      assets: options.assets,
      bundle: {
        assetCount: 0,
        bundleName: bundle.name || packageId,
        bundleVersion: bundle.bundleVersion || 1,
        hash: '',
        loadedAt: Date.now(),
        manifest: bundle,
        packageId,
        priority: runtimePackage.priority || 0,
        version: runtimePackage.version,
      },
      package: runtimePackage,
    }, options)
    try {
      return await import(/* @vite-ignore */ handle.url) as T
    }
    finally {
      handle.cleanup()
    }
  }
}

async function createModuleUrl(
  record: RuntimeWebModuleRecord,
  ctx: { assets: QuaAssets, bundle: DynamicBundleRecord, package: RuntimePackageManifest },
  options: WebRuntimeModuleLoaderOptions,
): Promise<ModuleUrlHandle> {
  const mode = options.moduleUrlMode || 'same-origin-with-blob-fallback'
  if (mode !== 'blob-only' && typeof record.module === 'string' && isSameOriginUrl(record.module)) {
    return { url: record.module, cleanup: () => {} }
  }

  const allowBlobFallback = options.allowBlobFallback !== false
    && (options.allowBlobFallback === true || mode === 'blob-only')
  if (!allowBlobFallback) {
    throw new Error('Runtime module loading requires an explicit same-origin module URL or Blob fallback enabled.')
  }
  if (!record.assetName) {
    throw new Error('Runtime module manifest is missing assetName.')
  }
  const asset = await ctx.assets.getAsset('scripts' as AssetType, record.assetName, {
    bundleName: ctx.bundle.bundleName,
    targetPackageId: ctx.package.id,
  })
  const blob = new Blob([toArrayBuffer(asset.data)], { type: 'text/javascript' })
  const url = URL.createObjectURL(blob)
  return {
    url,
    cleanup: () => URL.revokeObjectURL(url),
  }
}

async function importPublicKey(key: JsonWebKey | string | CryptoKey): Promise<CryptoKey> {
  if (typeof CryptoKey !== 'undefined' && key instanceof CryptoKey) {
    return key
  }
  if (typeof key === 'string') {
    const spki = pemToArrayBuffer(key)
    return await crypto.subtle.importKey('spki', spki, {
      name: 'ECDSA',
      namedCurve: 'P-256',
    }, false, ['verify'])
  }
  const jwk = key as JsonWebKey
  const algorithm: EcKeyImportParams = {
    name: 'ECDSA',
    namedCurve: 'P-256',
  }
  return await crypto.subtle.importKey('jwk', jwk, algorithm, false, ['verify'])
}

function isSameOriginUrl(url: string): boolean {
  try {
    const parsed = new URL(url, globalThis.location?.href || 'https://qua.invalid/')
    return parsed.origin === (globalThis.location?.origin || parsed.origin)
  }
  catch {
    return false
  }
}

function isProductionEnvironment(): boolean {
  return (globalThis as typeof globalThis & {
    process?: { env?: { NODE_ENV?: string } }
  }).process?.env?.NODE_ENV === 'production'
}

function base64UrlDecode(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4))
  const binary = atob(`${normalized}${padding}`)
  return Uint8Array.from(binary, char => char.charCodeAt(0))
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const base64 = pem
    .replace(/-----BEGIN PUBLIC KEY-----/g, '')
    .replace(/-----END PUBLIC KEY-----/g, '')
    .replace(/\s+/g, '')
  return toArrayBuffer(base64UrlDecode(base64.replace(/\+/g, '-').replace(/\//g, '_')))
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return copy.buffer
}

function sortCanonical(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortCanonical)
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => item !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, sortCanonical(item)]),
    )
  }
  return value
}

function selectExport(module: Record<string, unknown>, exportName: string | undefined, fallbackNames: string[]): unknown {
  if (exportName && exportName in module) {
    return module[exportName]
  }
  for (const name of fallbackNames) {
    if (name in module) {
      return module[name]
    }
  }
  return undefined
}

function isRuntimePackagePluginManifest(value: unknown): value is RuntimePackagePluginManifest {
  return Boolean(value && typeof value === 'object' && 'kind' in value && 'id' in value)
}

function isRendererPlugin(value: unknown): value is RendererPlugin {
  return Boolean(value && typeof value === 'object' && typeof (value as RendererPlugin).name === 'string')
}
