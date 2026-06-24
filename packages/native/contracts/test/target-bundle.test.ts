import type { QuaTargetBootstrap, TargetBundleManifest } from '../src'
import { describe, expect, it } from 'vitest'
import {
  assertTargetBundleManifest,
  COCOS_TARGET_BOOTSTRAP,
  collectTargetBundlePackageNames,
  createTargetBundleNativeRendererInfo,
  getTargetCorePluginFamily,
  NATIVE_TARGET_BOOTSTRAP,
  normalizePackageSpecifier,
  validateTargetBundleManifest,
  WEB_TARGET_BOOTSTRAP,
} from '../src'

const CORE_ADAPTERS_BY_TARGET = {
  web: WEB_TARGET_BOOTSTRAP.coreAdapters,
  cocos: COCOS_TARGET_BOOTSTRAP.coreAdapters,
  native: NATIVE_TARGET_BOOTSTRAP.coreAdapters,
} satisfies Record<QuaTargetBootstrap, readonly string[]>

const PLATFORM_BY_TARGET = {
  web: 'web',
  cocos: 'cocos',
  native: 'macos',
} satisfies Record<QuaTargetBootstrap, string>

const NATIVE_RENDERER_CAPABILITIES = [
  {
    id: 'native-wgpu.stage-layout@1',
    target: 'native',
    version: '1.0.0',
    ownerPackage: '@quajs/native-renderer',
    projectionKeys: ['QuaViewProjection.layout'],
    qssFeatures: ['safe-area', 'logical-stage'],
    quiComponents: ['Stage'],
    fallback: 'reject-package',
  },
  {
    id: 'native-wgpu.ui.surface@1',
    target: 'native',
    version: '1.0.0',
    ownerPackage: '@quajs/native-renderer',
    projectionKeys: ['view.ui.overlays'],
    qssFeatures: ['background-color', 'border-radius'],
    quiComponents: ['Box', 'Button', 'Text'],
    fallback: 'reject-package',
  },
  {
    id: 'native-wgpu.input.pointer@1',
    target: 'native',
    version: '1.0.0',
    ownerPackage: '@quajs/native-renderer',
    projectionKeys: ['view.choices', 'view.ui.overlays'],
    intentEvents: ['choice/select', 'ui/intent'],
    quiComponents: ['Button', 'Panel'],
    fallback: 'reject-package',
  },
] as const

function targetDependencies(target: QuaTargetBootstrap): TargetBundleManifest['dependencies'] {
  const shared = ['@quajs/engine', '@quajs/pipeline']
  switch (target) {
    case 'web':
      return [
        ...shared,
        '@quajs/assets-web',
        '@quajs/renderer-web/plugins/audio',
      ]
    case 'cocos':
      return [
        ...shared,
        '@quajs/cocos-host/runtime',
        '@quajs/assets-cocos',
        '@quajs/renderer-cocos/plugins/audio',
      ]
    case 'native':
      return [
        ...shared,
        '@quajs/native-contracts/bootstrap',
        { specifier: '@quajs/engine-native/native-host', runtime: true, source: 'static-import' },
        { specifier: '@quajs/assets-native', runtime: true, source: 'static-import' },
        { specifier: '@quajs/store-native', runtime: true, source: 'static-import' },
      ]
  }
}

function rendererEntry(target: QuaTargetBootstrap): NonNullable<TargetBundleManifest['rendererEntries']>[number] {
  switch (target) {
    case 'web':
      return { specifier: '@quajs/renderer-vue/plugins/ui', target: 'web' }
    case 'cocos':
      return { specifier: '@quajs/renderer-cocos/plugins/ui', target: 'cocos' }
    case 'native':
      return { specifier: '@quajs/native-renderer/builtin', target: 'native' }
  }
}

function nativeRendererInfo(): NonNullable<TargetBundleManifest['nativeRenderer']> {
  return createTargetBundleNativeRendererInfo({
    version: '0.1.0',
    backendVersion: 'wgpu-0.20',
    capabilities: NATIVE_RENDERER_CAPABILITIES,
  }, sha256Fixture)
}

function targetBundleManifest(overrides: Partial<TargetBundleManifest> = {}): TargetBundleManifest {
  return targetBundleManifestFor('native', overrides)
}

