import type { TargetBundleManifest } from '../src'
import { describe, expect, it } from 'vitest'
import {
  assertTargetBundleManifest,
  COCOS_TARGET_BOOTSTRAP,
  collectTargetBundlePackageNames,
  createTargetCoreSelection,
  NATIVE_TARGET_BOOTSTRAP,
  validateTargetBundleManifest,
  WEB_TARGET_BOOTSTRAP,
} from '../src'
import {
  rendererEntry,
  targetBundleManifest,
  targetBundleManifestFor,
  targetDependencies,
} from './target-bundle-fixtures'

describe('target bundle manifest validation', () => {
  it('accepts clean Web, Cocos, and native manifests with only their selected core adapters', () => {
    for (const target of ['web', 'cocos', 'native'] as const) {
      const result = validateTargetBundleManifest(targetBundleManifestFor(target))

      expect(result.ok).toBe(true)
      expect(result.bootstrapValidation.selectedTargets).toEqual([target])
      expect(result.diagnostics).toEqual([])
    }
  })

  it('accepts a native bundle manifest with only native core adapters', () => {
    const result = validateTargetBundleManifest(targetBundleManifest())

    expect(result.ok).toBe(true)
    expect(result.bootstrapValidation.selectedTargets).toEqual(['native'])
    expect(result.diagnostics).toEqual([])
    expect(assertTargetBundleManifest(targetBundleManifest())).toEqual(result)
  })

  it('derives target core resolver, family, and adapters from a single target selection', () => {
    expect(createTargetCoreSelection('web')).toEqual({
      target: 'web',
      targetCoreResolver: 'web-core-resolver',
      selectedCorePluginFamily: 'web-core',
      selectedCoreAdapters: WEB_TARGET_BOOTSTRAP.coreAdapters,
    })
    expect(createTargetCoreSelection('cocos')).toEqual({
      target: 'cocos',
      targetCoreResolver: 'cocos-core-resolver',
      selectedCorePluginFamily: 'cocos-core',
      selectedCoreAdapters: COCOS_TARGET_BOOTSTRAP.coreAdapters,
    })
    expect(createTargetCoreSelection('native')).toEqual({
      target: 'native',
      targetCoreResolver: 'native-core-resolver',
      selectedCorePluginFamily: 'native-core',
      selectedCoreAdapters: NATIVE_TARGET_BOOTSTRAP.coreAdapters,
    })
  })

  it('normalizes subentry dependencies before validating target isolation', () => {
    expect(collectTargetBundlePackageNames(targetBundleManifest())).toContain('@quajs/engine-native')
    expect(collectTargetBundlePackageNames(targetBundleManifest())).toContain('@quajs/native-contracts')
  })

  it('checks both specifier and packageName fields in target bundle references', () => {
    const result = validateTargetBundleManifest(targetBundleManifest({
      dependencies: [
        ...(targetDependencies('native') || []),
        {
          packageName: '@quajs/character',
          specifier: '@quajs/renderer-web/plugins/audio',
          source: 'static-import',
        },
      ],
      runtimePackages: [
        {
          id: 'runtime.masked.core',
          executableDependencies: [
            {
              packageName: '@quajs/character',
              specifier: '@quajs/renderer-cocos/plugins/audio',
            },
          ],
          rendererEntries: [
            {
              packageName: '@quajs/plugin-gallery',
              specifier: '@quajs/engine-native/native-host',
              target: 'native',
            },
          ],
        },
      ],
    }))

    expect(result.ok).toBe(false)
    expect(collectTargetBundlePackageNames(targetBundleManifest({
      dependencies: [
        {
          packageName: '@quajs/character',
          specifier: '@quajs/renderer-web/plugins/audio',
          source: 'static-import',
        },
      ],
    }))).toEqual(expect.arrayContaining([
      '@quajs/character',
      '@quajs/renderer-web',
    ]))
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'TARGET_CORE_ADAPTER_FORBIDDEN',
        target: 'native',
        packageName: '@quajs/renderer-web',
      }),
      expect.objectContaining({
        code: 'TARGET_BUNDLE_RUNTIME_PACKAGE_CORE_ADAPTER',
        runtimePackageId: 'runtime.masked.core',
        packageName: '@quajs/renderer-cocos',
        field: 'executableDependencies',
      }),
      expect.objectContaining({
        code: 'TARGET_BUNDLE_RUNTIME_PACKAGE_CORE_ADAPTER',
        runtimePackageId: 'runtime.masked.core',
        packageName: '@quajs/engine-native',
        field: 'rendererEntries',
      }),
    ]))
  })

  it('requires the selected core plugin family to match the artifact target', () => {
    const result = validateTargetBundleManifest(targetBundleManifest({
      selectedCorePluginFamily: 'web-core',
    }))

    expect(result.ok).toBe(false)
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'TARGET_BUNDLE_CORE_PLUGIN_FAMILY_MISMATCH',
        target: 'native',
        selectedCorePluginFamily: 'web-core',
        expectedCorePluginFamily: 'native-core',
      }),
    ]))
  })

  it('requires emitted target bundle manifests to record a selected core plugin family', () => {
    const manifest = targetBundleManifest() as unknown as Omit<TargetBundleManifest, 'selectedCorePluginFamily'>
    delete (manifest as Partial<TargetBundleManifest>).selectedCorePluginFamily
    const result = validateTargetBundleManifest(manifest as TargetBundleManifest)

    expect(result.ok).toBe(false)
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'TARGET_BUNDLE_CORE_PLUGIN_FAMILY_MISSING',
        target: 'native',
        expectedCorePluginFamily: 'native-core',
      }),
    ]))
  })

  it('requires emitted target bundle manifests to record the target core resolver', () => {
    const manifest = targetBundleManifest() as unknown as Omit<TargetBundleManifest, 'targetCoreResolver'>
    delete (manifest as Partial<TargetBundleManifest>).targetCoreResolver
    const result = validateTargetBundleManifest(manifest as TargetBundleManifest)

    expect(result.ok).toBe(false)
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'TARGET_BUNDLE_CORE_RESOLVER_MISSING',
        target: 'native',
        expectedTargetCoreResolver: 'native-core-resolver',
      }),
    ]))
  })

  it('rejects manifests produced by another target core resolver even when adapters are filtered', () => {
    const result = validateTargetBundleManifest(targetBundleManifest({
      targetCoreResolver: 'web-core-resolver',
      selectedCorePluginFamily: 'native-core',
      selectedCoreAdapters: NATIVE_TARGET_BOOTSTRAP.coreAdapters,
      dependencies: targetDependencies('native'),
      rendererEntries: [rendererEntry('native')],
    }))

    expect(result.ok).toBe(false)
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'TARGET_BUNDLE_CORE_RESOLVER_MISMATCH',
        target: 'native',
        targetCoreResolver: 'web-core-resolver',
        expectedTargetCoreResolver: 'native-core-resolver',
      }),
    ]))
  })

  it('rejects target bundle manifests with incomplete selected core adapters', () => {
    const result = validateTargetBundleManifest(targetBundleManifest({
      selectedCoreAdapters: NATIVE_TARGET_BOOTSTRAP.coreAdapters.filter(
        packageName => packageName !== '@quajs/store-native',
      ),
    }))

    expect(result.ok).toBe(false)
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'TARGET_BUNDLE_SELECTED_CORE_ADAPTER_MISSING',
        target: 'native',
        packageName: '@quajs/store-native',
      }),
    ]))
  })

  it('rejects target bundle manifests with unexpected selected core adapters', () => {
    const result = validateTargetBundleManifest(targetBundleManifest({
      selectedCoreAdapters: [
        ...NATIVE_TARGET_BOOTSTRAP.coreAdapters,
        '@quajs/renderer-web/plugins/ui',
      ],
    }))

    expect(result.ok).toBe(false)
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'TARGET_BUNDLE_SELECTED_CORE_ADAPTER_UNEXPECTED',
        target: 'native',
        packageName: '@quajs/renderer-web',
      }),
    ]))
  })

})
