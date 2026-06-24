import { describe, expect, it } from 'vitest'
import {
  DEFAULT_NATIVE_QUICKJS_SANDBOX_LIMITS,
  assertNativeQuickJsEvaluationResponse,
  createNativeQuickJsEvaluationRequest,
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
})
