import type {
  NativeGuardBundleManifest,
  NativeGuardDynamicBundleRecord,
  NativeGuardRuntimePackageManifest,
} from '../src'
import { describe, expect, it } from 'vitest'
import {
  assertNativeRuntimePackageGuard,
  checkNativeRuntimePackageGuard,
  isForbiddenNativeAssetReference,
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

  it('rejects native payload extensions discovered in bundle asset variant names', () => {
    const runtimePackage = createRuntimePackage()
    const bundle = createBundle(runtimePackage)
    bundle.manifest.assets.images!['poster.webp'].variants = {
      windows: {
        name: 'poster-helper.dll',
        path: 'images/poster.windows.webp',
        relativePath: 'images/poster.windows.webp',
      },
    }

    const result = checkNativeRuntimePackageGuard({
      package: runtimePackage,
      bundle,
    })

    expect(result.ok).toBe(false)
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: 'NATIVE_PACKAGE_NATIVE_PAYLOAD_FORBIDDEN',
        assetName: 'poster-helper.dll',
      }),
    ])
  })

  it('rejects non-package-relative asset references before native runtime loading', () => {
    const runtimePackage = createRuntimePackage({
      scripts: [
        {
          id: 'remote',
          assetName: 'https://cdn.example.invalid/opening.js',
          variants: {
            escape: {
              assetName: '../outside.js',
            },
          },
        },
      ],
      scenes: [
        { id: 'absolute-scene', assetName: '/tmp/scene.js' },
      ],
      plugins: [
        {
          id: 'windows-plugin',
          kind: 'renderer',
          assetName: 'C:\\native\\plugin.js',
        },
      ],
      storeMigrations: [
        { id: 'settings', assetName: 'migrations/../settings.js' },
      ],
    })
    const bundle = createBundle(runtimePackage)
    bundle.manifest.assets.images!['escape.png'] = {
      name: 'escape.png',
      path: 'images/../escape.png',
      relativePath: 'images/../escape.png',
    }

    const result = checkNativeRuntimePackageGuard({
      package: runtimePackage,
      bundle,
    })

    expect(result.ok).toBe(false)
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'NATIVE_PACKAGE_ASSET_REFERENCE_FORBIDDEN',
        assetName: 'https://cdn.example.invalid/opening.js',
      }),
      expect.objectContaining({
        code: 'NATIVE_PACKAGE_ASSET_REFERENCE_FORBIDDEN',
        assetName: '../outside.js',
      }),
      expect.objectContaining({
        code: 'NATIVE_PACKAGE_ASSET_REFERENCE_FORBIDDEN',
        assetName: '/tmp/scene.js',
      }),
      expect.objectContaining({
        code: 'NATIVE_PACKAGE_ASSET_REFERENCE_FORBIDDEN',
        assetName: 'C:\\native\\plugin.js',
      }),
      expect.objectContaining({
        code: 'NATIVE_PACKAGE_ASSET_REFERENCE_FORBIDDEN',
        assetName: 'migrations/../settings.js',
      }),
      expect.objectContaining({
        code: 'NATIVE_PACKAGE_ASSET_REFERENCE_FORBIDDEN',
        assetName: 'images/../escape.png',
      }),
    ]))
  })

  it('rejects forbidden runtime module variant references beyond scripts', () => {
    const result = checkNativeRuntimePackageGuard({
      package: createRuntimePackage({
        scenes: [
          {
            id: 'scene.native',
            assetName: 'scenes/native.js',
            variants: {
              escape: { module: '../outside-scene.js' },
            },
          },
        ],
        plugins: [
          {
            id: 'renderer.native-ui',
            kind: 'renderer',
            assetName: 'plugins/native-ui.js',
            variants: {
              windows: { assetName: 'plugins/native-ui.dll' },
            },
          },
        ],
        storeMigrations: [
          {
            id: 'settings',
            assetName: 'migrations/settings.js',
            variants: {
              macos: { module: 'migrations/settings.dylib' },
            },
          },
        ],
      }),
    })

    expect(result.ok).toBe(false)
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'NATIVE_PACKAGE_ASSET_REFERENCE_FORBIDDEN',
        assetName: '../outside-scene.js',
      }),
      expect.objectContaining({
        code: 'NATIVE_PACKAGE_NATIVE_PAYLOAD_FORBIDDEN',
        assetName: 'plugins/native-ui.dll',
      }),
      expect.objectContaining({
        code: 'NATIVE_PACKAGE_NATIVE_PAYLOAD_FORBIDDEN',
        assetName: 'migrations/settings.dylib',
      }),
    ]))
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

  it('rejects target core adapters declared as runtime package executable dependencies', () => {
    const result = checkNativeRuntimePackageGuard({
      package: createRuntimePackage({
        executableDependencies: [
          '@quajs/character',
          '@quajs/renderer-web/plugins/audio',
          { specifier: '@quajs/engine-native/runtime' },
        ],
      }),
    })

    expect(result.ok).toBe(false)
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: 'NATIVE_PACKAGE_TARGET_CORE_DEPENDENCY_FORBIDDEN',
        field: 'executableDependencies',
        message: expect.stringContaining('@quajs/renderer-web'),
      }),
      expect.objectContaining({
        code: 'NATIVE_PACKAGE_TARGET_CORE_DEPENDENCY_FORBIDDEN',
        field: 'executableDependencies',
        message: expect.stringContaining('@quajs/engine-native'),
      }),
    ])
  })

  it('rejects target core adapters declared as runtime package renderer entries', () => {
    const result = checkNativeRuntimePackageGuard({
      package: createRuntimePackage({
        rendererEntries: [
          '@quajs/plugin-gallery/native',
          '@quajs/renderer-cocos/plugins/dialogue',
          { specifier: '@quajs/assets-native/runtime' },
        ],
      }),
    })

    expect(result.ok).toBe(false)
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: 'NATIVE_PACKAGE_TARGET_CORE_DEPENDENCY_FORBIDDEN',
        field: 'rendererEntries',
        message: expect.stringContaining('@quajs/renderer-cocos'),
      }),
      expect.objectContaining({
        code: 'NATIVE_PACKAGE_TARGET_CORE_DEPENDENCY_FORBIDDEN',
        field: 'rendererEntries',
        message: expect.stringContaining('@quajs/assets-native'),
      }),
    ])
  })

  it('checks both specifier and packageName fields in runtime package references', () => {
    const result = checkNativeRuntimePackageGuard({
      package: createRuntimePackage({
        executableDependencies: [
          {
            packageName: '@quajs/character',
            specifier: '@quajs/renderer-web/plugins/audio',
          },
        ],
        rendererEntries: [
          {
            packageName: '@quajs/plugin-gallery',
            specifier: '@quajs/engine-native/native-host',
          },
        ],
      }),
    })

    expect(result.ok).toBe(false)
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'NATIVE_PACKAGE_TARGET_CORE_DEPENDENCY_FORBIDDEN',
        field: 'executableDependencies',
        message: expect.stringContaining('@quajs/renderer-web'),
      }),
      expect.objectContaining({
        code: 'NATIVE_PACKAGE_TARGET_CORE_DEPENDENCY_FORBIDDEN',
        field: 'rendererEntries',
        message: expect.stringContaining('@quajs/engine-native'),
      }),
    ]))
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

  it('matches forbidden native asset references across path styles', () => {
    expect(isForbiddenNativeAssetReference('https://example.invalid/asset.js')).toBe(true)
    expect(isForbiddenNativeAssetReference('/absolute/asset.js')).toBe(true)
    expect(isForbiddenNativeAssetReference('C:\\native\\plugin.js')).toBe(true)
    expect(isForbiddenNativeAssetReference('scripts/../escape.js')).toBe(true)
    expect(isForbiddenNativeAssetReference('scripts/opening.js')).toBe(false)
    expect(isForbiddenNativeAssetReference('ui/menu.qui.json')).toBe(false)
  })
})
