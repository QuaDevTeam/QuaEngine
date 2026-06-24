import type { QuaNativeHostInfo } from '../src'
import { describe, expect, it } from 'vitest'
import { checkNativeCompatibility } from '../src'

function createHostInfo(overrides: Partial<QuaNativeHostInfo['renderer']> = {}): QuaNativeHostInfo {
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

describe('checkNativeCompatibility', () => {
  it('accepts compatible native renderer version and required capabilities', () => {
    const result = checkNativeCompatibility({
      hostInfo: createHostInfo(),
      compatibility: {
        packageName: '@quajs/native-renderer',
        versionRange: '^0.1.0',
        capabilities: [
          'native-wgpu.ui.surface@1',
          'native-wgpu.image@1',
          'native-wgpu.video@1',
        ],
        quiComponents: ['Panel', 'Button', 'Text'],
        qssFeatures: ['background-color', 'border-radius', 'font-size'],
        assetKinds: ['qui', 'qss', 'tokens'],
        nativeCode: false,
      },
    })

    expect(result).toEqual({ ok: true, diagnostics: [] })
  })

  it('accepts target-scoped renderer metadata aliases', () => {
    const result = checkNativeCompatibility({
      hostInfo: createHostInfo(),
      compatibility: {
        renderer: '@quajs/native-renderer',
        version: '^0.1.0',
        capabilityIds: [
          'native-wgpu.ui.surface@1',
          'native-wgpu.image@1',
        ],
        optionalCapabilityIds: ['native-wgpu.video@1'],
        nativeCode: false,
      },
    })

    expect(result).toEqual({ ok: true, diagnostics: [] })
  })

  it('rejects native renderer version mismatch', () => {
    const result = checkNativeCompatibility({
      hostInfo: createHostInfo({ version: '1.0.0' }),
      compatibility: {
        versionRange: '^0.1.0',
        nativeCode: false,
      },
    })

    expect(result.ok).toBe(false)
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: 'NATIVE_RENDERER_VERSION_MISMATCH',
        severity: 'error',
        required: '^0.1.0',
        actual: '1.0.0',
      }),
    ])
  })

  it('rejects missing required capabilities', () => {
    const result = checkNativeCompatibility({
      hostInfo: createHostInfo(),
      compatibility: {
        capabilities: ['native-wgpu.audio@1'],
        nativeCode: false,
      },
    })

    expect(result.ok).toBe(false)
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: 'NATIVE_REQUIRED_CAPABILITY_MISSING',
        severity: 'error',
        required: 'native-wgpu.audio@1',
      }),
    ])
  })

  it('warns for missing optional capabilities without failing activation', () => {
    const result = checkNativeCompatibility({
      hostInfo: createHostInfo(),
      compatibility: {
        optionalCapabilities: ['native-wgpu.audio@1'],
        nativeCode: false,
      },
    })

    expect(result.ok).toBe(true)
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: 'NATIVE_OPTIONAL_CAPABILITY_MISSING',
        severity: 'warning',
        required: 'native-wgpu.audio@1',
      }),
    ])
  })

  it('rejects runtime packages that require unsupported QUI components or QSS features', () => {
    const result = checkNativeCompatibility({
      hostInfo: createHostInfo(),
      pluginId: 'runtime.menu',
      compatibility: {
        uiSurfaces: ['Dialog', 'VirtualList'],
        qssTargets: ['display', 'gap'],
        nativeCode: false,
      },
    })

    expect(result.ok).toBe(false)
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'NATIVE_REQUIRED_QSS_FEATURE_MISSING',
        severity: 'error',
        pluginId: 'runtime.menu',
        required: 'display',
      }),
      expect.objectContaining({
        code: 'NATIVE_REQUIRED_QSS_FEATURE_MISSING',
        severity: 'error',
        pluginId: 'runtime.menu',
        required: 'gap',
      }),
      expect.objectContaining({
        code: 'NATIVE_REQUIRED_QUI_COMPONENT_MISSING',
        severity: 'error',
        pluginId: 'runtime.menu',
        required: 'Dialog',
      }),
      expect.objectContaining({
        code: 'NATIVE_REQUIRED_QUI_COMPONENT_MISSING',
        severity: 'error',
        pluginId: 'runtime.menu',
        required: 'VirtualList',
      }),
    ]))
  })

  it('rejects runtime packages that require unsupported native asset kinds', () => {
    const result = checkNativeCompatibility({
      hostInfo: createHostInfo(),
      pluginId: 'runtime.native-ui',
      compatibility: {
        assetKinds: ['qui', 'shader'],
        nativeCode: false,
      },
    })

    expect(result.ok).toBe(false)
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: 'NATIVE_REQUIRED_ASSET_KIND_MISSING',
        severity: 'error',
        pluginId: 'runtime.native-ui',
        required: 'shader',
      }),
    ])
  })

  it('warns for missing optional native asset kinds without failing activation', () => {
    const result = checkNativeCompatibility({
      hostInfo: createHostInfo(),
      pluginId: 'runtime.native-ui',
      compatibility: {
        optionalAssetKinds: ['qss', 'shader'],
        nativeCode: false,
      },
    })

    expect(result.ok).toBe(true)
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: 'NATIVE_OPTIONAL_ASSET_KIND_MISSING',
        severity: 'warning',
        pluginId: 'runtime.native-ui',
        required: 'shader',
      }),
    ])
  })

  it('keeps legacy uiSurfaces and qssTargets compatibility aliases active', () => {
    const result = checkNativeCompatibility({
      hostInfo: createHostInfo(),
      compatibility: {
        uiSurfaces: ['Panel', 'Drawer'],
        qssTargets: ['color', 'gap'],
        nativeCode: false,
      },
    })

    expect(result.ok).toBe(false)
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'NATIVE_REQUIRED_QSS_FEATURE_MISSING',
        required: 'gap',
      }),
      expect.objectContaining({
        code: 'NATIVE_REQUIRED_QUI_COMPONENT_MISSING',
        required: 'Drawer',
      }),
    ]))
    expect(result.diagnostics).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ required: 'Panel' }),
      expect.objectContaining({ required: 'color' }),
    ]))
  })

  it('rejects dynamic packages that request native code activation', () => {
    const result = checkNativeCompatibility({
      hostInfo: createHostInfo(),
      compatibility: {
        nativeCode: true,
      } as any,
    })

    expect(result.ok).toBe(false)
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: 'NATIVE_CODE_NOT_ALLOWED',
        severity: 'error',
      }),
    ])
  })

  it('rejects native compatibility declarations without an explicit nativeCode false marker', () => {
    const result = checkNativeCompatibility({
      hostInfo: createHostInfo(),
      compatibility: {
        renderer: '@quajs/native-renderer',
        version: '^0.1.0',
        capabilityIds: ['native-wgpu.ui.surface@1'],
      },
    })

    expect(result.ok).toBe(false)
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: 'NATIVE_CODE_NOT_ALLOWED',
        severity: 'error',
        message: 'Dynamic native runtime packages must explicitly declare nativeCode: false.',
      }),
    ])
  })
})
