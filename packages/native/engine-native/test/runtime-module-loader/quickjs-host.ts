import { describe, expect, it, vi } from 'vitest'
import {
  createHost,
  createModuleLoadContext,
  createNativeHostQuickJsGameStepModuleNamespaceResolver,
  createNativeHostQuickJsJsonModuleNamespaceResolver,
  createNativeHostQuickJsModuleEvaluator,
  createNativeQuickJsGameStepFactoryFunction,
  createNativeQuickJsJsonExportFunction,
  createNativeRuntimeAdapters,
  createNativeRuntimeModuleLoader,
  executeNativeQuickJsGameStepHelperCall,
  executeNativeQuickJsGameStepCommand,
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

  it('creates GameStep factories over native QuickJS step handles', async () => {
    const host = {
      ...createHost(),
      callQuickJsGameStepFactory: vi.fn(async request => ({
        ok: true,
        steps: [{
          uuid: 'intro.1',
          runHandleId: `${request.moduleNamespaceId}:run:1`,
          metadataJson: JSON.stringify({
            title: JSON.parse(request.scopeJson || '{}').title,
            exportName: request.exportName,
          }),
        }],
      })),
      callQuickJsGameStepRun: vi.fn(async () => ({
        ok: true,
        commands: [{
          target: 'engine' as const,
          method: 'showChoices' as const,
          argsJson: '[[{"id":"go","text":"Go"}]]',
        }, {
          target: 'engine' as const,
          method: 'clearChoices' as const,
          argsJson: '[]',
        }],
      })),
      resumeQuickJsGameStepRun: vi.fn(async () => ({
        ok: true,
        commands: [],
      })),
    }

    const factory = createNativeQuickJsGameStepFactoryFunction(host, 'quickjs:rquickjs:1', 'default')
    const steps = await factory({ title: 'Opening' })

    expect(steps).toHaveLength(1)
    expect(steps[0]).toMatchObject({
      uuid: 'intro.1',
      metadata: {
        title: 'Opening',
        exportName: 'default',
      },
    })
    expect(typeof steps[0].run).toBe('function')

    const showChoices = vi.fn(async () => {})
    const clearChoices = vi.fn(async () => {})

    await steps[0].run({
      stepId: 'intro.1',
      previousStepId: 'intro.0',
      engine: {
        showChoices,
        clearChoices,
      },
    } as any)

    expect(host.callQuickJsGameStepFactory).toHaveBeenCalledWith({
      moduleNamespaceId: 'quickjs:rquickjs:1',
      exportName: 'default',
      scopeJson: '{"title":"Opening"}',
    })
    expect(host.callQuickJsGameStepRun).toHaveBeenCalledWith({
      runHandleId: 'quickjs:rquickjs:1:run:1',
      ctxJson: '{"stepId":"intro.1","previousStepId":"intro.0"}',
    })
    expect(showChoices).toHaveBeenCalledWith([{ id: 'go', text: 'Go' }])
    expect(clearChoices).toHaveBeenCalledWith()
  })

  it('resumes native QuickJS GameSteps through real engine waits', async () => {
    const host = {
      ...createHost(),
      callQuickJsGameStepFactory: vi.fn(async request => ({
        ok: true,
        steps: [{
          uuid: 'intro.wait',
          runHandleId: `${request.moduleNamespaceId}:run:wait`,
        }],
      })),
      callQuickJsGameStepRun: vi.fn(async () => ({
        ok: true,
        commands: [{
          target: 'engine' as const,
          method: 'showChoices' as const,
          argsJson: '[[{"id":"go","text":"Go"}]]',
        }],
        pendingWait: {
          resumeHandleId: 'quickjs:rquickjs:resume:1',
          event: 'user/choice_select',
        },
      })),
      resumeQuickJsGameStepRun: vi.fn(async request => request.payloadJson === '{"choiceId":"retry"}'
        ? {
            ok: true,
            pendingWait: {
              resumeHandleId: request.resumeHandleId,
              event: 'user/choice_select',
            },
          }
        : {
            ok: true,
            commands: [{
              target: 'engine' as const,
              method: 'clearChoices' as const,
              argsJson: '[]',
            }],
          }),
    }
    const factory = createNativeQuickJsGameStepFactoryFunction(host, 'quickjs:rquickjs:1', 'default')
    const [step] = await factory()
    const showChoices = vi.fn(async () => {})
    const clearChoices = vi.fn(async () => {})
    const waitFor = vi.fn()
      .mockResolvedValueOnce({ choiceId: 'retry' })
      .mockResolvedValueOnce({ choiceId: 'go' })

    await step.run({
      stepId: 'intro.wait',
      engine: {
        showChoices,
        clearChoices,
        waitFor,
      },
    } as any)

    expect(showChoices).toHaveBeenCalledWith([{ id: 'go', text: 'Go' }])
    expect(waitFor).toHaveBeenCalledTimes(2)
    expect(waitFor).toHaveBeenNthCalledWith(1, 'user/choice_select')
    expect(host.resumeQuickJsGameStepRun).toHaveBeenNthCalledWith(1, {
      resumeHandleId: 'quickjs:rquickjs:resume:1',
      payloadJson: '{"choiceId":"retry"}',
    })
    expect(host.resumeQuickJsGameStepRun).toHaveBeenNthCalledWith(2, {
      resumeHandleId: 'quickjs:rquickjs:resume:1',
      payloadJson: '{"choiceId":"go"}',
    })
    expect(clearChoices).toHaveBeenCalledTimes(1)
  })

  it('resumes native QuickJS GameSteps through real StepContext translations', async () => {
    const host = {
      ...createHost(),
      callQuickJsGameStepFactory: vi.fn(async request => ({
        ok: true,
        steps: [{
          uuid: 'intro.translate',
          runHandleId: `${request.moduleNamespaceId}:run:translate`,
        }],
      })),
      callQuickJsGameStepRun: vi.fn(async () => ({
        ok: true,
        pendingTranslation: {
          resumeHandleId: 'quickjs:rquickjs:resume:t1',
          key: 'runtime.greeting',
          optionsJson: '{"values":{"name":"Mira"}}',
        },
      })),
      resumeQuickJsGameStepRun: vi.fn(async request => ({
        ok: true,
        commands: [{
          target: 'engine' as const,
          method: 'showDialogue' as const,
          argsJson: `[{"text":${request.payloadJson}}]`,
        }],
      })),
    }
    const factory = createNativeQuickJsGameStepFactoryFunction(host, 'quickjs:rquickjs:1', 'default')
    const [step] = await factory()
    const showDialogue = vi.fn(async () => {})
    const t = vi.fn(async () => 'Hello, Mira')

    await step.run({
      stepId: 'intro.translate',
      engine: {
        showDialogue,
        waitFor: vi.fn(),
      },
      t,
    } as any)

    expect(t).toHaveBeenCalledWith('runtime.greeting', { values: { name: 'Mira' } })
    expect(host.resumeQuickJsGameStepRun).toHaveBeenCalledWith({
      resumeHandleId: 'quickjs:rquickjs:resume:t1',
      payloadJson: '"Hello, Mira"',
    })
    expect(showDialogue).toHaveBeenCalledWith({ text: 'Hello, Mira' })
  })

  it('resumes native QuickJS GameSteps through real pipeline emits', async () => {
    const host = {
      ...createHost(),
      callQuickJsGameStepFactory: vi.fn(async request => ({
        ok: true,
        steps: [{
          uuid: 'intro.pipeline',
          runHandleId: `${request.moduleNamespaceId}:run:pipeline`,
        }],
      })),
      callQuickJsGameStepRun: vi.fn(async () => ({
        ok: true,
        pendingPipelineEmit: {
          resumeHandleId: 'quickjs:rquickjs:resume:p1',
          event: 'plugin/custom_event',
          payloadJson: '{"value":42}',
        },
      })),
      resumeQuickJsGameStepRun: vi.fn(async () => ({
        ok: true,
        commands: [{
          target: 'engine' as const,
          method: 'clearChoices' as const,
          argsJson: '[]',
        }],
      })),
    }
    const factory = createNativeQuickJsGameStepFactoryFunction(host, 'quickjs:rquickjs:1', 'default')
    const [step] = await factory()
    const emit = vi.fn(async () => {})
    const clearChoices = vi.fn(async () => {})

    await step.run({
      stepId: 'intro.pipeline',
      engine: {
        clearChoices,
        waitFor: vi.fn(),
      },
      pipeline: { emit },
      t: vi.fn(),
    } as any)

    expect(emit).toHaveBeenCalledWith('plugin/custom_event', { value: 42 })
    expect(host.resumeQuickJsGameStepRun).toHaveBeenCalledWith({
      resumeHandleId: 'quickjs:rquickjs:resume:p1',
    })
    expect(clearChoices).toHaveBeenCalledTimes(1)
  })

  it('resumes native QuickJS GameSteps through registered helper modules', async () => {
    const host = {
      ...createHost(),
      callQuickJsGameStepFactory: vi.fn(async request => ({
        ok: true,
        steps: [{
          uuid: 'intro.helper',
          runHandleId: `${request.moduleNamespaceId}:run:helper`,
        }],
      })),
      callQuickJsGameStepRun: vi.fn(async () => ({
        ok: true,
        pendingHelperCall: {
          resumeHandleId: 'quickjs:rquickjs:resume:h1',
          module: '@quajs/plugin-background',
          exportName: 'setBackgroundWithEngine',
          argsJson: '["bg/opening.png",{"transition":{"type":"fade"}}]',
        },
      })),
      resumeQuickJsGameStepRun: vi.fn(async request => ({
        ok: true,
        commands: [{
          target: 'engine' as const,
          method: 'showDialogue' as const,
          argsJson: `[{"text":${request.payloadJson}}]`,
        }],
      })),
    }
    const helper = vi.fn(async (_engine, assetName, options) => `${assetName}:${options.transition.type}`)
    const factory = createNativeQuickJsGameStepFactoryFunction(host, 'quickjs:rquickjs:1', 'default', {
      helperModules: {
        '@quajs/plugin-background': {
          setBackgroundWithEngine: helper,
        },
      },
    })
    const [step] = await factory()
    const showDialogue = vi.fn(async () => {})
    const engine = {
      showDialogue,
      waitFor: vi.fn(),
    }

    await step.run({
      stepId: 'intro.helper',
      engine,
      pipeline: { emit: vi.fn() },
      t: vi.fn(),
    } as any)

    expect(helper).toHaveBeenCalledWith(engine, 'bg/opening.png', { transition: { type: 'fade' } })
    expect(host.resumeQuickJsGameStepRun).toHaveBeenCalledWith({
      resumeHandleId: 'quickjs:rquickjs:resume:h1',
      payloadJson: '"bg/opening.png:fade"',
    })
    expect(showDialogue).toHaveBeenCalledWith({ text: 'bg/opening.png:fade' })
  })

  it('requires native QuickJS helper calls to be registered on the host side', async () => {
    await expect(executeNativeQuickJsGameStepHelperCall({
      stepId: 'intro.helper',
      engine: {
        waitFor: vi.fn(),
      },
    } as any, {
      resumeHandleId: 'quickjs:rquickjs:resume:h2',
      module: '@quajs/plugin-background',
      exportName: 'setBackgroundWithEngine',
      argsJson: '[]',
    })).rejects.toThrow(/not registered/)
  })

  it('rejects unsupported native QuickJS GameStep commands before dispatching to engine', async () => {
    await expect(executeNativeQuickJsGameStepCommand({
      stepId: 'intro.1',
      engine: {
        waitFor: vi.fn(),
      },
    } as any, {
      target: 'engine',
      method: 'waitFor' as any,
      argsJson: '["user/choice_select"]',
    })).rejects.toThrow(/allowlisted/)
  })

  it('installs a native GameStep script module loader when the host supports the bridge', async () => {
    const { ctx } = createModuleLoadContext({
      'scripts/opening.js': 'export default function opening() {}',
    })
    const host = {
      ...createHost(),
      evaluateQuickJsModule: vi.fn(async request => ({
        ok: true,
        moduleNamespaceId: `${request.module.packageId}:${request.module.assetName}`,
      })),
      callQuickJsGameStepFactory: vi.fn(async request => ({
        ok: true,
        steps: [{
          uuid: 'intro.1',
          runHandleId: `${request.moduleNamespaceId}:run:1`,
        }],
      })),
      callQuickJsGameStepRun: vi.fn(async () => ({
        ok: true,
      })),
      resumeQuickJsGameStepRun: vi.fn(async () => ({
        ok: true,
      })),
    }
    const adapters = createNativeRuntimeAdapters(host)

    expect(adapters.runtimeModuleLoader?.loadEnginePluginModule).toBeUndefined()
    expect(adapters.runtimeModuleLoader?.loadSceneModule).toBeUndefined()
    expect(adapters.runtimeModuleLoader?.loadStoreMigrationModule).toBeUndefined()

    const loaded = await adapters.runtimeModuleLoader?.loadScriptModule?.({
      id: 'opening',
      packageId: 'runtime.chapter.native-ui',
      bundleName: 'runtime.chapter.native-ui',
      assetName: 'scripts/opening.js',
    }, ctx)
    const steps = await loaded?.default?.({ route: 'main' })

    expect(steps?.map(step => step.uuid)).toEqual(['intro.1'])
    expect(host.evaluateQuickJsModule).toHaveBeenCalled()
    expect(host.callQuickJsGameStepFactory).toHaveBeenCalledWith({
      moduleNamespaceId: 'runtime.chapter.native-ui:scripts/opening.js',
      exportName: 'default',
      scopeJson: '{"route":"main"}',
    })
  })

  it('keeps the GameStep namespace resolver scoped to script modules', async () => {
    const resolver = createNativeHostQuickJsGameStepModuleNamespaceResolver({
      callQuickJsGameStepFactory: vi.fn(),
      callQuickJsGameStepRun: vi.fn(),
      resumeQuickJsGameStepRun: vi.fn(),
    })

    expect(() => resolver('quickjs:rquickjs:1', {
      kind: 'engine-plugin',
    } as any, {
      ok: true,
      moduleNamespaceId: 'quickjs:rquickjs:1',
    })).toThrow(/only load script modules/)
  })
})
