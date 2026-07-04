import { describe, expect, it } from 'vitest'
import { checkNativeRuntimePackageGuard } from '../../src'
import { createBundle, createRuntimePackage } from '../package-guard-fixtures'

describe('native runtime package guard content packages', () => {
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
})
