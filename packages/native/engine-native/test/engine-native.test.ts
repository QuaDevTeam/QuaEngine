import { emitLogicToRender, LogicToRenderEvents, RenderToLogicEvents } from '@quajs/engine'
import { describe, expect, it, vi } from 'vitest'
import {
  assertNativeRuntimePackageCompatibility,
  checkNativeRuntimePackageCompatibility,
  createNativeRuntimeAdapters,
  NativeHostPlugin,
  readNativeHostInfo,
} from '../src'
import {
  createHost,
  createHostInfo,
  createTestPipeline,
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

})
