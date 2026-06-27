import { describe, expect, it } from 'vitest'
import { validateTargetBundleManifest } from '../src'
import {
  targetBundleManifest,
  targetBundleManifestFor,
} from './target-bundle-fixtures'

describe('target bundle renderer entry validation', () => {
  it('rejects renderer entries that declare a different target than the artifact', () => {
    const result = validateTargetBundleManifest(targetBundleManifest({
      rendererEntries: [
        { specifier: '@quajs/plugin-gallery/native-renderer', pluginId: '@quajs/plugin-gallery', target: 'web' },
      ],
      runtimePackages: [
        {
          id: 'runtime.bad.renderer-target',
          executableDependencies: ['@quajs/character'],
          rendererEntries: [
            { specifier: '@quajs/plugin-backlog/cocos-renderer', pluginId: '@quajs/plugin-backlog', target: 'cocos' },
          ],
        },
      ],
    }))

    expect(result.ok).toBe(false)
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'TARGET_BUNDLE_RENDERER_ENTRY_TARGET_MISMATCH',
        target: 'native',
        rendererTarget: 'web',
        packageName: '@quajs/plugin-gallery',
        pluginId: '@quajs/plugin-gallery',
      }),
      expect.objectContaining({
        code: 'TARGET_BUNDLE_RENDERER_ENTRY_TARGET_MISMATCH',
        target: 'native',
        rendererTarget: 'cocos',
        packageName: '@quajs/plugin-backlog',
        pluginId: '@quajs/plugin-backlog',
        runtimePackageId: 'runtime.bad.renderer-target',
      }),
    ]))
  })

  it('rejects renderer entries that do not declare their target', () => {
    for (const target of ['web', 'cocos', 'native'] as const) {
      const result = validateTargetBundleManifest(targetBundleManifestFor(target, {
        rendererEntries: [
          { specifier: '@quajs/plugin-menu/renderer', pluginId: '@quajs/plugin-menu' },
        ],
        runtimePackages: [
          {
            id: `runtime.${target}.missing-renderer-target`,
            executableDependencies: ['@quajs/character'],
            rendererEntries: [
              { specifier: '@quajs/plugin-backlog/renderer', pluginId: '@quajs/plugin-backlog' },
            ],
          },
        ],
      }))

      expect(result.ok).toBe(false)
      expect(result.diagnostics).toEqual(expect.arrayContaining([
        expect.objectContaining({
          code: 'TARGET_BUNDLE_RENDERER_ENTRY_TARGET_MISSING',
          target,
          packageName: '@quajs/plugin-menu',
          pluginId: '@quajs/plugin-menu',
        }),
        expect.objectContaining({
          code: 'TARGET_BUNDLE_RENDERER_ENTRY_TARGET_MISSING',
          target,
          packageName: '@quajs/plugin-backlog',
          pluginId: '@quajs/plugin-backlog',
          runtimePackageId: `runtime.${target}.missing-renderer-target`,
        }),
      ]))
    }
  })
})
