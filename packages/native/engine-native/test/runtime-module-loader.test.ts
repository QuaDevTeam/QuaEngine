import { describe, expect, it, vi } from 'vitest'
import {
  createNativeHostQuickJsModuleEvaluator,
  createNativeRuntimeAdapters,
  createNativeRuntimeModuleLoader,
  getNativeQuickJsNamespaceSummary,
  getNativeQuickJsPackageNamespaceSummary,
  releaseNativeQuickJsModuleNamespace,
  releaseNativeQuickJsPackageNamespaces,
} from '../src'
import { createHost, createModuleLoadContext } from './fixtures'

describe('@quajs/engine-native runtime module loader', () => {
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

  it('can evaluate native runtime modules through the host QuickJS bridge with an explicit namespace resolver', async () => {
    const { ctx } = createModuleLoadContext({
      'scripts/opening.js': 'export default function opening() {}',
    })
    const host = {
      ...createHost(),
      evaluateQuickJsModule: vi.fn(async request => ({
        ok: true,
        moduleNamespaceId: `${request.module.packageId}:${request.module.assetName}`,
      })),
    }
    const resolved: unknown[] = []
    const adapters = createNativeRuntimeAdapters(host, {
      moduleNamespaceResolver(moduleNamespaceId, input) {
        resolved.push({ moduleNamespaceId, input })
        return { default: moduleNamespaceId, assetName: input.assetName }
      },
    })

    await expect(adapters.runtimeModuleLoader?.loadScriptModule?.({
      id: 'opening',
      packageId: 'runtime.chapter.native-ui',
      bundleName: 'runtime.chapter.native-ui',
      assetName: 'scripts/opening.js',
    }, ctx)).resolves.toEqual({
      default: 'runtime.chapter.native-ui:scripts/opening.js',
      assetName: 'scripts/opening.js',
    })
    expect(host.evaluateQuickJsModule).toHaveBeenCalledWith(expect.objectContaining({
      module: expect.objectContaining({
        assetName: 'scripts/opening.js',
        code: 'export default function opening() {}',
        packageId: 'runtime.chapter.native-ui',
      }),
    }))
    expect(resolved).toEqual([
      expect.objectContaining({
        moduleNamespaceId: 'runtime.chapter.native-ui:scripts/opening.js',
      }),
    ])
  })

  it('requires native host QuickJS evaluation and a real module namespace object', async () => {
    const { ctx } = createModuleLoadContext()
    const evaluator = createNativeHostQuickJsModuleEvaluator(createHost(), () => ({ default: undefined }))
    const loader = createNativeRuntimeModuleLoader({ evaluator })

    await expect(loader.loadScriptModule?.({
      id: 'opening',
      packageId: 'runtime.chapter.native-ui',
      bundleName: 'runtime.chapter.native-ui',
      assetName: 'scripts/opening.js',
    }, ctx)).rejects.toThrow(/does not provide QuickJS module evaluation/)

    const failingHost = {
      ...createHost(),
      evaluateQuickJsModule: vi.fn(async () => ({
        ok: false,
        error: {
          code: 'evaluationFailed' as const,
          message: 'QuickJS failed.',
        },
      })),
    }
    const failingLoader = createNativeRuntimeModuleLoader({
      evaluator: createNativeHostQuickJsModuleEvaluator(failingHost, () => ({ default: undefined })),
    })
    await expect(failingLoader.loadScriptModule?.({
      id: 'opening',
      packageId: 'runtime.chapter.native-ui',
      bundleName: 'runtime.chapter.native-ui',
      assetName: 'scripts/opening.js',
    }, ctx)).rejects.toThrow(/QuickJS failed/)

    const nonObjectHost = {
      ...createHost(),
      evaluateQuickJsModule: vi.fn(async () => ({
        ok: true,
        moduleNamespaceId: 'runtime.chapter.native-ui:scripts/opening.js',
      })),
    }
    const nonObjectLoader = createNativeRuntimeModuleLoader({
      evaluator: createNativeHostQuickJsModuleEvaluator(nonObjectHost, () => undefined),
    })
    await expect(nonObjectLoader.loadScriptModule?.({
      id: 'opening',
      packageId: 'runtime.chapter.native-ui',
      bundleName: 'runtime.chapter.native-ui',
      assetName: 'scripts/opening.js',
    }, ctx)).rejects.toThrow(/did not evaluate to a module namespace object/)
  })

  it('validates QuickJS evaluation requests before calling the native host', async () => {
    const host = {
      ...createHost(),
      evaluateQuickJsModule: vi.fn(async () => ({
        ok: true,
        moduleNamespaceId: 'runtime.chapter.native-ui:scripts/opening.js',
      })),
    }
    const evaluator = createNativeHostQuickJsModuleEvaluator(host, () => ({ default: undefined }))

    await expect(evaluator({
      assetName: '../escape.js',
      bundleName: 'runtime.chapter.native-ui',
      bytes: new Uint8Array(),
      code: '',
      kind: 'script',
      packageId: 'runtime.chapter.native-ui',
      record: {
        id: 'escape',
        assetName: '../escape.js',
      } as any,
      request: {
        module: {
          assetName: '../escape.js',
          bundleName: 'runtime.chapter.native-ui',
          packageId: 'runtime.chapter.native-ui',
          kind: 'script',
          code: '',
          bytes: [],
        },
        limits: {
          maxExecutionTicks: 1_000_000,
          maxHeapBytes: 64 * 1024 * 1024,
          maxModuleBytes: 4 * 1024 * 1024,
          maxStackBytes: 2 * 1024 * 1024,
        },
      },
    })).rejects.toThrow(/must be package-relative/)

    expect(host.evaluateQuickJsModule).not.toHaveBeenCalled()
  })

  it('releases host QuickJS module namespaces without treating handles as engine modules', async () => {
    const namespaceRecord = {
      id: 'quickjs:module:1',
      packageId: 'runtime.chapter.native-ui',
      bundleName: 'runtime.chapter.native-ui',
      assetName: 'scripts/opening.js',
      kind: 'script' as const,
      moduleBytes: 3,
      codeBytes: 36,
      revision: 1,
    }
    const summary = {
      namespaceCount: 1,
      packageCount: 1,
      moduleBytes: 3,
      codeBytes: 36,
    }
    const host = {
      ...createHost(),
      releaseQuickJsModuleNamespace: vi.fn(async () => namespaceRecord),
      releaseQuickJsPackageNamespaces: vi.fn(async () => [namespaceRecord]),
      getQuickJsNamespaceSummary: vi.fn(async () => summary),
      getQuickJsPackageNamespaceSummary: vi.fn(async () => summary),
    }

    await expect(releaseNativeQuickJsModuleNamespace(host, 'quickjs:module:1')).resolves.toEqual(namespaceRecord)
    await expect(releaseNativeQuickJsPackageNamespaces(host, 'runtime.chapter.native-ui')).resolves.toEqual([namespaceRecord])
    await expect(getNativeQuickJsNamespaceSummary(host)).resolves.toEqual(summary)
    await expect(getNativeQuickJsPackageNamespaceSummary(host, 'runtime.chapter.native-ui')).resolves.toEqual(summary)

    expect(host.releaseQuickJsModuleNamespace).toHaveBeenCalledWith('quickjs:module:1')
    expect(host.releaseQuickJsPackageNamespaces).toHaveBeenCalledWith('runtime.chapter.native-ui')
    expect(host.getQuickJsPackageNamespaceSummary).toHaveBeenCalledWith('runtime.chapter.native-ui')

    await expect(releaseNativeQuickJsModuleNamespace(createHost(), 'quickjs:missing')).resolves.toBeUndefined()
    await expect(releaseNativeQuickJsPackageNamespaces(createHost(), 'runtime.chapter.native-ui')).resolves.toEqual([])
    await expect(getNativeQuickJsNamespaceSummary(createHost())).resolves.toBeUndefined()
  })

  it('rejects native runtime modules without package-relative asset names', async () => {
    const { ctx } = createModuleLoadContext()
    const loader = createNativeRuntimeModuleLoader({
      evaluator: () => ({ default: undefined }),
    })

    await expect(loader.loadEnginePluginModule?.({
      id: 'bad-plugin',
      kind: 'engine',
      module: 'https://example.invalid/plugin.js',
    }, ctx)).rejects.toThrow(/requires an assetName/)

    await expect(loader.loadScriptModule?.({
      id: 'escape',
      packageId: 'runtime.chapter.native-ui',
      bundleName: 'runtime.chapter.native-ui',
      assetName: '../escape.js',
    }, ctx)).rejects.toThrow(/package-relative script asset/)

    await expect(loader.loadScriptModule?.({
      id: 'remote',
      packageId: 'runtime.chapter.native-ui',
      bundleName: 'runtime.chapter.native-ui',
      assetName: 'https://example.invalid/remote.js',
    }, ctx)).rejects.toThrow(/package-relative script asset/)

    await expect(loader.loadScriptModule?.({
      id: 'backslash',
      packageId: 'runtime.chapter.native-ui',
      bundleName: 'runtime.chapter.native-ui',
      assetName: 'scripts\\opening.js',
    }, ctx)).rejects.toThrow(/package-relative script asset/)

    await expect(loader.loadScriptModule?.({
      id: 'blank',
      packageId: 'runtime.chapter.native-ui',
      bundleName: 'runtime.chapter.native-ui',
      assetName: '   ',
    }, ctx)).rejects.toThrow(/package-relative script asset/)

    await expect(loader.loadScriptModule?.({
      id: 'suffix-only',
      packageId: 'runtime.chapter.native-ui',
      bundleName: 'runtime.chapter.native-ui',
      assetName: '?module',
    }, ctx)).rejects.toThrow(/package-relative script asset/)

    await expect(loader.loadScriptModule?.({
      id: 'native-payload',
      packageId: 'runtime.chapter.native-ui',
      bundleName: 'runtime.chapter.native-ui',
      assetName: 'scripts/plugin.node',
    }, ctx)).rejects.toThrow(/must not reference a native payload/)

    await expect(loader.loadScriptModule?.({
      id: 'ui-ast',
      packageId: 'runtime.chapter.native-ui',
      bundleName: 'runtime.chapter.native-ui',
      assetName: 'ui/menu.qui.json',
    }, ctx)).rejects.toThrow(/must reference a JavaScript module asset/)
  })

  it('rejects unsafe native runtime module variant asset names before asset loading', async () => {
    const { calls, ctx } = createModuleLoadContext()
    const loader = createNativeRuntimeModuleLoader({
      evaluator: () => ({ default: undefined }),
    })

    await expect(loader.loadSceneModule?.({
      id: 'scene-with-escape',
      assetName: 'scenes/opening.js',
      variants: {
        escape: { module: '../outside-scene.js' },
      },
    } as any, ctx)).rejects.toThrow(/variants\.escape\.module "\.\.\/outside-scene\.js" must be a package-relative script asset/)

    await expect(loader.loadEnginePluginModule?.({
      id: 'plugin-with-native-variant',
      kind: 'engine',
      assetName: 'plugins/settings.js',
      variants: {
        windows: { assetName: 'plugins/settings.dll' },
      },
    } as any, ctx)).rejects.toThrow(/variants\.windows\.assetName "plugins\/settings\.dll" must not reference a native payload/)

    await expect(loader.loadStoreMigrationModule?.({
      id: 'migration-with-data-variant',
      assetName: 'migrations/save.js',
      variants: {
        data: { module: 'migrations/save.json' },
      },
    } as any, ctx)).rejects.toThrow(/variants\.data\.module "migrations\/save\.json" must reference a JavaScript module asset/)

    expect(calls).toEqual([])
  })

  it('accepts JavaScript module-like native runtime asset names', async () => {
    const { ctx } = createModuleLoadContext({
      'scripts/opening.mjs': 'export default function opening() {}',
      'scripts/opening.js?cache=1': 'export default function opening() {}',
      'migrations/save.cjs': 'module.exports = {}',
    })
    const loader = createNativeRuntimeModuleLoader({
      evaluator: input => ({ default: input.assetName }),
    })

    await expect(loader.loadScriptModule?.({
      id: 'opening',
      packageId: 'runtime.chapter.native-ui',
      bundleName: 'runtime.chapter.native-ui',
      assetName: 'scripts/opening.mjs',
    }, ctx)).resolves.toEqual({ default: 'scripts/opening.mjs' })
    await expect(loader.loadScriptModule?.({
      id: 'opening-cache',
      packageId: 'runtime.chapter.native-ui',
      bundleName: 'runtime.chapter.native-ui',
      assetName: 'scripts/opening.js?cache=1',
    }, ctx)).resolves.toEqual({ default: 'scripts/opening.js?cache=1' })
    await expect(loader.loadScriptModule?.({
      id: 'native-payload-query',
      assetName: 'scripts/helper.wasm?raw',
    } as any, ctx)).rejects.toThrow(/assetName "scripts\/helper\.wasm\?raw" must not reference a native payload/)
    await expect(loader.loadStoreMigrationModule?.({
      id: 'save-v2',
      assetName: 'migrations/save.cjs',
    }, ctx)).resolves.toEqual({ default: 'migrations/save.cjs' })
  })

  it('rejects native runtime evaluators that do not return a module namespace object', async () => {
    const { ctx } = createModuleLoadContext()
    const loader = createNativeRuntimeModuleLoader({
      evaluator: () => undefined,
    })

    await expect(loader.loadScriptModule?.({
      id: 'opening',
      packageId: 'runtime.chapter.native-ui',
      bundleName: 'runtime.chapter.native-ui',
      assetName: 'scripts/opening.js',
    }, ctx)).rejects.toThrow(/did not evaluate to a module namespace object/)
  })
})
