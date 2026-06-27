import type { TargetBundleManifest } from '../src'
import { describe, expect, it } from 'vitest'
import {
  assertTargetBundleManifest,
  COCOS_TARGET_BOOTSTRAP,
  collectTargetBundlePackageNames,
  createTargetBundleNativeRendererInfo,
  createTargetCoreSelection,
  NATIVE_TARGET_BOOTSTRAP,
  validateTargetBundleManifest,
  WEB_TARGET_BOOTSTRAP,
} from '../src'
import {
  NATIVE_RENDERER_CAPABILITIES,
  nativeRendererInfo,
  rendererEntry,
  sha256Fixture,
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

  it('creates native renderer manifest metadata from renderer capabilities', () => {
    const renderer = nativeRendererInfo()
    const changedRenderer = createTargetBundleNativeRendererInfo({
      version: '0.1.0',
      capabilities: [
        ...NATIVE_RENDERER_CAPABILITIES,
        {
          id: 'native-wgpu.video@1',
          target: 'native',
          version: '1.0.0',
          ownerPackage: '@quajs/native-renderer',
          projectionKeys: ['background.video'],
          assetKinds: ['video', 'images'],
          fallback: 'warn-once',
        },
      ],
    }, sha256Fixture)

    expect(renderer).toEqual({
      packageName: '@quajs/native-renderer',
      version: '0.1.0',
      backend: 'wgpu',
      backendVersion: 'wgpu-0.20',
      capabilityIds: [
        'native-wgpu.stage-layout@1',
        'native-wgpu.ui.surface@1',
        'native-wgpu.input.pointer@1',
      ],
      capabilityManifestHash: expect.stringMatching(/^sha256:fixture-/),
    })
    expect(changedRenderer.capabilityIds).toContain('native-wgpu.video@1')
    expect(changedRenderer.capabilityManifestHash).not.toBe(renderer.capabilityManifestHash)
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

  it('requires native artifacts to record renderer version and capability metadata', () => {
    const manifest = targetBundleManifest()
    delete manifest.nativeRenderer
    const result = validateTargetBundleManifest(manifest)

    expect(result.ok).toBe(false)
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'TARGET_BUNDLE_NATIVE_RENDERER_MISSING',
        target: 'native',
      }),
    ]))
  })

  it('rejects incomplete native renderer metadata on native artifacts', () => {
    const result = validateTargetBundleManifest(targetBundleManifest({
      nativeRenderer: {
        packageName: '@quajs/renderer-web',
        backend: 'canvas',
        capabilityIds: [],
      },
    }))

    expect(result.ok).toBe(false)
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'TARGET_BUNDLE_NATIVE_RENDERER_PACKAGE_MISMATCH',
        packageName: '@quajs/renderer-web',
      }),
      expect.objectContaining({
        code: 'TARGET_BUNDLE_NATIVE_RENDERER_BACKEND_MISMATCH',
        backend: 'canvas',
      }),
      expect.objectContaining({
        code: 'TARGET_BUNDLE_NATIVE_RENDERER_VERSION_MISSING',
      }),
      expect.objectContaining({
        code: 'TARGET_BUNDLE_NATIVE_RENDERER_CAPABILITY_MANIFEST_HASH_MISSING',
      }),
      expect.objectContaining({
        code: 'TARGET_BUNDLE_NATIVE_RENDERER_CAPABILITY_IDS_MISSING',
      }),
    ]))
  })

  it('rejects native renderer metadata in Web and Cocos artifacts', () => {
    for (const target of ['web', 'cocos'] as const) {
      const result = validateTargetBundleManifest(targetBundleManifestFor(target, {
        nativeRenderer: nativeRendererInfo(),
      }))

      expect(result.ok).toBe(false)
      expect(result.diagnostics).toEqual(expect.arrayContaining([
        expect.objectContaining({
          code: 'TARGET_BUNDLE_NATIVE_RENDERER_UNEXPECTED',
          target,
        }),
      ]))
    }
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

  it('requires native target bundle app metadata needed by release packaging', () => {
    const missingIcon = targetBundleManifest({
      app: {
        bundleId: 'dev.quajs.native.fixture',
        version: '1.0.0',
        buildNumber: '100',
      },
    })
    const emptyBuild = targetBundleManifest({
      app: {
        bundleId: 'dev.quajs.native.fixture',
        version: '1.0.0',
        buildNumber: '',
        icon: 'AppIcon.icns',
      },
    })

    const missingIconResult = validateTargetBundleManifest(missingIcon)
    const emptyBuildResult = validateTargetBundleManifest(emptyBuild)

    expect(missingIconResult.ok).toBe(false)
    expect(missingIconResult.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'TARGET_BUNDLE_APP_METADATA_MISSING',
        target: 'native',
        field: 'icon',
      }),
    ]))

    expect(emptyBuildResult.ok).toBe(false)
    expect(emptyBuildResult.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'TARGET_BUNDLE_APP_METADATA_EMPTY',
        target: 'native',
        field: 'buildNumber',
      }),
    ]))
  })

  it('requires native target bundle profile and platform metadata needed by packaging and startup', () => {
    const missingProfile = targetBundleManifest() as unknown as TargetBundleManifest & { profile?: unknown }
    delete missingProfile.profile
    const invalidProfile = {
      ...targetBundleManifest(),
      profile: 'staging',
    } as unknown as TargetBundleManifest
    const missingPlatform = targetBundleManifest()
    delete missingPlatform.platform
    const emptyPlatform = targetBundleManifest({ platform: ' ' })
    const invalidPlatform = targetBundleManifest({ platform: 'ios' })

    const missingProfileResult = validateTargetBundleManifest(missingProfile as TargetBundleManifest)
    const invalidProfileResult = validateTargetBundleManifest(invalidProfile)
    const missingPlatformResult = validateTargetBundleManifest(missingPlatform)
    const emptyPlatformResult = validateTargetBundleManifest(emptyPlatform)
    const invalidPlatformResult = validateTargetBundleManifest(invalidPlatform)

    expect(missingProfileResult.ok).toBe(false)
    expect(missingProfileResult.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'TARGET_BUNDLE_PROFILE_MISSING',
        target: 'native',
        field: 'profile',
      }),
    ]))

    expect(invalidProfileResult.ok).toBe(false)
    expect(invalidProfileResult.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'TARGET_BUNDLE_PROFILE_INVALID',
        target: 'native',
        field: 'profile',
        value: 'staging',
      }),
    ]))

    expect(missingPlatformResult.ok).toBe(false)
    expect(missingPlatformResult.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'TARGET_BUNDLE_PLATFORM_MISSING',
        target: 'native',
        field: 'platform',
      }),
    ]))

    expect(emptyPlatformResult.ok).toBe(false)
    expect(emptyPlatformResult.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'TARGET_BUNDLE_PLATFORM_EMPTY',
        target: 'native',
        field: 'platform',
      }),
    ]))

    expect(invalidPlatformResult.ok).toBe(false)
    expect(invalidPlatformResult.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'TARGET_BUNDLE_PLATFORM_INVALID',
        target: 'native',
        field: 'platform',
        value: 'ios',
      }),
    ]))
  })

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
