import { describe, expect, it, vi } from 'vitest'
import { createNativeRuntimeTrustPolicy } from '../../src'
import { createHost, createHostInfo, createTrustContext } from '../fixtures'

describe('@quajs/engine-native runtime trust policy host info', () => {
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
})
