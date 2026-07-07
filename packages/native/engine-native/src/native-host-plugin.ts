import type { EngineContext, EnginePlugin } from '@quajs/engine'
import { emitRenderToLogic, LogicToRenderEvents, onLogicToRender, RenderToLogicEvents } from '@quajs/engine'
import type { NativeRendererIntentBridgeDisposer } from './renderer-intents'
import type {
  ExclusiveTargetBootstrapValidationResult,
  NativeRendererIntent,
  NativeQuickJsModuleNamespaceRecord,
  QuaNativeHostApi,
  QuaNativeHostInfo,
  TargetBundleManifest,
  TargetBundleManifestValidationResult,
} from '@quajs/native-contracts'
import {
  checkNativeAppManifestCompatibility,
  checkNativeRendererManifestCompatibility,
  checkNativeRuntimeManifestCompatibility,
  checkNativeTargetBootstrap,
  checkNativeTargetBundleManifest,
  formatNativeManifestCompatibilityError,
  formatNativeTargetBootstrapError,
  formatNativeTargetBundleManifestError,
} from './native-manifest-validation'
import { installNativeRendererIntentBridge } from './renderer-intents'
import type { NativeQuickJsPipelineSubscriptionBridge } from './runtime-module-loader'

export interface NativeHostPluginOptions {
  host: QuaNativeHostApi
  info?: QuaNativeHostInfo
  quickJsPipelineSubscriptionBridge?: NativeQuickJsPipelineSubscriptionBridge
  targetBootstrapPackages?: readonly string[]
  targetBundleManifest?: TargetBundleManifest
}

export class NativeHostPlugin implements EnginePlugin {
  readonly name = '@quajs/engine-native/native-host'
  readonly version = '0.1.0'

  private hostInfo?: QuaNativeHostInfo
  private targetBootstrapValidation?: ExclusiveTargetBootstrapValidationResult
  private targetBundleManifestValidation?: TargetBundleManifestValidationResult
  private releasedQuickJsPackages: NativeQuickJsModuleNamespaceRecord[] = []
  private rendererIntentErrors: Error[] = []
  private quickJsCleanupErrors: Error[] = []
  private disposeRendererIntentBridge?: NativeRendererIntentBridgeDisposer
  private disposeRuntimePackageUnloadListener?: () => void

  constructor(private readonly options: NativeHostPluginOptions) {
    this.hostInfo = options.info
  }

  async init(context: EngineContext): Promise<void> {
    this.validateTargetBootstrap()
    const hostInfo = await this.resolveHostInfo()
    this.validateNativeManifestCompatibility(hostInfo)
    this.hostInfo = hostInfo
    if (context.pipeline) {
      this.disposeRendererIntentBridge?.()
      this.disposeRendererIntentBridge = installNativeRendererIntentBridge(
        this.options.host,
        context.pipeline,
        {
          onError: (error, event) => {
            void this.recordRendererIntentError(context.pipeline!, error, event)
          },
        },
      )
      this.disposeRuntimePackageUnloadListener?.()
      this.disposeRuntimePackageUnloadListener = onLogicToRender(
        context.pipeline,
        LogicToRenderEvents.RUNTIME_PACKAGE_UNLOAD,
        async payload => this.releaseQuickJsPackageNamespaces(context.pipeline!, payload.packageId),
      )
    }
  }

  destroy(): void {
    this.disposeRendererIntentBridge?.()
    this.disposeRendererIntentBridge = undefined
    this.disposeRuntimePackageUnloadListener?.()
    this.disposeRuntimePackageUnloadListener = undefined
    this.options.quickJsPipelineSubscriptionBridge?.dispose()
  }

  getHostInfo(): QuaNativeHostInfo | undefined {
    return this.hostInfo
  }

  getReleasedQuickJsPackageNamespaces(): NativeQuickJsModuleNamespaceRecord[] {
    return [...this.releasedQuickJsPackages]
  }

  getRendererIntentErrors(): Error[] {
    return [...this.rendererIntentErrors]
  }

  getQuickJsCleanupErrors(): Error[] {
    return [...this.quickJsCleanupErrors]
  }

  getTargetBootstrapValidation(): ExclusiveTargetBootstrapValidationResult | undefined {
    return this.targetBootstrapValidation
  }

