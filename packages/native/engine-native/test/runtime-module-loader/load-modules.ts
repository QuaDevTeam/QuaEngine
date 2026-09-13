import { describe, expect, it } from 'vitest'
import {
  createHost,
  createModuleLoadContext,
  createNativeRuntimeAdapters,
  createNativeRuntimeModuleLoader,
} from './helpers'

describe('@quajs/engine-native runtime module loader module loading', () => {
  it('creates a restricted native runtime module loader backed by package script assets', async () => {
    const { calls, ctx } = createModuleLoadContext({
      'scripts/opening.js': 'export default function opening() {}',
      'scenes/opening.js': 'export const Scene = {}',
      'plugins/settings.js': 'export class Plugin {}',
      'migrations/save.js': 'export default function migrate() {}',
    })
    const evaluated: unknown[] = []
    const loader = createNativeRuntimeModuleLoader({
      limits: {
        maxModuleBytes: 1024,
      },
      evaluator(input) {
        evaluated.push(input)
        return { default: input.code, marker: input.kind }
      },
    })

    await expect(loader.loadScriptModule?.({
      id: 'opening',
      packageId: 'runtime.chapter.native-ui',
      bundleName: 'runtime.chapter.native-ui',
      assetName: 'scripts/opening.js',
    }, ctx)).resolves.toEqual({
      default: 'export default function opening() {}',
      marker: 'script',
    })
    await expect(loader.loadSceneModule?.({
      id: 'opening-scene',
      assetName: 'scenes/opening.js',
    }, ctx)).resolves.toEqual(expect.objectContaining({ marker: 'scene' }))
    await expect(loader.loadEnginePluginModule?.({
      id: 'settings',
      kind: 'engine',
      assetName: 'plugins/settings.js',
    }, ctx)).resolves.toEqual(expect.objectContaining({ marker: 'engine-plugin' }))
    await expect(loader.loadStoreMigrationModule?.({
      id: 'save-v2',
      assetName: 'migrations/save.js',
    }, ctx)).resolves.toEqual(expect.objectContaining({ marker: 'store-migration' }))

    expect(calls).toEqual(expect.arrayContaining([
      {
        type: 'scripts',
        name: 'scripts/opening.js',
        options: {
          bundleName: 'runtime.chapter.native-ui',
          targetPackageId: 'runtime.chapter.native-ui',
          locale: 'ja-JP',
        },
      },
    ]))
    expect(evaluated).toEqual(expect.arrayContaining([
      expect.objectContaining({
        assetName: 'scripts/opening.js',
        bundleName: 'runtime.chapter.native-ui',
        code: 'export default function opening() {}',
        kind: 'script',
        packageId: 'runtime.chapter.native-ui',
        request: {
          module: {
            assetName: 'scripts/opening.js',
            bundleName: 'runtime.chapter.native-ui',
            bytes: Array.from(new TextEncoder().encode('export default function opening() {}')),
            code: 'export default function opening() {}',
            kind: 'script',
            packageId: 'runtime.chapter.native-ui',
          },
          limits: expect.objectContaining({
            maxHeapBytes: 64 * 1024 * 1024,
            maxModuleBytes: 1024,
          }),
        },
      }),
    ]))
    expect(evaluated).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: 'engine-plugin',
        request: expect.objectContaining({
          module: expect.objectContaining({
            assetName: 'plugins/settings.js',
            kind: 'enginePlugin',
          }),
        }),
      }),
      expect.objectContaining({
        kind: 'store-migration',
        request: expect.objectContaining({
          module: expect.objectContaining({
            assetName: 'migrations/save.js',
            kind: 'storeMigration',
          }),
        }),
      }),
    ]))
  })

  it('wires a native module evaluator into createNativeRuntimeAdapters', async () => {
    const { ctx } = createModuleLoadContext()
    const adapters = createNativeRuntimeAdapters(createHost(), {
      moduleEvaluator: input => ({ default: input.assetName }),
    })

    await expect(adapters.runtimeModuleLoader?.loadScriptModule?.({
      id: 'opening',
      packageId: 'runtime.chapter.native-ui',
      bundleName: 'runtime.chapter.native-ui',
      assetName: 'scripts/opening.js',
    }, ctx)).resolves.toEqual({ default: 'scripts/opening.js' })
  })
})
