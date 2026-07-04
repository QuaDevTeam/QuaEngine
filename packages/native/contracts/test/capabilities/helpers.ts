import { createHash } from 'node:crypto'

export function createHostInfo() {
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
      version: '0.1.0',
      backend: 'wgpu',
      capabilityManifestHash: 'sha256:native-capabilities-fixture',
      capabilities: [],
    },
    runtime: {
      quickjsVersion: 'unsupported',
      nativeRuntimeVersion: '0.1.0',
      assetAdapterVersion: '0.1.0',
      storeAdapterVersion: '0.1.0',
    },
  } as const
}

export function sha256Hex(payload: string): string {
  return createHash('sha256').update(payload).digest('hex')
}
