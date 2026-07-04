import type { NativeHostApiRequest } from '@quajs/native-contracts'
import { createNativeHostApiFromBridge } from '@quajs/native-contracts'
import { describe, expect, it, vi } from 'vitest'
import { createNativeRuntimeTrustPolicy, NativeHostPlugin } from '../../src'
import { createHost, createHostInfo, createTrustContext } from '../fixtures'

describe('@quajs/engine-native runtime trust policy signature verification', () => {
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
