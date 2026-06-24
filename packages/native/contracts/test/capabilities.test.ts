import { describe, expect, it } from 'vitest'
import {
  createNativeRendererIntent,
  createNativeSignatureVerifyWireRequest,
  parseNativeRendererIntentPayload,
} from '../src'

describe('native host contracts', () => {
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
})
