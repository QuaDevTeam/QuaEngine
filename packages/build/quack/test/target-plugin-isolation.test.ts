import { describe, expect, it } from 'vitest'
import {
  assertLoadedQuackPluginTargetIsolation,
  assertQuackPluginReferencesTargetIsolation,
  assertQuackPluginSpecifiersTargetIsolation,
  assertQuackTargetPluginManifestIsolation,
} from '../src/target-plugin-isolation'

describe('Quack target plugin isolation', () => {
  it('keeps the string specifier compatibility wrapper', () => {
    expect(() => assertQuackPluginSpecifiersTargetIsolation([
      '@quajs/renderer-web/plugins/audio',
    ], {
      target: 'native',
      fieldName: 'quack --plugin',
    })).toThrow(/@quajs\/renderer-web\/plugins\/audio resolves to @quajs\/renderer-web/)
  })

  it('checks both specifier and packageName fields in generated plugin references', () => {
    expect(() => assertQuackPluginReferencesTargetIsolation([
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
      fieldName: 'generated plugin resolver',
    })).toThrow(
      /generated plugin resolver[\s\S]*@quajs\/renderer-web\/plugins\/ui resolves to @quajs\/renderer-web[\s\S]*@quajs\/cocos-host resolves to @quajs\/cocos-host[\s\S]*@quajs\/engine-native\/runtime resolves to @quajs\/engine-native/,
    )
  })

  it('checks loaded plugin source metadata when it is available', () => {
    expect(() => assertLoadedQuackPluginTargetIsolation([
      {
        name: '@quajs/plugin-menu',
        version: '1.0.0',
        specifier: '@quajs/renderer-web/plugins/ui',
      },
      {
        name: '@quajs/plugin-gallery',
        version: '1.0.0',
        packageName: '@quajs/cocos-host',
      },
      {
        name: '@quajs/plugin-native-menu',
        version: '1.0.0',
        specifier: '@quajs/character',
        packageName: '@quajs/engine-native/runtime',
      },
    ], {
      target: 'native',
      fieldName: 'loaded plugin metadata',
    })).toThrow(
      /loaded plugin metadata[\s\S]*@quajs\/renderer-web\/plugins\/ui resolves to @quajs\/renderer-web[\s\S]*@quajs\/cocos-host resolves to @quajs\/cocos-host[\s\S]*@quajs\/engine-native\/runtime resolves to @quajs\/engine-native/,
    )
  })

  it('accepts target plugin manifests when only shared and active entries are selected', () => {
    expect(() => assertQuackTargetPluginManifestIsolation({
      target: 'native',
      manifest: {
        pluginId: '@quajs/plugin-menu',
        entries: [
          {
            specifier: '@quajs/plugin-menu/shared',
            target: 'shared',
            imports: ['@quajs/engine'],
          },
          {
            specifier: '@quajs/plugin-menu/web',
            target: 'web',
            imports: ['@quajs/renderer-web/plugins/ui'],
          },
          {
            specifier: '@quajs/plugin-menu/native',
            target: 'native',
            imports: ['@quajs/engine-native'],
          },
        ],
      },
      selectedEntries: [
        '@quajs/plugin-menu/shared',
        '@quajs/plugin-menu/native',
      ],
    })).not.toThrow()
  })

  it('wraps target plugin manifest diagnostics in packaging-ready Quack errors', () => {
    expect(() => assertQuackTargetPluginManifestIsolation({
      target: 'native',
      manifest: {
        pluginId: '@quajs/plugin-menu',
        entries: [
          {
            specifier: '@quajs/plugin-menu/shared',
            target: 'shared',
          },
          {
            specifier: '@quajs/plugin-menu/native',
            target: 'desktop-native' as any,
          },
          {
            specifier: '@quajs/plugin-menu/web',
            target: 'web',
            eager: true,
            imports: ['@quajs/renderer-web/plugins/ui'],
          },
        ],
      },
      selectedEntries: ['@quajs/plugin-menu/native'],
    })).toThrow(
      /@quajs\/plugin-menu[\s\S]*TARGET_PLUGIN_ENTRY_TARGET_INVALID @quajs\/plugin-menu\/native[\s\S]*TARGET_PLUGIN_INACTIVE_ENTRY_EAGER @quajs\/plugin-menu\/web[\s\S]*TARGET_PLUGIN_INACTIVE_ENTRY_TARGET_CORE_IMPORT @quajs\/plugin-menu\/web[\s\S]*Select only shared plus active-target plugin entries/,
    )
  })

  it('rejects target core leakage symmetrically for every packaging target', () => {
    const cases = [
      {
        target: 'web',
        references: [
          '@quajs/renderer-web/plugins/audio',
          { packageName: '@quajs/plugin-cocos-ui', specifier: '@quajs/renderer-cocos/plugins/ui' },
          { packageName: '@quajs/plugin-native-host', specifier: '@quajs/engine-native/runtime' },
        ],
        expected: [
          ['@quajs/renderer-web/plugins/audio', '@quajs/renderer-web', 'web-core'],
          ['@quajs/renderer-cocos/plugins/ui', '@quajs/renderer-cocos', 'cocos-core'],
          ['@quajs/engine-native/runtime', '@quajs/engine-native', 'native-core'],
        ],
      },
      {
        target: 'cocos',
        references: [
          '@quajs/cocos-host/runtime',
          { packageName: '@quajs/plugin-web-ui', specifier: '@quajs/renderer-vue/plugins/ui' },
          { packageName: '@quajs/plugin-native-store', specifier: '@quajs/store-native' },
        ],
        expected: [
          ['@quajs/cocos-host/runtime', '@quajs/cocos-host', 'cocos-core'],
          ['@quajs/renderer-vue/plugins/ui', '@quajs/renderer-vue', 'web-core'],
          ['@quajs/store-native', '@quajs/store-native', 'native-core'],
        ],
      },
      {
        target: 'native',
        references: [
          '@quajs/engine-native/native-host',
          { packageName: '@quajs/plugin-web-ui', specifier: '@quajs/renderer-web/plugins/ui' },
          { packageName: '@quajs/plugin-cocos-host', specifier: '@quajs/cocos-host/runtime' },
        ],
        expected: [
          ['@quajs/engine-native/native-host', '@quajs/engine-native', 'native-core'],
          ['@quajs/renderer-web/plugins/ui', '@quajs/renderer-web', 'web-core'],
          ['@quajs/cocos-host/runtime', '@quajs/cocos-host', 'cocos-core'],
        ],
      },
    ] as const

    for (const { target, references, expected } of cases) {
      let error: unknown
      try {
        assertQuackPluginReferencesTargetIsolation(references, {
          target,
          fieldName: `targets.${target}.plugins`,
        })
      }
      catch (caught) {
        error = caught
      }

      expect(error).toBeInstanceOf(Error)
      const message = (error as Error).message
      expect(message).toContain(`Quack plugin list "targets.${target}.plugins" must not include Web, Cocos, or native target core adapters.`)
      for (const [specifier, packageName, corePluginFamily] of expected)
        expect(message).toContain(`${specifier} resolves to ${packageName} (${corePluginFamily}).`)
    }
  })
})
