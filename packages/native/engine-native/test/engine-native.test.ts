import type { NativeHostApiRequest } from '@quajs/native-contracts'
import { emitLogicToRender, LogicToRenderEvents, RenderToLogicEvents } from '@quajs/engine'
import {
  COCOS_TARGET_BOOTSTRAP,
  createNativeHostApiFromBridge,
  getTargetCorePluginFamily,
  NATIVE_TARGET_BOOTSTRAP,
} from '@quajs/native-contracts'
import { describe, expect, it, vi } from 'vitest'
import {
  assertNativeRuntimePackageCompatibility,
  assertNativeTargetBootstrap,
  assertNativeTargetBundleManifest,
  checkNativeAppManifestCompatibility,
  checkNativeRendererManifestCompatibility,
  checkNativeRuntimePackageCompatibility,
  checkNativeTargetBootstrap,
  checkNativeTargetBundleManifest,
  createNativeEngineBootstrap,
  createNativeRuntimeAdapters,
  createNativeRuntimeTrustPolicy,
  NativeHostPlugin,
  readNativeHostInfo,
} from '../src'
import {
  CAPABILITY_MANIFEST_HASH,
  createHost,
  createHostInfo,
  createNativeTargetBundleManifest,
  createTestPipeline,
  createTrustContext,
  escapeRegExp,
} from './fixtures'

