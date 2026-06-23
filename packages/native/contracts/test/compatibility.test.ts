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
      capabilities: [
        {
          id: 'native-wgpu.ui.surface@1',
          target: 'native',
          version: '1.0.0',
          ownerPackage: '@quajs/native-renderer',
          projectionKeys: ['ui.overlays'],
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
        capabilities: ['native-wgpu.ui.surface@1', 'native-wgpu.image@1'],
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
        capabilities: ['native-wgpu.video@1'],
        nativeCode: false,
      },
    })

    expect(result.ok).toBe(false)
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: 'NATIVE_REQUIRED_CAPABILITY_MISSING',
        severity: 'error',
        required: 'native-wgpu.video@1',
      }),
    ])
  })

  it('warns for missing optional capabilities without failing activation', () => {
    const result = checkNativeCompatibility({
      hostInfo: createHostInfo(),
      compatibility: {
        optionalCapabilities: ['native-wgpu.filters@1'],
        nativeCode: false,
      },
    })

    expect(result.ok).toBe(true)
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: 'NATIVE_OPTIONAL_CAPABILITY_MISSING',
        severity: 'warning',
        required: 'native-wgpu.filters@1',
      }),
    ])
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
})
