import type {
  NativeGuardBundleManifest,
  NativeGuardDynamicBundleRecord,
  NativeGuardRuntimePackageManifest,
} from '../src'
import { describe, expect, it } from 'vitest'
import {
  assertNativeRuntimePackageGuard,
  checkNativeRuntimePackageGuard,
  isForbiddenNativePayload,
} from '../src'

function createRuntimePackage(overrides: Partial<NativeGuardRuntimePackageManifest> = {}): NativeGuardRuntimePackageManifest {
  return {
    id: 'runtime.chapter.native-ui',
    version: '1.0.0',
    scripts: [
      { id: 'chapter.opening', assetName: 'scripts/opening.js' },
    ],
    plugins: [
      { id: 'chapter.renderer.ui', kind: 'renderer', renderer: '@quajs/native-renderer', assetName: 'ui/menu.qui.json' },
    ],
    metadata: {
      nativeRenderer: {
        packageName: '@quajs/native-renderer',
        versionRange: '^0.1.0',
        nativeCode: false,
      },
    },
    ...overrides,
  }
}

function createBundle(runtimePackage = createRuntimePackage()): NativeGuardDynamicBundleRecord & {
  packageId: string
  bundleName: string
  version: string
  bundleVersion: number
  hash: string
  priority: number
  loadedAt: number
  assetCount: number
} {
  return {
    packageId: runtimePackage.id,
    bundleName: 'runtime.chapter.native-ui',
    version: '1.0.0',
    bundleVersion: 1,
    hash: 'hash',
    priority: 0,
    loadedAt: 1,
    assetCount: 4,
    manifest: createBundleManifest(runtimePackage),
  }
}

function createBundleManifest(_runtimePackage: NativeGuardRuntimePackageManifest): NativeGuardBundleManifest {
  return {
    assets: {
      scripts: {
        'opening.js': {
          name: 'opening.js',
          path: 'scripts/opening.js',
          relativePath: 'scripts/opening.js',
        },
      },
      data: {
        'menu.qui.json': {
          name: 'menu.qui.json',
          path: 'ui/menu.qui.json',
          relativePath: 'ui/menu.qui.json',
        },
      },
      images: {
        'poster.webp': {
          name: 'poster.webp',
          path: 'images/poster.webp',
          relativePath: 'images/poster.webp',
        },
      },
    },
  }
}

describe('native runtime package guard', () => {
  it('accepts content-only QS/JS/assets/QUI/QSS runtime packages', () => {
    const runtimePackage = createRuntimePackage({
      scripts: [
        { id: 'chapter.opening', assetName: 'scripts/opening.js' },
        { id: 'chapter.branch', assetName: 'scripts/branch.js', variants: { ja: { assetName: 'scripts/branch.ja.js' } } },
      ],
      storeMigrations: [
        { id: 'settings-defaults', assetName: 'migrations/settings.js' },
      ],
      plugins: [
        { id: 'chapter.renderer.ui', kind: 'renderer', renderer: '@quajs/native-renderer', assetName: 'ui/menu.qui.json' },
      ],
    })

    expect(checkNativeRuntimePackageGuard({
      package: runtimePackage,
      bundle: createBundle(runtimePackage),
    })).toEqual({
      ok: true,
      diagnostics: [],
    })
  })

  it('rejects native payload extensions referenced by runtime package manifests', () => {
    const result = checkNativeRuntimePackageGuard({
      package: createRuntimePackage({
        scripts: [
          { id: 'native-loader', assetName: 'native/plugin.dll' },
        ],
      }),
    })

    expect(result.ok).toBe(false)
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: 'NATIVE_PACKAGE_NATIVE_PAYLOAD_FORBIDDEN',
        assetName: 'native/plugin.dll',
      }),
    ])
  })

  it('rejects native payload extensions discovered in bundle assets', () => {
    const runtimePackage = createRuntimePackage()
    const bundle = createBundle(runtimePackage)
    bundle.manifest.assets.data!['helper.wasm'] = {
      name: 'helper.wasm',
      path: 'native/helper.wasm',
      relativePath: 'native/helper.wasm',
      size: 1,
      hash: 'wasm-hash',
    }

    const result = checkNativeRuntimePackageGuard({
      package: runtimePackage,
      bundle,
    })

    expect(result.ok).toBe(false)
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: 'NATIVE_PACKAGE_NATIVE_PAYLOAD_FORBIDDEN',
        assetName: 'native/helper.wasm',
      }),
      expect.objectContaining({
        code: 'NATIVE_PACKAGE_NATIVE_PAYLOAD_FORBIDDEN',
        assetName: 'helper.wasm',
      }),
    ])
  })

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

  it('matches native payload extensions case-insensitively', () => {
    expect(isForbiddenNativePayload('Plugins/Renderer.DYLIB')).toBe(true)
    expect(isForbiddenNativePayload('ui/menu.qui.json')).toBe(false)
  })
})
