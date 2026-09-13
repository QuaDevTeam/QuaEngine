import { describe, expect, it } from 'vitest'
import { validateTargetPluginManifest } from '../../src'
import { createPluginManifest } from './helpers'

describe('target plugin manifest inactive entries', () => {
  it('rejects inactive eager entries for Web, Cocos, and native artifacts', () => {
    for (const target of ['web', 'cocos', 'native'] as const) {
      const inactiveTarget = target === 'web' ? 'native' : 'web'
      const result = validateTargetPluginManifest({
        target,
        manifest: createPluginManifest({
          entries: [
            { specifier: '@quajs/plugin-ui/shared', target: 'shared' },
            { specifier: `@quajs/plugin-ui/${target}`, target },
            { specifier: `@quajs/plugin-ui/${inactiveTarget}`, target: inactiveTarget, eager: true },
          ],
        }),
      })

      expect(result.ok).toBe(false)
      expect(result.diagnostics).toEqual([
        expect.objectContaining({
          code: 'TARGET_PLUGIN_INACTIVE_ENTRY_EAGER',
          target,
          entryTarget: inactiveTarget,
        }),
      ])
    }
  })

  it('reports target core imports from inactive eager entries before packaging', () => {
    const cases = [
      {
        target: 'web',
        inactiveTarget: 'native',
        importedCore: '@quajs/engine-native/runtime',
        packageName: '@quajs/engine-native',
      },
      {
        target: 'cocos',
        inactiveTarget: 'web',
        importedCore: '@quajs/renderer-web/plugins/ui',
        packageName: '@quajs/renderer-web',
      },
      {
        target: 'native',
        inactiveTarget: 'cocos',
        importedCore: '@quajs/cocos-host/runtime',
        packageName: '@quajs/cocos-host',
      },
    ] as const

    for (const { target, inactiveTarget, importedCore, packageName } of cases) {
      const result = validateTargetPluginManifest({
        target,
        manifest: createPluginManifest({
          entries: [
            { specifier: '@quajs/plugin-ui/shared', target: 'shared' },
            { specifier: `@quajs/plugin-ui/${target}`, target },
            {
              specifier: `@quajs/plugin-ui/${inactiveTarget}`,
              target: inactiveTarget,
              eager: true,
              imports: [importedCore],
            },
          ],
        }),
      })

      expect(result.ok).toBe(false)
      expect(result.diagnostics).toEqual(expect.arrayContaining([
        expect.objectContaining({
          code: 'TARGET_PLUGIN_INACTIVE_ENTRY_EAGER',
          target,
          entryTarget: inactiveTarget,
        }),
        expect.objectContaining({
          code: 'TARGET_PLUGIN_INACTIVE_ENTRY_TARGET_CORE_IMPORT',
          target,
          entryTarget: inactiveTarget,
          packageName,
        }),
      ]))
    }
  })

  it('checks masked packageName and specifier fields in inactive eager entries', () => {
    const result = validateTargetPluginManifest({
      target: 'native',
      manifest: createPluginManifest({
        entries: [
          { specifier: '@quajs/plugin-menu/shared', target: 'shared' },
          { specifier: '@quajs/plugin-menu/native', target: 'native' },
          {
            specifier: '@quajs/plugin-menu/web',
            target: 'web',
            eager: true,
            imports: [
              {
                packageName: '@quajs/plugin-menu-core',
                specifier: '@quajs/renderer-web/plugins/ui',
              },
            ],
          },
          {
            specifier: '@quajs/plugin-menu/cocos',
            target: 'cocos',
            eager: true,
            imports: [
              {
                packageName: '@quajs/cocos-host',
                specifier: '@quajs/plugin-menu-cocos/runtime',
              },
            ],
          },
        ],
      }),
    })

    expect(result.ok).toBe(false)
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'TARGET_PLUGIN_INACTIVE_ENTRY_TARGET_CORE_IMPORT',
        target: 'native',
        entryTarget: 'web',
        packageName: '@quajs/renderer-web',
      }),
      expect.objectContaining({
        code: 'TARGET_PLUGIN_INACTIVE_ENTRY_TARGET_CORE_IMPORT',
        target: 'native',
        entryTarget: 'cocos',
        packageName: '@quajs/cocos-host',
      }),
    ]))
  })
})
