import { describe, expect, it } from 'vitest'
import {
  COCOS_TARGET_BOOTSTRAP,
  NATIVE_TARGET_BOOTSTRAP,
  WEB_TARGET_BOOTSTRAP,
  collectTargetCoreAdapterRoots,
  normalizePackageSpecifier,
  validateExclusiveTargetBootstrap,
  validateOrdinaryPluginListTargetIsolation,
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

  it('accepts platform-neutral ordinary game plugin lists', () => {
    const result = validateOrdinaryPluginListTargetIsolation([
      '@quajs/character',
      '@quajs/plugin-background',
      '@scope/project-story-plugin/runtime',
    ], {
      target: 'native',
    })

    expect(result).toEqual({
      ok: true,
      packageNames: [
        '@quajs/character',
        '@quajs/plugin-background',
        '@scope/project-story-plugin',
      ],
      diagnostics: [],
    })
  })

  it('rejects target core adapters in ordinary game plugin lists before target packaging', () => {
    const result = validateOrdinaryPluginListTargetIsolation([
      '@quajs/plugin-background',
      '@quajs/renderer-web/plugins/audio',
      '@quajs/renderer-cocos/plugins/dialogue',
      '@quajs/engine-native/runtime',
      'quajs_wgpu_renderer::plugins::ui',
    ], {
      target: 'native',
      fieldName: 'qua.project.plugins',
    })

    expect(result.ok).toBe(false)
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: 'ORDINARY_PLUGIN_TARGET_CORE_ADAPTER',
        target: 'native',
        fieldName: 'qua.project.plugins',
        specifier: '@quajs/renderer-web/plugins/audio',
        packageName: '@quajs/renderer-web',
        corePluginFamily: 'web-core',
      }),
      expect.objectContaining({
        code: 'ORDINARY_PLUGIN_TARGET_CORE_ADAPTER',
        specifier: '@quajs/renderer-cocos/plugins/dialogue',
        packageName: '@quajs/renderer-cocos',
        corePluginFamily: 'cocos-core',
      }),
      expect.objectContaining({
        code: 'ORDINARY_PLUGIN_TARGET_CORE_ADAPTER',
        specifier: '@quajs/engine-native/runtime',
        packageName: '@quajs/engine-native',
        corePluginFamily: 'native-core',
      }),
      expect.objectContaining({
        code: 'ORDINARY_PLUGIN_TARGET_CORE_ADAPTER',
        specifier: 'quajs_wgpu_renderer::plugins::ui',
        packageName: 'quajs_wgpu_renderer',
        corePluginFamily: 'native-core',
      }),
    ])
  })

  it('checks both specifier and packageName fields in ordinary plugin references', () => {
    const result = validateOrdinaryPluginListTargetIsolation([
      '@quajs/plugin-background',
      {
        packageName: '@quajs/plugin-menu',
        specifier: '@quajs/renderer-web/plugins/ui',
      },
      {
        packageName: '@quajs/cocos-host',
        specifier: '@quajs/plugin-gallery/cocos',
      },
      {
        packageName: '@quajs/plugin-native-menu',
        specifier: '@quajs/engine-native/runtime',
      },
    ], {
      target: 'native',
      fieldName: 'qua.project.plugins',
    })

    expect(result.ok).toBe(false)
    expect(result.packageNames).toEqual(expect.arrayContaining([
      '@quajs/plugin-background',
      '@quajs/plugin-menu',
      '@quajs/renderer-web',
      '@quajs/cocos-host',
      '@quajs/plugin-gallery',
      '@quajs/plugin-native-menu',
      '@quajs/engine-native',
    ]))
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'ORDINARY_PLUGIN_TARGET_CORE_ADAPTER',
        specifier: '@quajs/renderer-web/plugins/ui',
        packageName: '@quajs/renderer-web',
        corePluginFamily: 'web-core',
      }),
      expect.objectContaining({
        code: 'ORDINARY_PLUGIN_TARGET_CORE_ADAPTER',
        specifier: '@quajs/cocos-host',
        packageName: '@quajs/cocos-host',
        corePluginFamily: 'cocos-core',
      }),
      expect.objectContaining({
        code: 'ORDINARY_PLUGIN_TARGET_CORE_ADAPTER',
        specifier: '@quajs/engine-native/runtime',
        packageName: '@quajs/engine-native',
        corePluginFamily: 'native-core',
      }),
    ]))
  })

  it('rejects target core adapters symmetrically in ordinary plugin lists for every packaging target', () => {
    const cases = [
      {
        target: 'web',
        fieldName: 'targets.web.plugins',
        specifiers: [
          '@quajs/cocos-host/runtime',
          '@quajs/renderer-cocos/plugins/ui',
          '@quajs/engine-native/native-host',
          '@quajs/assets-native',
          'quajs_wgpu_renderer::plugins::ui',
        ],
        expected: [
          ['@quajs/cocos-host/runtime', '@quajs/cocos-host', 'cocos-core'],
          ['@quajs/renderer-cocos/plugins/ui', '@quajs/renderer-cocos', 'cocos-core'],
          ['@quajs/engine-native/native-host', '@quajs/engine-native', 'native-core'],
          ['@quajs/assets-native', '@quajs/assets-native', 'native-core'],
          ['quajs_wgpu_renderer::plugins::ui', 'quajs_wgpu_renderer', 'native-core'],
        ],
      },
      {
        target: 'cocos',
        fieldName: 'targets.cocos.plugins',
        specifiers: [
          '@quajs/renderer-web/plugins/ui',
          '@quajs/renderer-vue/plugins/preset',
          '@quajs/engine-native/native-host',
          '@quajs/store-native',
          'quajs_native_app::startup',
        ],
        expected: [
          ['@quajs/renderer-web/plugins/ui', '@quajs/renderer-web', 'web-core'],
          ['@quajs/renderer-vue/plugins/preset', '@quajs/renderer-vue', 'web-core'],
          ['@quajs/engine-native/native-host', '@quajs/engine-native', 'native-core'],
          ['@quajs/store-native', '@quajs/store-native', 'native-core'],
          ['quajs_native_app::startup', 'quajs_native_app', 'native-core'],
        ],
      },
      {
        target: 'native',
        fieldName: 'targets.native.plugins',
        specifiers: [
          '@quajs/assets-web',
          '@quajs/renderer-svelte/plugins/ui',
          '@quajs/cocos-host/runtime',
          '@quajs/assets-cocos',
          '@quajs/renderer-cocos/plugins/dialogue',
        ],
        expected: [
          ['@quajs/assets-web', '@quajs/assets-web', 'web-core'],
          ['@quajs/renderer-svelte/plugins/ui', '@quajs/renderer-svelte', 'web-core'],
          ['@quajs/cocos-host/runtime', '@quajs/cocos-host', 'cocos-core'],
          ['@quajs/assets-cocos', '@quajs/assets-cocos', 'cocos-core'],
          ['@quajs/renderer-cocos/plugins/dialogue', '@quajs/renderer-cocos', 'cocos-core'],
        ],
      },
    ] as const

    for (const { target, fieldName, specifiers, expected } of cases) {
      const result = validateOrdinaryPluginListTargetIsolation([
        '@quajs/character',
        '@quajs/plugin-background',
        ...specifiers,
      ], {
        target,
        fieldName,
      })

      expect(result.ok).toBe(false)
      for (const [specifier, packageName, corePluginFamily] of expected) {
        expect(result.diagnostics).toEqual(expect.arrayContaining([
          expect.objectContaining({
            code: 'ORDINARY_PLUGIN_TARGET_CORE_ADAPTER',
            target,
            fieldName,
            specifier,
            packageName,
            corePluginFamily,
          }),
        ]))
      }
    }
  })
})
