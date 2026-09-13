import { describe, expect, it } from 'vitest'
import { checkNativeRuntimePackageGuard } from '../src'
import { createRuntimePackage } from './package-guard-fixtures'

describe('native runtime package guard target core isolation', () => {
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
        packageName: '@quajs/renderer-web',
        message: expect.stringContaining('@quajs/renderer-web'),
      }),
      expect.objectContaining({
        code: 'NATIVE_PACKAGE_TARGET_CORE_DEPENDENCY_FORBIDDEN',
        field: 'executableDependencies',
        packageName: '@quajs/engine-native',
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
        packageName: '@quajs/renderer-cocos',
        message: expect.stringContaining('@quajs/renderer-cocos'),
      }),
      expect.objectContaining({
        code: 'NATIVE_PACKAGE_TARGET_CORE_DEPENDENCY_FORBIDDEN',
        field: 'rendererEntries',
        packageName: '@quajs/assets-native',
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
        packageName: '@quajs/renderer-web',
        message: expect.stringContaining('@quajs/renderer-web'),
      }),
      expect.objectContaining({
        code: 'NATIVE_PACKAGE_TARGET_CORE_DEPENDENCY_FORBIDDEN',
        field: 'rendererEntries',
        packageName: '@quajs/engine-native',
        message: expect.stringContaining('@quajs/engine-native'),
      }),
    ]))
  })

  it('normalizes bundled and package-manager paths before target core checks', () => {
    const result = checkNativeRuntimePackageGuard({
      package: createRuntimePackage({
        executableDependencies: [
          'npm:@quajs/renderer-web/plugins/audio?import#hot',
          'C:\\repo\\node_modules\\@quajs\\cocos-host\\runtime.js',
        ],
        rendererEntries: [
          {
            packageName: '@quajs/plugin-native-ui',
            specifier: '/repo/node_modules/.pnpm/@quajs+engine-native@0.1.0/node_modules/@quajs/engine-native/runtime.js',
          },
          '/repo/node_modules/.pnpm/@quajs+native-contracts@0.1.0',
        ],
      }),
    })

    expect(result.ok).toBe(false)
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'NATIVE_PACKAGE_TARGET_CORE_DEPENDENCY_FORBIDDEN',
        field: 'executableDependencies',
        packageName: '@quajs/renderer-web',
      }),
      expect.objectContaining({
        code: 'NATIVE_PACKAGE_TARGET_CORE_DEPENDENCY_FORBIDDEN',
        field: 'executableDependencies',
        packageName: '@quajs/cocos-host',
      }),
      expect.objectContaining({
        code: 'NATIVE_PACKAGE_TARGET_CORE_DEPENDENCY_FORBIDDEN',
        field: 'rendererEntries',
        packageName: '@quajs/engine-native',
      }),
      expect.objectContaining({
        code: 'NATIVE_PACKAGE_TARGET_CORE_DEPENDENCY_FORBIDDEN',
        field: 'rendererEntries',
        packageName: '@quajs/native-contracts',
      }),
    ]))
  })
})
