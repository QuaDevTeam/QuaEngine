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

  it('returns encoded native frame bytes for save preview capture requests', async () => {
    const pipeline = createTestPipeline()
    const bytes = new Uint8Array([0x89, 0x50, 0x4E, 0x47])
    const captureSavePreview = vi.fn(async () => ({
      bytes,
      mimeType: 'image/png',
      width: 1920,
      height: 1080,
      capturedAt: 42,
    }))
    const plugin = new NativeHostPlugin({
      captureSavePreview,
      host: createHost(),
      rendererId: 'native-wgpu',
    })
    const results: unknown[] = []
    pipeline.on(RenderToLogicEvents.SAVE_PREVIEW_CAPTURE_RESULT, context => results.push(context.event.payload))

    await plugin.init({ pipeline } as any)
    await emitLogicToRender(pipeline, LogicToRenderEvents.SAVE_PREVIEW_CAPTURE_REQUEST, {
      requestId: 'capture-1',
      saveOpId: 'save-1',
      slotId: 'slot-1',
      reason: 'save',
      transaction: 'sync',
      policy: {
        format: 'image/png',
        maxWidth: 1920,
      },
    })

    expect(captureSavePreview).toHaveBeenCalledWith({
      format: 'image/png',
      maxWidth: 1920,
    })
    expect(results).toEqual([
      expect.objectContaining({
        requestId: 'capture-1',
        saveOpId: 'save-1',
        slotId: 'slot-1',
        rendererId: 'native-wgpu',
        mimeType: 'image/png',
        image: {
          kind: 'bytes',
          bytes,
        },
        width: 1920,
        height: 1080,
        capturedAt: 42,
      }),
    ])
  })

  it('reports unavailable or failed native save preview capture as recoverable', async () => {
    const unavailablePipeline = createTestPipeline()
    const unavailableErrors: unknown[] = []
    unavailablePipeline.on(RenderToLogicEvents.SAVE_PREVIEW_CAPTURE_ERROR, context => unavailableErrors.push(context.event.payload))
    const unavailablePlugin = new NativeHostPlugin({ host: createHost() })
    await unavailablePlugin.init({ pipeline: unavailablePipeline } as any)

    await emitLogicToRender(unavailablePipeline, LogicToRenderEvents.SAVE_PREVIEW_CAPTURE_REQUEST, {
      requestId: 'capture-unavailable',
      saveOpId: 'save-unavailable',
      slotId: 'slot-unavailable',
      reason: 'quickSave',
      transaction: 'sync',
      policy: {},
    })

    expect(unavailableErrors).toEqual([
      expect.objectContaining({
        requestId: 'capture-unavailable',
        message: 'Native save preview capture is unavailable for this product host.',
        recoverable: true,
      }),
    ])

    const failedPipeline = createTestPipeline()
    const failedErrors: unknown[] = []
    failedPipeline.on(RenderToLogicEvents.SAVE_PREVIEW_CAPTURE_ERROR, context => failedErrors.push(context.event.payload))
    const failedPlugin = new NativeHostPlugin({
      captureSavePreview: async () => {
        throw new Error('wgpu readback failed')
      },
      host: createHost(),
    })
    await failedPlugin.init({ pipeline: failedPipeline } as any)

    await emitLogicToRender(failedPipeline, LogicToRenderEvents.SAVE_PREVIEW_CAPTURE_REQUEST, {
      requestId: 'capture-failed',
      saveOpId: 'save-failed',
      slotId: 'slot-failed',
      reason: 'autoSave',
      transaction: 'sync',
      policy: {},
    })

    expect(failedErrors).toEqual([
      expect.objectContaining({
        requestId: 'capture-failed',
        message: 'wgpu readback failed',
        recoverable: true,
      }),
    ])
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

  it('moves QuickJS namespace cleanup listeners when the native host plugin is reinitialized', async () => {
    const host = {
      ...createHost(),
      releaseQuickJsPackageNamespaces: vi.fn(async () => []),
    }
    const plugin = new NativeHostPlugin({ host })
    const firstPipeline = createTestPipeline()
    const secondPipeline = createTestPipeline()

    await plugin.init({ pipeline: firstPipeline } as any)
    await plugin.init({ pipeline: secondPipeline } as any)

    await emitLogicToRender(firstPipeline, LogicToRenderEvents.RUNTIME_PACKAGE_UNLOAD, {
      packageId: 'runtime.first',
      bundleName: 'runtime.first',
    })
    await emitLogicToRender(secondPipeline, LogicToRenderEvents.RUNTIME_PACKAGE_UNLOAD, {
      packageId: 'runtime.second',
      bundleName: 'runtime.second',
    })

    expect(host.releaseQuickJsPackageNamespaces).toHaveBeenCalledTimes(1)
    expect(host.releaseQuickJsPackageNamespaces).toHaveBeenCalledWith('runtime.second')
  })

  it('keeps runtime package unload recoverable when QuickJS cleanup error reporting fails', async () => {
    const cleanupError = new Error('native cleanup unavailable')
    const renderErrorListenerFailure = new Error('render error listener failed')
    const host = {
      ...createHost(),
      releaseQuickJsPackageNamespaces: vi.fn(async () => {
        throw cleanupError
      }),
    }
    const plugin = new NativeHostPlugin({ host })
    const pipeline = createTestPipeline()
    pipeline.on(RenderToLogicEvents.RENDER_ERROR, () => {
      throw renderErrorListenerFailure
    })

    await plugin.init({ pipeline } as any)

    await expect(emitLogicToRender(pipeline, LogicToRenderEvents.RUNTIME_PACKAGE_UNLOAD, {
      packageId: 'runtime.chapter.native-ui',
      bundleName: 'runtime.chapter.native-ui',
    })).resolves.toBeUndefined()

    expect(host.releaseQuickJsPackageNamespaces).toHaveBeenCalledWith('runtime.chapter.native-ui')
    expect(plugin.getReleasedQuickJsPackageNamespaces()).toEqual([])
    expect(plugin.getQuickJsCleanupErrors()).toEqual([cleanupError])
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
