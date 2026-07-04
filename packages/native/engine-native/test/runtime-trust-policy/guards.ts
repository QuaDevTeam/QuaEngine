import { describe, expect, it, vi } from 'vitest'
import { createNativeRuntimeTrustPolicy } from '../../src'
import { createHost, createHostInfo, createTrustContext } from '../fixtures'

describe('@quajs/engine-native runtime trust policy guards', () => {
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
})
