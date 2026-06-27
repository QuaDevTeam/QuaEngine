import type { NativeHostApiRequest } from '@quajs/native-contracts'
import { createNativeHostApiFromBridge } from '@quajs/native-contracts'
import { describe, expect, it, vi } from 'vitest'
import { createNativeRuntimeTrustPolicy, NativeHostPlugin } from '../src'
import { createHost, createHostInfo, createTrustContext } from './fixtures'

describe('@quajs/engine-native runtime trust policy', () => {
  it('rejects native-code runtime packages through native trust policy', async () => {
    const host = createHost()
    const policy = createNativeRuntimeTrustPolicy(host, { allowUnsignedInDevelopment: true })

    await expect(policy.verifyPackage!(createTrustContext({
      scripts: [
        { id: 'native', assetName: 'native/plugin.dylib' },
      ],
    }))).rejects.toThrow(/forbidden native payload/)
  })

  it('rejects unsafe runtime package asset references before native signature verification', async () => {
    const host = {
      ...createHost(),
      verifySignature: vi.fn(async () => true),
    }
    const policy = createNativeRuntimeTrustPolicy(host)

    await expect(policy.verifyPackage!(createTrustContext({
      scripts: [
        { id: 'remote', assetName: 'https://cdn.example.invalid/opening.js' },
      ],
      integrity: {
        hash: 'abc123',
        algorithm: 'sha256',
      },
      signature: {
        value: 'base64:AQID',
        algorithm: 'ed25519',
        keyId: 'test-key',
      },
    }))).rejects.toThrow(/forbidden asset reference "https:\/\/cdn\.example\.invalid\/opening\.js"/)

    expect(host.verifySignature).not.toHaveBeenCalled()
  })

  it('checks runtime package native renderer compatibility before native signature verification', async () => {
    const host = {
      ...createHost(),
      verifySignature: vi.fn(async () => true),
    }
    const policy = createNativeRuntimeTrustPolicy(host, {
      hostInfo: createHostInfo(),
    })

    await expect(policy.verifyPackage!(createTrustContext({
      metadata: {
        nativeRenderer: {
          packageName: '@quajs/native-renderer',
          versionRange: '^0.1.0',
          capabilities: ['native-wgpu.audio@1'],
          nativeCode: false,
        },
      },
      integrity: {
        hash: 'abc123',
        algorithm: 'sha256',
      },
      signature: {
        value: 'base64:AQID',
        algorithm: 'ed25519',
        keyId: 'test-key',
      },
    }))).rejects.toThrow(/Required native capability "native-wgpu\.audio@1" is not available/)

    expect(host.getHostInfo).not.toHaveBeenCalled()
    expect(host.verifySignature).not.toHaveBeenCalled()
  })

  it('checks target-scoped renderers.native compatibility metadata before native signature verification', async () => {
    const host = {
      ...createHost(),
      verifySignature: vi.fn(async () => true),
    }
    const policy = createNativeRuntimeTrustPolicy(host, {
      hostInfo: createHostInfo(),
    })

    await expect(policy.verifyPackage!(createTrustContext({
      metadata: {
        renderers: {
          native: {
            renderer: '@quajs/native-renderer',
            version: '^0.1.0',
            capabilityIds: ['native-wgpu.audio@1'],
            nativeCode: false,
          },
        },
      },
      integrity: {
        hash: 'abc123',
        algorithm: 'sha256',
      },
      signature: {
        value: 'base64:AQID',
        algorithm: 'ed25519',
        keyId: 'test-key',
      },
    }))).rejects.toThrow(/Required native capability "native-wgpu\.audio@1" is not available/)

    expect(host.getHostInfo).not.toHaveBeenCalled()
    expect(host.verifySignature).not.toHaveBeenCalled()
  })

  it('checks runtime package native asset kind compatibility before native signature verification', async () => {
    const host = {
      ...createHost(),
      verifySignature: vi.fn(async () => true),
    }
    const policy = createNativeRuntimeTrustPolicy(host, {
      hostInfo: createHostInfo(),
    })

    await expect(policy.verifyPackage!(createTrustContext({
      metadata: {
        nativeRenderer: {
          renderer: '@quajs/native-renderer',
          version: '^0.1.0',
          assetKinds: ['qui', 'shader'],
          nativeCode: false,
        },
      },
      integrity: {
        hash: 'abc123',
        algorithm: 'sha256',
      },
      signature: {
        value: 'base64:AQID',
        algorithm: 'ed25519',
        keyId: 'test-key',
      },
    }))).rejects.toThrow(/Required native asset kind "shader" is not available/)

    expect(host.getHostInfo).not.toHaveBeenCalled()
    expect(host.verifySignature).not.toHaveBeenCalled()
  })

  it('allows missing optional native asset kinds before native signature verification', async () => {
    const host = {
      ...createHost(),
      verifySignature: vi.fn(async () => true),
    }
    const policy = createNativeRuntimeTrustPolicy(host, {
      hostInfo: createHostInfo(),
    })

    await expect(policy.verifyPackage!(createTrustContext({
      metadata: {
        nativeRenderer: {
          renderer: '@quajs/native-renderer',
          version: '^0.1.0',
          optionalAssetKinds: ['qss', 'shader'],
          nativeCode: false,
        },
      },
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

    expect(host.getHostInfo).not.toHaveBeenCalled()
    expect(host.verifySignature).toHaveBeenCalledTimes(1)
  })

  it('checks runtime package native QSS and QUI compatibility before native signature verification', async () => {
    const host = {
      ...createHost(),
      verifySignature: vi.fn(async () => true),
    }
    const policy = createNativeRuntimeTrustPolicy(host, {
      hostInfo: createHostInfo(),
    })

    await expect(policy.verifyPackage!(createTrustContext({
      metadata: {
        nativeRenderer: {
          renderer: '@quajs/native-renderer',
          version: '^0.1.0',
          capabilities: ['native-wgpu.ui.surface@1'],
          qssFeatures: ['background-color', 'gap'],
          quiComponents: ['Panel', 'VirtualList'],
          nativeCode: false,
        },
      },
      integrity: {
        hash: 'abc123',
        algorithm: 'sha256',
      },
      signature: {
        value: 'base64:AQID',
        algorithm: 'ed25519',
        keyId: 'test-key',
      },
    }))).rejects.toThrow(/Required native QSS feature "gap" is not available.*Required native QUI component "VirtualList" is not available/)

    expect(host.getHostInfo).not.toHaveBeenCalled()
    expect(host.verifySignature).not.toHaveBeenCalled()
  })

  it('allows missing optional native QSS features and QUI components before native signature verification', async () => {
    const host = {
      ...createHost(),
      verifySignature: vi.fn(async () => true),
    }
    const policy = createNativeRuntimeTrustPolicy(host, {
      hostInfo: createHostInfo(),
    })

    await expect(policy.verifyPackage!(createTrustContext({
      metadata: {
        nativeRenderer: {
          renderer: '@quajs/native-renderer',
          version: '^0.1.0',
          optionalQssFeatures: ['color', 'gap'],
          optionalQuiComponents: ['Panel', 'Drawer'],
          nativeCode: false,
        },
      },
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

    expect(host.getHostInfo).not.toHaveBeenCalled()
    expect(host.verifySignature).toHaveBeenCalledTimes(1)
  })

  it('rejects native renderer compatibility without nativeCode false before native signature verification', async () => {
    const host = {
      ...createHost(),
      verifySignature: vi.fn(async () => true),
    }
    const policy = createNativeRuntimeTrustPolicy(host, {
      hostInfo: createHostInfo(),
    })

    await expect(policy.verifyPackage!(createTrustContext({
      metadata: {
        renderers: {
          native: {
            renderer: '@quajs/native-renderer',
            version: '^0.1.0',
            capabilityIds: ['native-wgpu.ui.surface@1'],
          },
        },
      },
      integrity: {
        hash: 'abc123',
        algorithm: 'sha256',
      },
      signature: {
        value: 'base64:AQID',
        algorithm: 'ed25519',
        keyId: 'test-key',
      },
    }))).rejects.toThrow(/must explicitly declare nativeCode: false/)

    expect(host.getHostInfo).not.toHaveBeenCalled()
    expect(host.verifySignature).not.toHaveBeenCalled()
  })

  it('reads host info for native renderer compatibility when trust policy options omit it', async () => {
    const host = {
      ...createHost(createHostInfo()),
      verifySignature: vi.fn(async () => true),
    }
    const policy = createNativeRuntimeTrustPolicy(host)

    await expect(policy.verifyPackage!(createTrustContext({
      metadata: {
        nativeRenderer: {
          packageName: '@quajs/native-renderer',
          versionRange: '^0.1.0',
          capabilities: ['native-wgpu.ui.surface@1'],
          nativeCode: false,
        },
      },
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

    expect(host.getHostInfo).toHaveBeenCalledTimes(1)
    expect(host.verifySignature).toHaveBeenCalledTimes(1)
  })

  it('reuses resolved host info across native renderer compatibility checks', async () => {
    const host = {
      ...createHost(createHostInfo()),
      verifySignature: vi.fn(async () => true),
    }
    const policy = createNativeRuntimeTrustPolicy(host)

    for (const packageId of ['runtime.chapter.native-ui', 'runtime.chapter.extra-ui']) {
      await expect(policy.verifyPackage!(createTrustContext({
        id: packageId,
        metadata: {
          nativeRenderer: {
            packageName: '@quajs/native-renderer',
            versionRange: '^0.1.0',
            capabilities: ['native-wgpu.ui.surface@1'],
            nativeCode: false,
          },
        },
      }))).resolves.toBe(true)
    }

    expect(host.getHostInfo).toHaveBeenCalledTimes(1)
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

  it('uses the host bridge dispatcher for host info and package signature verification', async () => {
    const requests: NativeHostApiRequest[] = []
    const hostInfo = createHostInfo('0.3.0')
    const host = createNativeHostApiFromBridge(async (request) => {
      requests.push(request)
      switch (request.method) {
        case 'getHostInfo':
          return { ok: true, payload: { type: 'hostInfo', value: hostInfo } }
        case 'verifySignature':
          return { ok: true, payload: { type: 'signatureValid', value: true } }
        default:
          return {
            ok: false,
            error: {
              code: 'unsupportedOperation',
              message: `Unexpected bridge request "${request.method}".`,
            },
          }
      }
    })
    const plugin = new NativeHostPlugin({ host })
    const policy = createNativeRuntimeTrustPolicy(host)

    await plugin.init({} as any)
    await expect(policy.verifyPackage!(createTrustContext({
      integrity: {
        hash: 'abc123',
        algorithm: 'sha256',
      },
      signature: {
        value: 'base64:AQID',
        algorithm: 'ed25519',
        keyId: 'bridge-key',
      },
    }))).resolves.toBe(true)

    expect(plugin.getHostInfo()).toBe(hostInfo)
    expect(requests).toEqual([
      { method: 'getHostInfo' },
      {
        method: 'verifySignature',
        params: {
          bytes: [97, 98, 99, 49, 50, 51],
          signature: [1, 2, 3],
          keyId: 'bridge-key',
          algorithm: 'ed25519',
        },
      },
    ])
  })
})
