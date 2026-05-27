import type { AssetInfo, BundleManifest, RuntimePackageManifest } from '../core/types'
import { createHash, createPrivateKey, createPublicKey, sign as nodeSign, verify as nodeVerify } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { readQpkBundle } from '../qpk-reader'

export const QUA_RUNTIME_SIGNATURE_ALGORITHM = 'ecdsa-p256-sha256'
export const QUA_RUNTIME_SIGNATURE_SCHEMA = 'quajs.runtime-package-signature.v1'

export interface RuntimePackageSignaturePayload {
  schema: typeof QUA_RUNTIME_SIGNATURE_SCHEMA
  bundle: {
    bundleVersion?: number
    format: BundleManifest['format']
    merkleRoot?: string
  }
  runtimePackage: RuntimePackageManifest
}

export interface QpkSignatureOptions {
  keyId?: string
  privateKey: QpkKeyInput
}

export interface QpkVerifyOptions {
  expectedKeyId?: string
  publicKey?: QpkKeyInput
  requireSignature?: boolean
}

export interface QpkVerifyResult {
  valid: boolean
  errors: string[]
}

export async function signQpkFile(qpkPath: string, options: QpkSignatureOptions): Promise<BundleManifest> {
  const { assets, manifest } = await readQpkBundle(qpkPath)
  if (!manifest.runtimePackage) {
    throw new Error('QPK bundle does not contain runtimePackage metadata.')
  }
  if (manifest.encryption?.enabled) {
    throw new Error('Signing encrypted QPK files is not supported. Sign before encryption or disable manifest encryption for runtime packages.')
  }

  const signedRuntimePackage = await signRuntimePackageManifest(manifest, options)
  const signedManifest: BundleManifest = {
    ...manifest,
    runtimePackage: signedRuntimePackage,
  }
  await rewriteQpkFile(qpkPath, signedManifest, assets)
  return signedManifest
}

export async function signRuntimePackageManifest(
  manifest: BundleManifest,
  options: QpkSignatureOptions,
): Promise<RuntimePackageManifest> {
  if (!manifest.runtimePackage) {
    throw new Error('Bundle manifest does not contain runtimePackage metadata.')
  }
  if (manifest.format !== 'qpk') {
    throw new Error('Runtime package signing only supports QPK bundles.')
  }

  const payload = createRuntimePackageSignaturePayload(manifest)
  const bytes = new TextEncoder().encode(canonicalJson(payload))
  const key = createPrivateKeyObject(options.privateKey)
  const derSignature = nodeSign('sha256', bytes, {
    key,
    dsaEncoding: 'ieee-p1363',
  })
  return {
    ...manifest.runtimePackage,
    signature: {
      algorithm: QUA_RUNTIME_SIGNATURE_ALGORITHM,
      keyId: options.keyId || manifest.runtimePackage.signature?.keyId,
      value: base64UrlEncode(derSignature),
    },
  }
}

