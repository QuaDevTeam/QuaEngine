import { describe, expect, it } from 'vitest'
import { checkNativeCompatibility, createNativeUiSurfaceCompatibility } from '../../src'
import { createHostInfo } from './helpers'

describe('checkNativeCompatibility acceptance', () => {
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
        intentEvents: ['ui/intent'],
        quiComponents: ['Panel', 'Button', 'Text'],
        qssFeatures: ['background-color', 'border-radius', 'font-size'],
        assetKinds: ['qui', 'qss', 'tokens'],
        nativeCode: false,
      },
    })

    expect(result).toEqual({ ok: true, diagnostics: [] })
  })

  it('creates native UI surface compatibility from renderer capability metadata', () => {
    const hostInfo = createHostInfo()
    const compatibility = createNativeUiSurfaceCompatibility({
      rendererVersionRange: '^0.1.0',
      capabilities: hostInfo.renderer.capabilities,
      quiComponents: ['Scroll'],
      qssFeatures: ['object-fit'],
    })

    expect(compatibility).toMatchObject({
      packageName: '@quajs/native-renderer',
      versionRange: '^0.1.0',
      capabilities: ['native-wgpu.ui.surface@1'],
      nativeCode: false,
    })
    expect(compatibility.assetKinds).toEqual(expect.arrayContaining(['qui', 'qss', 'tokens']))
    expect(compatibility.intentEvents).toEqual(expect.arrayContaining(['choice/select', 'ui/intent']))
    expect(compatibility.quiComponents).toEqual(expect.arrayContaining(['Box', 'Button', 'Panel', 'Scroll', 'Text']))
    expect(compatibility.qssFeatures).toEqual(expect.arrayContaining(['background-color', 'border-radius', 'font-size', 'object-fit']))
    expect([
      ...(compatibility.capabilities || []),
      ...(compatibility.optionalCapabilities || []),
    ]).not.toContain('native-wgpu.audio@1')
    expect(checkNativeCompatibility({ hostInfo, compatibility })).toEqual({
      ok: true,
      diagnostics: [],
    })
  })

  it('does not invent UI surface components or QSS features when no capability metadata is supplied', () => {
    const compatibility = createNativeUiSurfaceCompatibility({
      quiComponents: ['Panel'],
      qssFeatures: ['background-color'],
      optionalCapabilities: ['native-wgpu.video@1'],
      optionalAssetKinds: ['video'],
    })

    expect(compatibility).toEqual({
      packageName: '@quajs/native-renderer',
      capabilities: ['native-wgpu.ui.surface@1'],
      optionalCapabilities: ['native-wgpu.video@1'],
      assetKinds: ['qui', 'qss', 'tokens'],
      optionalAssetKinds: ['video'],
      quiComponents: ['Panel'],
      qssFeatures: ['background-color'],
      nativeCode: false,
    })
    expect([
      ...(compatibility.capabilities || []),
      ...(compatibility.optionalCapabilities || []),
    ]).not.toContain('native-wgpu.audio@1')
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
})
