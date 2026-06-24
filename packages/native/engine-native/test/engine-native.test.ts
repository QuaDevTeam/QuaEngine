import type { NativeHostApiRequest, QuaNativeHostApi, QuaNativeHostInfo, TargetBundleManifest } from '@quajs/native-contracts'
import { emitLogicToRender, LogicToRenderEvents } from '@quajs/engine'
import {
  COCOS_TARGET_BOOTSTRAP,
  createNativeCapabilityManifestHash,
  createNativeHostApiFromBridge,
  getTargetCorePluginFamily,
  getTargetCoreResolverId,
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
  createNativeHostQuickJsModuleEvaluator,
  createNativeRuntimeAdapters,
  createNativeRuntimeModuleLoader,
  createNativeRuntimeTrustPolicy,
  getNativeQuickJsNamespaceSummary,
  getNativeQuickJsPackageNamespaceSummary,
  NativeHostPlugin,
  readNativeHostInfo,
  releaseNativeQuickJsModuleNamespace,
  releaseNativeQuickJsPackageNamespaces,
} from '../src'

const CAPABILITIES: QuaNativeHostInfo['renderer']['capabilities'] = [
  {
    id: 'native-wgpu.ui.surface@1',
    target: 'native',
    version: '1.0.0',
    ownerPackage: '@quajs/native-renderer',
    projectionKeys: ['view.ui.overlays'],
    assetKinds: ['data', 'images', 'fonts', 'qui', 'qss', 'tokens'],
    fallback: 'reject-package',
  },
  {
    id: 'native-wgpu.video@1',
    target: 'native',
    version: '1.0.0',
    ownerPackage: '@quajs/native-renderer',
    projectionKeys: ['background.video'],
    assetKinds: ['video', 'images'],
    fallback: 'warn-once',
  },
  {
    id: 'native-wgpu.input.pointer@1',
    target: 'native',
    version: '1.0.0',
    ownerPackage: '@quajs/native-renderer',
    projectionKeys: ['view.choices', 'view.ui.overlays'],
    intentEvents: ['choice/select', 'ui/intent'],
    fallback: 'reject-package',
  },
]

const CAPABILITY_MANIFEST_HASH = createNativeCapabilityManifestHash(
  CAPABILITIES,
  payload => `test-sha256:${payload.length}`,
)

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function createHostInfo(version = '0.1.0'): QuaNativeHostInfo {
  return {
    app: {
      name: 'Native Fixture',
      bundleId: 'dev.quajs.native.fixture',
      version: '1.0.0',
      buildNumber: '100',
      profile: 'debug',
      platform: 'macos',
      arch: 'arm64',
    },
    renderer: {
      packageName: '@quajs/native-renderer',
      version,
      backend: 'wgpu',
      capabilityManifestHash: CAPABILITY_MANIFEST_HASH,
      capabilities: CAPABILITIES,
    },
    runtime: {
      quickjsVersion: '2025-04-26',
      nativeRuntimeVersion: '0.1.0',
      assetAdapterVersion: '0.1.0',
      storeAdapterVersion: '0.1.0',
    },
  }
}

function createHost(hostInfo = createHostInfo()): QuaNativeHostApi {
  return {
    getHostInfo: vi.fn(async () => hostInfo),
    readAssetBytes: vi.fn(),
    readStorage: vi.fn(),
    writeStorage: vi.fn(),
    deleteStorage: vi.fn(),
    hashBytes: vi.fn(),
  }
}

function createTestPipeline() {
  const listeners = new Map<string, Set<(context: any) => unknown>>()
  return {
    on: vi.fn((type: string, listener: (context: any) => unknown) => {
      const eventListeners = listeners.get(type) || new Set()
      eventListeners.add(listener)
      listeners.set(type, eventListeners)
    }),
    off: vi.fn((type: string, listener: (context: any) => unknown) => {
      listeners.get(type)?.delete(listener)
    }),
    emit: vi.fn(async (type: string, payload: unknown) => {
      for (const listener of listeners.get(type) || []) {
        await listener({
          event: {
            type,
            payload,
            timestamp: Date.now(),
            id: `${type}:test`,
          },
          handled: false,
          stopPropagation: false,
        })
      }
    }),
  }
}

