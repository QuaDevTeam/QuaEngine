import { describe, expect, it } from 'vitest'
import {
  DEFAULT_NATIVE_QUICKJS_SANDBOX_LIMITS,
  assertNativeQuickJsEvaluationResponse,
  assertNativeQuickJsModuleExportCallRequest,
  createNativeQuickJsEvaluationRequest,
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
})
