import { describe, expect, it } from 'vitest'
import {
  createNativeCapabilityManifestHash,
  createNativeCapabilityManifestPayload,
} from '../../src'
import { sha256Hex } from './helpers'

describe('native capability manifest contracts', () => {
  it('creates stable native capability manifest payloads for release hashing', () => {
    const capabilities = [
      {
        id: 'native-wgpu.ui.surface@1',
        target: 'native',
        version: '1.0.0',
        ownerPackage: '@quajs/native-renderer',
        projectionKeys: ['view.ui.overlays'],
        intentEvents: ['ui/intent'],
        assetKinds: ['data', 'images'],
        qssFeatures: ['background-color', 'border-radius'],
        quiComponents: ['Box', 'Button'],
        fallback: 'reject-package',
      },
      {
        id: 'native-wgpu.escape\n\t\b@1',
        target: 'native',
        version: '1.0.0',
        ownerPackage: '@quajs/native-renderer',
        projectionKeys: [],
        fallback: 'warn-once',
      },
    ] as const
    const payload = createNativeCapabilityManifestPayload(capabilities)

    expect(payload).toBe([
      '[{"id":"native-wgpu.ui.surface@1","target":"native","version":"1.0.0","ownerPackage":"@quajs/native-renderer","projectionKeys":["view.ui.overlays"],"intentEvents":["ui/intent"],"assetKinds":["data","images"],"qssFeatures":["background-color","border-radius"],"quiComponents":["Box","Button"],"fallback":"reject-package"}',
      ',{"id":"native-wgpu.escape\\n\\t\\u0008@1","target":"native","version":"1.0.0","ownerPackage":"@quajs/native-renderer","projectionKeys":[],"intentEvents":[],"assetKinds":[],"qssFeatures":[],"quiComponents":[],"fallback":"warn-once"}]',
    ].join(''))

    const hash = createNativeCapabilityManifestHash(capabilities, sha256Hex)
    expect(hash).toBe(`sha256:${sha256Hex(payload)}`)
    expect(createNativeCapabilityManifestHash(capabilities, value => `sha256:${sha256Hex(value)}`)).toBe(hash)
    expect(createNativeCapabilityManifestHash([
      {
        ...capabilities[0],
        qssFeatures: [...capabilities[0].qssFeatures, 'color'],
      },
    ], sha256Hex)).not.toBe(hash)
  })
})
