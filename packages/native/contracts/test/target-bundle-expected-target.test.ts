import { describe, expect, it } from 'vitest'
import { validateTargetBundleManifest } from '../src'
import { targetBundleManifestFor } from './target-bundle-fixtures'

describe('target bundle expected target validation', () => {
  it('rejects manifests whose declared target does not match the expected packaging target', () => {
    const result = validateTargetBundleManifest(targetBundleManifestFor('web'), {
      expectedTarget: 'native',
    })

    expect(result.ok).toBe(false)
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'TARGET_BUNDLE_TARGET_MISMATCH',
        target: 'web',
        expectedTarget: 'native',
      }),
      expect.objectContaining({
        code: 'TARGET_BOOTSTRAP_UNEXPECTED',
        targets: ['web'],
        expectedTarget: 'native',
      }),
      expect.objectContaining({
        code: 'TARGET_CORE_ADAPTER_MISSING',
        target: 'native',
        packageName: '@quajs/engine-native',
      }),
      expect.objectContaining({
        code: 'TARGET_CORE_ADAPTER_FORBIDDEN',
        target: 'native',
        packageName: '@quajs/assets-web',
      }),
      expect.objectContaining({
        code: 'TARGET_BUNDLE_CORE_RESOLVER_MISMATCH',
        target: 'native',
        targetCoreResolver: 'web-core-resolver',
        expectedTargetCoreResolver: 'native-core-resolver',
      }),
      expect.objectContaining({
        code: 'TARGET_BUNDLE_CORE_PLUGIN_FAMILY_MISMATCH',
        target: 'native',
        selectedCorePluginFamily: 'web-core',
        expectedCorePluginFamily: 'native-core',
      }),
      expect.objectContaining({
        code: 'TARGET_BUNDLE_NATIVE_RENDERER_MISSING',
        target: 'native',
      }),
      expect.objectContaining({
        code: 'TARGET_BUNDLE_SELECTED_CORE_ADAPTER_MISSING',
        target: 'native',
        packageName: '@quajs/engine-native',
      }),
      expect.objectContaining({
        code: 'TARGET_BUNDLE_SELECTED_CORE_ADAPTER_UNEXPECTED',
        target: 'native',
        packageName: '@quajs/assets-web',
      }),
      expect.objectContaining({
        code: 'TARGET_BUNDLE_RENDERER_ENTRY_TARGET_MISMATCH',
        target: 'native',
        rendererTarget: 'web',
        packageName: '@quajs/renderer-vue',
      }),
    ]))
  })

  it('validates resolver, family, adapters, and renderer entries against the packaging target context', () => {
    const cases = [
      {
        manifestTarget: 'native',
        expectedTarget: 'web',
        targetCoreResolver: 'native-core-resolver',
        expectedTargetCoreResolver: 'web-core-resolver',
        selectedCorePluginFamily: 'native-core',
        expectedCorePluginFamily: 'web-core',
        unexpectedAdapter: '@quajs/engine-native',
        missingAdapter: '@quajs/assets-web',
        rendererEntryPackage: '@quajs/native-renderer',
      },
      {
        manifestTarget: 'web',
        expectedTarget: 'cocos',
        targetCoreResolver: 'web-core-resolver',
        expectedTargetCoreResolver: 'cocos-core-resolver',
        selectedCorePluginFamily: 'web-core',
        expectedCorePluginFamily: 'cocos-core',
        unexpectedAdapter: '@quajs/assets-web',
        missingAdapter: '@quajs/cocos-host',
        rendererEntryPackage: '@quajs/renderer-vue',
      },
    ] as const

    for (const {
      manifestTarget,
      expectedTarget,
      targetCoreResolver,
      expectedTargetCoreResolver,
      selectedCorePluginFamily,
      expectedCorePluginFamily,
      unexpectedAdapter,
      missingAdapter,
      rendererEntryPackage,
    } of cases) {
      const result = validateTargetBundleManifest(targetBundleManifestFor(manifestTarget), {
        expectedTarget,
      })

      expect(result.ok).toBe(false)
      expect(result.diagnostics).toEqual(expect.arrayContaining([
        expect.objectContaining({
          code: 'TARGET_BUNDLE_TARGET_MISMATCH',
          target: manifestTarget,
          expectedTarget,
        }),
        expect.objectContaining({
          code: 'TARGET_BUNDLE_CORE_RESOLVER_MISMATCH',
          target: expectedTarget,
          targetCoreResolver,
          expectedTargetCoreResolver,
        }),
        expect.objectContaining({
          code: 'TARGET_BUNDLE_CORE_PLUGIN_FAMILY_MISMATCH',
          target: expectedTarget,
          selectedCorePluginFamily,
          expectedCorePluginFamily,
        }),
        expect.objectContaining({
          code: 'TARGET_BUNDLE_SELECTED_CORE_ADAPTER_MISSING',
          target: expectedTarget,
          packageName: missingAdapter,
        }),
        expect.objectContaining({
          code: 'TARGET_BUNDLE_SELECTED_CORE_ADAPTER_UNEXPECTED',
          target: expectedTarget,
          packageName: unexpectedAdapter,
        }),
        expect.objectContaining({
          code: 'TARGET_BUNDLE_RENDERER_ENTRY_TARGET_MISMATCH',
          target: expectedTarget,
          rendererTarget: manifestTarget,
          packageName: rendererEntryPackage,
        }),
      ]))
    }
  })
})
