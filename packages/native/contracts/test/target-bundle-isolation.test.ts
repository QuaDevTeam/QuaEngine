import type { QuaTargetBootstrap } from '../src'
import { describe, expect, it } from 'vitest'
import {
  assertTargetBundleManifest,
  COCOS_TARGET_BOOTSTRAP,
  NATIVE_TARGET_BOOTSTRAP,
  normalizePackageSpecifier,
  validateTargetBundleManifest,
  WEB_TARGET_BOOTSTRAP,
} from '../src'
import {
  CORE_ADAPTERS_BY_TARGET,
  rendererEntry,
  targetBundleManifest,
  targetBundleManifestFor,
  targetDependencies,
} from './target-bundle-fixtures'

describe('target bundle manifest target-core isolation', () => {
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

  it('accepts target project graphs that contain only shared packages before bundling', () => {
    for (const target of ['web', 'cocos', 'native'] as const) {
      const result = validateTargetBundleManifest(targetBundleManifestFor(target, {
        projectGraphs: [
          {
            id: `${target}.project-template`,
            kind: 'project-template',
            references: [
              '@quajs/engine',
              '@quajs/pipeline',
            ],
          },
          {
            id: `${target}.startup-shell`,
            kind: 'startup-shell',
            references: [
              '@quajs/character',
              '@quajs/plugin-background',
            ],
          },
        ],
      }))

      expect(result.ok).toBe(true)
      expect(result.diagnostics).toEqual([])
    }
  })

  it('accepts post-bundle project graphs with only the active core family', () => {
    for (const target of ['web', 'cocos', 'native'] as const) {
      const result = validateTargetBundleManifest(targetBundleManifestFor(target, {
        projectGraphs: [
          {
            id: `${target}.post-bundle`,
            kind: 'post-bundle',
            references: [
              '@quajs/engine',
              ...CORE_ADAPTERS_BY_TARGET[target],
              rendererEntry(target),
            ],
          },
        ],
      }))

      expect(result.ok).toBe(true)
      expect(result.diagnostics).toEqual([])
    }
  })

  it('rejects active target core adapters in project templates before bundling', () => {
    for (const target of ['web', 'cocos', 'native'] as const) {
      const packageName = normalizePackageSpecifier(CORE_ADAPTERS_BY_TARGET[target][0])
      const result = validateTargetBundleManifest(targetBundleManifestFor(target, {
        projectGraphs: [
          {
            id: `${target}.template.declares-core`,
            kind: 'project-template',
            references: [
              '@quajs/engine',
              CORE_ADAPTERS_BY_TARGET[target][0],
            ],
          },
        ],
      }))

      expect(result.ok).toBe(false)
      expect(result.diagnostics).toEqual(expect.arrayContaining([
        expect.objectContaining({
          code: 'TARGET_BUNDLE_PROJECT_GRAPH_CORE_ADAPTER',
          target,
          packageName,
          packageCorePluginFamily: `${target}-core`,
          expectedCorePluginFamily: `${target}-core`,
          projectGraphId: `${target}.template.declares-core`,
          projectGraphKind: 'project-template',
        }),
      ]))
    }
  })

  it('rejects inactive target core adapters in project templates and startup shells', () => {
    const cases = [
      {
        target: 'web',
        graphId: 'web.template',
        graphKind: 'project-template',
        specifier: '@quajs/renderer-cocos/plugins/ui',
        packageName: '@quajs/renderer-cocos',
        packageCorePluginFamily: 'cocos-core',
      },
      {
        target: 'cocos',
        graphId: 'cocos.startup',
        graphKind: 'startup-shell',
        specifier: '@quajs/renderer-web/plugins/ui?import',
        packageName: '@quajs/renderer-web',
        packageCorePluginFamily: 'web-core',
      },
      {
        target: 'native',
        graphId: 'native.installer',
        graphKind: 'installer',
        specifier: '@quajs/renderer-web/plugins/audio',
        packageName: '@quajs/renderer-web',
        packageCorePluginFamily: 'web-core',
      },
    ] as const

    for (const {
      target,
      graphId,
      graphKind,
      specifier,
      packageName,
      packageCorePluginFamily,
    } of cases) {
      const result = validateTargetBundleManifest(targetBundleManifestFor(target, {
        projectGraphs: [
          {
            id: graphId,
            kind: graphKind,
            references: [
              '@quajs/engine',
              {
                packageName: '@quajs/character',
                specifier,
              },
            ],
          },
        ],
      }))

      expect(result.ok).toBe(false)
      expect(result.diagnostics).toEqual(expect.arrayContaining([
        expect.objectContaining({
          code: 'TARGET_BUNDLE_PROJECT_GRAPH_CORE_ADAPTER',
          target,
          packageName,
          packageCorePluginFamily,
          expectedCorePluginFamily: `${target}-core`,
          projectGraphId: graphId,
          projectGraphKind: graphKind,
        }),
      ]))
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

  it('rejects runtime packages that declare target core adapters as executable dependencies or renderer entries', () => {
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
            { specifier: '@quajs/engine-native/native-host', target: 'native' },
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
        field: 'executableDependencies',
      }),
      expect.objectContaining({
        code: 'TARGET_BUNDLE_RUNTIME_PACKAGE_CORE_ADAPTER',
        runtimePackageId: 'runtime.bad.native-entry',
        packageName: '@quajs/engine-native',
        field: 'rendererEntries',
      }),
    ]))
  })

  it('rejects Runtime QPK core adapter declarations for Web, Cocos, and native bundles', () => {
    const cases = [
      {
        target: 'web',
        executableDependency: '@quajs/assets-web',
        rendererEntry: { specifier: '@quajs/renderer-web/plugins/ui', target: 'web' },
        executablePackageName: '@quajs/assets-web',
        rendererPackageName: '@quajs/renderer-web',
      },
      {
        target: 'cocos',
        executableDependency: '@quajs/cocos-host/runtime',
        rendererEntry: { specifier: '@quajs/renderer-cocos/plugins/ui', target: 'cocos' },
        executablePackageName: '@quajs/cocos-host',
        rendererPackageName: '@quajs/renderer-cocos',
      },
      {
        target: 'native',
        executableDependency: '@quajs/engine-native/native-host',
        rendererEntry: { specifier: '@quajs/native-contracts/bootstrap', target: 'native' },
        executablePackageName: '@quajs/engine-native',
        rendererPackageName: '@quajs/native-contracts',
      },
    ] as const

    for (const {
      target,
      executableDependency,
      rendererEntry,
      executablePackageName,
      rendererPackageName,
    } of cases) {
      const result = validateTargetBundleManifest(targetBundleManifestFor(target, {
        runtimePackages: [
          {
            id: `runtime.${target}.bad.executable-core`,
            executableDependencies: [
              '@quajs/character',
              executableDependency,
            ],
          },
          {
            id: `runtime.${target}.bad.renderer-core`,
            executableDependencies: ['@quajs/character'],
            rendererEntries: [rendererEntry],
          },
        ],
      }))

      expect(result.ok).toBe(false)
      expect(result.diagnostics).toEqual(expect.arrayContaining([
        expect.objectContaining({
          code: 'TARGET_BUNDLE_RUNTIME_PACKAGE_CORE_ADAPTER',
          target,
          runtimePackageId: `runtime.${target}.bad.executable-core`,
          packageName: executablePackageName,
          field: 'executableDependencies',
        }),
        expect.objectContaining({
          code: 'TARGET_BUNDLE_RUNTIME_PACKAGE_CORE_ADAPTER',
          target,
          runtimePackageId: `runtime.${target}.bad.renderer-core`,
          packageName: rendererPackageName,
          field: 'rendererEntries',
        }),
      ]))
    }
  })
})
