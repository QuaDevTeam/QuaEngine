import type { QuaTargetBootstrap } from '../../src'
import { describe, expect, it } from 'vitest'
import {
  assertTargetBundleManifest,
  COCOS_TARGET_BOOTSTRAP,
  NATIVE_TARGET_BOOTSTRAP,
  normalizePackageSpecifier,
  validateTargetBundleManifest,
  WEB_TARGET_BOOTSTRAP,
} from '../../src'
import {
  CORE_ADAPTERS_BY_TARGET,
  rendererEntry,
  targetBundleManifest,
  targetBundleManifestFor,
  targetDependencies,
} from '../target-bundle-fixtures'

describe('target bundle manifest target-core isolation adapters', () => {
  it('rejects package roots from another target core plugin family even when the selected adapters are valid', () => {
    const result = validateTargetBundleManifest(targetBundleManifest({
      dependencies: [
        ...targetDependencies('native') || [],
        '@quajs/renderer-vue/plugins/ui',
        '@quajs/cocos-host/runtime',
      ],
      selectedCoreAdapters: NATIVE_TARGET_BOOTSTRAP.coreAdapters,
    }))

    expect(result.ok).toBe(false)
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'TARGET_BUNDLE_CORE_PLUGIN_FAMILY_LEAK',
        target: 'native',
        packageName: '@quajs/renderer-vue',
        packageCorePluginFamily: 'web-core',
        expectedCorePluginFamily: 'native-core',
      }),
      expect.objectContaining({
        code: 'TARGET_BUNDLE_CORE_PLUGIN_FAMILY_LEAK',
        target: 'native',
        packageName: '@quajs/cocos-host',
        packageCorePluginFamily: 'cocos-core',
        expectedCorePluginFamily: 'native-core',
      }),
    ]))
  })

  it('rejects cross-target core adapters for Web, Cocos, and native artifacts', () => {
    for (const target of ['web', 'cocos', 'native'] as const) {
      const crossTargetCoreAdapters = (Object.keys(CORE_ADAPTERS_BY_TARGET) as QuaTargetBootstrap[])
        .filter(candidate => candidate !== target)
        .flatMap(candidate => CORE_ADAPTERS_BY_TARGET[candidate])
      const result = validateTargetBundleManifest(targetBundleManifestFor(target, {
        dependencies: [
          ...(targetDependencies(target) || []),
          ...crossTargetCoreAdapters,
        ],
      }))

      expect(result.ok).toBe(false)
      expect(result.bootstrapValidation.selectedTargets).toEqual(['web', 'cocos', 'native'])
      for (const packageName of crossTargetCoreAdapters) {
        expect(result.diagnostics).toEqual(expect.arrayContaining([
          expect.objectContaining({
            code: 'TARGET_CORE_ADAPTER_FORBIDDEN',
            target,
            packageName: normalizePackageSpecifier(packageName),
          }),
        ]))
      }
    }
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
        { specifier: '@quajs/renderer-vue/plugins/ui', target: 'web' },
        { specifier: '@quajs/renderer-cocos/plugins/audio', target: 'cocos' },
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
      rendererEntries: [{ specifier: '@quajs/renderer-vue/plugins/ui', target: 'web' }],
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
      rendererEntries: [{ specifier: '@quajs/renderer-cocos/plugins/ui', target: 'cocos' }],
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

  it('throws a packaging-ready error when native artifacts mix Web or Cocos core plugins', () => {
    expect(() => assertTargetBundleManifest(targetBundleManifest({
      dependencies: [
        ...targetDependencies('native') || [],
        '@quajs/renderer-web/plugins/ui',
        '@quajs/cocos-host/runtime',
      ],
      rendererEntries: [
        rendererEntry('native'),
        { specifier: '@quajs/renderer-vue/plugins/ui', pluginId: '@quajs/plugin-ui', target: 'web' },
        { specifier: '@quajs/renderer-cocos/plugins/ui', pluginId: '@quajs/plugin-ui', target: 'cocos' },
      ],
      runtimePackages: [
        {
          id: 'runtime.bad.core-leak',
          executableDependencies: ['@quajs/assets-web'],
          rendererEntries: [
            { specifier: '@quajs/renderer-cocos/plugins/dialogue', target: 'cocos' },
          ],
        },
      ],
    }))).toThrow(
      /Target bundle manifest validation failed.*Package output mixes target bootstrap core adapters.*Renderer entry "@quajs\/renderer-vue" declares target "web".*Runtime package "runtime\.bad\.core-leak" must not include target core adapter "@quajs\/assets-web" through "executableDependencies"/,
    )
  })
})
