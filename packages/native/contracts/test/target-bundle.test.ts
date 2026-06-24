import type { QuaTargetBootstrap, TargetBundleManifest } from '../src'
import { describe, expect, it } from 'vitest'
import {
  assertTargetBundleManifest,
  COCOS_TARGET_BOOTSTRAP,
  collectTargetBundlePackageNames,
  getTargetCorePluginFamily,
  NATIVE_TARGET_BOOTSTRAP,
  normalizePackageSpecifier,
  validateTargetBundleManifest,
  WEB_TARGET_BOOTSTRAP,
} from '../src'

const CORE_ADAPTERS_BY_TARGET = {
  web: WEB_TARGET_BOOTSTRAP.coreAdapters,
  cocos: COCOS_TARGET_BOOTSTRAP.coreAdapters,
  native: NATIVE_TARGET_BOOTSTRAP.coreAdapters,
} satisfies Record<QuaTargetBootstrap, readonly string[]>

const PLATFORM_BY_TARGET = {
  web: 'web',
  cocos: 'cocos',
  native: 'macos',
} satisfies Record<QuaTargetBootstrap, string>

function targetDependencies(target: QuaTargetBootstrap): TargetBundleManifest['dependencies'] {
  const shared = ['@quajs/engine', '@quajs/pipeline']
  switch (target) {
    case 'web':
      return [
        ...shared,
        '@quajs/assets-web',
        '@quajs/renderer-web/plugins/audio',
      ]
    case 'cocos':
      return [
        ...shared,
        '@quajs/cocos-host/runtime',
        '@quajs/assets-cocos',
        '@quajs/renderer-cocos/plugins/audio',
      ]
    case 'native':
      return [
        ...shared,
        '@quajs/native-contracts/bootstrap',
        { specifier: '@quajs/engine-native/native-host', runtime: true, source: 'static-import' },
        { specifier: '@quajs/assets-native', runtime: true, source: 'static-import' },
        { specifier: '@quajs/store-native', runtime: true, source: 'static-import' },
      ]
  }
}

function rendererEntry(target: QuaTargetBootstrap): NonNullable<TargetBundleManifest['rendererEntries']>[number] {
  switch (target) {
    case 'web':
      return { specifier: '@quajs/renderer-vue/plugins/ui', target: 'web' }
    case 'cocos':
      return { specifier: '@quajs/renderer-cocos/plugins/ui', target: 'cocos' }
    case 'native':
      return { specifier: '@quajs/native-renderer/builtin', target: 'native' }
  }
}

function targetBundleManifest(overrides: Partial<TargetBundleManifest> = {}): TargetBundleManifest {
  return targetBundleManifestFor('native', overrides)
}

function targetBundleManifestFor(
  target: QuaTargetBootstrap,
  overrides: Partial<TargetBundleManifest> = {},
): TargetBundleManifest {
  return {
    schemaVersion: 1,
    target,
    profile: 'release',
    platform: PLATFORM_BY_TARGET[target],
    app: {
      bundleId: `dev.quajs.${target}.fixture`,
      version: '1.0.0',
      buildNumber: '100',
      icon: 'AppIcon.icns',
    },
    selectedCorePluginFamily: getTargetCorePluginFamily(target),
    selectedCoreAdapters: CORE_ADAPTERS_BY_TARGET[target],
    dependencies: targetDependencies(target),
    rendererEntries: [rendererEntry(target)],
    runtimePackages: [
      {
        id: 'runtime.chapter.1',
        executableDependencies: ['@quajs/character'],
        rendererEntries: [`@quajs/${target}-renderer/ui`],
      },
    ],
    ...overrides,
  }
}