describe('@quajs/engine-native', () => {
  it('reads native renderer version and capabilities from the Rust host API', async () => {
    const hostInfo = createHostInfo('0.2.0')
    const host = createHost(hostInfo)

    await expect(readNativeHostInfo(host)).resolves.toBe(hostInfo)
    expect(host.getHostInfo).toHaveBeenCalledTimes(1)
  })

  it('resolves host info during NativeHostPlugin initialization', async () => {
    const hostInfo = createHostInfo()
    const host = createHost(hostInfo)
    const plugin = new NativeHostPlugin({ host })

    expect(plugin.getHostInfo()).toBeUndefined()

    await plugin.init({} as any)

    expect(plugin.getHostInfo()).toBe(hostInfo)
    expect(host.getHostInfo).toHaveBeenCalledTimes(1)
  })

  it('uses preloaded host info without calling the host again', async () => {
    const hostInfo = createHostInfo()
    const host = createHost(createHostInfo('0.2.0'))
    const plugin = new NativeHostPlugin({ host, info: hostInfo })

    await plugin.init({} as any)

    expect(plugin.getHostInfo()).toBe(hostInfo)
    expect(host.getHostInfo).not.toHaveBeenCalled()
  })

  it('releases package-owned QuickJS namespaces after runtime package unload is emitted to renderers', async () => {
    const namespaceRecord = {
      id: 'quickjs:module:1',
      packageId: 'runtime.chapter.native-ui',
      bundleName: 'runtime.chapter.native-ui',
      assetName: 'scripts/opening.js',
      kind: 'script' as const,
      moduleBytes: 3,
      codeBytes: 36,
      revision: 1,
    }
    const host = {
      ...createHost(),
      releaseQuickJsPackageNamespaces: vi.fn(async () => [namespaceRecord]),
    }
    const plugin = new NativeHostPlugin({ host })
    const pipeline = createTestPipeline()

    await plugin.init({
      pipeline,
      runtimePackage: {
        package: { id: 'runtime.chapter.native-ui', version: '1.0.0' },
        bundleName: 'runtime.chapter.native-ui',
      },
    } as any)
    await emitLogicToRender(pipeline, LogicToRenderEvents.RUNTIME_PACKAGE_UNLOAD, {
      packageId: 'runtime.chapter.native-ui',
      bundleName: 'runtime.chapter.native-ui',
    })

    expect(host.releaseQuickJsPackageNamespaces).toHaveBeenCalledWith('runtime.chapter.native-ui')
    expect(plugin.getReleasedQuickJsPackageNamespaces()).toEqual([namespaceRecord])

    const noCleanupPipeline = createTestPipeline()
    const noCleanupPlugin = new NativeHostPlugin({ host: createHost() })
    await noCleanupPlugin.init({ pipeline: noCleanupPipeline } as any)
    await expect(emitLogicToRender(noCleanupPipeline, LogicToRenderEvents.RUNTIME_PACKAGE_UNLOAD, {
      packageId: 'runtime.chapter.native-ui',
    })).resolves.toBeUndefined()

    plugin.destroy()
    await emitLogicToRender(pipeline, LogicToRenderEvents.RUNTIME_PACKAGE_UNLOAD, {
      packageId: 'runtime.chapter.native-ui',
    })
    expect(host.releaseQuickJsPackageNamespaces).toHaveBeenCalledTimes(1)
  })

  it('reports QuickJS package namespace cleanup failures without blocking runtime package unload', async () => {
    const cleanupError = new Error('native cleanup unavailable')
    const host = {
      ...createHost(),
      releaseQuickJsPackageNamespaces: vi.fn(async () => {
        throw cleanupError
      }),
    }
    const plugin = new NativeHostPlugin({ host })
    const pipeline = createTestPipeline()
    const errors: unknown[] = []
    pipeline.on(RenderToLogicEvents.RENDER_ERROR, context => errors.push(context.event.payload))

    await plugin.init({ pipeline } as any)

    await expect(emitLogicToRender(pipeline, LogicToRenderEvents.RUNTIME_PACKAGE_UNLOAD, {
      packageId: 'runtime.chapter.native-ui',
      bundleName: 'runtime.chapter.native-ui',
    })).resolves.toBeUndefined()

    expect(host.releaseQuickJsPackageNamespaces).toHaveBeenCalledWith('runtime.chapter.native-ui')
    expect(plugin.getReleasedQuickJsPackageNamespaces()).toEqual([])
    expect(plugin.getQuickJsCleanupErrors()).toEqual([cleanupError])
    expect(errors).toEqual([
      expect.objectContaining({
        message: 'native cleanup unavailable',
        source: 'native-renderer',
        phase: 'quickjs-cleanup',
        recoverable: true,
        metadata: {
          runtimePackageId: 'runtime.chapter.native-ui',
        },
      }),
    ])
  })

  it('accepts native startup package roots through the native target bootstrap guard', () => {
    const result = checkNativeTargetBootstrap(NATIVE_TARGET_BOOTSTRAP.coreAdapters)

    expect(result.ok).toBe(true)
    expect(result.selectedTargets).toEqual(['native'])
    expect(assertNativeTargetBootstrap(NATIVE_TARGET_BOOTSTRAP.coreAdapters)).toEqual(result)
  })

  it('rejects mixed target bootstrap packages before reading host info', async () => {
    const host = createHost()
    const plugin = new NativeHostPlugin({
      host,
      targetBootstrapPackages: [
        ...NATIVE_TARGET_BOOTSTRAP.coreAdapters,
        '@quajs/renderer-web/plugins/ui',
        ...COCOS_TARGET_BOOTSTRAP.coreAdapters,
      ],
    })

    await expect(plugin.init({} as any)).rejects.toThrow(
      /Native target bootstrap validation failed.*mixes target bootstrap core adapters/,
    )
    expect(plugin.getTargetBootstrapValidation()?.selectedTargets).toEqual(['web', 'cocos', 'native'])
    expect(host.getHostInfo).not.toHaveBeenCalled()
  })

  it('accepts native post-bundle manifests during startup bootstrap validation', async () => {
    const manifest = createNativeTargetBundleManifest()
    const result = checkNativeTargetBundleManifest(manifest)
    const host = createHost()
    const plugin = new NativeHostPlugin({
      host,
      targetBundleManifest: manifest,
    })

    expect(result.ok).toBe(true)
    expect(assertNativeTargetBundleManifest(manifest)).toEqual(result)

    await plugin.init({} as any)

    expect(plugin.getTargetBundleManifestValidation()).toEqual(result)
    expect(plugin.getTargetBootstrapValidation()).toEqual(result.bootstrapValidation)
    expect(host.getHostInfo).toHaveBeenCalledTimes(1)
  })

  it('checks emitted native renderer metadata against the native host info', () => {
    expect(checkNativeRendererManifestCompatibility(
      createHostInfo(),
      createNativeTargetBundleManifest().nativeRenderer!,
    )).toEqual([])
  })

  it('checks emitted native app metadata against the native host info', () => {
    expect(checkNativeAppManifestCompatibility(
      createHostInfo(),
      createNativeTargetBundleManifest(),
    )).toEqual([])
  })

  it('rejects emitted native app metadata that drifts from host info', async () => {
    const hostInfo = createHostInfo()
    hostInfo.app = {
      ...hostInfo.app,
      bundleId: 'dev.quajs.native.other',
      version: '2.0.0',
      buildNumber: '200',
      profile: 'release',
      platform: 'windows',
    }
    const host = createHost(hostInfo)
    const plugin = new NativeHostPlugin({
      host,
      targetBundleManifest: createNativeTargetBundleManifest(),
    })

    await expect(plugin.init({} as any)).rejects.toThrow(
      /Native manifest compatibility validation failed.*app\.bundleId "dev\.quajs\.native\.fixture" does not match host app bundleId "dev\.quajs\.native\.other".*app\.version "1\.0\.0" does not match host app version "2\.0\.0".*app\.buildNumber "100" does not match host app buildNumber "200".*profile "debug" does not match host app profile "release".*platform "macos" does not match host app platform "windows"/,
    )
    expect(plugin.getTargetBundleManifestValidation()?.ok).toBe(true)
    expect(host.getHostInfo).toHaveBeenCalledTimes(1)
    expect(plugin.getHostInfo()).toBeUndefined()
  })

  it('rejects emitted native renderer metadata that drifts from host info', async () => {
    const host = createHost(createHostInfo('0.2.0'))
    const plugin = new NativeHostPlugin({
      host,
      targetBundleManifest: createNativeTargetBundleManifest({
        nativeRenderer: {
          packageName: '@quajs/native-renderer',
          version: '0.1.0',
          backend: 'wgpu',
          capabilityIds: [
            'native-wgpu.ui.surface@1',
            'native-wgpu.audio@1',
          ],
          capabilityManifestHash: 'sha256:stale-native-capabilities',
        },
      }),
    })

    await expect(plugin.init({} as any)).rejects.toThrow(
      new RegExp(`Native manifest compatibility validation failed.*renderer version "0\\.1\\.0" does not match host renderer version "0\\.2\\.0".*capability hash "sha256:stale-native-capabilities" does not match host renderer capability hash "${escapeRegExp(CAPABILITY_MANIFEST_HASH)}".*capability "native-wgpu\\.audio@1" is not provided`),
    )
    expect(plugin.getTargetBundleManifestValidation()?.ok).toBe(true)
    expect(host.getHostInfo).toHaveBeenCalledTimes(1)
    expect(plugin.getHostInfo()).toBeUndefined()
  })

  it('rejects emitted native renderer backendVersion that drifts from host info', async () => {
    const hostInfo = createHostInfo()
    hostInfo.renderer = {
      ...hostInfo.renderer,
      backendVersion: 'wgpu-host',
    }
    const host = createHost(hostInfo)
    const plugin = new NativeHostPlugin({
      host,
      targetBundleManifest: createNativeTargetBundleManifest({
        nativeRenderer: {
          ...createNativeTargetBundleManifest().nativeRenderer!,
          backendVersion: 'wgpu-manifest',
        },
      }),
    })

    await expect(plugin.init({} as any)).rejects.toThrow(
      /Native manifest compatibility validation failed.*renderer backendVersion "wgpu-manifest" does not match host renderer backendVersion "wgpu-host"/,
    )
    expect(plugin.getTargetBundleManifestValidation()?.ok).toBe(true)
    expect(host.getHostInfo).toHaveBeenCalledTimes(1)
    expect(plugin.getHostInfo()).toBeUndefined()
  })

  it('rejects native post-bundle manifests with foreign target core plugin families before host info', async () => {
    const host = createHost()
    const plugin = new NativeHostPlugin({
      host,
      targetBundleManifest: createNativeTargetBundleManifest({
        dependencies: [
          '@quajs/engine',
          ...NATIVE_TARGET_BOOTSTRAP.coreAdapters,
          '@quajs/renderer-web/plugins/ui',
        ],
        rendererEntries: [
          { specifier: '@quajs/renderer-vue/plugins/ui', target: 'web' },
        ],
      }),
    })

    await expect(plugin.init({} as any)).rejects.toThrow(
      /Native target bundle manifest validation failed.*core plugin family "web-core".*Renderer entry "@quajs\/renderer-vue" declares target "web"/,
    )
    expect(plugin.getTargetBundleManifestValidation()?.ok).toBe(false)
    expect(plugin.getTargetBootstrapValidation()?.selectedTargets).toEqual(['web', 'native'])
    expect(host.getHostInfo).not.toHaveBeenCalled()
  })

  it('rejects generated native project graphs that redeclare target core adapters before host info', async () => {
    const host = createHost()
    const plugin = new NativeHostPlugin({
      host,
      targetBundleManifest: createNativeTargetBundleManifest({
        projectGraphs: [
          {
            id: 'native.template.generated',
            kind: 'project-template',
            references: [
              '@quajs/engine',
              '@quajs/engine-native/native-host',
            ],
          },
          {
            id: 'native.debug.macos.post-bundle',
            kind: 'post-bundle',
            references: [
              '@quajs/engine',
              ...NATIVE_TARGET_BOOTSTRAP.coreAdapters,
            ],
          },
        ],
      }),
    })

    await expect(plugin.init({} as any)).rejects.toThrow(
      /Native target bundle manifest validation failed.*Project graph "native\.template\.generated" \(project-template\).*must not declare target core adapter "@quajs\/engine-native"/,
    )
    expect(plugin.getTargetBundleManifestValidation()?.ok).toBe(false)
    expect(plugin.getTargetBundleManifestValidation()?.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'TARGET_BUNDLE_PROJECT_GRAPH_CORE_ADAPTER',
        target: 'native',
        packageName: '@quajs/engine-native',
        projectGraphId: 'native.template.generated',
        projectGraphKind: 'project-template',
      }),
    ]))
    expect(host.getHostInfo).not.toHaveBeenCalled()
  })

  it('rejects post-bundle manifests declared for another target before host info', async () => {
    const host = createHost()
    const bootstrap = createNativeEngineBootstrap(host, {
      targetBundleManifest: createNativeTargetBundleManifest({
        target: 'web',
        platform: 'web',
        nativeRenderer: undefined,
        selectedCorePluginFamily: getTargetCorePluginFamily('web'),
        selectedCoreAdapters: ['@quajs/assets-web', '@quajs/renderer-web'],
        dependencies: [
          '@quajs/engine',
          '@quajs/assets-web',
          '@quajs/renderer-web/plugins/ui',
        ],
        rendererEntries: [
          { specifier: '@quajs/renderer-vue/plugins/ui', target: 'web' },
        ],
      }),
    })

    await expect(bootstrap.plugin.init({} as any)).rejects.toThrow(
      /Native target bundle manifest validation failed.*declares target "web", but expected "native"/,
    )
    expect(bootstrap.plugin.getTargetBundleManifestValidation()?.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'TARGET_BUNDLE_TARGET_MISMATCH',
        target: 'web',
        expectedTarget: 'native',
      }),
    ]))
    expect(host.getHostInfo).not.toHaveBeenCalled()
  })

  it('checks runtime package native renderer compatibility before activation', () => {
    const result = checkNativeRuntimePackageCompatibility(createHostInfo(), {
      pluginId: 'runtime.chapter.native-ui',
      nativeRenderer: {
        packageName: '@quajs/native-renderer',
        versionRange: '^0.1.0',
        capabilities: ['native-wgpu.ui.surface@1', 'native-wgpu.video@1'],
        optionalCapabilities: ['native-wgpu.audio@1'],
        nativeCode: false,
      },
    })

    expect(result.ok).toBe(true)
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: 'NATIVE_OPTIONAL_CAPABILITY_MISSING',
        severity: 'warning',
        pluginId: 'runtime.chapter.native-ui',
      }),
    ])
  })

  it('throws on native renderer version or required capability mismatches', () => {
    expect(() => assertNativeRuntimePackageCompatibility(createHostInfo('1.0.0'), {
      pluginId: 'runtime.chapter.native-ui',
      nativeRenderer: {
        versionRange: '^0.1.0',
        capabilities: ['native-wgpu.audio@1'],
        nativeCode: false,
      },
    })).toThrow(/Native renderer version "1\.0\.0" does not satisfy "\^0\.1\.0".*Required native capability "native-wgpu.audio@1" is not available./)
  })

  it('keeps native runtime adapters scoped to the provided host object', () => {
    const host = createHost()
    const adapters = createNativeRuntimeAdapters(host)

    expect(adapters.host).toBe(host)
    expect(adapters.trustPolicy).toEqual({
      allowUnsignedInDevelopment: undefined,
      requireSignature: undefined,
      verifyPackage: expect.any(Function),
    })
  })

  it('creates native runtime adapters with a host plugin wired to the emitted bundle manifest', async () => {
    const manifest = createNativeTargetBundleManifest()
    const host = createHost()
    const bootstrap = createNativeEngineBootstrap(host, {
      targetBundleManifest: manifest,
    })

    expect(bootstrap.adapters.host).toBe(host)
    expect(bootstrap.adapters.trustPolicy).toEqual(expect.objectContaining({
      verifyPackage: expect.any(Function),
    }))

    await bootstrap.plugin.init({} as any)

    expect(bootstrap.plugin.getTargetBundleManifestValidation()?.ok).toBe(true)
    expect(bootstrap.plugin.getTargetBootstrapValidation()?.selectedTargets).toEqual(['native'])
    expect(host.getHostInfo).toHaveBeenCalledTimes(1)
  })

  it('rejects mixed target bootstrap manifests through the native bootstrap helper before host info', async () => {
    const host = createHost()
    const bootstrap = createNativeEngineBootstrap(host, {
      targetBundleManifest: createNativeTargetBundleManifest({
        dependencies: [
          '@quajs/engine',
          ...NATIVE_TARGET_BOOTSTRAP.coreAdapters,
          '@quajs/renderer-web/plugins/ui',
        ],
      }),
    })

    await expect(bootstrap.plugin.init({} as any)).rejects.toThrow(
      /Native target bundle manifest validation failed.*core plugin family "web-core"/,
    )
    expect(host.getHostInfo).not.toHaveBeenCalled()
  })

  it('rejects native-code runtime packages through native trust policy', async () => {
    const host = createHost()
    const policy = createNativeRuntimeTrustPolicy(host, { allowUnsignedInDevelopment: true })

    await expect(policy.verifyPackage!(createTrustContext({
      scripts: [
        { id: 'native', assetName: 'native/plugin.dylib' },
      ],
    }))).rejects.toThrow(/forbidden native payload/)
  })

  it('rejects unsafe runtime package asset references before native signature verification', async () => {
    const host = {
      ...createHost(),
      verifySignature: vi.fn(async () => true),
    }
    const policy = createNativeRuntimeTrustPolicy(host)

    await expect(policy.verifyPackage!(createTrustContext({
      scripts: [
        { id: 'remote', assetName: 'https://cdn.example.invalid/opening.js' },
      ],
      integrity: {
        hash: 'abc123',
        algorithm: 'sha256',
      },
      signature: {
        value: 'base64:AQID',
        algorithm: 'ed25519',
        keyId: 'test-key',
      },
    }))).rejects.toThrow(/forbidden asset reference "https:\/\/cdn\.example\.invalid\/opening\.js"/)

    expect(host.verifySignature).not.toHaveBeenCalled()
  })

  it('checks runtime package native renderer compatibility before native signature verification', async () => {
    const host = {
      ...createHost(),
      verifySignature: vi.fn(async () => true),
    }
    const policy = createNativeRuntimeTrustPolicy(host, {
      hostInfo: createHostInfo(),
    })

    await expect(policy.verifyPackage!(createTrustContext({
      metadata: {
        nativeRenderer: {
          packageName: '@quajs/native-renderer',
          versionRange: '^0.1.0',
          capabilities: ['native-wgpu.audio@1'],
          nativeCode: false,
        },
      },
      integrity: {
        hash: 'abc123',
        algorithm: 'sha256',
      },
      signature: {
        value: 'base64:AQID',
        algorithm: 'ed25519',
        keyId: 'test-key',
      },
    }))).rejects.toThrow(/Required native capability "native-wgpu\.audio@1" is not available/)

    expect(host.getHostInfo).not.toHaveBeenCalled()
    expect(host.verifySignature).not.toHaveBeenCalled()
  })

  it('checks target-scoped renderers.native compatibility metadata before native signature verification', async () => {
    const host = {
      ...createHost(),
      verifySignature: vi.fn(async () => true),
    }
    const policy = createNativeRuntimeTrustPolicy(host, {
      hostInfo: createHostInfo(),
    })

    await expect(policy.verifyPackage!(createTrustContext({
      metadata: {
        renderers: {
          native: {
            renderer: '@quajs/native-renderer',
            version: '^0.1.0',
            capabilityIds: ['native-wgpu.audio@1'],
            nativeCode: false,
          },
        },
      },
      integrity: {
        hash: 'abc123',
        algorithm: 'sha256',
      },
      signature: {
        value: 'base64:AQID',
        algorithm: 'ed25519',
        keyId: 'test-key',
      },
    }))).rejects.toThrow(/Required native capability "native-wgpu\.audio@1" is not available/)

    expect(host.getHostInfo).not.toHaveBeenCalled()
    expect(host.verifySignature).not.toHaveBeenCalled()
  })

  it('checks runtime package native asset kind compatibility before native signature verification', async () => {
    const host = {
      ...createHost(),
      verifySignature: vi.fn(async () => true),
    }
    const policy = createNativeRuntimeTrustPolicy(host, {
      hostInfo: createHostInfo(),
    })

    await expect(policy.verifyPackage!(createTrustContext({
      metadata: {
        nativeRenderer: {
          renderer: '@quajs/native-renderer',
          version: '^0.1.0',
          assetKinds: ['qui', 'shader'],
          nativeCode: false,
        },
      },
      integrity: {
        hash: 'abc123',
        algorithm: 'sha256',
      },
      signature: {
        value: 'base64:AQID',
        algorithm: 'ed25519',
        keyId: 'test-key',
      },
    }))).rejects.toThrow(/Required native asset kind "shader" is not available/)

    expect(host.getHostInfo).not.toHaveBeenCalled()
    expect(host.verifySignature).not.toHaveBeenCalled()
  })

  it('allows missing optional native asset kinds before native signature verification', async () => {
    const host = {
      ...createHost(),
      verifySignature: vi.fn(async () => true),
    }
    const policy = createNativeRuntimeTrustPolicy(host, {
      hostInfo: createHostInfo(),
    })

    await expect(policy.verifyPackage!(createTrustContext({
      metadata: {
        nativeRenderer: {
          renderer: '@quajs/native-renderer',
          version: '^0.1.0',
          optionalAssetKinds: ['qss', 'shader'],
          nativeCode: false,
        },
      },
      integrity: {
        hash: 'abc123',
        algorithm: 'sha256',
      },
      signature: {
        value: 'base64:AQID',
        algorithm: 'ed25519',
        keyId: 'test-key',
      },
    }))).resolves.toBe(true)

    expect(host.getHostInfo).not.toHaveBeenCalled()
    expect(host.verifySignature).toHaveBeenCalledTimes(1)
  })

  it('checks runtime package native QSS and QUI compatibility before native signature verification', async () => {
    const host = {
      ...createHost(),
      verifySignature: vi.fn(async () => true),
    }
    const policy = createNativeRuntimeTrustPolicy(host, {
      hostInfo: createHostInfo(),
    })

    await expect(policy.verifyPackage!(createTrustContext({
      metadata: {
        nativeRenderer: {
          renderer: '@quajs/native-renderer',
          version: '^0.1.0',
          capabilities: ['native-wgpu.ui.surface@1'],
          qssFeatures: ['background-color', 'gap'],
          quiComponents: ['Panel', 'VirtualList'],
          nativeCode: false,
        },
      },
      integrity: {
        hash: 'abc123',
        algorithm: 'sha256',
      },
      signature: {
        value: 'base64:AQID',
        algorithm: 'ed25519',
        keyId: 'test-key',
      },
    }))).rejects.toThrow(/Required native QSS feature "gap" is not available.*Required native QUI component "VirtualList" is not available/)

    expect(host.getHostInfo).not.toHaveBeenCalled()
    expect(host.verifySignature).not.toHaveBeenCalled()
  })

  it('allows missing optional native QSS features and QUI components before native signature verification', async () => {
    const host = {
      ...createHost(),
      verifySignature: vi.fn(async () => true),
    }
    const policy = createNativeRuntimeTrustPolicy(host, {
      hostInfo: createHostInfo(),
    })

    await expect(policy.verifyPackage!(createTrustContext({
      metadata: {
        nativeRenderer: {
          renderer: '@quajs/native-renderer',
          version: '^0.1.0',
          optionalQssFeatures: ['color', 'gap'],
          optionalQuiComponents: ['Panel', 'Drawer'],
          nativeCode: false,
        },
      },
      integrity: {
        hash: 'abc123',
        algorithm: 'sha256',
      },
      signature: {
        value: 'base64:AQID',
        algorithm: 'ed25519',
        keyId: 'test-key',
      },
    }))).resolves.toBe(true)

    expect(host.getHostInfo).not.toHaveBeenCalled()
    expect(host.verifySignature).toHaveBeenCalledTimes(1)
  })

  it('rejects native renderer compatibility without nativeCode false before native signature verification', async () => {
    const host = {
      ...createHost(),
      verifySignature: vi.fn(async () => true),
    }
    const policy = createNativeRuntimeTrustPolicy(host, {
      hostInfo: createHostInfo(),
    })

    await expect(policy.verifyPackage!(createTrustContext({
      metadata: {
        renderers: {
          native: {
            renderer: '@quajs/native-renderer',
            version: '^0.1.0',
            capabilityIds: ['native-wgpu.ui.surface@1'],
          },
        },
      },
      integrity: {
        hash: 'abc123',
        algorithm: 'sha256',
      },
      signature: {
        value: 'base64:AQID',
        algorithm: 'ed25519',
        keyId: 'test-key',
      },
    }))).rejects.toThrow(/must explicitly declare nativeCode: false/)

    expect(host.getHostInfo).not.toHaveBeenCalled()
    expect(host.verifySignature).not.toHaveBeenCalled()
  })

  it('reads host info for native renderer compatibility when trust policy options omit it', async () => {
    const host = {
      ...createHost(createHostInfo()),
      verifySignature: vi.fn(async () => true),
    }
    const policy = createNativeRuntimeTrustPolicy(host)

    await expect(policy.verifyPackage!(createTrustContext({
      metadata: {
        nativeRenderer: {
          packageName: '@quajs/native-renderer',
          versionRange: '^0.1.0',
          capabilities: ['native-wgpu.ui.surface@1'],
          nativeCode: false,
        },
      },
      integrity: {
        hash: 'abc123',
        algorithm: 'sha256',
      },
      signature: {
        value: 'base64:AQID',
        algorithm: 'ed25519',
        keyId: 'test-key',
      },
    }))).resolves.toBe(true)

    expect(host.getHostInfo).toHaveBeenCalledTimes(1)
    expect(host.verifySignature).toHaveBeenCalledTimes(1)
  })

  it('reuses resolved host info across native renderer compatibility checks', async () => {
    const host = {
      ...createHost(createHostInfo()),
      verifySignature: vi.fn(async () => true),
    }
    const policy = createNativeRuntimeTrustPolicy(host)

    for (const packageId of ['runtime.chapter.native-ui', 'runtime.chapter.extra-ui']) {
      await expect(policy.verifyPackage!(createTrustContext({
        id: packageId,
        metadata: {
          nativeRenderer: {
            packageName: '@quajs/native-renderer',
            versionRange: '^0.1.0',
            capabilities: ['native-wgpu.ui.surface@1'],
            nativeCode: false,
          },
        },
      }))).resolves.toBe(true)
    }

    expect(host.getHostInfo).toHaveBeenCalledTimes(1)
  })

  it('forwards signed package verification to the native host', async () => {
    const host = {
      ...createHost(),
      verifySignature: vi.fn(async () => true),
    }
    const policy = createNativeRuntimeTrustPolicy(host)

    await expect(policy.verifyPackage!(createTrustContext({
      integrity: {
        hash: 'abc123',
        algorithm: 'sha256',
      },
      signature: {
        value: 'base64:AQID',
        algorithm: 'ed25519',
        keyId: 'test-key',
      },
    }))).resolves.toBe(true)

    expect(host.verifySignature).toHaveBeenCalledWith({
      bytes: new TextEncoder().encode('abc123'),
      signature: new Uint8Array([1, 2, 3]),
      keyId: 'test-key',
      algorithm: 'ed25519',
    })
  })

  it('uses the host bridge dispatcher for host info and package signature verification', async () => {
    const requests: NativeHostApiRequest[] = []
    const hostInfo = createHostInfo('0.3.0')
    const host = createNativeHostApiFromBridge(async (request) => {
      requests.push(request)
      switch (request.method) {
        case 'getHostInfo':
          return { ok: true, payload: { type: 'hostInfo', value: hostInfo } }
        case 'verifySignature':
          return { ok: true, payload: { type: 'signatureValid', value: true } }
        default:
          return {
            ok: false,
            error: {
              code: 'unsupportedOperation',
              message: `Unexpected bridge request "${request.method}".`,
            },
          }
      }
    })
    const plugin = new NativeHostPlugin({ host })
    const policy = createNativeRuntimeTrustPolicy(host)

    await plugin.init({} as any)
    await expect(policy.verifyPackage!(createTrustContext({
      integrity: {
        hash: 'abc123',
        algorithm: 'sha256',
      },
      signature: {
        value: 'base64:AQID',
        algorithm: 'ed25519',
        keyId: 'bridge-key',
      },
    }))).resolves.toBe(true)

    expect(plugin.getHostInfo()).toBe(hostInfo)
    expect(requests).toEqual([
      { method: 'getHostInfo' },
      {
        method: 'verifySignature',
        params: {
          bytes: [97, 98, 99, 49, 50, 51],
          signature: [1, 2, 3],
          keyId: 'bridge-key',
          algorithm: 'ed25519',
        },
      },
    ])
  })
})
