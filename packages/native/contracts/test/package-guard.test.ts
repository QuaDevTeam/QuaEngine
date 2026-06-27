import { describe, expect, it } from 'vitest'
import {
  checkNativeRuntimePackageGuard,
  isForbiddenNativeAssetReference,
  isForbiddenNativePayload,
} from '../src'
import { createBundle, createRuntimePackage } from './package-guard-fixtures'

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

  it('rejects native payloads hidden in dynamic UI and media resource metadata', () => {
    const result = checkNativeRuntimePackageGuard({
      package: createRuntimePackage({
        metadata: {
          nativeRenderer: {
            packageName: '@quajs/native-renderer',
            versionRange: '^0.1.0',
            nativeCode: false,
            ui: {
              surface: {
                path: 'ui/settings.qui.json',
                fallbackImage: '../escape.png',
              },
              tokens: ['ui/theme.tokens.json', 'native/theme-loader.wasm'],
            },
          },
        },
        plugins: [
          {
            id: 'runtime.media',
            kind: 'renderer',
            assetName: 'plugins/media.js',
            metadata: {
              assets: [
                { name: 'video/poster.webp', path: 'video/poster.webp' },
                { name: 'native/audio-device.node', path: 'audio/theme.ogg' },
                { name: 'video/captions.vtt', href: '../captions.vtt' },
                { name: 'video/decoder.dat', uri: 'native/decoder.wasm' },
              ],
              video: {
                poster: 'video/poster.webp',
                src: 'https://cdn.example.invalid/trailer.mp4',
              },
            },
          },
        ],
      }),
    })

    expect(result.ok).toBe(false)
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'NATIVE_PACKAGE_ASSET_REFERENCE_FORBIDDEN',
        assetName: '../escape.png',
      }),
      expect.objectContaining({
        code: 'NATIVE_PACKAGE_NATIVE_PAYLOAD_FORBIDDEN',
        assetName: 'native/theme-loader.wasm',
      }),
      expect.objectContaining({
        code: 'NATIVE_PACKAGE_NATIVE_PAYLOAD_FORBIDDEN',
        assetName: 'native/audio-device.node',
      }),
      expect.objectContaining({
        code: 'NATIVE_PACKAGE_ASSET_REFERENCE_FORBIDDEN',
        assetName: '../captions.vtt',
      }),
      expect.objectContaining({
        code: 'NATIVE_PACKAGE_NATIVE_PAYLOAD_FORBIDDEN',
        assetName: 'native/decoder.wasm',
      }),
      expect.objectContaining({
        code: 'NATIVE_PACKAGE_ASSET_REFERENCE_FORBIDDEN',
        assetName: 'https://cdn.example.invalid/trailer.mp4',
      }),
    ]))
  })

  it('does not treat ordinary compatibility strings as package asset references', () => {
    const result = checkNativeRuntimePackageGuard({
      package: createRuntimePackage({
        metadata: {
          nativeRenderer: {
            packageName: '@quajs/native-renderer',
            versionRange: '^0.1.0',
            nativeCode: false,
            capabilities: ['native-wgpu.ui.surface@1'],
            quiComponents: ['Panel', 'Button'],
            qssFeatures: ['background-color', 'border-radius'],
          },
          renderers: {
            native: {
              renderer: '@quajs/native-renderer',
              version: '^0.1.0',
              nativeCode: false,
              capabilityIds: ['native-wgpu.input.pointer@1'],
            },
          },
        },
      }),
    })

    expect(result).toEqual({
      ok: true,
      diagnostics: [],
    })
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

  it('matches native payload extensions case-insensitively', () => {
    expect(isForbiddenNativePayload('Plugins/Renderer.DYLIB')).toBe(true)
    expect(isForbiddenNativePayload('native/plugin.dll?raw')).toBe(true)
    expect(isForbiddenNativePayload('native/helper.wasm#runtime')).toBe(true)
    expect(isForbiddenNativePayload('native/helper.wasm?cache=1#runtime')).toBe(true)
    expect(isForbiddenNativePayload('ui/menu.qui.json')).toBe(false)
  })

  it('matches forbidden native asset references across path styles', () => {
    expect(isForbiddenNativeAssetReference('https://example.invalid/asset.js')).toBe(true)
    expect(isForbiddenNativeAssetReference('/absolute/asset.js')).toBe(true)
    expect(isForbiddenNativeAssetReference('C:\\native\\plugin.js')).toBe(true)
    expect(isForbiddenNativeAssetReference('scripts/../escape.js')).toBe(true)
    expect(isForbiddenNativeAssetReference('')).toBe(true)
    expect(isForbiddenNativeAssetReference('   #empty')).toBe(true)
    expect(isForbiddenNativeAssetReference('?empty')).toBe(true)
    expect(isForbiddenNativeAssetReference('scripts/opening.js')).toBe(false)
    expect(isForbiddenNativeAssetReference('ui/menu.qui.json')).toBe(false)
  })
})
