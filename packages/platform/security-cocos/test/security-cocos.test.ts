import type { RuntimeModuleLoader, RuntimeTrustPolicy } from '@quajs/engine'
import type { CocosBundleManifest, CocosDynamicBundleRecord, CocosRuntimePackageManifest } from '../src'
import { describe, expect, it } from 'vitest'
import {
  createCocosStaticOnlyTrustPolicy,
  createUnsupportedCocosRuntimeModuleLoader,
  verifyCocosBundleIntegrity,
} from '../src'

describe('@quajs/security-cocos', () => {
  it('verifies static bundle integrity metadata', () => {
    const manifest = createManifest(createRuntimePackage())
    expect(verifyCocosBundleIntegrity({ manifest }).valid).toBe(true)
    expect(verifyCocosBundleIntegrity({
      manifest: {
        ...manifest,
        merkleRoot: 'bad',
      },
    })).toMatchObject({
      valid: false,
      reason: 'Cocos bundle integrity hash mismatch.',
    })
  })

  it('rejects dynamic runtime package entrypoints through the static-only trust policy', async () => {
    const policy = createCocosStaticOnlyTrustPolicy()
    const staticPackage = createRuntimePackage()
    await expect(Promise.resolve(policy.verifyPackage?.({
      bundle: createBundle(createManifest(staticPackage)),
      package: staticPackage,
    }))).resolves.toBe(false)

    const optInPolicy = createCocosStaticOnlyTrustPolicy({ allowStaticRuntimePackages: true })
    const dynamicPackage = createRuntimePackage({
      scripts: [{
        id: 'story',
        assetName: 'story.js',
      }],
    })
    const bundle = createBundle(createManifest(dynamicPackage))
    await expect(Promise.resolve(optInPolicy.verifyPackage?.({
      bundle,
      package: dynamicPackage,
    }))).resolves.toBe(false)
    await expect(Promise.resolve(optInPolicy.verifyPackage?.({
      bundle: createBundle(createManifest(staticPackage)),
      package: staticPackage,
    }))).resolves.toBe(true)
  })

  it('throws explicit unsupported errors for dynamic Cocos module loading', async () => {
    const loader = createUnsupportedCocosRuntimeModuleLoader()
    await expect(loader.loadScriptModule?.(
      { id: 'story', packageId: 'pkg', bundleName: 'pkg', assetName: 'story.js' },
      { assets: {} as never, bundle: createBundle(createManifest(createRuntimePackage())), package: createRuntimePackage() },
    )).rejects.toThrow('Cocos static-only runtime does not support dynamic runtime script modules.')
  })

  it('is structurally injectable into QuaEngine runtime package services', () => {
    const policy: RuntimeTrustPolicy = createCocosStaticOnlyTrustPolicy()
    const loader: RuntimeModuleLoader = createUnsupportedCocosRuntimeModuleLoader()

    expect(policy.requireSignature).toBe(false)
    expect(loader.loadScriptModule).toBeTypeOf('function')
  })
})

function createRuntimePackage(overrides: Partial<CocosRuntimePackageManifest> = {}): CocosRuntimePackageManifest {
  return {
    id: 'pkg',
    version: '1.0.0',
    integrity: {
      algorithm: 'sha256',
      hash: 'root',
    },
    ...overrides,
  }
}

function createManifest(runtimePackage: CocosRuntimePackageManifest): CocosBundleManifest {
  return {
    merkleRoot: 'root',
    runtimePackage,
  }
}

function createBundle(manifest: CocosBundleManifest): CocosDynamicBundleRecord {
  return {
    hash: manifest.merkleRoot || '',
    manifest,
  }
}
