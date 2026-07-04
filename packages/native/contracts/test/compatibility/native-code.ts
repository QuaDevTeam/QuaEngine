import { describe, expect, it } from 'vitest'
import { checkNativeCompatibility } from '../../src'
import { createHostInfo } from './helpers'

describe('checkNativeCompatibility native code gate', () => {
  it('rejects dynamic packages that request native code activation', () => {
    const result = checkNativeCompatibility({
      hostInfo: createHostInfo(),
      compatibility: {
        nativeCode: true,
      } as any,
    })

    expect(result.ok).toBe(false)
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: 'NATIVE_CODE_NOT_ALLOWED',
        severity: 'error',
      }),
    ])
  })

  it('rejects native compatibility declarations without an explicit nativeCode false marker', () => {
    const result = checkNativeCompatibility({
      hostInfo: createHostInfo(),
      compatibility: {
        renderer: '@quajs/native-renderer',
        version: '^0.1.0',
        capabilityIds: ['native-wgpu.ui.surface@1'],
      },
    })

    expect(result.ok).toBe(false)
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: 'NATIVE_CODE_NOT_ALLOWED',
        severity: 'error',
        message: 'Dynamic native runtime packages must explicitly declare nativeCode: false.',
      }),
    ])
  })
})
