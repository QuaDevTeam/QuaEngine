import type { BundleManifest, DynamicBundleRecord, RuntimePackageManifest } from '@quajs/assets'
import { webcrypto } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createQuaCspPolicy,
  createRuntimePackageSignaturePayload,
  createWebRuntimeModuleLoader,
  createWebRuntimeTrustPolicy,
  serializeCspPolicy,
  verifyRuntimePackageSignature,
} from '../src/index'

describe('@quajs/security-web', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('verifies ECDSA P-256 runtime package signatures with raw P-1363 signatures', async () => {
    const { privateKey, publicKey } = await webcrypto.subtle.generateKey({
      name: 'ECDSA',
      namedCurve: 'P-256',
    }, true, ['sign', 'verify'])
    const publicJwk = await webcrypto.subtle.exportKey('jwk', publicKey)
    const manifest = createRuntimeManifest()
    const unsignedPackage = manifest.runtimePackage!
    const payload = createRuntimePackageSignaturePayload(manifest)
    const signature = await webcrypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      privateKey,
      new TextEncoder().encode(JSON.stringify(sortCanonical(payload))),
    )
    const runtimePackage: RuntimePackageManifest = {
      ...unsignedPackage,
      signature: {
        algorithm: 'ecdsa-p256-sha256',
        keyId: 'test-key',
        value: base64UrlEncode(new Uint8Array(signature)),
      },
    }
    const bundle: DynamicBundleRecord = createDynamicBundle({
      ...manifest,
      runtimePackage,
    })

    await expect(verifyRuntimePackageSignature(
      { bundle, package: runtimePackage },
      { keys: [{ id: 'test-key', key: publicJwk }] },
    )).resolves.toBe(true)
  })

  it('creates trust policy that allows unsigned packages only when development mode explicitly opts in', async () => {
    const policy = createWebRuntimeTrustPolicy({ keys: [], allowUnsignedInDevelopment: true })
    expect(policy.allowUnsignedInDevelopment).toBe(true)
    await expect(Promise.resolve(policy.verifyPackage?.({
      bundle: createDynamicBundle(createRuntimeManifest()),
      package: createRuntimeManifest().runtimePackage!,
    }))).resolves.toBe(true)

    const strictPolicy = createWebRuntimeTrustPolicy({ keys: [], allowUnsignedInDevelopment: true, requireSignature: true })
    await expect(Promise.resolve(strictPolicy.verifyPackage?.({
      bundle: createDynamicBundle(createRuntimeManifest()),
      package: createRuntimeManifest().runtimePackage!,
    }))).resolves.toBe(false)
  })

  it('keeps blob runtime modules opt-in in CSP and loader behavior', async () => {
    expect(serializeCspPolicy(createQuaCspPolicy()).includes('script-src \'self\' blob:')).toBe(false)
    expect(serializeCspPolicy(createQuaCspPolicy({ allowRuntimeBlobModules: true }))).toContain('script-src \'self\' blob:')

    const loader = createWebRuntimeModuleLoader({ allowBlobFallback: false })
    await expect(loader.loadScriptModule?.(
      { id: 'module', packageId: 'pkg', bundleName: 'pkg', assetName: 'module.js' },
      { assets: createFakeAssets(), bundle: createDynamicBundle(createRuntimeManifest()), package: createRuntimeManifest().runtimePackage! },
    )).rejects.toThrow('Blob fallback enabled')
  })
})

function createRuntimeManifest(): BundleManifest {
  return {
    name: 'pkg',
    version: '1.0.0',
    bundler: 'test',
    created: '2026-01-01T00:00:00.000Z',
    format: 'qpk',
    bundleVersion: 1,
    compression: { algorithm: 'none' },
    encryption: { enabled: false, algorithm: 'none' },
    locales: ['default'],
    defaultLocale: 'default',
    assets: {},
    merkleRoot: 'abc',
    runtimePackage: {
      id: 'pkg',
      version: '1.0.0',
      integrity: {
        algorithm: 'sha256',
        hash: 'abc',
      },
      scripts: [{
        id: 'module',
        assetName: 'module.js',
      }],
    },
  }
}

function createDynamicBundle(manifest: BundleManifest): DynamicBundleRecord {
  return {
    assetCount: 0,
    bundleName: 'pkg',
    bundleVersion: 1,
    hash: manifest.merkleRoot || '',
    loadedAt: 1,
    manifest,
    packageId: manifest.runtimePackage?.id,
    priority: 0,
    version: manifest.runtimePackage?.version,
  }
}

function createFakeAssets() {
  return {
    getAsset: vi.fn(),
  } as any
}

function base64UrlEncode(bytes: Uint8Array): string {
  return Buffer.from(bytes)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
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
