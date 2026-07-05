import { describe, expect, it } from 'vitest'
import { checkNativeCompatibility } from '../../src'
import { createHostInfo } from './helpers'

describe('checkNativeCompatibility capabilities and resources', () => {
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

  it('rejects runtime packages that require unsupported native intent events', () => {
    const result = checkNativeCompatibility({
      hostInfo: createHostInfo({
        capabilities: [
          {
            id: 'native-wgpu.ui.surface@1',
            target: 'native',
            version: '1.0.0',
            ownerPackage: '@quajs/native-renderer',
            projectionKeys: ['view.ui.overlays'],
            intentEvents: ['ui/intent'],
            fallback: 'reject-package',
          },
        ],
      }),
      pluginId: 'runtime.native-choice-ui',
      compatibility: {
        capabilities: ['native-wgpu.ui.surface@1'],
        intentEvents: ['choice/select', 'ui/intent'],
        nativeCode: false,
      },
    })

    expect(result.ok).toBe(false)
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: 'NATIVE_REQUIRED_INTENT_EVENT_MISSING',
        severity: 'error',
        pluginId: 'runtime.native-choice-ui',
        required: 'choice/select',
      }),
    ])
  })

  it('warns for missing optional native intent events without failing activation', () => {
    const result = checkNativeCompatibility({
      hostInfo: createHostInfo({
        capabilities: [
          {
            id: 'native-wgpu.ui.surface@1',
            target: 'native',
            version: '1.0.0',
            ownerPackage: '@quajs/native-renderer',
            projectionKeys: ['view.ui.overlays'],
            intentEvents: ['ui/intent'],
            fallback: 'reject-package',
          },
        ],
      }),
      pluginId: 'runtime.native-menu',
      compatibility: {
        optionalIntentEvents: ['choice/select', 'ui/intent'],
        nativeCode: false,
      },
    })

    expect(result.ok).toBe(true)
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: 'NATIVE_OPTIONAL_INTENT_EVENT_MISSING',
        severity: 'warning',
        pluginId: 'runtime.native-menu',
        required: 'choice/select',
      }),
    ])
  })

  it('warns for missing optional QSS features and QUI components without failing activation', () => {
    const result = checkNativeCompatibility({
      hostInfo: createHostInfo(),
      pluginId: 'runtime.native-menu',
      compatibility: {
        optionalQssFeatures: ['color', 'gap'],
        optionalQuiComponents: ['Panel', 'Drawer'],
        nativeCode: false,
      },
    })

    expect(result.ok).toBe(true)
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'NATIVE_OPTIONAL_QSS_FEATURE_MISSING',
        severity: 'warning',
        pluginId: 'runtime.native-menu',
        required: 'gap',
      }),
      expect.objectContaining({
        code: 'NATIVE_OPTIONAL_QUI_COMPONENT_MISSING',
        severity: 'warning',
        pluginId: 'runtime.native-menu',
        required: 'Drawer',
      }),
    ]))
    expect(result.diagnostics).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ required: 'color' }),
      expect.objectContaining({ required: 'Panel' }),
    ]))
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
})
