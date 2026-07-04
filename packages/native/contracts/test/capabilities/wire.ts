import { describe, expect, it } from 'vitest'
import {
  createNativeHostApiRequest,
  createNativeRendererIntent,
  createNativeSignatureVerifyWireRequest,
  nativeBytesToWire,
  nativeWireBytesToUint8Array,
  parseNativeRendererIntentPayload,
} from '../../src'

describe('native host wire contracts', () => {
  it('creates renderer intents with the Rust host payloadJson field', () => {
    expect(createNativeRendererIntent({
      type: 'ui/intent',
      payload: { action: 'close', panel: 'settings' },
    })).toEqual({
      type: 'ui/intent',
      payloadJson: '{"action":"close","panel":"settings"}',
    })

    expect(createNativeRendererIntent({
      type: 'ui/intent',
      payloadJson: '{"action":"open"}',
    })).toEqual({
      type: 'ui/intent',
      payloadJson: '{"action":"open"}',
    })
  })

  it('parses renderer intent payload JSON without adding renderer state', () => {
    expect(parseNativeRendererIntentPayload<{ action: string }>({
      type: 'ui/intent',
      payloadJson: '{"action":"submit"}',
    })).toEqual({ action: 'submit' })
    expect(parseNativeRendererIntentPayload({ type: 'ui/intent' })).toBeUndefined()
  })

  it('serializes signature verification requests to the Rust host wire shape', () => {
    expect(createNativeSignatureVerifyWireRequest({
      bytes: new Uint8Array([1, 2, 3]),
      signature: new Uint8Array([4, 5, 6]),
      keyId: 'release-key',
      algorithm: 'ed25519',
    })).toEqual({
      bytes: [1, 2, 3],
      signature: [4, 5, 6],
      keyId: 'release-key',
      algorithm: 'ed25519',
    })
  })

  it('creates host bridge requests with the Rust method and params shape', () => {
    expect(createNativeHostApiRequest({
      method: 'readAssetBytes',
      params: {
        url: 'images/bg.png',
        bundleName: 'base',
        assetId: 'bg',
      },
    })).toEqual({
      method: 'readAssetBytes',
      params: {
        url: 'images/bg.png',
        bundleName: 'base',
        assetId: 'bg',
      },
    })

    expect(createNativeHostApiRequest({
      method: 'hashBytes',
      params: {
        bytes: nativeBytesToWire(new Uint8Array([1, 2, 3])),
        algorithm: 'sha256',
      },
    })).toEqual({
      method: 'hashBytes',
      params: {
        bytes: [1, 2, 3],
        algorithm: 'sha256',
      },
    })

    expect(createNativeHostApiRequest({
      method: 'releaseQuickJsModuleNamespace',
      params: {
        moduleNamespaceId: 'quickjs:module:1',
      },
    })).toEqual({
      method: 'releaseQuickJsModuleNamespace',
      params: {
        moduleNamespaceId: 'quickjs:module:1',
      },
    })

    expect(createNativeHostApiRequest({
      method: 'getQuickJsPackageNamespaceSummary',
      params: {
        packageId: 'runtime.chapter.native-ui',
      },
    })).toEqual({
      method: 'getQuickJsPackageNamespaceSummary',
      params: {
        packageId: 'runtime.chapter.native-ui',
      },
    })
  })

  it('accepts host bridge responses with typed payloads and errors', () => {
    const okResponse = {
      ok: true,
      payload: {
        type: 'storageKeys',
        value: ['profile/save-1'],
      },
    } as const
    const errorResponse = {
      ok: false,
      error: {
        code: 'assetNotFound',
        message: 'Native asset "missing.png" was not found.',
        assetUrl: 'missing.png',
      },
    } as const

    expect(okResponse.payload.value).toEqual(['profile/save-1'])
    expect(errorResponse.error.code).toBe('assetNotFound')
    expect(nativeWireBytesToUint8Array([4, 5, 6])).toEqual(new Uint8Array([4, 5, 6]))
    expect(nativeWireBytesToUint8Array(undefined)).toBeUndefined()
  })
})