  getTargetBundleManifestValidation(): TargetBundleManifestValidationResult | undefined {
    return this.targetBundleManifestValidation
  }

  private async resolveHostInfo(): Promise<QuaNativeHostInfo> {
    if (this.hostInfo)
      return this.hostInfo
    return await this.options.host.getHostInfo()
  }

  private validateTargetBootstrap(): void {
    if (this.options.targetBundleManifest) {
      const result = checkNativeTargetBundleManifest(this.options.targetBundleManifest)
      this.targetBundleManifestValidation = result
      this.targetBootstrapValidation = result.bootstrapValidation
      if (!result.ok)
        throw new Error(formatNativeTargetBundleManifestError(result))
    }

    if (!this.options.targetBootstrapPackages)
      return

    const result = checkNativeTargetBootstrap(this.options.targetBootstrapPackages)
    this.targetBootstrapValidation = result
    if (!result.ok)
      throw new Error(formatNativeTargetBootstrapError(result))
  }

  private validateNativeManifestCompatibility(hostInfo: QuaNativeHostInfo): void {
    const manifest = this.options.targetBundleManifest
    if (!manifest)
      return
    const diagnostics = [
      ...checkNativeAppManifestCompatibility(hostInfo, manifest),
      ...checkNativeRendererManifestCompatibility(hostInfo, manifest.nativeRenderer),
      ...checkNativeRuntimeManifestCompatibility(hostInfo, manifest.nativeRuntime),
    ]
    if (diagnostics.length > 0)
      throw new Error(formatNativeManifestCompatibilityError(diagnostics))
  }

  private async releaseQuickJsPackageNamespaces(
    pipeline: NonNullable<EngineContext['pipeline']>,
    packageId: string,
  ): Promise<void> {
    if (!this.options.host.releaseQuickJsPackageNamespaces)
      return
    try {
      const released = await this.options.host.releaseQuickJsPackageNamespaces(packageId)
      for (const record of released) {
        this.options.quickJsPipelineSubscriptionBridge?.releaseModuleNamespace(record.id)
      }
      this.releasedQuickJsPackages.push(...released)
    }
    catch (error) {
      await this.recordQuickJsCleanupError(pipeline, error, packageId).catch(() => undefined)
    }
  }

  private async recordRendererIntentError(
    pipeline: NonNullable<EngineContext['pipeline']>,
    error: unknown,
    event: NativeRendererIntent,
  ): Promise<void> {
    const normalized = error instanceof Error ? error : new Error(String(error))
    this.rendererIntentErrors.push(normalized)
    await emitRenderToLogic(pipeline, RenderToLogicEvents.RENDER_ERROR, {
      message: normalized.message,
      error: {
        name: normalized.name,
        message: normalized.message,
        stack: normalized.stack,
      },
      source: 'native-renderer',
      phase: 'renderer-intent',
      recoverable: true,
      timestamp: Date.now(),
      metadata: {
        nativeIntentType: event.type,
      },
    })
  }

  private async recordQuickJsCleanupError(
    pipeline: NonNullable<EngineContext['pipeline']>,
    error: unknown,
    packageId: string,
  ): Promise<void> {
    const normalized = error instanceof Error ? error : new Error(String(error))
    this.quickJsCleanupErrors.push(normalized)
    await emitRenderToLogic(pipeline, RenderToLogicEvents.RENDER_ERROR, {
      message: normalized.message,
      error: {
        name: normalized.name,
        message: normalized.message,
        stack: normalized.stack,
      },
      source: 'native-renderer',
      phase: 'quickjs-cleanup',
      recoverable: true,
      timestamp: Date.now(),
      metadata: {
        runtimePackageId: packageId,
      },
    })
  }
}

export async function readNativeHostInfo(host: QuaNativeHostApi): Promise<QuaNativeHostInfo> {
  return await host.getHostInfo()
}

export {
  assertNativeTargetBootstrap,
  assertNativeTargetBundleManifest,
  checkNativeAppManifestCompatibility,
  checkNativeRendererManifestCompatibility,
  checkNativeRuntimeManifestCompatibility,
  checkNativeTargetBootstrap,
  checkNativeTargetBundleManifest,
} from './native-manifest-validation'
