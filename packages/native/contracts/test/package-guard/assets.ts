import { describe, expect, it } from 'vitest'
import { checkNativeRuntimePackageGuard } from '../../src'
import { createBundle, createRuntimePackage } from '../package-guard-fixtures'

describe('native runtime package guard asset references', () => {
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

  it('rejects empty and suffix-only asset references before native runtime loading', () => {
    const runtimePackage = createRuntimePackage({
      scripts: [
        { id: 'empty-script', assetName: '' },
        { id: 'hash-script', assetName: '   #script' },
      ],
      scenes: [
        { id: 'query-scene', assetName: '?scene' },
      ],
      plugins: [
        {
          id: 'blank-plugin-module',
          kind: 'renderer',
          assetName: 'plugins/native-ui.js',
          variants: {
            blank: { module: '   ' },
          },
        },
      ],
    })
    const bundle = createBundle(runtimePackage)
    bundle.manifest.assets.data!['empty-path'] = {
      name: 'menu.qui.json',
      path: '',
      relativePath: 'ui/menu.qui.json',
    }
    bundle.manifest.assets.images!['poster.webp'].variants = {
      empty: {
        name: '#poster',
        path: 'images/poster.webp',
        relativePath: 'images/poster.webp',
      },
    }

    const result = checkNativeRuntimePackageGuard({
      package: runtimePackage,
      bundle,
    })

    expect(result.ok).toBe(false)
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'NATIVE_PACKAGE_ASSET_REFERENCE_FORBIDDEN',
        assetName: '',
      }),
      expect.objectContaining({
        code: 'NATIVE_PACKAGE_ASSET_REFERENCE_FORBIDDEN',
        assetName: '   #script',
      }),
      expect.objectContaining({
        code: 'NATIVE_PACKAGE_ASSET_REFERENCE_FORBIDDEN',
        assetName: '?scene',
      }),
      expect.objectContaining({
        code: 'NATIVE_PACKAGE_ASSET_REFERENCE_FORBIDDEN',
        assetName: '   ',
      }),
      expect.objectContaining({
        code: 'NATIVE_PACKAGE_ASSET_REFERENCE_FORBIDDEN',
        assetName: '#poster',
      }),
    ]))
  })
})
