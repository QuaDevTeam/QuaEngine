import type { EngineContext, EnginePlugin } from '@quajs/engine'
import { emitRenderToLogic, LogicToRenderEvents, onLogicToRender, RenderToLogicEvents } from '@quajs/engine'
import type { NativeRendererIntentBridgeDisposer, NativeRendererIntentDrainResult } from './renderer-intents'
import type { NativeRendererFeatureSurfaceEntry } from './feature-surfaces'
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
import { drainNativeRendererIntentsToPipeline, installNativeRendererIntentBridge } from './renderer-intents'
import type { NativeQuickJsPipelineSubscriptionBridge } from './runtime-module-loader'
import type { CreateNativeRendererJsonFrameInputOptions, NativeRendererEngineViewProjection, NativeRendererJsonFrameInput } from './renderer-frame'
import { createNativeRendererJsonFrameInput } from './renderer-frame'
import type { NativeSavePreviewCaptureProvider } from './save-preview-capture'
import { installNativeSavePreviewCaptureResponder } from './save-preview-capture'
import type { NativeQuickJsRendererIntentBridge } from './quickjs-renderer-bridge'
import { installNativeQuickJsRendererIntentBridge, resolveNativeQuickJsRendererIntentBridge } from './quickjs-renderer-bridge'

export interface NativeHostPluginOptions {
  captureSavePreview?: NativeSavePreviewCaptureProvider
  featureSurfaces?: readonly NativeRendererFeatureSurfaceEntry[]
  host: QuaNativeHostApi
  info?: QuaNativeHostInfo
  quickJsPipelineSubscriptionBridge?: NativeQuickJsPipelineSubscriptionBridge
  quickJsRendererIntentBridge?: NativeQuickJsRendererIntentBridge
  rendererId?: string
  targetBootstrapPackages?: readonly string[]
  targetBundleManifest?: TargetBundleManifest
}

// Diagnostics must not retain every unloaded namespace or error for a whole game.
const DIAGNOSTIC_HISTORY_LIMIT = 64

function appendDiagnostic<T>(history: T[], records: readonly T[]): void {
  history.push(...records.slice(-DIAGNOSTIC_HISTORY_LIMIT))
  if (history.length > DIAGNOSTIC_HISTORY_LIMIT)
    history.splice(0, history.length - DIAGNOSTIC_HISTORY_LIMIT)
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
  private disposeQuickJsRendererIntentBridge?: () => void
  private disposeRuntimePackageUnloadListener?: () => void
  private disposeSavePreviewCaptureResponder?: () => void
  private rendererIntentPipeline?: NonNullable<EngineContext['pipeline']>
  constructor(private readonly options: NativeHostPluginOptions) {
    this.hostInfo = options.info
  }

  async init(context: EngineContext): Promise<void> {
    this.validateTargetBootstrap()
    const hostInfo = await this.resolveHostInfo()
    this.validateNativeManifestCompatibility(hostInfo)
    this.hostInfo = hostInfo
    if (context.pipeline) {
      this.rendererIntentPipeline = context.pipeline
      const rendererIntentBridgeOptions = {
        featureSurfaces: this.options.featureSurfaces,
        onError: (error: unknown, event: NativeRendererIntent) => {
          void this.recordRendererIntentError(context.pipeline!, error, event)
        },
      }
      this.disposeRendererIntentBridge?.()
      this.disposeQuickJsRendererIntentBridge?.()
      const quickJsRendererIntentBridge = this.options.quickJsRendererIntentBridge
        || resolveNativeQuickJsRendererIntentBridge()
      if (quickJsRendererIntentBridge) {
        this.disposeRendererIntentBridge = undefined
        this.disposeQuickJsRendererIntentBridge = installNativeQuickJsRendererIntentBridge(
          quickJsRendererIntentBridge,
          context.pipeline,
          rendererIntentBridgeOptions,
        )
      }
      else {
        this.disposeQuickJsRendererIntentBridge = undefined
        this.disposeRendererIntentBridge = installNativeRendererIntentBridge(
          this.options.host,
          context.pipeline,
          rendererIntentBridgeOptions,
        )
      }
      this.disposeRuntimePackageUnloadListener?.()
      this.disposeRuntimePackageUnloadListener = onLogicToRender(
        context.pipeline,
        LogicToRenderEvents.RUNTIME_PACKAGE_UNLOAD,
        async payload => this.releaseQuickJsPackageNamespaces(context.pipeline!, payload.packageId),
      )
      this.disposeSavePreviewCaptureResponder?.()
      this.disposeSavePreviewCaptureResponder = installNativeSavePreviewCaptureResponder(
        context.pipeline,
        {
          capture: this.options.captureSavePreview,
          rendererId: this.options.rendererId,
        },
      )
    }
  }

  destroy(): void {
    this.disposeRendererIntentBridge?.()
    this.disposeRendererIntentBridge = undefined
    this.disposeQuickJsRendererIntentBridge?.()
    this.disposeQuickJsRendererIntentBridge = undefined
    this.disposeRuntimePackageUnloadListener?.()
    this.disposeRuntimePackageUnloadListener = undefined
    this.disposeSavePreviewCaptureResponder?.()
    this.disposeSavePreviewCaptureResponder = undefined
    this.rendererIntentPipeline = undefined
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

  createRendererJsonFrameInput(
    view: NativeRendererEngineViewProjection,
    options: CreateNativeRendererJsonFrameInputOptions = {},
  ): NativeRendererJsonFrameInput {
    return createNativeRendererJsonFrameInput(view, options)
  }

  async drainRendererIntents(): Promise<NativeRendererIntentDrainResult> {
    const pipeline = this.rendererIntentPipeline
    if (!pipeline) {
      return {
        drainedCount: 0,
        dispatchResults: [],
      }
    }

    return await drainNativeRendererIntentsToPipeline(
      this.options.host,
      pipeline,
      {
        featureSurfaces: this.options.featureSurfaces,
        onError: (error, event) => {
          void this.recordRendererIntentError(pipeline, error, event)
        },
      },
    )
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
      appendDiagnostic(this.releasedQuickJsPackages, released)
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
    appendDiagnostic(this.rendererIntentErrors, [normalized])
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
    appendDiagnostic(this.quickJsCleanupErrors, [normalized])
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