export async function verifyQpkFile(qpkPath: string, options: QpkVerifyOptions = {}): Promise<QpkVerifyResult> {
  const errors: string[] = []
  let bundle: Awaited<ReturnType<typeof readQpkBundle>>
  try {
    bundle = await readQpkBundle(qpkPath)
  }
  catch (error) {
    return {
      valid: false,
      errors: [`Failed to read QPK: ${error instanceof Error ? error.message : String(error)}`],
    }
  }

  errors.push(...verifyQpkStructure(bundle.manifest, bundle.assets))
  errors.push(...verifyManifestMerkleRoot(bundle.manifest))
  if (!bundle.manifest.runtimePackage) {
    if (options.requireSignature) {
      errors.push('QPK bundle does not contain runtimePackage metadata required for signature verification.')
    }
  }
  else {
    errors.push(...verifyRuntimePackageIntegrity(bundle.manifest))
    const signature = bundle.manifest.runtimePackage.signature
    if (options.requireSignature && !signature?.value) {
      errors.push(`Runtime package "${bundle.manifest.runtimePackage.id}" is missing a required signature.`)
    }
    if (signature?.value && options.expectedKeyId && signature.keyId !== options.expectedKeyId) {
      errors.push(`Runtime package "${bundle.manifest.runtimePackage.id}" signature keyId mismatch: expected ${options.expectedKeyId}, got ${signature.keyId || '<missing>'}.`)
    }
    if (signature?.value && options.publicKey) {
      const verified = tryVerifyRuntimePackageSignature(bundle.manifest, options.publicKey)
      if (!verified) {
        errors.push(`Runtime package "${bundle.manifest.runtimePackage.id}" failed signature verification.`)
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}

export function verifyRuntimePackageSignature(manifest: BundleManifest, publicKey: QpkKeyInput): boolean {
  const runtimePackage = manifest.runtimePackage
  const signature = runtimePackage?.signature
  if (!runtimePackage || !signature?.value) {
    return false
  }
  if (signature.algorithm && signature.algorithm !== QUA_RUNTIME_SIGNATURE_ALGORITHM) {
    return false
  }
  const payload = createRuntimePackageSignaturePayload(manifest)
  const bytes = new TextEncoder().encode(canonicalJson(payload))
  const key = createPublicKeyObject(publicKey)
  return nodeVerify('sha256', bytes, {
    key,
    dsaEncoding: 'ieee-p1363',
  }, base64UrlDecode(signature.value))
}

function tryVerifyRuntimePackageSignature(manifest: BundleManifest, publicKey: QpkKeyInput): boolean {
  try {
    return verifyRuntimePackageSignature(manifest, publicKey)
  }
  catch {
    return false
  }
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
  return deepCloneCanonical(rest) as RuntimePackageManifest
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortCanonical(value))
}

export function base64UrlEncode(bytes: Uint8Array | Buffer): string {
  return Buffer.from(bytes)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

export function base64UrlDecode(value: string): Buffer {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4))
  return Buffer.from(`${normalized}${padding}`, 'base64')
}

export type QpkKeyInput = string | Buffer | Record<string, unknown>

export async function readKeyFile(path: string): Promise<QpkKeyInput> {
  const contents = await readFile(path)
  const text = contents.toString('utf8').trim()
  return text.startsWith('{') ? JSON.parse(text) as Record<string, unknown> : contents
}

export async function writeManifestJson(path: string, manifest: BundleManifest): Promise<void> {
  await writeFile(path, JSON.stringify(manifest, null, 2), 'utf8')
}

function verifyQpkStructure(manifest: BundleManifest, assets: Map<string, Buffer>): string[] {
  const errors: string[] = []
  const seen = new Set<string>()
  const matchedManifestPaths = new Set<string>()
  for (const [path, data] of assets.entries()) {
    if (!isSafeQpkPath(path)) {
      errors.push(`Unsafe QPK asset path: ${path}`)
    }
    if (seen.has(path)) {
      errors.push(`Duplicate QPK asset path: ${path}`)
    }
    seen.add(path)
    const manifestAsset = findManifestAssetForPath(manifest, path)
    if (!manifestAsset) {
      errors.push(`QPK asset is not declared in manifest: ${path}`)
      continue
    }
    matchedManifestPaths.add(path)
    if (manifestAsset?.hash) {
      const actualHash = createHash('sha256').update(data).digest('hex')
      if (actualHash !== manifestAsset.hash) {
        errors.push(`Hash mismatch for ${path}: expected ${manifestAsset.hash}, got ${actualHash}`)
      }
    }
  }
  for (const asset of listManifestAssets(manifest)) {
    const path = qpkPathForManifestAsset(asset)
    if (path && !matchedManifestPaths.has(path)) {
      errors.push(`Manifest asset is missing from QPK data: ${path}`)
    }
  }
  return errors
}

function verifyManifestMerkleRoot(manifest: BundleManifest): string[] {
  if (!manifest.merkleRoot) {
    return []
  }
  const assets = listManifestAssets(manifest)
  if (assets.length === 0) {
    const emptyRoot = createHash('sha256').update('').digest('hex')
    return manifest.merkleRoot === emptyRoot
      ? []
      : [`Merkle root mismatch: expected ${manifest.merkleRoot}, got ${emptyRoot}`]
  }
  const root = createMerkleRoot(assets)
  return root === manifest.merkleRoot
    ? []
    : [`Merkle root mismatch: expected ${manifest.merkleRoot}, got ${root}`]
}

function verifyRuntimePackageIntegrity(manifest: BundleManifest): string[] {
  const errors: string[] = []
  const runtimePackage = manifest.runtimePackage
  if (!runtimePackage) {
    return errors
  }
  const algorithm = runtimePackage.integrity?.algorithm || 'sha256'
  if (algorithm !== 'sha256') {
    errors.push(`Runtime package "${runtimePackage.id}" uses unsupported integrity algorithm "${algorithm}".`)
  }
  if (!manifest.merkleRoot) {
    errors.push(`Runtime package "${runtimePackage.id}" is missing bundle merkleRoot.`)
  }
  if (!runtimePackage.integrity?.hash) {
    errors.push(`Runtime package "${runtimePackage.id}" is missing integrity hash.`)
  }
  if (runtimePackage.integrity?.hash && manifest.merkleRoot && runtimePackage.integrity.hash !== manifest.merkleRoot) {
    errors.push(`Runtime package "${runtimePackage.id}" integrity hash mismatch.`)
  }
  return errors
}

function findManifestAssetForPath(manifest: BundleManifest, path: string): AssetInfo | { hash?: string, path?: string, relativePath?: string, type?: string } | undefined {
  for (const records of Object.values(manifest.assets || {})) {
    for (const asset of Object.values(records || {})) {
      const candidates = new Set([
        asset.path,
        asset.relativePath,
        `assets/${asset.type}/${asset.relativePath?.replace(new RegExp(`^${asset.type}/`), '')}`,
      ].filter(Boolean))
      if (candidates.has(path)) {
        return asset
      }
      for (const variant of Object.values(asset.variants || {})) {
        const variantCandidates = new Set([
          variant.path,
          variant.relativePath,
          `assets/${asset.type}/${variant.relativePath?.replace(new RegExp(`^${asset.type}/`), '')}`,
        ].filter(Boolean))
        if (variantCandidates.has(path)) {
          return variant
        }
      }
    }
  }
  return undefined
}

function listManifestAssets(manifest: BundleManifest): AssetInfo[] {
  const assets: AssetInfo[] = []
  for (const records of Object.values(manifest.assets || {})) {
    for (const asset of Object.values(records || {})) {
      const variants = Object.values(asset.variants || {})
      if (variants.length === 0) {
        assets.push(asset)
        continue
      }
      for (const variant of variants) {
        assets.push({
          ...asset,
          hash: variant.hash,
          locales: [variant.locale || 'default'],
          mediaMetadata: variant.mediaMetadata || asset.mediaMetadata,
          mimeType: variant.mimeType || asset.mimeType,
          mtime: variant.mtime || asset.mtime,
          path: variant.path,
          relativePath: variant.relativePath,
          size: variant.size,
          version: variant.version || asset.version,
          variants: undefined,
        })
      }
    }
  }
  return assets
}

function qpkPathForManifestAsset(asset: AssetInfo): string | undefined {
  if (!asset.relativePath) {
    return undefined
  }
  const relativePath = asset.relativePath.startsWith(`${asset.type}/`)
    ? asset.relativePath.slice(asset.type.length + 1)
    : asset.relativePath
  return `assets/${asset.type}/${relativePath}`
}

function createMerkleRoot(assets: AssetInfo[]): string {
  const sortedAssets = [...assets].sort((left, right) => left.relativePath.localeCompare(right.relativePath))
  let nodes = sortedAssets.map(asset => asset.hash)
  while (nodes.length > 1) {
    const next: string[] = []
    for (let i = 0; i < nodes.length; i += 2) {
      const left = nodes[i]
      const right = nodes[i + 1]
      next.push(right
        ? createHash('sha256').update(left).update(right).digest('hex')
        : left)
    }
    nodes = next
  }
  return nodes[0] || createHash('sha256').update('').digest('hex')
}

function createPrivateKeyObject(key: QpkKeyInput) {
  return isJwkKey(key)
    ? createPrivateKey({ key: key as any, format: 'jwk' })
    : createPrivateKey(key)
}

function createPublicKeyObject(key: QpkKeyInput) {
  return isJwkKey(key)
    ? createPublicKey({ key: key as any, format: 'jwk' })
    : createPublicKey(key)
}

function isJwkKey(key: QpkKeyInput): key is Record<string, unknown> {
  return typeof key === 'object' && !Buffer.isBuffer(key) && 'kty' in key
}

function isSafeQpkPath(path: string): boolean {
  if (!path || path.startsWith('/') || path.startsWith('\\') || /^[a-z]:/i.test(path)) {
    return false
  }
  const segments = path.replace(/\\/g, '/').split('/')
  return segments.every(segment => segment !== '..' && segment !== '')
}

async function rewriteQpkFile(qpkPath: string, manifest: BundleManifest, assets: Map<string, Buffer>): Promise<void> {
  const assetChunks: Buffer[] = []
  for (const [path, data] of assets) {
    const pathBuffer = Buffer.from(path, 'utf8')
    const pathLength = Buffer.alloc(4)
    pathLength.writeUInt32LE(pathBuffer.length, 0)
    const dataLength = Buffer.alloc(4)
    dataLength.writeUInt32LE(data.length, 0)
    assetChunks.push(pathLength, pathBuffer, dataLength, data)
  }

  const assetData = Buffer.concat(assetChunks)
  const manifestData = Buffer.from(JSON.stringify(manifest, null, 2), 'utf8')
  const header = Buffer.alloc(32)
  Buffer.from('QPK\0', 'ascii').copy(header, 0)
  header.writeUInt32LE(1, 4)
  header.writeUInt32LE(0, 8)
  header.writeUInt32LE(32, 12)
  header.writeBigUInt64LE(BigInt(header.length + assetData.length), 16)
  header.writeBigUInt64LE(BigInt(manifestData.length), 24)

  await writeFile(qpkPath, Buffer.concat([header, assetData, manifestData]))
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

function deepCloneCanonical(value: unknown): unknown {
  return JSON.parse(canonicalJson(value))
}
