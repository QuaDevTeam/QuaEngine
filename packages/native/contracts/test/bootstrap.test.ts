import { describe, expect, it } from 'vitest'
import {
  COCOS_TARGET_BOOTSTRAP,
  NATIVE_TARGET_BOOTSTRAP,
  WEB_TARGET_BOOTSTRAP,
  collectTargetCoreAdapterRoots,
  normalizePackageSpecifier,
  validateExclusiveTargetBootstrap,
  validateTargetBootstrap,
} from '../src'

describe('target bootstrap isolation', () => {
  it('accepts the exact Web core adapter set', () => {
    expect(validateTargetBootstrap('web', WEB_TARGET_BOOTSTRAP.coreAdapters)).toEqual({
      ok: true,
      missing: [],
      forbidden: [],
      diagnostics: [],
    })
  })

  it('accepts the exact Cocos core adapter set', () => {
    expect(validateTargetBootstrap('cocos', COCOS_TARGET_BOOTSTRAP.coreAdapters)).toEqual({
      ok: true,
      missing: [],
      forbidden: [],
      diagnostics: [],
    })
  })

  it('accepts the exact native core adapter set', () => {
    expect(validateTargetBootstrap('native', NATIVE_TARGET_BOOTSTRAP.coreAdapters)).toEqual({
      ok: true,
      missing: [],
      forbidden: [],
      diagnostics: [],
    })
  })

  it('rejects Web renderer and Web framework adapters in native bundles', () => {
    const result = validateTargetBootstrap('native', [
      ...NATIVE_TARGET_BOOTSTRAP.coreAdapters,
      '@quajs/renderer-web/plugins/audio',
      '@quajs/renderer-vue/plugins/preset',
      '@quajs/renderer-react',
      '@quajs/assets-web',
    ])

    expect(result.ok).toBe(false)
    expect(result.missing).toEqual([])
    expect(result.forbidden).toEqual([
      '@quajs/assets-web',
      '@quajs/renderer-web',
      '@quajs/renderer-vue',
      '@quajs/renderer-react',
    ])
  })

  it('rejects Cocos adapters in native bundles', () => {
    const result = validateTargetBootstrap('native', [
      ...NATIVE_TARGET_BOOTSTRAP.coreAdapters,
      '@quajs/cocos-host/testing',
      '@quajs/renderer-cocos/plugins/audio',
      '@quajs/assets-cocos',
      '@quajs/store-cocos',
    ])

    expect(result.ok).toBe(false)
    expect(result.forbidden).toEqual([
      '@quajs/assets-cocos',
      '@quajs/store-cocos',
      '@quajs/cocos-host',
      '@quajs/renderer-cocos',
    ])
  })

  it('rejects native adapters in Web bundles', () => {
    const result = validateTargetBootstrap('web', [
      ...WEB_TARGET_BOOTSTRAP.coreAdapters,
      '@quajs/engine-native',
      '@quajs/assets-native',
      '@quajs/store-native',
      '@quajs/native-contracts',
      'quajs_wgpu_renderer::plugins::audio',
    ])

    expect(result.ok).toBe(false)
    expect(result.forbidden).toEqual([
      '@quajs/engine-native',
      '@quajs/assets-native',
      '@quajs/store-native',
      '@quajs/native-contracts',
      'quajs_wgpu_renderer',
    ])
  })

  it('rejects Web and native adapters in Cocos bundles', () => {
    const result = validateTargetBootstrap('cocos', [
      ...COCOS_TARGET_BOOTSTRAP.coreAdapters,
      '@quajs/renderer-web',
      '@quajs/renderer-svelte/plugins/ui',
      '@quajs/engine-native/native-host',
      '@quajs/assets-native',
      '@quajs/native-contracts/bootstrap',
    ])

    expect(result.ok).toBe(false)
    expect(result.forbidden).toEqual([
      '@quajs/renderer-web',
      '@quajs/renderer-svelte',
      '@quajs/engine-native',
      '@quajs/assets-native',
      '@quajs/native-contracts',
    ])
  })

  it('reports missing required target core adapters', () => {
    const result = validateTargetBootstrap('native', [
      '@quajs/engine-native',
      '@quajs/native-contracts',
    ])

    expect(result.ok).toBe(false)
    expect(result.missing).toEqual(['@quajs/assets-native', '@quajs/store-native'])
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: 'TARGET_CORE_ADAPTER_MISSING',
        packageName: '@quajs/assets-native',
      }),
      expect.objectContaining({
        code: 'TARGET_CORE_ADAPTER_MISSING',
        packageName: '@quajs/store-native',
      }),
    ])
  })

  it('can skip required core checks for partial dependency graph linting', () => {
    const result = validateTargetBootstrap('native', ['@quajs/engine-native'], {
      requireCoreAdapters: false,
    })

    expect(result).toEqual({
      ok: true,
      missing: [],
      forbidden: [],
      diagnostics: [],
    })
  })

  it('normalizes package subentries before validating isolation', () => {
    expect(normalizePackageSpecifier('@quajs/renderer-web/plugins/audio')).toBe('@quajs/renderer-web')
    expect(normalizePackageSpecifier('@quajs/cocos-host/testing')).toBe('@quajs/cocos-host')
    expect(normalizePackageSpecifier('quajs_wgpu_renderer::plugins::audio')).toBe('quajs_wgpu_renderer')
  })

  it('collects normalized target core adapter roots for runtime package guards', () => {
    const roots = collectTargetCoreAdapterRoots()

    expect(roots.has('@quajs/renderer-web')).toBe(true)
    expect(roots.has('@quajs/cocos-host')).toBe(true)
    expect(roots.has('@quajs/engine-native')).toBe(true)
    expect(roots.has('@quajs/native-contracts')).toBe(true)
    expect(roots.has('quajs_wgpu_renderer')).toBe(true)
    expect(roots.has('@quajs/character')).toBe(false)
  })

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
