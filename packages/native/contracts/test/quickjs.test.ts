import { describe, expect, it } from 'vitest'
import {
  DEFAULT_NATIVE_QUICKJS_SANDBOX_LIMITS,
  assertNativeQuickJsEvaluationResponse,
  assertNativeQuickJsGameStepCommand,
  assertNativeQuickJsGameStepHelperCallRequest,
  assertNativeQuickJsPipelineListenerDispatchRequest,
  assertNativeQuickJsPipelineListenerDispatchResponse,
  assertNativeQuickJsPipelineSubscriptionChange,
  assertNativeQuickJsGameStepRunResponse,
  assertNativeQuickJsGameStepFactoryCallResponse,
  assertNativeQuickJsGameStepFactoryCallRequest,
  assertNativeQuickJsGameStepResumeRequest,
  assertNativeQuickJsGameStepRunRequest,
  assertNativeQuickJsModuleExportCallRequest,
  createNativeQuickJsEvaluationRequest,
  createNativeQuickJsGameStepFactoryCallRequest,
  createNativeQuickJsGameStepResumeRequest,
  createNativeQuickJsGameStepRunRequest,
  createNativeQuickJsPipelineListenerDispatchRequest,
  createNativeQuickJsModuleExportCallRequest,
  parseNativeQuickJsModuleExportCallResponse,
  validateNativeQuickJsEvaluationRequest,
} from '../src'