function createNativeTargetBundleManifest(
  overrides: Partial<TargetBundleManifest> = {},
): TargetBundleManifest {
  return {
    schemaVersion: 1,
    target: 'native',
    profile: 'debug',
    platform: 'macos',
    app: {
      bundleId: 'dev.quajs.native.fixture',
      version: '1.0.0',
      buildNumber: '100',
      icon: 'AppIcon.icns',
    },
    nativeRenderer: {
      packageName: '@quajs/native-renderer',
      version: '0.1.0',
      backend: 'wgpu',
      capabilityIds: [
        'native-wgpu.ui.surface@1',
        'native-wgpu.video@1',
        'native-wgpu.input.pointer@1',
      ],
      capabilityManifestHash: CAPABILITY_MANIFEST_HASH,
    },
    targetCoreResolver: getTargetCoreResolverId('native'),
    selectedCorePluginFamily: getTargetCorePluginFamily('native'),
    selectedCoreAdapters: NATIVE_TARGET_BOOTSTRAP.coreAdapters,
    dependencies: [
      '@quajs/engine',
      '@quajs/pipeline',
      ...NATIVE_TARGET_BOOTSTRAP.coreAdapters,
    ],
    rendererEntries: [
      { specifier: '@quajs/native-renderer/builtin', target: 'native' },
    ],
    runtimePackages: [
      {
        id: 'runtime.chapter.native-ui',
        executableDependencies: ['@quajs/character'],
        rendererEntries: [
          { specifier: '@quajs/native-renderer/ui', target: 'native' },
        ],
      },
    ],
    ...overrides,
  }
}

function createTrustContext(overrides: Record<string, unknown> = {}) {
  const runtimePackage = {
    id: 'runtime.chapter.native-ui',
    version: '1.0.0',
    scripts: [
      { id: 'opening', assetName: 'scripts/opening.js' },
    ],
    ...overrides,
  }
  return {
    package: runtimePackage,
    bundle: {
      packageId: runtimePackage.id,
      bundleName: runtimePackage.id,
      version: '1.0.0',
      bundleVersion: 1,
      hash: 'hash',
      priority: 0,
      loadedAt: 1,
      assetCount: 1,
      manifest: {
        assets: {},
      },
    },
  } as any
}

