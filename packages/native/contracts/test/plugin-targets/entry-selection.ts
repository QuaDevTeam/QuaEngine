import { describe, expect, it } from 'vitest'
import { validateTargetPluginManifest } from '../../src'
import { createPluginManifest } from './helpers'

describe('target plugin manifest entry selection', () => {
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

  it('rejects plugin entries with invalid target metadata', () => {
    const result = validateTargetPluginManifest({
      target: 'native',
      manifest: createPluginManifest({
        entries: [
          { specifier: '@quajs/plugin-gallery/shared', target: 'shared' },
          { specifier: '@quajs/plugin-gallery/native', target: 'desktop-native' as any },
        ],
      }),
      selectedEntries: ['@quajs/plugin-gallery/native'],
    })

    expect(result.ok).toBe(false)
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'TARGET_PLUGIN_ENTRY_TARGET_INVALID',
        target: 'native',
        specifier: '@quajs/plugin-gallery/native',
        entryTarget: 'desktop-native',
      }),
    ]))
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
})
