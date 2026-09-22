import { describe, expect, it } from 'vitest'
import {
  assertNativeJscEvaluationResponse,
  assertNativeJscGameStepCommand,
  assertNativeJscGameStepFactoryCallRequest,
  assertNativeJscGameStepFactoryCallResponse,
  assertNativeJscGameStepHelperCallRequest,
  assertNativeJscGameStepResumeRequest,
  assertNativeJscGameStepRunRequest,
  assertNativeJscGameStepRunResponse,
  assertNativeJscModuleExportCallRequest,
  assertNativeJscPipelineListenerDispatchRequest,
  assertNativeJscPipelineListenerDispatchResponse,
  assertNativeJscPipelineSubscriptionChange,
  createNativeJscEvaluationRequest,
  createNativeJscGameStepFactoryCallRequest,
  createNativeJscGameStepResumeRequest,
  createNativeJscGameStepRunRequest,
  createNativeJscModuleExportCallRequest,
  createNativeJscPipelineListenerDispatchRequest,
  DEFAULT_NATIVE_JSC_SANDBOX_LIMITS,
  parseNativeJscModuleExportCallResponse,
  validateNativeJscEvaluationRequest,
} from '../src'

describe('native JavaScriptCore contracts', () => {
  it('creates evaluation requests matching the Rust JscEvaluationRequest wire shape', () => {
    expect(createNativeJscEvaluationRequest({
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
      limits: DEFAULT_NATIVE_JSC_SANDBOX_LIMITS,
    })
  })

  it('allows sandbox limit overrides while preserving defaults', () => {
    expect(createNativeJscEvaluationRequest({
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
      ...DEFAULT_NATIVE_JSC_SANDBOX_LIMITS,
      maxModuleBytes: 1024,
    })
  })

  it('creates and validates package-local JavaScriptCore module graphs', () => {
    const request = createNativeJscEvaluationRequest({
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
    expect(validateNativeJscEvaluationRequest(request)).toEqual({ ok: true, errors: [] })

    expect(validateNativeJscEvaluationRequest({
      ...request,
      moduleGraph: [{
        ...request.moduleGraph![0],
        packageId: 'runtime.other',
      }],
    }).errors.map(error => error.code)).toContain('forbiddenAssetName')

    expect(validateNativeJscEvaluationRequest({
      ...request,
      moduleGraph: [{
        ...request.moduleGraph![0],
        assetName: '../helper.js',
      }],
    }).errors.map(error => error.code)).toContain('forbiddenAssetName')

    expect(validateNativeJscEvaluationRequest({
      ...request,
      moduleGraph: [{
        ...request.moduleGraph![0],
        assetName: 'scripts/opening.js?cache=1',
      }],
    }).errors.map(error => error.code)).toContain('forbiddenAssetName')
  })

  it('accepts JavaScript module assets with inert query or hash suffixes', () => {
    for (const assetName of ['scripts/opening.js?cache=1', 'scripts/opening.mjs#runtime', 'scripts/opening.cjs?cache=1#runtime']) {
      const result = validateNativeJscEvaluationRequest(createNativeJscEvaluationRequest({
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

  it('rejects unsafe JavaScriptCore evaluation request asset names at the wire boundary', () => {
    const base = createNativeJscEvaluationRequest({
      assetName: 'scripts/opening.js',
      bundleName: 'runtime.chapter.native-ui',
      packageId: 'runtime.chapter.native-ui',
      kind: 'script',
      code: '',
      bytes: new Uint8Array(),
    })

    expect(validateNativeJscEvaluationRequest({
      ...base,
      module: {
        ...base.module,
        assetName: '',
      },
    }).errors.map(error => error.code)).toContain('missingAssetName')

    expect(validateNativeJscEvaluationRequest({
      ...base,
      module: {
        ...base.module,
        assetName: '../escape.js',
      },
    }).errors.map(error => error.code)).toContain('forbiddenAssetName')

    expect(validateNativeJscEvaluationRequest({
      ...base,
      module: {
        ...base.module,
        assetName: 'scripts\\opening.js',
      },
    }).errors.map(error => error.code)).toContain('forbiddenAssetName')

    expect(validateNativeJscEvaluationRequest({
      ...base,
      module: {
        ...base.module,
        assetName: 'scripts/native.wasm?raw',
      },
    }).errors.map(error => error.code)).toContain('forbiddenNativePayload')

    expect(validateNativeJscEvaluationRequest({
      ...base,
      module: {
        ...base.module,
        assetName: 'ui/menu.qui.json',
      },
    }).errors.map(error => error.code)).toContain('unsupportedModuleAsset')
  })

  it('rejects JavaScriptCore evaluation requests that exceed sandbox module byte limits', () => {
    const request = createNativeJscEvaluationRequest({
      assetName: 'scripts/opening.js',
      bundleName: 'runtime.chapter.native-ui',
      packageId: 'runtime.chapter.native-ui',
      kind: 'script',
      code: 'export const label = "序章"',
      bytes: new Uint8Array([1, 2, 3]),
    })
    const result = validateNativeJscEvaluationRequest({
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
    expect(assertNativeJscEvaluationResponse({
      ok: true,
      moduleNamespaceId: 'runtime.chapter.native-ui:scripts/opening.js',
    })).toBe('runtime.chapter.native-ui:scripts/opening.js')

    expect(() => assertNativeJscEvaluationResponse({
      ok: false,
      error: {
        code: 'unsupportedRuntime',
        message: 'JavaScriptCore host is not initialized.',
        assetName: 'scripts/opening.js',
      },
    })).toThrow('JavaScriptCore host is not initialized.')

    expect(() => assertNativeJscEvaluationResponse({
      ok: true,
    })).toThrow('Native JavaScriptCore module evaluation succeeded without a module namespace id.')
  })

  it('creates and validates JSON-safe module export call requests', () => {
    expect(createNativeJscModuleExportCallRequest({
      moduleNamespaceId: 'jsc:1',
      exportName: 'default',
      args: [{ scene: 'opening' }],
    })).toEqual({
      moduleNamespaceId: 'jsc:1',
      exportName: 'default',
      argsJson: '[{"scene":"opening"}]',
    })

    expect(() => assertNativeJscModuleExportCallRequest({
      moduleNamespaceId: ' jsc:1',
      exportName: 'default',
      argsJson: '[]',
    })).toThrow(/moduleNamespaceId/)

    expect(() => assertNativeJscModuleExportCallRequest({
      moduleNamespaceId: 'jsc:1',
      exportName: 'constructor',
      argsJson: '[]',
    })).toThrow(/blocked/)

    expect(() => assertNativeJscModuleExportCallRequest({
      moduleNamespaceId: 'jsc:1',
      exportName: 'default',
      argsJson: '{"not":"array"}',
    })).toThrow(/JSON array/)
  })

  it('parses JSON-safe module export call responses', () => {
    expect(parseNativeJscModuleExportCallResponse({
      ok: true,
      valueJson: '{"value":5}',
    })).toEqual({ value: 5 })

    expect(parseNativeJscModuleExportCallResponse({
      ok: true,
    })).toBeUndefined()

    expect(() => parseNativeJscModuleExportCallResponse({
      ok: false,
      error: {
        code: 'missingExport',
        message: 'Missing export.',
      },
    })).toThrow('Missing export.')
  })

  it('creates and validates GameStep factory and run bridge requests', () => {
    expect(createNativeJscGameStepFactoryCallRequest({
      moduleNamespaceId: 'jsc:1',
      scope: { title: 'Opening' },
    })).toEqual({
      moduleNamespaceId: 'jsc:1',
      exportName: 'default',
      scopeJson: '{"title":"Opening"}',
    })

    expect(createNativeJscGameStepRunRequest({
      runHandleId: 'jsc:step:1',
      ctx: { stepId: 'intro.1' },
    })).toEqual({
      runHandleId: 'jsc:step:1',
      ctxJson: '{"stepId":"intro.1"}',
    })

    expect(createNativeJscGameStepResumeRequest({
      resumeHandleId: 'jsc:resume:1',
      payload: { choiceId: 'go' },
    })).toEqual({
      resumeHandleId: 'jsc:resume:1',
      payloadJson: '{"choiceId":"go"}',
    })

    expect(() => assertNativeJscGameStepFactoryCallRequest({
      moduleNamespaceId: 'jsc:1',
      exportName: 'constructor',
      scopeJson: '{}',
    })).toThrow(/blocked/)

    expect(() => assertNativeJscGameStepFactoryCallRequest({
      moduleNamespaceId: 'jsc:1',
      exportName: 'default',
      scopeJson: '[]',
    })).toThrow(/JSON object/)

    expect(() => assertNativeJscGameStepRunRequest({
      runHandleId: ' jsc:step:1',
      ctxJson: '{}',
    })).toThrow(/runHandleId/)

    expect(() => assertNativeJscGameStepRunRequest({
      runHandleId: 'jsc:step:1',
      ctxJson: 'null',
    })).toThrow(/JSON object/)

    expect(() => assertNativeJscGameStepResumeRequest({
      resumeHandleId: ' jsc:resume:1',
      payloadJson: '{}',
    })).toThrow(/resumeHandleId/)

    expect(() => assertNativeJscGameStepResumeRequest({
      resumeHandleId: 'jsc:resume:1',
      payloadJson: '{',
    })).toThrow(/JSON/)
  })

  it('unwraps GameStep factory and run responses', () => {
    expect(assertNativeJscGameStepFactoryCallResponse({
      ok: true,
      steps: [{
        uuid: 'intro.1',
        runHandleId: 'jsc:step:1',
        metadataJson: '{"title":"Opening"}',
      }],
    })).toEqual([{
      uuid: 'intro.1',
      runHandleId: 'jsc:step:1',
      metadataJson: '{"title":"Opening"}',
    }])

    expect(() => assertNativeJscGameStepFactoryCallResponse({
      ok: false,
      error: {
        code: 'invalidStepFactoryResult',
        message: 'Factory did not return steps.',
      },
    })).toThrow('Factory did not return steps.')

    expect(() => assertNativeJscGameStepFactoryCallResponse({ ok: true }))
      .toThrow(/without step descriptors/)

    expect(assertNativeJscGameStepRunResponse({ ok: true })).toEqual({
      ok: true,
      commands: [],
      pipelineSubscriptions: [],
    })

    expect(assertNativeJscGameStepRunResponse({
      ok: true,
      commands: [{
        target: 'engine',
        method: 'showChoices',
        argsJson: '[[{"id":"go","text":"Go"}]]',
      }],
      pendingWait: {
        resumeHandleId: 'jsc:resume:1',
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
        resumeHandleId: 'jsc:resume:1',
        event: 'user/choice_select',
      },
      pipelineSubscriptions: [],
    })

    expect(assertNativeJscGameStepRunResponse({
      ok: true,
      pendingTranslation: {
        resumeHandleId: 'jsc:resume:2',
        key: 'runtime.greeting',
        optionsJson: '{"values":{"name":"Mira"}}',
      },
    })).toEqual({
      ok: true,
      commands: [],
      pendingTranslation: {
        resumeHandleId: 'jsc:resume:2',
        key: 'runtime.greeting',
        optionsJson: '{"values":{"name":"Mira"}}',
      },
      pipelineSubscriptions: [],
    })

    expect(assertNativeJscGameStepRunResponse({
      ok: true,
      pendingTranslation: {
        resumeHandleId: 'jsc:resume:3',
        key: 'runtime.indexed',
        optionsJson: '["Mira"]',
      },
    }).pendingTranslation?.optionsJson).toBe('["Mira"]')

    expect(assertNativeJscGameStepRunResponse({
      ok: true,
      pendingPipelineEmit: {
        resumeHandleId: 'jsc:resume:5',
        event: 'plugin/custom_event',
        payloadJson: '{"ok":true}',
      },
    })).toEqual({
      ok: true,
      commands: [],
      pendingPipelineEmit: {
        resumeHandleId: 'jsc:resume:5',
        event: 'plugin/custom_event',
        payloadJson: '{"ok":true}',
      },
      pipelineSubscriptions: [],
    })

    expect(assertNativeJscGameStepRunResponse({
      ok: true,
      pendingHelperCall: {
        resumeHandleId: 'jsc:resume:7',
        module: '@quajs/plugin-background',
        exportName: 'setBackgroundWithEngine',
        argsJson: '["bg/opening.png",{"transition":{"type":"fade"}}]',
      },
    })).toEqual({
      ok: true,
      commands: [],
      pendingHelperCall: {
        resumeHandleId: 'jsc:resume:7',
        module: '@quajs/plugin-background',
        exportName: 'setBackgroundWithEngine',
        argsJson: '["bg/opening.png",{"transition":{"type":"fade"}}]',
      },
      pipelineSubscriptions: [],
    })

    expect(assertNativeJscGameStepRunResponse({
      ok: true,
      pipelineSubscriptions: [{
        op: 'subscribe',
        subscriptionId: 'jsc:1:pipeline:1',
        moduleNamespaceId: 'jsc:1',
        event: 'plugin/custom_event',
      }],
    }).pipelineSubscriptions).toEqual([{
      op: 'subscribe',
      subscriptionId: 'jsc:1:pipeline:1',
      moduleNamespaceId: 'jsc:1',
      event: 'plugin/custom_event',
    }])

    expect(() => assertNativeJscGameStepHelperCallRequest({
      resumeHandleId: 'jsc:resume:8',
      module: '@quajs/plugin-background',
      exportName: 'constructor',
      argsJson: '[]',
    })).toThrow(/blocked/)

    expect(() => assertNativeJscGameStepHelperCallRequest({
      resumeHandleId: 'jsc:resume:9',
      module: ' @quajs/plugin-background',
      exportName: 'setBackgroundWithEngine',
      argsJson: '[]',
    })).toThrow(/module name/)

    expect(() => assertNativeJscGameStepHelperCallRequest({
      resumeHandleId: 'jsc:resume:10',
      module: '@quajs/plugin-background',
      exportName: 'setBackgroundWithEngine',
      argsJson: '{"not":"array"}',
    })).toThrow(/JSON array/)

    expect(() => assertNativeJscGameStepRunResponse({
      ok: true,
      pendingWait: {
        resumeHandleId: 'jsc:resume:1',
        event: 'user/choice_select',
      },
      pendingTranslation: {
        resumeHandleId: 'jsc:resume:2',
        key: 'runtime.greeting',
      },
      pendingPipelineEmit: {
        resumeHandleId: 'jsc:resume:5',
        event: 'plugin/custom_event',
      },
      pendingHelperCall: {
        resumeHandleId: 'jsc:resume:7',
        module: '@quajs/plugin-background',
        exportName: 'setBackgroundWithEngine',
      },
    })).toThrow(/one pending continuation/)

    expect(() => assertNativeJscGameStepRunResponse({
      ok: true,
      pendingTranslation: {
        resumeHandleId: 'jsc:resume:4',
        key: 'runtime.greeting',
        optionsJson: '"Mira"',
      },
    })).toThrow(/JSON object or array/)

    expect(() => assertNativeJscGameStepRunResponse({
      ok: true,
      pendingPipelineEmit: {
        resumeHandleId: 'jsc:resume:6',
        event: ' plugin/custom_event',
      },
    })).toThrow(/event name/)

    expect(() => assertNativeJscGameStepRunResponse({
      ok: false,
      error: {
        code: 'missingRunHandle',
        message: 'Missing run handle.',
      },
    })).toThrow('Missing run handle.')
  })

  it('validates GameStep run command descriptors', () => {
    expect(() => assertNativeJscGameStepCommand({
      target: 'engine',
      method: 'clearChoices',
      argsJson: '[]',
    })).not.toThrow()

    expect(() => assertNativeJscGameStepCommand({
      target: 'engine',
      method: 'quickSave',
      argsJson: '[{"name":"Before choice"}]',
    })).not.toThrow()

    expect(() => assertNativeJscGameStepCommand({
      target: 'engine',
      method: 'markRollbackBoundary',
      argsJson: '["no-rollback"]',
    })).not.toThrow()

    expect(() => assertNativeJscGameStepCommand({
      target: 'pipeline' as any,
      method: 'clearChoices',
      argsJson: '[]',
    })).toThrow(/target/)

    expect(() => assertNativeJscGameStepCommand({
      target: 'engine',
      method: 'waitFor' as any,
      argsJson: '["user/choice_select"]',
    })).toThrow(/allowlisted/)

    expect(() => assertNativeJscGameStepCommand({
      target: 'engine',
      method: 'showChoices',
      argsJson: '{"not":"array"}',
    })).toThrow(/JSON array/)
  })

  it('creates and validates pipeline listener dispatch wire payloads', () => {
    expect(createNativeJscPipelineListenerDispatchRequest({
      subscriptionId: 'jsc:1:pipeline:1',
      context: {
        event: {
          type: 'plugin/custom_event',
          payload: { value: 42 },
        },
      },
    })).toEqual({
      subscriptionId: 'jsc:1:pipeline:1',
      contextJson: '{"event":{"type":"plugin/custom_event","payload":{"value":42}}}',
    })

    expect(() => assertNativeJscPipelineSubscriptionChange({
      op: 'subscribe',
      subscriptionId: 'jsc:1:pipeline:1',
      moduleNamespaceId: 'jsc:1',
      event: 'plugin/custom_event',
    })).not.toThrow()

    expect(assertNativeJscPipelineListenerDispatchResponse({
      ok: true,
      commands: [{
        target: 'engine',
        method: 'showDialogue',
        argsJson: '[{"text":"Dispatched"}]',
      }],
      pipelineSubscriptions: [{
        op: 'unsubscribe',
        subscriptionId: 'jsc:1:pipeline:1',
        moduleNamespaceId: 'jsc:1',
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
        subscriptionId: 'jsc:1:pipeline:1',
        moduleNamespaceId: 'jsc:1',
        event: 'plugin/custom_event',
      }],
    })

    expect(() => assertNativeJscPipelineSubscriptionChange({
      op: 'replace' as any,
      subscriptionId: 'jsc:1:pipeline:1',
      moduleNamespaceId: 'jsc:1',
      event: 'plugin/custom_event',
    })).toThrow(/subscribe.*unsubscribe/)

    expect(() => assertNativeJscPipelineListenerDispatchRequest({
      subscriptionId: ' jsc:1:pipeline:1',
      contextJson: '{}',
    })).toThrow(/subscriptionId/)

    expect(() => assertNativeJscPipelineListenerDispatchRequest({
      subscriptionId: 'jsc:1:pipeline:1',
      contextJson: '[]',
    })).toThrow(/JSON object/)
  })
})
