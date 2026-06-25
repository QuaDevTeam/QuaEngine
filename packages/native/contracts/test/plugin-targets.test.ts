import type { TargetPluginManifest } from '../src'
import { describe, expect, it } from 'vitest'
import { validateTargetPluginManifest } from '../src'

function createPluginManifest(overrides: Partial<TargetPluginManifest> = {}): TargetPluginManifest {
  return {
    pluginId: '@quajs/plugin-dialogue-plus',
    entries: [
      {
        specifier: '@quajs/plugin-dialogue-plus/shared',
        target: 'shared',
        imports: ['@quajs/engine', '@quajs/pipeline'],
      },
      {
        specifier: '@quajs/plugin-dialogue-plus/web',
        target: 'web',
        imports: ['@quajs/renderer-web/plugins/dialogue'],
      },
      {
        specifier: '@quajs/plugin-dialogue-plus/cocos',
        target: 'cocos',
        imports: ['@quajs/renderer-cocos/plugins/dialogue'],
      },
      {
        specifier: '@quajs/plugin-dialogue-plus/native',
        target: 'native',
        imports: ['@quajs/native-contracts', '@quajs/engine-native'],
      },
    ],
    ...overrides,
  }
}

describe('target plugin manifest validation', () => {
  it('accepts multi-target plugin manifests when only the active target entry is selected', () => {
    const result = validateTargetPluginManifest({
      target: 'native',
      manifest: createPluginManifest(),
      selectedEntries: [
        '@quajs/plugin-dialogue-plus/shared',
        '@quajs/plugin-dialogue-plus/native',
      ],
    })

    expect(result.ok).toBe(true)
    expect(result.selectedEntries.map(entry => entry.specifier)).toEqual([
      '@quajs/plugin-dialogue-plus/shared',
      '@quajs/plugin-dialogue-plus/native',
    ])
    expect(result.diagnostics).toEqual([])
  })

  it('rejects packaging a plugin for a target without that target entry', () => {
    const result = validateTargetPluginManifest({
      target: 'native',
      manifest: createPluginManifest({
        entries: [
          { specifier: '@quajs/plugin-gallery/shared', target: 'shared' },
          { specifier: '@quajs/plugin-gallery/web', target: 'web' },
        ],
      }),
    })

    expect(result.ok).toBe(false)
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: 'TARGET_PLUGIN_ENTRY_MISSING',
        target: 'native',
        pluginId: '@quajs/plugin-dialogue-plus',
      }),
    ])
  })

  it('rejects selected renderer entries for another target', () => {
    const result = validateTargetPluginManifest({
      target: 'native',
      manifest: createPluginManifest(),
      selectedEntries: ['@quajs/plugin-dialogue-plus/web'],
    })

    expect(result.ok).toBe(false)
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'TARGET_PLUGIN_SELECTED_ENTRY_TARGET_MISMATCH',
        target: 'native',
        entryTarget: 'web',
        specifier: '@quajs/plugin-dialogue-plus/web',
      }),
    ]))
  })

  it('rejects selected entries that omit the active target entry', () => {
    const result = validateTargetPluginManifest({
      target: 'native',
      manifest: createPluginManifest(),
      selectedEntries: ['@quajs/plugin-dialogue-plus/shared'],
    })

    expect(result.ok).toBe(false)
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: 'TARGET_PLUGIN_SELECTED_ENTRY_MISSING',
        target: 'native',
      }),
    ])
  })

  it('rejects unknown selected entries so packagers cannot silently fall back', () => {
    const result = validateTargetPluginManifest({
      target: 'web',
      manifest: createPluginManifest(),
      selectedEntries: ['@quajs/plugin-dialogue-plus/missing'],
    })

    expect(result.ok).toBe(false)
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'TARGET_PLUGIN_SELECTED_ENTRY_UNKNOWN',
        target: 'web',
        specifier: '@quajs/plugin-dialogue-plus/missing',
      }),
    ]))
  })

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
