import { describe, expect, it } from 'vitest'
import { validateOrdinaryPluginListTargetIsolation } from '../../src'

describe('ordinary plugin target isolation', () => {
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
