import type { QuaNativeHostApi, QuaNativeHostInfo } from '@quajs/native-contracts'
import { describe, expect, it, vi } from 'vitest'
import {
  NativeHostPlugin,
  assertNativeRuntimePackageCompatibility,
  checkNativeRuntimePackageCompatibility,
  createNativeRuntimeAdapters,
  createNativeRuntimeTrustPolicy,
  readNativeHostInfo,
} from '../src'

function createHostInfo(version = '0.1.0'): QuaNativeHostInfo {
  return {
    app: {
      name: 'Native Fixture',
      bundleId: 'dev.quajs.native.fixture',
      version: '1.0.0',
      buildNumber: '100',
      profile: 'debug',
      platform: 'macos',
      arch: 'arm64',
    },
    renderer: {
      packageName: '@quajs/native-renderer',
      version,
      backend: 'wgpu',
      capabilities: [
        {
          id: 'native-wgpu.ui.surface@1',
          target: 'native',
          version: '1.0.0',
          ownerPackage: '@quajs/native-renderer',
          projectionKeys: ['view.ui.overlays'],
          fallback: 'reject-package',
        },
        {
          id: 'native-wgpu.video@1',
          target: 'native',
          version: '1.0.0',
          ownerPackage: '@quajs/native-renderer',
          projectionKeys: ['background.video'],
          assetKinds: ['video', 'images'],
          fallback: 'warn-once',
        },
      ],
    },
    runtime: {
      quickjsVersion: '2025-04-26',
      nativeRuntimeVersion: '0.1.0',
      assetAdapterVersion: '0.1.0',
      storeAdapterVersion: '0.1.0',
    },
  }
}

function createHost(hostInfo = createHostInfo()): QuaNativeHostApi {
  return {
    getHostInfo: vi.fn(async () => hostInfo),
    readAssetBytes: vi.fn(),
    readStorage: vi.fn(),
    writeStorage: vi.fn(),
    deleteStorage: vi.fn(),
    hashBytes: vi.fn(),
  }
}

function createTrustContext(overrides: Record<string, unknown> = {}) {
  const runtimePackage = {
    id: 'runtime.chapter.native-ui',
    version: '1.0.0',
    scripts: [
      { id: 'opening', assetName: 'scripts/opening.js' },
    ],
    ...overrides,
  }
  return {
    package: runtimePackage,
    bundle: {
      packageId: runtimePackage.id,
      bundleName: runtimePackage.id,
      version: '1.0.0',
      bundleVersion: 1,
      hash: 'hash',
      priority: 0,
      loadedAt: 1,
      assetCount: 1,
      manifest: {
        assets: {},
      },
    },
  } as any
}

describe('@quajs/engine-native', () => {
  it('reads native renderer version and capabilities from the Rust host API', async () => {
    const hostInfo = createHostInfo('0.2.0')
    const host = createHost(hostInfo)

    await expect(readNativeHostInfo(host)).resolves.toBe(hostInfo)
    expect(host.getHostInfo).toHaveBeenCalledTimes(1)
  })

  it('resolves host info during NativeHostPlugin initialization', async () => {
    const hostInfo = createHostInfo()
    const host = createHost(hostInfo)
    const plugin = new NativeHostPlugin({ host })

    expect(plugin.getHostInfo()).toBeUndefined()

    await plugin.init({} as any)

    expect(plugin.getHostInfo()).toBe(hostInfo)
    expect(host.getHostInfo).toHaveBeenCalledTimes(1)
  })

  it('uses preloaded host info without calling the host again', async () => {
    const hostInfo = createHostInfo()
    const host = createHost(createHostInfo('0.2.0'))
    const plugin = new NativeHostPlugin({ host, info: hostInfo })

    await plugin.init({} as any)

    expect(plugin.getHostInfo()).toBe(hostInfo)
    expect(host.getHostInfo).not.toHaveBeenCalled()
  })

  it('checks runtime package native renderer compatibility before activation', () => {
    const result = checkNativeRuntimePackageCompatibility(createHostInfo(), {
      pluginId: 'runtime.chapter.native-ui',
      nativeRenderer: {
        packageName: '@quajs/native-renderer',
        versionRange: '^0.1.0',
        capabilities: ['native-wgpu.ui.surface@1', 'native-wgpu.video@1'],
        optionalCapabilities: ['native-wgpu.audio@1'],
        nativeCode: false,
      },
    })

    expect(result.ok).toBe(true)
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: 'NATIVE_OPTIONAL_CAPABILITY_MISSING',
        severity: 'warning',
        pluginId: 'runtime.chapter.native-ui',
      }),
    ])
  })

  it('throws on native renderer version or required capability mismatches', () => {
    expect(() => assertNativeRuntimePackageCompatibility(createHostInfo('1.0.0'), {
      pluginId: 'runtime.chapter.native-ui',
      nativeRenderer: {
        versionRange: '^0.1.0',
        capabilities: ['native-wgpu.audio@1'],
        nativeCode: false,
      },
    })).toThrow(/Native renderer version "1\.0\.0" does not satisfy "\^0\.1\.0".*Required native capability "native-wgpu.audio@1" is not available./)
  })

  it('keeps native runtime adapters scoped to the provided host object', () => {
    const host = createHost()
    const adapters = createNativeRuntimeAdapters(host)

    expect(adapters.host).toBe(host)
    expect(adapters.trustPolicy).toEqual({
      allowUnsignedInDevelopment: undefined,
      requireSignature: undefined,
      verifyPackage: expect.any(Function),
    })
  })

  it('rejects native-code runtime packages through native trust policy', async () => {
    const host = createHost()
    const policy = createNativeRuntimeTrustPolicy(host, { allowUnsignedInDevelopment: true })

    await expect(policy.verifyPackage!(createTrustContext({
      scripts: [
        { id: 'native', assetName: 'native/plugin.dylib' },
      ],
    }))).rejects.toThrow(/forbidden native payload/)
  })

  it('forwards signed package verification to the native host', async () => {
    const host = {
      ...createHost(),
      verifySignature: vi.fn(async () => true),
    }
    const policy = createNativeRuntimeTrustPolicy(host)

    await expect(policy.verifyPackage!(createTrustContext({
      integrity: {
        hash: 'abc123',
        algorithm: 'sha256',
      },
      signature: {
        value: 'base64:AQID',
        algorithm: 'ed25519',
        keyId: 'test-key',
      },
    }))).resolves.toBe(true)

    expect(host.verifySignature).toHaveBeenCalledWith({
      bytes: new TextEncoder().encode('abc123'),
      signature: new Uint8Array([1, 2, 3]),
      keyId: 'test-key',
      algorithm: 'ed25519',
    })
  })
})