function createModuleLoadContext(assetCodeByName: Record<string, string> = {}) {
  const calls: unknown[] = []
  const ctx = {
    assets: {
      async getAsset(type: string, name: string, options: unknown) {
        calls.push({ type, name, options })
        return {
          data: new TextEncoder().encode(assetCodeByName[name] || `export default "${name}"`),
        }
      },
    },
    bundle: {
      packageId: 'runtime.chapter.native-ui',
      bundleName: 'runtime.chapter.native-ui',
      version: '1.0.0',
      bundleVersion: 1,
      hash: 'hash',
      priority: 0,
      loadedAt: 1,
      assetCount: 1,
      manifest: {
        name: 'runtime.chapter.native-ui',
        version: 1,
        buildNumber: '100',
        created: '2026-06-24T00:00:00.000Z',
        assets: [],
      },
    },
    package: {
      id: 'runtime.chapter.native-ui',
      version: '1.0.0',
    },
    locale: 'ja-JP',
  }
  return { calls, ctx: ctx as any }
}

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

  it('creates a restricted native runtime module loader backed by package script assets', async () => {
    const { calls, ctx } = createModuleLoadContext({
      'scripts/opening.js': 'export default function opening() {}',
      'scenes/opening.js': 'export const Scene = {}',
      'plugins/settings.js': 'export class Plugin {}',
      'migrations/save.js': 'export default function migrate() {}',
    })
    const evaluated: unknown[] = []
    const loader = createNativeRuntimeModuleLoader({
      limits: {
        maxModuleBytes: 1024,
      },
      evaluator(input) {
        evaluated.push(input)
        return { default: input.code, marker: input.kind }
      },
    })

    await expect(loader.loadScriptModule?.({
      id: 'opening',
      packageId: 'runtime.chapter.native-ui',
      bundleName: 'runtime.chapter.native-ui',
      assetName: 'scripts/opening.js',
    }, ctx)).resolves.toEqual({
      default: 'export default function opening() {}',
      marker: 'script',
    })
    await expect(loader.loadSceneModule?.({
      id: 'opening-scene',
      assetName: 'scenes/opening.js',
    }, ctx)).resolves.toEqual(expect.objectContaining({ marker: 'scene' }))
    await expect(loader.loadEnginePluginModule?.({
      id: 'settings',
      kind: 'engine',
      assetName: 'plugins/settings.js',
    }, ctx)).resolves.toEqual(expect.objectContaining({ marker: 'engine-plugin' }))
    await expect(loader.loadStoreMigrationModule?.({
      id: 'save-v2',
      assetName: 'migrations/save.js',
    }, ctx)).resolves.toEqual(expect.objectContaining({ marker: 'store-migration' }))

    expect(calls).toEqual(expect.arrayContaining([
      {
        type: 'scripts',
        name: 'scripts/opening.js',
        options: {
          bundleName: 'runtime.chapter.native-ui',
          targetPackageId: 'runtime.chapter.native-ui',
          locale: 'ja-JP',
        },
      },
    ]))
    expect(evaluated).toEqual(expect.arrayContaining([
      expect.objectContaining({
        assetName: 'scripts/opening.js',
        bundleName: 'runtime.chapter.native-ui',
        code: 'export default function opening() {}',
        kind: 'script',
        packageId: 'runtime.chapter.native-ui',
        request: {
          module: {
            assetName: 'scripts/opening.js',
            bundleName: 'runtime.chapter.native-ui',
            bytes: Array.from(new TextEncoder().encode('export default function opening() {}')),
            code: 'export default function opening() {}',
            kind: 'script',
            packageId: 'runtime.chapter.native-ui',
          },
          limits: expect.objectContaining({
            maxHeapBytes: 64 * 1024 * 1024,
            maxModuleBytes: 1024,
          }),
        },
      }),
    ]))
    expect(evaluated).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: 'engine-plugin',
        request: expect.objectContaining({
          module: expect.objectContaining({
            assetName: 'plugins/settings.js',
            kind: 'enginePlugin',
          }),
        }),
      }),
      expect.objectContaining({
        kind: 'store-migration',
        request: expect.objectContaining({
          module: expect.objectContaining({
            assetName: 'migrations/save.js',
            kind: 'storeMigration',
          }),
        }),
      }),
    ]))
  })

  it('wires a native module evaluator into createNativeRuntimeAdapters', async () => {
    const { ctx } = createModuleLoadContext()
    const adapters = createNativeRuntimeAdapters(createHost(), {
      moduleEvaluator: input => ({ default: input.assetName }),
    })

    await expect(adapters.runtimeModuleLoader?.loadScriptModule?.({
      id: 'opening',
      packageId: 'runtime.chapter.native-ui',
      bundleName: 'runtime.chapter.native-ui',
      assetName: 'scripts/opening.js',
    }, ctx)).resolves.toEqual({ default: 'scripts/opening.js' })
  })

  it('can evaluate native runtime modules through the host QuickJS bridge with an explicit namespace resolver', async () => {
    const { ctx } = createModuleLoadContext({
      'scripts/opening.js': 'export default function opening() {}',
    })
    const host = {
      ...createHost(),
      evaluateQuickJsModule: vi.fn(async request => ({
        ok: true,
        moduleNamespaceId: `${request.module.packageId}:${request.module.assetName}`,
      })),
    }
    const resolved: unknown[] = []
    const adapters = createNativeRuntimeAdapters(host, {
      moduleNamespaceResolver(moduleNamespaceId, input) {
        resolved.push({ moduleNamespaceId, input })
        return { default: moduleNamespaceId, assetName: input.assetName }
      },
    })

    await expect(adapters.runtimeModuleLoader?.loadScriptModule?.({
      id: 'opening',
      packageId: 'runtime.chapter.native-ui',
      bundleName: 'runtime.chapter.native-ui',
      assetName: 'scripts/opening.js',
    }, ctx)).resolves.toEqual({
      default: 'runtime.chapter.native-ui:scripts/opening.js',
      assetName: 'scripts/opening.js',
    })
    expect(host.evaluateQuickJsModule).toHaveBeenCalledWith(expect.objectContaining({
      module: expect.objectContaining({
        assetName: 'scripts/opening.js',
        code: 'export default function opening() {}',
        packageId: 'runtime.chapter.native-ui',
      }),
    }))
    expect(resolved).toEqual([
      expect.objectContaining({
        moduleNamespaceId: 'runtime.chapter.native-ui:scripts/opening.js',
      }),
    ])
  })

  it('requires native host QuickJS evaluation and a real module namespace object', async () => {
    const { ctx } = createModuleLoadContext()
    const evaluator = createNativeHostQuickJsModuleEvaluator(createHost(), () => ({ default: undefined }))
    const loader = createNativeRuntimeModuleLoader({ evaluator })

    await expect(loader.loadScriptModule?.({
      id: 'opening',
      packageId: 'runtime.chapter.native-ui',
      bundleName: 'runtime.chapter.native-ui',
      assetName: 'scripts/opening.js',
    }, ctx)).rejects.toThrow(/does not provide QuickJS module evaluation/)

    const failingHost = {
      ...createHost(),
      evaluateQuickJsModule: vi.fn(async () => ({
        ok: false,
        error: {
          code: 'evaluationFailed' as const,
          message: 'QuickJS failed.',
        },
      })),
    }
    const failingLoader = createNativeRuntimeModuleLoader({
      evaluator: createNativeHostQuickJsModuleEvaluator(failingHost, () => ({ default: undefined })),
    })
    await expect(failingLoader.loadScriptModule?.({
      id: 'opening',
      packageId: 'runtime.chapter.native-ui',
      bundleName: 'runtime.chapter.native-ui',
      assetName: 'scripts/opening.js',
    }, ctx)).rejects.toThrow(/QuickJS failed/)

    const nonObjectHost = {
      ...createHost(),
      evaluateQuickJsModule: vi.fn(async () => ({
        ok: true,
        moduleNamespaceId: 'runtime.chapter.native-ui:scripts/opening.js',
      })),
    }
    const nonObjectLoader = createNativeRuntimeModuleLoader({
      evaluator: createNativeHostQuickJsModuleEvaluator(nonObjectHost, () => undefined),
    })
    await expect(nonObjectLoader.loadScriptModule?.({
      id: 'opening',
      packageId: 'runtime.chapter.native-ui',
      bundleName: 'runtime.chapter.native-ui',
      assetName: 'scripts/opening.js',
    }, ctx)).rejects.toThrow(/did not evaluate to a module namespace object/)
  })

  it('releases host QuickJS module namespaces without treating handles as engine modules', async () => {
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
    const summary = {
      namespaceCount: 1,
      packageCount: 1,
      moduleBytes: 3,
      codeBytes: 36,
    }
    const host = {
      ...createHost(),
      releaseQuickJsModuleNamespace: vi.fn(async () => namespaceRecord),
      releaseQuickJsPackageNamespaces: vi.fn(async () => [namespaceRecord]),
      getQuickJsNamespaceSummary: vi.fn(async () => summary),
      getQuickJsPackageNamespaceSummary: vi.fn(async () => summary),
    }

    await expect(releaseNativeQuickJsModuleNamespace(host, 'quickjs:module:1')).resolves.toEqual(namespaceRecord)
    await expect(releaseNativeQuickJsPackageNamespaces(host, 'runtime.chapter.native-ui')).resolves.toEqual([namespaceRecord])
    await expect(getNativeQuickJsNamespaceSummary(host)).resolves.toEqual(summary)
    await expect(getNativeQuickJsPackageNamespaceSummary(host, 'runtime.chapter.native-ui')).resolves.toEqual(summary)

    expect(host.releaseQuickJsModuleNamespace).toHaveBeenCalledWith('quickjs:module:1')
    expect(host.releaseQuickJsPackageNamespaces).toHaveBeenCalledWith('runtime.chapter.native-ui')
    expect(host.getQuickJsPackageNamespaceSummary).toHaveBeenCalledWith('runtime.chapter.native-ui')

    await expect(releaseNativeQuickJsModuleNamespace(createHost(), 'quickjs:missing')).resolves.toBeUndefined()
    await expect(releaseNativeQuickJsPackageNamespaces(createHost(), 'runtime.chapter.native-ui')).resolves.toEqual([])
    await expect(getNativeQuickJsNamespaceSummary(createHost())).resolves.toBeUndefined()
  })

  it('rejects native runtime modules without package-relative asset names', async () => {
    const { ctx } = createModuleLoadContext()
    const loader = createNativeRuntimeModuleLoader({
      evaluator: () => ({ default: undefined }),
    })

    await expect(loader.loadEnginePluginModule?.({
      id: 'bad-plugin',
      kind: 'engine',
      module: 'https://example.invalid/plugin.js',
    }, ctx)).rejects.toThrow(/requires an assetName/)

    await expect(loader.loadScriptModule?.({
      id: 'escape',
      packageId: 'runtime.chapter.native-ui',
      bundleName: 'runtime.chapter.native-ui',
      assetName: '../escape.js',
    }, ctx)).rejects.toThrow(/package-relative script asset/)

    await expect(loader.loadScriptModule?.({
      id: 'remote',
      packageId: 'runtime.chapter.native-ui',
      bundleName: 'runtime.chapter.native-ui',
      assetName: 'https://example.invalid/remote.js',
    }, ctx)).rejects.toThrow(/package-relative script asset/)

    await expect(loader.loadScriptModule?.({
      id: 'native-payload',
      packageId: 'runtime.chapter.native-ui',
      bundleName: 'runtime.chapter.native-ui',
      assetName: 'scripts/plugin.node',
    }, ctx)).rejects.toThrow(/must not reference a native payload/)

    await expect(loader.loadScriptModule?.({
      id: 'ui-ast',
      packageId: 'runtime.chapter.native-ui',
      bundleName: 'runtime.chapter.native-ui',
      assetName: 'ui/menu.qui.json',
    }, ctx)).rejects.toThrow(/must reference a JavaScript module asset/)
  })

  it('rejects unsafe native runtime module variant asset names before asset loading', async () => {
    const { calls, ctx } = createModuleLoadContext()
    const loader = createNativeRuntimeModuleLoader({
      evaluator: () => ({ default: undefined }),
    })

    await expect(loader.loadSceneModule?.({
      id: 'scene-with-escape',
      assetName: 'scenes/opening.js',
      variants: {
        escape: { module: '../outside-scene.js' },
      },
    } as any, ctx)).rejects.toThrow(/variants\.escape\.module "\.\.\/outside-scene\.js" must be a package-relative script asset/)

    await expect(loader.loadEnginePluginModule?.({
      id: 'plugin-with-native-variant',
      kind: 'engine',
      assetName: 'plugins/settings.js',
      variants: {
        windows: { assetName: 'plugins/settings.dll' },
      },
    } as any, ctx)).rejects.toThrow(/variants\.windows\.assetName "plugins\/settings\.dll" must not reference a native payload/)

    await expect(loader.loadStoreMigrationModule?.({
      id: 'migration-with-data-variant',
      assetName: 'migrations/save.js',
      variants: {
        data: { module: 'migrations/save.json' },
      },
    } as any, ctx)).rejects.toThrow(/variants\.data\.module "migrations\/save\.json" must reference a JavaScript module asset/)

    expect(calls).toEqual([])
  })

  it('accepts JavaScript module-like native runtime asset names', async () => {
    const { ctx } = createModuleLoadContext({
      'scripts/opening.mjs': 'export default function opening() {}',
      'migrations/save.cjs': 'module.exports = {}',
    })
    const loader = createNativeRuntimeModuleLoader({
      evaluator: input => ({ default: input.assetName }),
    })

    await expect(loader.loadScriptModule?.({
      id: 'opening',
      packageId: 'runtime.chapter.native-ui',
      bundleName: 'runtime.chapter.native-ui',
      assetName: 'scripts/opening.mjs',
    }, ctx)).resolves.toEqual({ default: 'scripts/opening.mjs' })
    await expect(loader.loadStoreMigrationModule?.({
      id: 'save-v2',
      assetName: 'migrations/save.cjs',
    }, ctx)).resolves.toEqual({ default: 'migrations/save.cjs' })
  })

  it('rejects native runtime evaluators that do not return a module namespace object', async () => {
    const { ctx } = createModuleLoadContext()
    const loader = createNativeRuntimeModuleLoader({
      evaluator: () => undefined,
    })

    await expect(loader.loadScriptModule?.({
      id: 'opening',
      packageId: 'runtime.chapter.native-ui',
      bundleName: 'runtime.chapter.native-ui',
      assetName: 'scripts/opening.js',
    }, ctx)).rejects.toThrow(/did not evaluate to a module namespace object/)
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
