import { describe, expect, it } from 'vitest'
import { checkNativeRuntimePackageGuard } from '../../src'
import { createRuntimePackage } from '../package-guard-fixtures'

describe('native runtime package guard metadata scanning', () => {
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

  it('rejects direct resource url, uri, href, and name metadata references', () => {
    const result = checkNativeRuntimePackageGuard({
      package: createRuntimePackage({
        metadata: {
          nativeRenderer: {
            packageName: '@quajs/native-renderer',
            versionRange: '^0.1.0',
            nativeCode: false,
            ui: {
              href: '../ui/menu.qui',
              url: 'https://cdn.example.invalid/theme.qss',
              uri: 'native/theme-loader.wasm',
              name: 'native/panel.node',
            },
          },
        },
      }),
    })

    expect(result.ok).toBe(false)
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'NATIVE_PACKAGE_ASSET_REFERENCE_FORBIDDEN',
        assetName: '../ui/menu.qui',
      }),
      expect.objectContaining({
        code: 'NATIVE_PACKAGE_ASSET_REFERENCE_FORBIDDEN',
        assetName: 'https://cdn.example.invalid/theme.qss',
      }),
      expect.objectContaining({
        code: 'NATIVE_PACKAGE_NATIVE_PAYLOAD_FORBIDDEN',
        assetName: 'native/theme-loader.wasm',
      }),
      expect.objectContaining({
        code: 'NATIVE_PACKAGE_NATIVE_PAYLOAD_FORBIDDEN',
        assetName: 'native/panel.node',
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
})
