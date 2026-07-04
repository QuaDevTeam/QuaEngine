import type { QuaTargetBootstrap } from '../../src'
import { describe, expect, it } from 'vitest'
import {
  normalizePackageSpecifier,
  validateTargetBundleManifest,
} from '../../src'
import {
  CORE_ADAPTERS_BY_TARGET,
  rendererEntry,
  targetBundleManifestFor,
} from '../target-bundle-fixtures'

describe('target bundle manifest target-core isolation project graphs', () => {
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

  it('rejects all-target core unions outside post-bundle project graphs', () => {
    const graphKinds = [
      'project-template',
      'startup-shell',
      'debug-shell',
      'release-shell',
      'smoke-runner',
      'installer',
      'updater',
      'dev-server',
      'custom',
    ] as const
    const allTargetCoreAdapters = (Object.keys(CORE_ADAPTERS_BY_TARGET) as QuaTargetBootstrap[])
      .flatMap(target => CORE_ADAPTERS_BY_TARGET[target])
    const allTargetCorePackages = Array.from(new Set(allTargetCoreAdapters.map(normalizePackageSpecifier)))

    for (const target of ['web', 'cocos', 'native'] as const) {
      for (const graphKind of graphKinds) {
        const graphId = `${target}.${graphKind}.all-target-core-union`
        const result = validateTargetBundleManifest(targetBundleManifestFor(target, {
          projectGraphs: [
            {
              id: graphId,
              kind: graphKind,
              references: [
                '@quajs/engine',
                ...allTargetCoreAdapters,
              ],
            },
          ],
        }))

        const graphDiagnostics = result.diagnostics.filter(
          diagnostic => diagnostic.code === 'TARGET_BUNDLE_PROJECT_GRAPH_CORE_ADAPTER'
            && diagnostic.projectGraphId === graphId,
        )

        expect(result.ok).toBe(false)
        expect(result.bootstrapValidation.selectedTargets).toEqual(['web', 'cocos', 'native'])
        expect(graphDiagnostics.map(diagnostic => diagnostic.packageName).sort())
          .toEqual([...allTargetCorePackages].sort())
        expect(graphDiagnostics).toEqual(expect.arrayContaining([
          expect.objectContaining({
            target,
            projectGraphId: graphId,
            projectGraphKind: graphKind,
          }),
        ]))
      }
    }
  })

  it('rejects inactive target core adapters in post-bundle graphs even when the active core is present', () => {
    const allTargetCoreAdapters = (Object.keys(CORE_ADAPTERS_BY_TARGET) as QuaTargetBootstrap[])
      .flatMap(target => CORE_ADAPTERS_BY_TARGET[target])

    for (const target of ['web', 'cocos', 'native'] as const) {
      const graphId = `${target}.post-bundle.all-target-core-union`
      const inactiveCorePackages = Array.from(new Set(
        (Object.keys(CORE_ADAPTERS_BY_TARGET) as QuaTargetBootstrap[])
          .filter(candidate => candidate !== target)
          .flatMap(candidate => CORE_ADAPTERS_BY_TARGET[candidate])
          .map(normalizePackageSpecifier),
      ))
      const activeCorePackages = new Set(CORE_ADAPTERS_BY_TARGET[target].map(normalizePackageSpecifier))
      const result = validateTargetBundleManifest(targetBundleManifestFor(target, {
        projectGraphs: [
          {
            id: graphId,
            kind: 'post-bundle',
            references: [
              '@quajs/engine',
              ...allTargetCoreAdapters,
            ],
          },
        ],
      }))
      const graphDiagnostics = result.diagnostics.filter(
        diagnostic => diagnostic.code === 'TARGET_BUNDLE_PROJECT_GRAPH_CORE_ADAPTER'
          && diagnostic.projectGraphId === graphId,
      )

      expect(result.ok).toBe(false)
      expect(result.bootstrapValidation.selectedTargets).toEqual(['web', 'cocos', 'native'])
      expect(graphDiagnostics.map(diagnostic => diagnostic.packageName).sort())
        .toEqual([...inactiveCorePackages].sort())
      for (const packageName of activeCorePackages) {
        expect(graphDiagnostics).not.toEqual(expect.arrayContaining([
          expect.objectContaining({ packageName }),
        ]))
      }
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

  it('rejects target core adapters hidden in either project graph reference field for every target', () => {
    const cases = [
      {
        target: 'web',
        graphId: 'web.project.field-mask',
        graphKind: 'project-template',
        specifier: '@quajs/plugin-cocos-ui',
        packageName: '@quajs/renderer-cocos/plugins/ui',
        expectedPackageName: '@quajs/renderer-cocos',
        expectedCorePluginFamily: 'cocos-core',
      },
      {
        target: 'web',
        graphId: 'web.debug.field-mask',
        graphKind: 'debug-shell',
        specifier: '@quajs/engine-native/runtime',
        packageName: '@quajs/plugin-native-debug',
        expectedPackageName: '@quajs/engine-native',
        expectedCorePluginFamily: 'native-core',
      },
      {
        target: 'cocos',
        graphId: 'cocos.release.field-mask',
        graphKind: 'release-shell',
        specifier: '@quajs/plugin-web-ui',
        packageName: '@quajs/renderer-web/plugins/ui',
        expectedPackageName: '@quajs/renderer-web',
        expectedCorePluginFamily: 'web-core',
      },
      {
        target: 'cocos',
        graphId: 'cocos.installer.field-mask',
        graphKind: 'installer',
        specifier: '@quajs/assets-native',
        packageName: '@quajs/plugin-native-installer',
        expectedPackageName: '@quajs/assets-native',
        expectedCorePluginFamily: 'native-core',
      },
      {
        target: 'native',
        graphId: 'native.updater.field-mask',
        graphKind: 'updater',
        specifier: '@quajs/plugin-web-updater',
        packageName: '@quajs/renderer-vue/plugins/ui',
        expectedPackageName: '@quajs/renderer-vue',
        expectedCorePluginFamily: 'web-core',
      },
      {
        target: 'native',
        graphId: 'native.smoke.field-mask',
        graphKind: 'smoke-runner',
        specifier: '@quajs/renderer-cocos/plugins/ui',
        packageName: '@quajs/plugin-cocos-smoke',
        expectedPackageName: '@quajs/renderer-cocos',
        expectedCorePluginFamily: 'cocos-core',
      },
    ] as const

    for (const {
      target,
      graphId,
      graphKind,
      specifier,
      packageName,
      expectedPackageName,
      expectedCorePluginFamily,
    } of cases) {
      const result = validateTargetBundleManifest(targetBundleManifestFor(target, {
        projectGraphs: [
          {
            id: graphId,
            kind: graphKind,
            references: [
              {
                specifier,
                packageName,
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
          packageName: expectedPackageName,
          packageCorePluginFamily: expectedCorePluginFamily,
          expectedCorePluginFamily: `${target}-core`,
          projectGraphId: graphId,
          projectGraphKind: graphKind,
        }),
      ]))
    }
  })
})