describe('native QuickJS contracts', () => {
  it('creates evaluation requests matching the Rust QuickJsEvaluationRequest wire shape', () => {
    expect(createNativeQuickJsEvaluationRequest({
      assetName: 'scripts/opening.js',
      bundleName: 'runtime.chapter.native-ui',
      packageId: 'runtime.chapter.native-ui',
      kind: 'script',
      code: 'export default function opening() {}',
      bytes: new Uint8Array([1, 2, 3]),
    })).toEqual({
      module: {
        assetName: 'scripts/opening.js',
        bundleName: 'runtime.chapter.native-ui',
        packageId: 'runtime.chapter.native-ui',
        kind: 'script',
        code: 'export default function opening() {}',
        bytes: [1, 2, 3],
      },
      limits: DEFAULT_NATIVE_QUICKJS_SANDBOX_LIMITS,
    })
  })

  it('allows sandbox limit overrides while preserving defaults', () => {
    expect(createNativeQuickJsEvaluationRequest({
      assetName: 'scripts/opening.js',
      bundleName: 'runtime.chapter.native-ui',
      packageId: 'runtime.chapter.native-ui',
      kind: 'script',
      code: '',
      bytes: new Uint8Array(),
      limits: {
        maxModuleBytes: 1024,
      },
    }).limits).toEqual({
      ...DEFAULT_NATIVE_QUICKJS_SANDBOX_LIMITS,
      maxModuleBytes: 1024,
    })
  })

  it('creates and validates package-local QuickJS module graphs', () => {
    const request = createNativeQuickJsEvaluationRequest({
      assetName: 'scripts/opening.js',
      bundleName: 'runtime.chapter.native-ui',
      packageId: 'runtime.chapter.native-ui',
      kind: 'script',
      code: 'import { title } from "./helper.js"; export default title',
      bytes: new Uint8Array([1]),
      moduleGraph: [{
        assetName: 'scripts/helper.js',
        bundleName: 'runtime.chapter.native-ui',
        packageId: 'runtime.chapter.native-ui',
        kind: 'script',
        code: 'export const title = "Opening"',
        bytes: [2],
      }],
    })

    expect(request.moduleGraph).toEqual([{
      assetName: 'scripts/helper.js',
      bundleName: 'runtime.chapter.native-ui',
      packageId: 'runtime.chapter.native-ui',
      kind: 'script',
      code: 'export const title = "Opening"',
      bytes: [2],
    }])
    expect(validateNativeQuickJsEvaluationRequest(request)).toEqual({ ok: true, errors: [] })

    expect(validateNativeQuickJsEvaluationRequest({
      ...request,
      moduleGraph: [{
        ...request.moduleGraph![0],
        packageId: 'runtime.other',
      }],
    }).errors.map(error => error.code)).toContain('forbiddenAssetName')

    expect(validateNativeQuickJsEvaluationRequest({
      ...request,
      moduleGraph: [{
        ...request.moduleGraph![0],
        assetName: '../helper.js',
      }],
    }).errors.map(error => error.code)).toContain('forbiddenAssetName')

    expect(validateNativeQuickJsEvaluationRequest({
      ...request,
      moduleGraph: [{
        ...request.moduleGraph![0],
        assetName: 'scripts/opening.js?cache=1',
      }],
    }).errors.map(error => error.code)).toContain('forbiddenAssetName')
  })

  it('accepts JavaScript module assets with inert query or hash suffixes', () => {
    for (const assetName of ['scripts/opening.js?cache=1', 'scripts/opening.mjs#runtime', 'scripts/opening.cjs?cache=1#runtime']) {
      const result = validateNativeQuickJsEvaluationRequest(createNativeQuickJsEvaluationRequest({
        assetName,
        bundleName: 'runtime.chapter.native-ui',
        packageId: 'runtime.chapter.native-ui',
        kind: 'script',
        code: '',
        bytes: new Uint8Array(),
      }))

      expect(result).toEqual({
        ok: true,
        errors: [],
      })
    }
  })

  it('rejects unsafe QuickJS evaluation request asset names at the wire boundary', () => {
    const base = createNativeQuickJsEvaluationRequest({
      assetName: 'scripts/opening.js',
      bundleName: 'runtime.chapter.native-ui',
      packageId: 'runtime.chapter.native-ui',
      kind: 'script',
      code: '',
      bytes: new Uint8Array(),
    })

    expect(validateNativeQuickJsEvaluationRequest({
      ...base,
      module: {
        ...base.module,
        assetName: '',
      },
    }).errors.map(error => error.code)).toContain('missingAssetName')

    expect(validateNativeQuickJsEvaluationRequest({
      ...base,
      module: {
        ...base.module,
        assetName: '../escape.js',
      },
    }).errors.map(error => error.code)).toContain('forbiddenAssetName')

    expect(validateNativeQuickJsEvaluationRequest({
      ...base,
      module: {
        ...base.module,
        assetName: 'scripts\\opening.js',
      },
    }).errors.map(error => error.code)).toContain('forbiddenAssetName')

    expect(validateNativeQuickJsEvaluationRequest({
      ...base,
      module: {
        ...base.module,
        assetName: 'scripts/native.wasm?raw',
      },
    }).errors.map(error => error.code)).toContain('forbiddenNativePayload')

    expect(validateNativeQuickJsEvaluationRequest({
      ...base,
      module: {
        ...base.module,
        assetName: 'ui/menu.qui.json',
      },
    }).errors.map(error => error.code)).toContain('unsupportedModuleAsset')
  })

  it('rejects QuickJS evaluation requests that exceed sandbox module byte limits', () => {
    const request = createNativeQuickJsEvaluationRequest({
      assetName: 'scripts/opening.js',
      bundleName: 'runtime.chapter.native-ui',
      packageId: 'runtime.chapter.native-ui',
      kind: 'script',
      code: 'export const label = "序章"',
      bytes: new Uint8Array([1, 2, 3]),
    })
    const result = validateNativeQuickJsEvaluationRequest({
      ...request,
      limits: {
        ...request.limits,
        maxModuleBytes: 4,
      },
    })

    expect(result.ok).toBe(false)
    expect(result.errors).toEqual([
      expect.objectContaining({
        code: 'moduleTooLarge',
        detail: 'code bytes: 29; maxModuleBytes: 4',
      }),
    ])
  })

  it('unwraps successful evaluation responses and throws structured errors', () => {
    expect(assertNativeQuickJsEvaluationResponse({
      ok: true,
      moduleNamespaceId: 'runtime.chapter.native-ui:scripts/opening.js',
    })).toBe('runtime.chapter.native-ui:scripts/opening.js')

    expect(() => assertNativeQuickJsEvaluationResponse({
      ok: false,
      error: {
        code: 'unsupportedRuntime',
        message: 'QuickJS host is not initialized.',
        assetName: 'scripts/opening.js',
      },
    })).toThrow('QuickJS host is not initialized.')

    expect(() => assertNativeQuickJsEvaluationResponse({
      ok: true,
    })).toThrow('Native QuickJS module evaluation succeeded without a module namespace id.')
  })

  it('creates and validates JSON-safe module export call requests', () => {
    expect(createNativeQuickJsModuleExportCallRequest({
      moduleNamespaceId: 'quickjs:rquickjs:1',
      exportName: 'default',
      args: [{ scene: 'opening' }],
    })).toEqual({
      moduleNamespaceId: 'quickjs:rquickjs:1',
      exportName: 'default',
      argsJson: '[{"scene":"opening"}]',
    })

    expect(() => assertNativeQuickJsModuleExportCallRequest({
      moduleNamespaceId: ' quickjs:rquickjs:1',
      exportName: 'default',
      argsJson: '[]',
    })).toThrow(/moduleNamespaceId/)

    expect(() => assertNativeQuickJsModuleExportCallRequest({
      moduleNamespaceId: 'quickjs:rquickjs:1',
      exportName: 'constructor',
      argsJson: '[]',
    })).toThrow(/blocked/)

    expect(() => assertNativeQuickJsModuleExportCallRequest({
      moduleNamespaceId: 'quickjs:rquickjs:1',
      exportName: 'default',
      argsJson: '{"not":"array"}',
    })).toThrow(/JSON array/)
  })

  it('parses JSON-safe module export call responses', () => {
    expect(parseNativeQuickJsModuleExportCallResponse({
      ok: true,
      valueJson: '{"value":5}',
    })).toEqual({ value: 5 })

    expect(parseNativeQuickJsModuleExportCallResponse({
      ok: true,
    })).toBeUndefined()

    expect(() => parseNativeQuickJsModuleExportCallResponse({
      ok: false,
      error: {
        code: 'missingExport',
        message: 'Missing export.',
      },
    })).toThrow('Missing export.')
  })

  it('creates and validates GameStep factory and run bridge requests', () => {
    expect(createNativeQuickJsGameStepFactoryCallRequest({
      moduleNamespaceId: 'quickjs:rquickjs:1',
      scope: { title: 'Opening' },
    })).toEqual({
      moduleNamespaceId: 'quickjs:rquickjs:1',
      exportName: 'default',
      scopeJson: '{"title":"Opening"}',
    })

    expect(createNativeQuickJsGameStepRunRequest({
      runHandleId: 'quickjs:rquickjs:step:1',
      ctx: { stepId: 'intro.1' },
    })).toEqual({
      runHandleId: 'quickjs:rquickjs:step:1',
      ctxJson: '{"stepId":"intro.1"}',
    })

    expect(createNativeQuickJsGameStepResumeRequest({
      resumeHandleId: 'quickjs:rquickjs:resume:1',
      payload: { choiceId: 'go' },
    })).toEqual({
      resumeHandleId: 'quickjs:rquickjs:resume:1',
      payloadJson: '{"choiceId":"go"}',
    })

    expect(() => assertNativeQuickJsGameStepFactoryCallRequest({
      moduleNamespaceId: 'quickjs:rquickjs:1',
      exportName: 'constructor',
      scopeJson: '{}',
    })).toThrow(/blocked/)

    expect(() => assertNativeQuickJsGameStepFactoryCallRequest({
      moduleNamespaceId: 'quickjs:rquickjs:1',
      exportName: 'default',
      scopeJson: '[]',
    })).toThrow(/JSON object/)

    expect(() => assertNativeQuickJsGameStepRunRequest({
      runHandleId: ' quickjs:rquickjs:step:1',
      ctxJson: '{}',
    })).toThrow(/runHandleId/)

    expect(() => assertNativeQuickJsGameStepRunRequest({
      runHandleId: 'quickjs:rquickjs:step:1',
      ctxJson: 'null',
    })).toThrow(/JSON object/)

    expect(() => assertNativeQuickJsGameStepResumeRequest({
      resumeHandleId: ' quickjs:rquickjs:resume:1',
      payloadJson: '{}',
    })).toThrow(/resumeHandleId/)

    expect(() => assertNativeQuickJsGameStepResumeRequest({
      resumeHandleId: 'quickjs:rquickjs:resume:1',
      payloadJson: '{',
    })).toThrow(/JSON/)
  })

  it('unwraps GameStep factory and run responses', () => {
    expect(assertNativeQuickJsGameStepFactoryCallResponse({
      ok: true,
      steps: [{
        uuid: 'intro.1',
        runHandleId: 'quickjs:rquickjs:step:1',
        metadataJson: '{"title":"Opening"}',
      }],
    })).toEqual([{
      uuid: 'intro.1',
      runHandleId: 'quickjs:rquickjs:step:1',
      metadataJson: '{"title":"Opening"}',
    }])

    expect(() => assertNativeQuickJsGameStepFactoryCallResponse({
      ok: false,
      error: {
        code: 'invalidStepFactoryResult',
        message: 'Factory did not return steps.',
      },
    })).toThrow('Factory did not return steps.')

    expect(() => assertNativeQuickJsGameStepFactoryCallResponse({ ok: true }))
      .toThrow(/without step descriptors/)

    expect(assertNativeQuickJsGameStepRunResponse({ ok: true })).toEqual({
      ok: true,
      commands: [],
      pipelineSubscriptions: [],
    })

    expect(assertNativeQuickJsGameStepRunResponse({
      ok: true,
      commands: [{
        target: 'engine',
        method: 'showChoices',
        argsJson: '[[{"id":"go","text":"Go"}]]',
      }],
      pendingWait: {
        resumeHandleId: 'quickjs:rquickjs:resume:1',
        event: 'user/choice_select',
      },
    })).toEqual({
      ok: true,
      commands: [{
        target: 'engine',
        method: 'showChoices',
        argsJson: '[[{"id":"go","text":"Go"}]]',
      }],
      pendingWait: {
        resumeHandleId: 'quickjs:rquickjs:resume:1',
        event: 'user/choice_select',
      },
      pipelineSubscriptions: [],
    })

    expect(assertNativeQuickJsGameStepRunResponse({
      ok: true,
      pendingTranslation: {
        resumeHandleId: 'quickjs:rquickjs:resume:2',
        key: 'runtime.greeting',
        optionsJson: '{"values":{"name":"Mira"}}',
      },
    })).toEqual({
      ok: true,
      commands: [],
      pendingTranslation: {
        resumeHandleId: 'quickjs:rquickjs:resume:2',
        key: 'runtime.greeting',
        optionsJson: '{"values":{"name":"Mira"}}',
      },
      pipelineSubscriptions: [],
    })

    expect(assertNativeQuickJsGameStepRunResponse({
      ok: true,
      pendingTranslation: {
        resumeHandleId: 'quickjs:rquickjs:resume:3',
        key: 'runtime.indexed',
        optionsJson: '["Mira"]',
      },
    }).pendingTranslation?.optionsJson).toBe('["Mira"]')

    expect(assertNativeQuickJsGameStepRunResponse({
      ok: true,
      pendingPipelineEmit: {
        resumeHandleId: 'quickjs:rquickjs:resume:5',
        event: 'plugin/custom_event',
        payloadJson: '{"ok":true}',
      },
    })).toEqual({
      ok: true,
      commands: [],
      pendingPipelineEmit: {
        resumeHandleId: 'quickjs:rquickjs:resume:5',
        event: 'plugin/custom_event',
        payloadJson: '{"ok":true}',
      },
      pipelineSubscriptions: [],
    })

    expect(assertNativeQuickJsGameStepRunResponse({
      ok: true,
      pendingHelperCall: {
        resumeHandleId: 'quickjs:rquickjs:resume:7',
        module: '@quajs/plugin-background',
        exportName: 'setBackgroundWithEngine',
        argsJson: '["bg/opening.png",{"transition":{"type":"fade"}}]',
      },
    })).toEqual({
      ok: true,
      commands: [],
      pendingHelperCall: {
        resumeHandleId: 'quickjs:rquickjs:resume:7',
        module: '@quajs/plugin-background',
        exportName: 'setBackgroundWithEngine',
        argsJson: '["bg/opening.png",{"transition":{"type":"fade"}}]',
      },
      pipelineSubscriptions: [],
    })

    expect(assertNativeQuickJsGameStepRunResponse({
      ok: true,
      pipelineSubscriptions: [{
        op: 'subscribe',
        subscriptionId: 'quickjs:rquickjs:1:pipeline:1',
        moduleNamespaceId: 'quickjs:rquickjs:1',
        event: 'plugin/custom_event',
      }],
    }).pipelineSubscriptions).toEqual([{
      op: 'subscribe',
      subscriptionId: 'quickjs:rquickjs:1:pipeline:1',
      moduleNamespaceId: 'quickjs:rquickjs:1',
      event: 'plugin/custom_event',
    }])

    expect(() => assertNativeQuickJsGameStepHelperCallRequest({
      resumeHandleId: 'quickjs:rquickjs:resume:8',
      module: '@quajs/plugin-background',
      exportName: 'constructor',
      argsJson: '[]',
    })).toThrow(/blocked/)

    expect(() => assertNativeQuickJsGameStepHelperCallRequest({
      resumeHandleId: 'quickjs:rquickjs:resume:9',
      module: ' @quajs/plugin-background',
      exportName: 'setBackgroundWithEngine',
      argsJson: '[]',
    })).toThrow(/module name/)

    expect(() => assertNativeQuickJsGameStepHelperCallRequest({
      resumeHandleId: 'quickjs:rquickjs:resume:10',
      module: '@quajs/plugin-background',
      exportName: 'setBackgroundWithEngine',
      argsJson: '{"not":"array"}',
    })).toThrow(/JSON array/)

    expect(() => assertNativeQuickJsGameStepRunResponse({
      ok: true,
      pendingWait: {
        resumeHandleId: 'quickjs:rquickjs:resume:1',
        event: 'user/choice_select',
      },
      pendingTranslation: {
        resumeHandleId: 'quickjs:rquickjs:resume:2',
        key: 'runtime.greeting',
      },
      pendingPipelineEmit: {
        resumeHandleId: 'quickjs:rquickjs:resume:5',
        event: 'plugin/custom_event',
      },
      pendingHelperCall: {
        resumeHandleId: 'quickjs:rquickjs:resume:7',
        module: '@quajs/plugin-background',
        exportName: 'setBackgroundWithEngine',
      },
    })).toThrow(/one pending continuation/)

    expect(() => assertNativeQuickJsGameStepRunResponse({
      ok: true,
      pendingTranslation: {
        resumeHandleId: 'quickjs:rquickjs:resume:4',
        key: 'runtime.greeting',
        optionsJson: '"Mira"',
      },
    })).toThrow(/JSON object or array/)

    expect(() => assertNativeQuickJsGameStepRunResponse({
      ok: true,
      pendingPipelineEmit: {
        resumeHandleId: 'quickjs:rquickjs:resume:6',
        event: ' plugin/custom_event',
      },
    })).toThrow(/event name/)

    expect(() => assertNativeQuickJsGameStepRunResponse({
      ok: false,
      error: {
        code: 'missingRunHandle',
        message: 'Missing run handle.',
      },
    })).toThrow('Missing run handle.')
  })

  it('validates GameStep run command descriptors', () => {
    expect(() => assertNativeQuickJsGameStepCommand({
      target: 'engine',
      method: 'clearChoices',
      argsJson: '[]',
    })).not.toThrow()

    expect(() => assertNativeQuickJsGameStepCommand({
      target: 'engine',
      method: 'quickSave',
      argsJson: '[{"name":"Before choice"}]',
    })).not.toThrow()

    expect(() => assertNativeQuickJsGameStepCommand({
      target: 'engine',
      method: 'markRollbackBoundary',
      argsJson: '["no-rollback"]',
    })).not.toThrow()

    expect(() => assertNativeQuickJsGameStepCommand({
      target: 'pipeline' as any,
      method: 'clearChoices',
      argsJson: '[]',
    })).toThrow(/target/)

    expect(() => assertNativeQuickJsGameStepCommand({
      target: 'engine',
      method: 'waitFor' as any,
      argsJson: '["user/choice_select"]',
    })).toThrow(/allowlisted/)

    expect(() => assertNativeQuickJsGameStepCommand({
      target: 'engine',
      method: 'showChoices',
      argsJson: '{"not":"array"}',
    })).toThrow(/JSON array/)
  })

  it('creates and validates pipeline listener dispatch wire payloads', () => {
    expect(createNativeQuickJsPipelineListenerDispatchRequest({
      subscriptionId: 'quickjs:rquickjs:1:pipeline:1',
      context: {
        event: {
          type: 'plugin/custom_event',
          payload: { value: 42 },
        },
      },
    })).toEqual({
      subscriptionId: 'quickjs:rquickjs:1:pipeline:1',
      contextJson: '{"event":{"type":"plugin/custom_event","payload":{"value":42}}}',
    })

    expect(() => assertNativeQuickJsPipelineSubscriptionChange({
      op: 'subscribe',
      subscriptionId: 'quickjs:rquickjs:1:pipeline:1',
      moduleNamespaceId: 'quickjs:rquickjs:1',
      event: 'plugin/custom_event',
    })).not.toThrow()

    expect(assertNativeQuickJsPipelineListenerDispatchResponse({
      ok: true,
      commands: [{
        target: 'engine',
        method: 'showDialogue',
        argsJson: '[{"text":"Dispatched"}]',
      }],
      pipelineSubscriptions: [{
        op: 'unsubscribe',
        subscriptionId: 'quickjs:rquickjs:1:pipeline:1',
        moduleNamespaceId: 'quickjs:rquickjs:1',
        event: 'plugin/custom_event',
      }],
    })).toEqual({
      ok: true,
      commands: [{
        target: 'engine',
        method: 'showDialogue',
        argsJson: '[{"text":"Dispatched"}]',
      }],
      pipelineSubscriptions: [{
        op: 'unsubscribe',
        subscriptionId: 'quickjs:rquickjs:1:pipeline:1',
        moduleNamespaceId: 'quickjs:rquickjs:1',
        event: 'plugin/custom_event',
      }],
    })

    expect(() => assertNativeQuickJsPipelineSubscriptionChange({
      op: 'replace' as any,
      subscriptionId: 'quickjs:rquickjs:1:pipeline:1',
      moduleNamespaceId: 'quickjs:rquickjs:1',
      event: 'plugin/custom_event',
    })).toThrow(/subscribe.*unsubscribe/)

    expect(() => assertNativeQuickJsPipelineListenerDispatchRequest({
      subscriptionId: ' quickjs:rquickjs:1:pipeline:1',
      contextJson: '{}',
    })).toThrow(/subscriptionId/)

    expect(() => assertNativeQuickJsPipelineListenerDispatchRequest({
      subscriptionId: 'quickjs:rquickjs:1:pipeline:1',
      contextJson: '[]',
    })).toThrow(/JSON object/)
  })
})
