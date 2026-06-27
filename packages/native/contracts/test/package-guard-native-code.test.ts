import { describe, expect, it } from 'vitest'
import {
  assertNativeRuntimePackageGuard,
  checkNativeRuntimePackageGuard,
} from '../src'
import { createRuntimePackage } from './package-guard-fixtures'

describe('native runtime package guard native code declarations', () => {
  it('rejects nativeCode declarations in package and plugin metadata', () => {
    const result = checkNativeRuntimePackageGuard({
      package: createRuntimePackage({
        metadata: {
          nativeCode: true,
        },
        plugins: [
          {
            id: 'native-plugin',
            kind: 'renderer',
            metadata: {
              nativeCode: true,
            },
          },
        ],
      }),
    })

    expect(result.ok).toBe(false)
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: 'NATIVE_PACKAGE_NATIVE_CODE_REQUESTED',
        field: 'metadata.nativeCode',
      }),
      expect.objectContaining({
        code: 'NATIVE_PACKAGE_NATIVE_PLUGIN_FORBIDDEN',
        pluginId: 'native-plugin',
      }),
      expect.objectContaining({
        code: 'NATIVE_PACKAGE_NATIVE_CODE_REQUESTED',
        pluginId: 'native-plugin',
        field: 'plugins.native-plugin.metadata.nativeCode',
      }),
    ])
  })

  it('rejects native payload declarations at package and plugin top level', () => {
    const result = checkNativeRuntimePackageGuard({
      package: createRuntimePackage({
        nativeBinaries: ['native/plugin.dylib'],
        nativeEntry: 'native/bootstrap.node',
        plugins: [
          {
            id: 'native-plugin',
            kind: 'renderer',
            nativePayloads: ['native/plugin.dll'],
            metadata: {
              nativeCode: false,
            },
          },
        ],
      }),
    })

    expect(result.ok).toBe(false)
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: 'NATIVE_PACKAGE_NATIVE_CODE_REQUESTED',
        field: 'package.nativeBinaries',
      }),
      expect.objectContaining({
        code: 'NATIVE_PACKAGE_NATIVE_CODE_REQUESTED',
        field: 'package.nativeEntry',
      }),
      expect.objectContaining({
        code: 'NATIVE_PACKAGE_NATIVE_CODE_REQUESTED',
        pluginId: 'native-plugin',
        field: 'plugins.native-plugin.nativePayloads',
      }),
    ])
  })

  it('rejects native compatibility blocks without explicit nativeCode false markers', () => {
    const result = checkNativeRuntimePackageGuard({
      package: createRuntimePackage({
        metadata: {
          nativeRenderer: {
            packageName: '@quajs/native-renderer',
            versionRange: '^0.1.0',
          },
          renderers: {
            native: {
              renderer: '@quajs/native-renderer',
              version: '^0.1.0',
            },
          },
        },
      }),
    })

    expect(result.ok).toBe(false)
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: 'NATIVE_PACKAGE_NATIVE_CODE_REQUESTED',
        field: 'metadata.nativeRenderer.nativeCode',
      }),
      expect.objectContaining({
        code: 'NATIVE_PACKAGE_NATIVE_CODE_REQUESTED',
        field: 'metadata.renderers.native.nativeCode',
      }),
    ])
  })

  it('rejects plugin native compatibility blocks without explicit nativeCode false markers', () => {
    const result = checkNativeRuntimePackageGuard({
      package: createRuntimePackage({
        plugins: [
          {
            id: 'menu-ui',
            kind: 'renderer',
            assetName: 'plugins/menu-ui.js',
            metadata: {
              nativeRenderer: {
                packageName: '@quajs/native-renderer',
                versionRange: '^0.1.0',
              },
            },
          },
          {
            id: 'settings-ui',
            kind: 'renderer',
            assetName: 'plugins/settings-ui.js',
            metadata: {
              renderers: {
                native: {
                  renderer: '@quajs/native-renderer',
                  version: '^0.1.0',
                },
              },
            },
          },
        ],
      }),
    })

    expect(result.ok).toBe(false)
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: 'NATIVE_PACKAGE_NATIVE_CODE_REQUESTED',
        pluginId: 'menu-ui',
        field: 'plugins.menu-ui.metadata.nativeRenderer.nativeCode',
      }),
      expect.objectContaining({
        code: 'NATIVE_PACKAGE_NATIVE_CODE_REQUESTED',
        pluginId: 'settings-ui',
        field: 'plugins.settings-ui.metadata.renderers.native.nativeCode',
      }),
    ])
  })

  it('accepts plugin native compatibility blocks with explicit nativeCode false markers', () => {
    const result = checkNativeRuntimePackageGuard({
      package: createRuntimePackage({
        plugins: [
          {
            id: 'menu-ui',
            kind: 'renderer',
            assetName: 'plugins/menu-ui.js',
            metadata: {
              nativeRenderer: {
                packageName: '@quajs/native-renderer',
                versionRange: '^0.1.0',
                nativeCode: false,
              },
            },
          },
          {
            id: 'settings-ui',
            kind: 'renderer',
            assetName: 'plugins/settings-ui.js',
            metadata: {
              renderers: {
                native: {
                  renderer: '@quajs/native-renderer',
                  version: '^0.1.0',
                  nativeCode: false,
                },
              },
            },
          },
        ],
      }),
    })

    expect(result).toEqual({
      ok: true,
      diagnostics: [],
    })
  })

  it('rejects plugin metadata that declares native plugin kind or target', () => {
    const result = checkNativeRuntimePackageGuard({
      package: createRuntimePackage({
        plugins: [
          { id: 'rust-renderer', kind: 'renderer', metadata: { kind: 'native-code' } },
          { id: 'native-target', kind: 'renderer', metadata: { target: 'rust' } },
        ],
      }),
    })

    expect(result.ok).toBe(false)
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: 'NATIVE_PACKAGE_NATIVE_PLUGIN_FORBIDDEN',
        pluginId: 'rust-renderer',
      }),
      expect.objectContaining({
        code: 'NATIVE_PACKAGE_NATIVE_PLUGIN_FORBIDDEN',
        pluginId: 'native-target',
      }),
    ])
  })

  it('throws a combined error message for invalid runtime packages', () => {
    expect(() => assertNativeRuntimePackageGuard({
      package: createRuntimePackage({
        metadata: {
          nativeCode: true,
        },
        scripts: [
          { id: 'native-loader', assetName: 'native/plugin.node' },
        ],
      }),
    })).toThrow(/requests native code.*contains forbidden native payload/)
  })
})