function targetBundleManifestFor(
  target: QuaTargetBootstrap,
  overrides: Partial<TargetBundleManifest> = {},
): TargetBundleManifest {
  return {
    schemaVersion: 1,
    target,
    profile: 'release',
    platform: PLATFORM_BY_TARGET[target],
    app: {
      bundleId: `dev.quajs.${target}.fixture`,
      version: '1.0.0',
      buildNumber: '100',
      icon: 'AppIcon.icns',
    },
    ...(target === 'native' ? { nativeRenderer: nativeRendererInfo() } : {}),
    selectedCorePluginFamily: getTargetCorePluginFamily(target),
    selectedCoreAdapters: CORE_ADAPTERS_BY_TARGET[target],
    dependencies: targetDependencies(target),
    rendererEntries: [rendererEntry(target)],
    runtimePackages: [
      {
        id: 'runtime.chapter.1',
        executableDependencies: ['@quajs/character'],
        rendererEntries: [`@quajs/${target}-renderer/ui`],
      },
    ],
    ...overrides,
  }
}

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

  it('normalizes subentry dependencies before validating target isolation', () => {
    expect(collectTargetBundlePackageNames(targetBundleManifest())).toContain('@quajs/engine-native')
    expect(collectTargetBundlePackageNames(targetBundleManifest())).toContain('@quajs/native-contracts')
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

  it('rejects package roots from another target core plugin family even when the selected adapters are valid', () => {
    const result = validateTargetBundleManifest(targetBundleManifest({
      dependencies: [
        ...targetDependencies('native') || [],
        '@quajs/renderer-vue/plugins/ui',
        '@quajs/cocos-host/runtime',
      ],
      selectedCoreAdapters: NATIVE_TARGET_BOOTSTRAP.coreAdapters,
    }))

    expect(result.ok).toBe(false)
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'TARGET_BUNDLE_CORE_PLUGIN_FAMILY_LEAK',
        target: 'native',
        packageName: '@quajs/renderer-vue',
        packageCorePluginFamily: 'web-core',
        expectedCorePluginFamily: 'native-core',
      }),
      expect.objectContaining({
        code: 'TARGET_BUNDLE_CORE_PLUGIN_FAMILY_LEAK',
        target: 'native',
        packageName: '@quajs/cocos-host',
        packageCorePluginFamily: 'cocos-core',
        expectedCorePluginFamily: 'native-core',
      }),
    ]))
  })

  it('rejects cross-target core adapters for Web, Cocos, and native artifacts', () => {
    for (const target of ['web', 'cocos', 'native'] as const) {
      const crossTargetCoreAdapters = (Object.keys(CORE_ADAPTERS_BY_TARGET) as QuaTargetBootstrap[])
        .filter(candidate => candidate !== target)
        .flatMap(candidate => CORE_ADAPTERS_BY_TARGET[candidate])
      const result = validateTargetBundleManifest(targetBundleManifestFor(target, {
        dependencies: [
          ...(targetDependencies(target) || []),
          ...crossTargetCoreAdapters,
        ],
      }))

      expect(result.ok).toBe(false)
      expect(result.bootstrapValidation.selectedTargets).toEqual(['web', 'cocos', 'native'])
      for (const packageName of crossTargetCoreAdapters) {
        expect(result.diagnostics).toEqual(expect.arrayContaining([
          expect.objectContaining({
            code: 'TARGET_CORE_ADAPTER_FORBIDDEN',
            target,
            packageName: normalizePackageSpecifier(packageName),
          }),
        ]))
      }
    }
  })

  it('rejects native artifacts that include Web or Cocos renderer entries after bundling', () => {
    const result = validateTargetBundleManifest(targetBundleManifest({
      dependencies: [
        '@quajs/engine',
        '@quajs/renderer-web/plugins/audio',
        '@quajs/cocos-host/testing',
        ...NATIVE_TARGET_BOOTSTRAP.coreAdapters,
      ],
      rendererEntries: [
        '@quajs/renderer-vue/plugins/ui',
        '@quajs/renderer-cocos/plugins/audio',
      ],
    }))

    expect(result.ok).toBe(false)
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'TARGET_BOOTSTRAP_MIXED',
        targets: ['web', 'cocos', 'native'],
      }),
      expect.objectContaining({
        code: 'TARGET_CORE_ADAPTER_FORBIDDEN',
        packageName: '@quajs/renderer-web',
      }),
      expect.objectContaining({
        code: 'TARGET_CORE_ADAPTER_FORBIDDEN',
        packageName: '@quajs/renderer-vue',
      }),
      expect.objectContaining({
        code: 'TARGET_CORE_ADAPTER_FORBIDDEN',
        packageName: '@quajs/cocos-host',
      }),
      expect.objectContaining({
        code: 'TARGET_CORE_ADAPTER_FORBIDDEN',
        packageName: '@quajs/renderer-cocos',
      }),
    ]))
  })

  it('rejects Web artifacts that retain native contracts in the runtime graph', () => {
    const result = validateTargetBundleManifest(targetBundleManifest({
      target: 'web',
      platform: 'web',
      selectedCoreAdapters: WEB_TARGET_BOOTSTRAP.coreAdapters,
      dependencies: [
        '@quajs/assets-web',
        '@quajs/renderer-web/plugins/audio',
        '@quajs/native-contracts/bootstrap',
      ],
      rendererEntries: ['@quajs/renderer-vue/plugins/ui'],
    }))

    expect(result.ok).toBe(false)
    expect(result.bootstrapValidation.selectedTargets).toEqual(['web', 'native'])
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'TARGET_BOOTSTRAP_MIXED',
        targets: ['web', 'native'],
      }),
      expect.objectContaining({
        code: 'TARGET_CORE_ADAPTER_FORBIDDEN',
        packageName: '@quajs/native-contracts',
      }),
    ]))
  })

  it('rejects Cocos artifacts that retain native contracts in the runtime graph', () => {
    const result = validateTargetBundleManifest(targetBundleManifest({
      target: 'cocos',
      platform: 'cocos',
      selectedCoreAdapters: COCOS_TARGET_BOOTSTRAP.coreAdapters,
      dependencies: [
        '@quajs/cocos-host/runtime',
        '@quajs/assets-cocos',
        '@quajs/renderer-cocos/plugins/audio',
        '@quajs/native-contracts/bootstrap',
      ],
      rendererEntries: ['@quajs/renderer-cocos/plugins/ui'],
    }))

    expect(result.ok).toBe(false)
    expect(result.bootstrapValidation.selectedTargets).toEqual(['cocos', 'native'])
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'TARGET_BOOTSTRAP_MIXED',
        targets: ['cocos', 'native'],
      }),
      expect.objectContaining({
        code: 'TARGET_CORE_ADAPTER_FORBIDDEN',
        packageName: '@quajs/native-contracts',
      }),
    ]))
  })

  it('throws a packaging-ready error when native artifacts mix Web or Cocos core plugins', () => {
    expect(() => assertTargetBundleManifest(targetBundleManifest({
      dependencies: [
        ...targetDependencies('native') || [],
        '@quajs/renderer-web/plugins/ui',
        '@quajs/cocos-host/runtime',
      ],
      rendererEntries: [
        rendererEntry('native'),
        { specifier: '@quajs/renderer-vue/plugins/ui', pluginId: '@quajs/plugin-ui', target: 'web' },
        { specifier: '@quajs/renderer-cocos/plugins/ui', pluginId: '@quajs/plugin-ui', target: 'cocos' },
      ],
      runtimePackages: [
        {
          id: 'runtime.bad.core-leak',
          executableDependencies: ['@quajs/assets-web'],
          rendererEntries: [
            { specifier: '@quajs/renderer-cocos/plugins/dialogue', target: 'cocos' },
          ],
        },
      ],
    }))).toThrow(
      /Target bundle manifest validation failed.*Package output mixes target bootstrap core adapters.*Renderer entry "@quajs\/renderer-vue" declares target "web".*Runtime package "runtime\.bad\.core-leak" must not include target core adapter "@quajs\/assets-web" through "executableDependencies"/,
    )
  })

  it('rejects runtime packages that declare target core adapters as executable dependencies or renderer entries', () => {
    const result = validateTargetBundleManifest(targetBundleManifest({
      runtimePackages: [
        {
          id: 'runtime.bad.web-entry',
          executableDependencies: [
            '@quajs/character',
            '@quajs/renderer-web/plugins/audio',
          ],
        },
        {
          id: 'runtime.bad.native-entry',
          rendererEntries: [
            '@quajs/engine-native/native-host',
          ],
        },
      ],
    }))

    expect(result.ok).toBe(false)
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'TARGET_BUNDLE_RUNTIME_PACKAGE_CORE_ADAPTER',
        runtimePackageId: 'runtime.bad.web-entry',
        packageName: '@quajs/renderer-web',
        field: 'executableDependencies',
      }),
      expect.objectContaining({
        code: 'TARGET_BUNDLE_RUNTIME_PACKAGE_CORE_ADAPTER',
        runtimePackageId: 'runtime.bad.native-entry',
        packageName: '@quajs/engine-native',
        field: 'rendererEntries',
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
})

function sha256Fixture(payload: string): string {
  return `fixture-${payload.length}`
}
