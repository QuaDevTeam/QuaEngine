import { describe, expect, it } from 'vitest'
import { validateTargetBundleManifest } from '../../src'
import {
  targetBundleManifest,
  targetBundleManifestFor,
} from '../target-bundle-fixtures'

describe('target bundle manifest target-core isolation runtime packages', () => {
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

  it('rejects Runtime QPK target core adapters hidden in either reference field for every target', () => {
    const cases = [
      {
        target: 'web',
        executableDependency: {
          specifier: '@quajs/plugin-cocos-extra',
          packageName: '@quajs/renderer-cocos/plugins/ui',
        },
        rendererEntry: {
          specifier: '@quajs/engine-native/native-host',
          packageName: '@quajs/plugin-native-ui',
        },
        executablePackageName: '@quajs/renderer-cocos',
        rendererPackageName: '@quajs/engine-native',
      },
      {
        target: 'cocos',
        executableDependency: {
          specifier: '@quajs/plugin-web-extra',
          packageName: '@quajs/renderer-web/plugins/ui',
        },
        rendererEntry: {
          specifier: '@quajs/assets-native',
          packageName: '@quajs/plugin-native-ui',
        },
        executablePackageName: '@quajs/renderer-web',
        rendererPackageName: '@quajs/assets-native',
      },
      {
        target: 'native',
        executableDependency: {
          specifier: '@quajs/plugin-web-extra',
          packageName: '@quajs/assets-web',
        },
        rendererEntry: {
          specifier: '@quajs/plugin-cocos-ui',
          packageName: '@quajs/renderer-cocos/plugins/ui',
        },
        executablePackageName: '@quajs/assets-web',
        rendererPackageName: '@quajs/renderer-cocos',
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
            id: `runtime.${target}.bad.field-mask`,
            executableDependencies: [executableDependency],
            rendererEntries: [rendererEntry],
          },
        ],
      }))

      expect(result.ok).toBe(false)
      expect(result.diagnostics).toEqual(expect.arrayContaining([
        expect.objectContaining({
          code: 'TARGET_BUNDLE_RUNTIME_PACKAGE_CORE_ADAPTER',
          target,
          runtimePackageId: `runtime.${target}.bad.field-mask`,
          packageName: executablePackageName,
          field: 'executableDependencies',
        }),
        expect.objectContaining({
          code: 'TARGET_BUNDLE_RUNTIME_PACKAGE_CORE_ADAPTER',
          target,
          runtimePackageId: `runtime.${target}.bad.field-mask`,
          packageName: rendererPackageName,
          field: 'rendererEntries',
        }),
      ]))
    }
  })

  it('rejects bundler-normalized Runtime QPK target core adapter references for every target', () => {
    const cases = [
      {
        target: 'web',
        executableDependency: {
          specifier: 'npm:@quajs/engine-native/native-host?import',
          packageName: '@quajs/plugin-native-extra',
        },
        rendererEntry: {
          specifier: '@quajs/plugin-cocos-renderer',
          packageName: 'C:\\repo\\node_modules\\@quajs\\renderer-cocos\\plugins\\ui.js?raw',
        },
        executablePackageName: '@quajs/engine-native',
        rendererPackageName: '@quajs/renderer-cocos',
      },
      {
        target: 'cocos',
        executableDependency: {
          specifier: '/repo/node_modules/.pnpm/@quajs+renderer-web@0.1.0/node_modules/@quajs/renderer-web/plugins/audio.js#entry',
          packageName: '@quajs/plugin-web-extra',
        },
        rendererEntry: {
          specifier: 'npm:@quajs/assets-native/runtime?worker',
          packageName: '@quajs/plugin-native-renderer',
        },
        executablePackageName: '@quajs/renderer-web',
        rendererPackageName: '@quajs/assets-native',
      },
      {
        target: 'native',
        executableDependency: {
          specifier: 'C:\\repo\\node_modules\\@quajs\\assets-web\\dist\\index.js?raw',
          packageName: '@quajs/plugin-web-extra',
        },
        rendererEntry: {
          specifier: '@quajs/plugin-cocos-ui',
          packageName: '/repo/node_modules/.pnpm/@quajs+renderer-cocos@0.1.0/node_modules/@quajs/renderer-cocos/plugins/dialogue.js#entry',
        },
        executablePackageName: '@quajs/assets-web',
        rendererPackageName: '@quajs/renderer-cocos',
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
            id: `runtime.${target}.bad.bundler-mask`,
            executableDependencies: [executableDependency],
            rendererEntries: [rendererEntry],
          },
        ],
      }))

      expect(result.ok).toBe(false)
      expect(result.diagnostics).toEqual(expect.arrayContaining([
        expect.objectContaining({
          code: 'TARGET_BUNDLE_RUNTIME_PACKAGE_CORE_ADAPTER',
          target,
          runtimePackageId: `runtime.${target}.bad.bundler-mask`,
          packageName: executablePackageName,
          field: 'executableDependencies',
        }),
        expect.objectContaining({
          code: 'TARGET_BUNDLE_RUNTIME_PACKAGE_CORE_ADAPTER',
          target,
          runtimePackageId: `runtime.${target}.bad.bundler-mask`,
          packageName: rendererPackageName,
          field: 'rendererEntries',
        }),
      ]))
    }
  })
})
