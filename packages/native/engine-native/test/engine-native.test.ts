import type { NativeHostApiRequest, QuaNativeHostApi, QuaNativeHostInfo, TargetBundleManifest } from '@quajs/native-contracts'
import { COCOS_TARGET_BOOTSTRAP, NATIVE_TARGET_BOOTSTRAP, createNativeHostApiFromBridge, getTargetCorePluginFamily } from '@quajs/native-contracts'
import { describe, expect, it, vi } from 'vitest'
import {
  NativeHostPlugin,
  assertNativeTargetBundleManifest,
  assertNativeTargetBootstrap,
  assertNativeRuntimePackageCompatibility,
  checkNativeTargetBundleManifest,
  checkNativeTargetBootstrap,
  checkNativeRuntimePackageCompatibility,
  createNativeRuntimeAdapters,
  createNativeRuntimeModuleLoader,
  createNativeRuntimeTrustPolicy,
  readNativeHostInfo,
} from '../src'

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
      capabilities: [
        {
          id: 'native-wgpu.ui.surface@1',
          target: 'native',
          version: '1.0.0',
          ownerPackage: '@quajs/native-renderer',
          projectionKeys: ['view.ui.overlays'],
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
      ],
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
