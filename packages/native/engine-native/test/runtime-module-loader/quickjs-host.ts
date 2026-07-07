import { describe, expect, it, vi } from 'vitest'
import {
  createHost,
  createModuleLoadContext,
  createNativeHostQuickJsJsonModuleNamespaceResolver,
  createNativeHostQuickJsModuleEvaluator,
  createNativeQuickJsJsonExportFunction,
  createNativeRuntimeAdapters,
  createNativeRuntimeModuleLoader,
} from './helpers'

describe('@quajs/engine-native runtime module loader QuickJS host bridge', () => {
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

  it('creates JSON-safe export proxy functions over native QuickJS namespace handles', async () => {
    const host = {
      ...createHost(),
      callQuickJsModuleExport: vi.fn(async request => ({
        ok: true,
        valueJson: JSON.stringify({
          namespace: request.moduleNamespaceId,
          exportName: request.exportName,
          args: JSON.parse(request.argsJson || '[]'),
        }),
      })),
    }

    const callDefault = createNativeQuickJsJsonExportFunction(host, 'quickjs:rquickjs:1', 'default')
    await expect(callDefault({ scene: 'opening' })).resolves.toEqual({
      namespace: 'quickjs:rquickjs:1',
      exportName: 'default',
      args: [{ scene: 'opening' }],
    })

    const resolver = createNativeHostQuickJsJsonModuleNamespaceResolver(host)
    const namespace = await resolver('quickjs:rquickjs:2', {} as any, {
      ok: true,
      moduleNamespaceId: 'quickjs:rquickjs:2',
    }) as Record<string, unknown>

    expect('default' in namespace).toBe(true)
    expect(typeof namespace.default).toBe('function')
    await expect((namespace.default as (...args: unknown[]) => Promise<unknown>)('hello')).resolves.toEqual({
      namespace: 'quickjs:rquickjs:2',
      exportName: 'default',
      args: ['hello'],
    })
    expect(host.callQuickJsModuleExport).toHaveBeenCalledWith({
      moduleNamespaceId: 'quickjs:rquickjs:2',
      exportName: 'default',
      argsJson: '["hello"]',
    })
  })
})
