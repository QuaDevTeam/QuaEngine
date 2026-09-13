import { describe, expect, it } from 'vitest'
import { validateTargetPluginManifest } from '../../src'
import { createPluginManifest } from './helpers'

describe('target plugin manifest import isolation', () => {
  it('rejects shared entries that import any target core adapter', () => {
    const result = validateTargetPluginManifest({
      target: 'native',
      manifest: createPluginManifest({
        entries: [
          {
            specifier: '@quajs/plugin-settings/shared',
            target: 'shared',
            imports: ['@quajs/renderer-web/plugins/settings'],
          },
          {
            specifier: '@quajs/plugin-settings/native',
            target: 'native',
            imports: ['@quajs/engine-native'],
          },
        ],
      }),
    })

    expect(result.ok).toBe(false)
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: 'TARGET_PLUGIN_SHARED_ENTRY_TARGET_CORE_IMPORT',
        packageName: '@quajs/renderer-web',
      }),
    ])
  })

  it('checks both specifier and packageName fields in plugin import references', () => {
    const result = validateTargetPluginManifest({
      target: 'native',
      manifest: createPluginManifest({
        entries: [
          {
            specifier: '@quajs/plugin-settings/shared',
            target: 'shared',
            imports: [
              {
                packageName: '@quajs/plugin-settings-core',
                specifier: '@quajs/renderer-cocos/plugins/settings',
              },
            ],
          },
          {
            specifier: '@quajs/plugin-settings/native',
            target: 'native',
            imports: [
              {
                packageName: '@quajs/plugin-settings-runtime',
                specifier: '@quajs/renderer-web/plugins/settings',
              },
            ],
          },
        ],
      }),
    })

    expect(result.ok).toBe(false)
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'TARGET_PLUGIN_SHARED_ENTRY_TARGET_CORE_IMPORT',
        packageName: '@quajs/renderer-cocos',
      }),
      expect.objectContaining({
        code: 'TARGET_PLUGIN_TARGET_ENTRY_FOREIGN_CORE_IMPORT',
        packageName: '@quajs/renderer-web',
      }),
    ]))
  })

  it('rejects active target entries that import foreign target core adapters for every target', () => {
    const cases = [
      {
        target: 'web',
        ownCore: '@quajs/renderer-web/plugins/backlog',
        foreignCoreImports: ['@quajs/cocos-host/runtime', '@quajs/engine-native/native-host'],
        packageNames: ['@quajs/cocos-host', '@quajs/engine-native'],
      },
      {
        target: 'cocos',
        ownCore: '@quajs/renderer-cocos/plugins/backlog',
        foreignCoreImports: ['@quajs/renderer-web/plugins/backlog', '@quajs/assets-native'],
        packageNames: ['@quajs/renderer-web', '@quajs/assets-native'],
      },
      {
        target: 'native',
        ownCore: '@quajs/engine-native',
        foreignCoreImports: ['@quajs/renderer-web/plugins/backlog', '@quajs/cocos-host/runtime'],
        packageNames: ['@quajs/renderer-web', '@quajs/cocos-host'],
      },
    ] as const

    for (const { target, ownCore, foreignCoreImports, packageNames } of cases) {
      const result = validateTargetPluginManifest({
        target,
        manifest: createPluginManifest({
          entries: [
            { specifier: '@quajs/plugin-backlog/shared', target: 'shared' },
            {
              specifier: `@quajs/plugin-backlog/${target}`,
              target,
              imports: [
                ownCore,
                ...foreignCoreImports,
              ],
            },
          ],
        }),
      })

      expect(result.ok).toBe(false)
      for (const packageName of packageNames) {
        expect(result.diagnostics).toEqual(expect.arrayContaining([
          expect.objectContaining({
            code: 'TARGET_PLUGIN_TARGET_ENTRY_FOREIGN_CORE_IMPORT',
            target,
            packageName,
          }),
        ]))
      }
    }
  })
})
