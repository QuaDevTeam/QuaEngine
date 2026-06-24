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

  it('rejects active target entries that import another target core adapter', () => {
    const result = validateTargetPluginManifest({
      target: 'native',
      manifest: createPluginManifest({
        entries: [
          { specifier: '@quajs/plugin-backlog/shared', target: 'shared' },
          {
            specifier: '@quajs/plugin-backlog/native',
            target: 'native',
            imports: [
              '@quajs/engine-native',
              '@quajs/renderer-web/plugins/backlog',
              '@quajs/cocos-host/runtime',
            ],
          },
        ],
      }),
    })

    expect(result.ok).toBe(false)
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'TARGET_PLUGIN_TARGET_ENTRY_FOREIGN_CORE_IMPORT',
        packageName: '@quajs/renderer-web',
      }),
      expect.objectContaining({
        code: 'TARGET_PLUGIN_TARGET_ENTRY_FOREIGN_CORE_IMPORT',
        packageName: '@quajs/cocos-host',
      }),
    ]))
  })
})
