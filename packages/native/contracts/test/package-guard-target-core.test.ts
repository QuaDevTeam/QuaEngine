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
})
