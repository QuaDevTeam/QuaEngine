import { describe, expect, it } from 'vitest'
import {
  COCOS_TARGET_BOOTSTRAP,
  NATIVE_TARGET_BOOTSTRAP,
  WEB_TARGET_BOOTSTRAP,
  type TargetBundleManifest,
  collectTargetBundlePackageNames,
  validateTargetBundleManifest,
} from '../src'

function targetBundleManifest(overrides: Partial<TargetBundleManifest> = {}): TargetBundleManifest {
  return {
    schemaVersion: 1,
    target: 'native',
    profile: 'release',
    platform: 'macos',
    app: {
      bundleId: 'dev.quajs.native.fixture',
      version: '1.0.0',
      buildNumber: '100',
      icon: 'AppIcon.icns',
    },
    selectedCoreAdapters: NATIVE_TARGET_BOOTSTRAP.coreAdapters,
    dependencies: [
      '@quajs/engine',
      '@quajs/pipeline',
      '@quajs/native-contracts/bootstrap',
      { specifier: '@quajs/engine-native/native-host', runtime: true, source: 'static-import' },
      { specifier: '@quajs/assets-native', runtime: true, source: 'static-import' },
      { specifier: '@quajs/store-native', runtime: true, source: 'static-import' },
    ],
    rendererEntries: [
      { specifier: '@quajs/native-renderer/builtin', target: 'native' },
    ],
    runtimePackages: [
      {
        id: 'runtime.chapter.1',
        executableDependencies: ['@quajs/character'],
        rendererEntries: ['@quajs/native-renderer/ui'],
      },
    ],
    ...overrides,
  }
}

describe('target bundle manifest validation', () => {
  it('accepts a native bundle manifest with only native core adapters', () => {
    const result = validateTargetBundleManifest(targetBundleManifest())

    expect(result.ok).toBe(true)
    expect(result.bootstrapValidation.selectedTargets).toEqual(['native'])
    expect(result.diagnostics).toEqual([])
  })

  it('normalizes subentry dependencies before validating target isolation', () => {
    expect(collectTargetBundlePackageNames(targetBundleManifest())).toContain('@quajs/engine-native')
    expect(collectTargetBundlePackageNames(targetBundleManifest())).toContain('@quajs/native-contracts')
  })

  it('rejects native artifacts that include Web or Cocos renderer entries after bundling', () => {
    const result = validateTargetBundleManifest(targetBundleManifest({
      dependencies: [
        '@quajs/engine',
        '@quajs/renderer-web/plugins/audio',
        '@quajs/cocos-host/testing',
        ...NATIVE_TARGET_BOOTSTRAP.coreAdapters,
      ],
      rendererEntries: [
        '@quajs/renderer-vue/plugins/ui',
        '@quajs/renderer-cocos/plugins/audio',
      ],
    }))

    expect(result.ok).toBe(false)
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'TARGET_BOOTSTRAP_MIXED',
        targets: ['web', 'cocos', 'native'],
      }),
      expect.objectContaining({
        code: 'TARGET_CORE_ADAPTER_FORBIDDEN',
        packageName: '@quajs/renderer-web',
      }),
      expect.objectContaining({
        code: 'TARGET_CORE_ADAPTER_FORBIDDEN',
        packageName: '@quajs/renderer-vue',
      }),
      expect.objectContaining({
        code: 'TARGET_CORE_ADAPTER_FORBIDDEN',
        packageName: '@quajs/cocos-host',
      }),
      expect.objectContaining({
        code: 'TARGET_CORE_ADAPTER_FORBIDDEN',
        packageName: '@quajs/renderer-cocos',
      }),
    ]))
  })

  it('rejects Web artifacts that retain native contracts in the runtime graph', () => {
    const result = validateTargetBundleManifest(targetBundleManifest({
      target: 'web',
      platform: 'web',
      selectedCoreAdapters: WEB_TARGET_BOOTSTRAP.coreAdapters,
      dependencies: [
        '@quajs/assets-web',
        '@quajs/renderer-web/plugins/audio',
        '@quajs/native-contracts/bootstrap',
      ],
      rendererEntries: ['@quajs/renderer-vue/plugins/ui'],
    }))

    expect(result.ok).toBe(false)
    expect(result.bootstrapValidation.selectedTargets).toEqual(['web', 'native'])
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'TARGET_BOOTSTRAP_MIXED',
        targets: ['web', 'native'],
      }),
      expect.objectContaining({
        code: 'TARGET_CORE_ADAPTER_FORBIDDEN',
        packageName: '@quajs/native-contracts',
      }),
    ]))
  })

  it('rejects Cocos artifacts that retain native contracts in the runtime graph', () => {
    const result = validateTargetBundleManifest(targetBundleManifest({
      target: 'cocos',
      platform: 'cocos',
      selectedCoreAdapters: COCOS_TARGET_BOOTSTRAP.coreAdapters,
      dependencies: [
        '@quajs/cocos-host/runtime',
        '@quajs/assets-cocos',
        '@quajs/renderer-cocos/plugins/audio',
        '@quajs/native-contracts/bootstrap',
      ],
      rendererEntries: ['@quajs/renderer-cocos/plugins/ui'],
    }))

    expect(result.ok).toBe(false)
    expect(result.bootstrapValidation.selectedTargets).toEqual(['cocos', 'native'])
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'TARGET_BOOTSTRAP_MIXED',
        targets: ['cocos', 'native'],
      }),
      expect.objectContaining({
        code: 'TARGET_CORE_ADAPTER_FORBIDDEN',
        packageName: '@quajs/native-contracts',
      }),
    ]))
  })

  it('rejects runtime packages that declare target core adapters as executable dependencies', () => {
    const result = validateTargetBundleManifest(targetBundleManifest({
      runtimePackages: [
        {
          id: 'runtime.bad.web-entry',
          executableDependencies: [
            '@quajs/character',
            '@quajs/renderer-web/plugins/audio',
          ],
        },
        {
          id: 'runtime.bad.native-entry',
          rendererEntries: [
            '@quajs/engine-native/native-host',
          ],
        },
      ],
    }))

    expect(result.ok).toBe(false)
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'TARGET_BUNDLE_RUNTIME_PACKAGE_CORE_ADAPTER',
        runtimePackageId: 'runtime.bad.web-entry',
        packageName: '@quajs/renderer-web',
      }),
      expect.objectContaining({
        code: 'TARGET_BUNDLE_RUNTIME_PACKAGE_CORE_ADAPTER',
        runtimePackageId: 'runtime.bad.native-entry',
        packageName: '@quajs/engine-native',
      }),
    ]))
  })
})