describe('target bundle manifest validation', () => {
  it('accepts clean Web, Cocos, and native manifests with only their selected core adapters', () => {
    for (const target of ['web', 'cocos', 'native'] as const) {
      const result = validateTargetBundleManifest(targetBundleManifestFor(target))

      expect(result.ok).toBe(true)
      expect(result.bootstrapValidation.selectedTargets).toEqual([target])
      expect(result.diagnostics).toEqual([])
    }
  })

  it('accepts a native bundle manifest with only native core adapters', () => {
    const result = validateTargetBundleManifest(targetBundleManifest())

    expect(result.ok).toBe(true)
    expect(result.bootstrapValidation.selectedTargets).toEqual(['native'])
    expect(result.diagnostics).toEqual([])
    expect(assertTargetBundleManifest(targetBundleManifest())).toEqual(result)
  })

  it('normalizes subentry dependencies before validating target isolation', () => {
    expect(collectTargetBundlePackageNames(targetBundleManifest())).toContain('@quajs/engine-native')
    expect(collectTargetBundlePackageNames(targetBundleManifest())).toContain('@quajs/native-contracts')
  })

  it('requires the selected core plugin family to match the artifact target', () => {
    const result = validateTargetBundleManifest(targetBundleManifest({
      selectedCorePluginFamily: 'web-core',
    }))

    expect(result.ok).toBe(false)
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'TARGET_BUNDLE_CORE_PLUGIN_FAMILY_MISMATCH',
        target: 'native',
        selectedCorePluginFamily: 'web-core',
        expectedCorePluginFamily: 'native-core',
      }),
    ]))
  })

  it('requires emitted target bundle manifests to record a selected core plugin family', () => {
    const manifest = targetBundleManifest() as unknown as Omit<TargetBundleManifest, 'selectedCorePluginFamily'>
    delete (manifest as Partial<TargetBundleManifest>).selectedCorePluginFamily
    const result = validateTargetBundleManifest(manifest as TargetBundleManifest)

    expect(result.ok).toBe(false)
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'TARGET_BUNDLE_CORE_PLUGIN_FAMILY_MISSING',
        target: 'native',
        expectedCorePluginFamily: 'native-core',
      }),
    ]))
  })

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
      /Target bundle manifest validation failed.*Package output mixes target bootstrap core adapters.*Renderer entry "@quajs\/renderer-vue" declares target "web".*Runtime package "runtime\.bad\.core-leak" must not include target core adapter "@quajs\/assets-web"/,
    )
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

  it('rejects target bundle manifests with incomplete selected core adapters', () => {
    const result = validateTargetBundleManifest(targetBundleManifest({
      selectedCoreAdapters: NATIVE_TARGET_BOOTSTRAP.coreAdapters.filter(
        packageName => packageName !== '@quajs/store-native',
      ),
    }))

    expect(result.ok).toBe(false)
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'TARGET_BUNDLE_SELECTED_CORE_ADAPTER_MISSING',
        target: 'native',
        packageName: '@quajs/store-native',
      }),
    ]))
  })

  it('rejects target bundle manifests with unexpected selected core adapters', () => {
    const result = validateTargetBundleManifest(targetBundleManifest({
      selectedCoreAdapters: [
        ...NATIVE_TARGET_BOOTSTRAP.coreAdapters,
        '@quajs/renderer-web/plugins/ui',
      ],
    }))

    expect(result.ok).toBe(false)
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'TARGET_BUNDLE_SELECTED_CORE_ADAPTER_UNEXPECTED',
        target: 'native',
        packageName: '@quajs/renderer-web',
      }),
    ]))
  })

  it('rejects renderer entries that declare a different target than the artifact', () => {
    const result = validateTargetBundleManifest(targetBundleManifest({
      rendererEntries: [
        { specifier: '@quajs/plugin-gallery/native-renderer', pluginId: '@quajs/plugin-gallery', target: 'web' },
      ],
      runtimePackages: [
        {
          id: 'runtime.bad.renderer-target',
          executableDependencies: ['@quajs/character'],
          rendererEntries: [
            { specifier: '@quajs/plugin-backlog/cocos-renderer', pluginId: '@quajs/plugin-backlog', target: 'cocos' },
          ],
        },
      ],
    }))

    expect(result.ok).toBe(false)
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'TARGET_BUNDLE_RENDERER_ENTRY_TARGET_MISMATCH',
        target: 'native',
        rendererTarget: 'web',
        packageName: '@quajs/plugin-gallery',
        pluginId: '@quajs/plugin-gallery',
      }),
      expect.objectContaining({
        code: 'TARGET_BUNDLE_RENDERER_ENTRY_TARGET_MISMATCH',
        target: 'native',
        rendererTarget: 'cocos',
        packageName: '@quajs/plugin-backlog',
        pluginId: '@quajs/plugin-backlog',
        runtimePackageId: 'runtime.bad.renderer-target',
      }),
    ]))
  })
})
