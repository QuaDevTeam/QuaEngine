import type { QuaNativeHostInfo } from '../../src'

export function createHostInfo(
  overrides: Partial<QuaNativeHostInfo['renderer']> = {},
): QuaNativeHostInfo {
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
      capabilities: [
        {
          id: 'native-wgpu.ui.surface@1',
          target: 'native',
          version: '1.0.0',
          ownerPackage: '@quajs/native-renderer',
          projectionKeys: ['view.ui.overlays'],
          intentEvents: ['choice/select', 'ui/intent'],
          assetKinds: ['data', 'images', 'fonts', 'qui', 'qss', 'tokens'],
          qssFeatures: [
            'background-color',
            'border-color',
            'border-radius',
            'font-size',
            'color',
            'object-fit',
          ],
          quiComponents: [
            'Box',
            'Button',
            'Column',
            'Image',
            'Panel',
            'Scroll',
            'Text',
          ],
          fallback: 'reject-package',
        },
        {
          id: 'native-wgpu.image@1',
          target: 'native',
          version: '1.0.0',
          ownerPackage: '@quajs/native-renderer',
          projectionKeys: ['background', 'characters'],
          fallback: 'render-empty',
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
      ...overrides,
    },
    runtime: {
      quickjsVersion: '2025-04-26',
      nativeRuntimeVersion: '0.1.0',
      assetAdapterVersion: '0.1.0',
      storeAdapterVersion: '0.1.0',
    },
  }
}
