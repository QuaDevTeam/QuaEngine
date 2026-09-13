import { describe, expect, it } from 'vitest'
import {
  NATIVE_TARGET_BOOTSTRAP,
  WEB_TARGET_BOOTSTRAP,
  validateExclusiveTargetBootstrap,
} from '../../src'

describe('exclusive target bootstrap isolation', () => {
  it('accepts exactly one registered target bootstrap', () => {
    const result = validateExclusiveTargetBootstrap(NATIVE_TARGET_BOOTSTRAP.coreAdapters, {
      expectedTarget: 'native',
    })

    expect(result.ok).toBe(true)
    expect(result.selectedTargets).toEqual(['native'])
    expect(result.targetValidation).toMatchObject({
      ok: true,
      missing: [],
      forbidden: [],
    })
  })

  it('rejects package outputs that mix target bootstrap core adapters', () => {
    const result = validateExclusiveTargetBootstrap([
      ...WEB_TARGET_BOOTSTRAP.coreAdapters,
      '@quajs/engine-native/native-host',
      '@quajs/assets-native',
      '@quajs/renderer-cocos/plugins/audio',
    ])

    expect(result.ok).toBe(false)
    expect(result.selectedTargets).toEqual(['web', 'cocos', 'native'])
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: 'TARGET_BOOTSTRAP_MIXED',
        targets: ['web', 'cocos', 'native'],
        packageNames: [
          '@quajs/assets-web',
          '@quajs/renderer-web',
          '@quajs/renderer-cocos',
          '@quajs/engine-native',
          '@quajs/assets-native',
        ],
      }),
    ])
  })

  it('rejects outputs that do not register any target bootstrap', () => {
    const result = validateExclusiveTargetBootstrap(['@quajs/engine', '@quajs/pipeline'], {
      expectedTarget: 'web',
    })

    expect(result.ok).toBe(false)
    expect(result.selectedTargets).toEqual([])
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: 'TARGET_BOOTSTRAP_NONE',
        expectedTarget: 'web',
      }),
    ])
    expect(result.targetValidation?.missing).toEqual(WEB_TARGET_BOOTSTRAP.coreAdapters)
  })

  it('rejects outputs registered for a different target than requested', () => {
    const result = validateExclusiveTargetBootstrap(WEB_TARGET_BOOTSTRAP.coreAdapters, {
      expectedTarget: 'native',
    })

    expect(result.ok).toBe(false)
    expect(result.selectedTargets).toEqual(['web'])
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: 'TARGET_BOOTSTRAP_UNEXPECTED',
        targets: ['web'],
        expectedTarget: 'native',
      }),
    ])
    expect(result.targetValidation?.forbidden).toEqual([
      '@quajs/assets-web',
      '@quajs/renderer-web',
    ])
  })
})
