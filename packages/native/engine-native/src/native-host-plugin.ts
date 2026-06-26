import type { EngineContext, EnginePlugin } from '@quajs/engine'
import { emitRenderToLogic, LogicToRenderEvents, onLogicToRender, RenderToLogicEvents } from '@quajs/engine'
import type { NativeRendererIntentBridgeDisposer } from './renderer-intents'
import type {
  ExclusiveTargetBootstrapValidationResult,
  NativeRendererIntent,
  NativeQuickJsModuleNamespaceRecord,
  QuaNativeHostApi,
  QuaNativeHostInfo,
  TargetBundleNativeRendererInfo,
  TargetBundleManifest,
  TargetBundleManifestValidationResult,
} from '@quajs/native-contracts'
import { validateExclusiveTargetBootstrap, validateTargetBundleManifest } from '@quajs/native-contracts'
import { installNativeRendererIntentBridge } from './renderer-intents'

export interface NativeHostPluginOptions {
  host: QuaNativeHostApi
  info?: QuaNativeHostInfo
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

export function checkNativeAppManifestCompatibility(
  hostInfo: QuaNativeHostInfo,
  manifest: TargetBundleManifest,
): string[] {
  const diagnostics: string[] = []
  if (manifest.app?.bundleId && manifest.app.bundleId !== hostInfo.app.bundleId) {
    diagnostics.push(
      `Native target bundle manifest app.bundleId "${manifest.app.bundleId}" does not match host app bundleId "${hostInfo.app.bundleId}".`,
    )
  }
  if (manifest.app?.version && manifest.app.version !== hostInfo.app.version) {
    diagnostics.push(
      `Native target bundle manifest app.version "${manifest.app.version}" does not match host app version "${hostInfo.app.version}".`,
    )
  }
  if (manifest.app?.buildNumber && manifest.app.buildNumber !== hostInfo.app.buildNumber) {
    diagnostics.push(
      `Native target bundle manifest app.buildNumber "${manifest.app.buildNumber}" does not match host app buildNumber "${hostInfo.app.buildNumber}".`,
    )
  }
  if (manifest.profile && manifest.profile !== hostInfo.app.profile) {
    diagnostics.push(
      `Native target bundle manifest profile "${manifest.profile}" does not match host app profile "${hostInfo.app.profile}".`,
    )
  }
  if (manifest.platform && manifest.platform !== hostInfo.app.platform) {
    diagnostics.push(
      `Native target bundle manifest platform "${manifest.platform}" does not match host app platform "${hostInfo.app.platform}".`,
    )
  }
  return diagnostics
}

export function checkNativeRendererManifestCompatibility(
  hostInfo: QuaNativeHostInfo,
  manifestRenderer?: TargetBundleNativeRendererInfo,
): string[] {
  const diagnostics: string[] = []
  if (!manifestRenderer)
    return diagnostics

  if (manifestRenderer.packageName && manifestRenderer.packageName !== hostInfo.renderer.packageName) {
    diagnostics.push(
      `Native target bundle manifest renderer package "${manifestRenderer.packageName}" does not match host renderer package "${hostInfo.renderer.packageName}".`,
    )
  }
  if (manifestRenderer.version && manifestRenderer.version !== hostInfo.renderer.version) {
    diagnostics.push(
      `Native target bundle manifest renderer version "${manifestRenderer.version}" does not match host renderer version "${hostInfo.renderer.version}".`,
    )
  }
  if (manifestRenderer.backend && manifestRenderer.backend !== hostInfo.renderer.backend) {
    diagnostics.push(
      `Native target bundle manifest renderer backend "${manifestRenderer.backend}" does not match host renderer backend "${hostInfo.renderer.backend}".`,
    )
  }
  if (
    manifestRenderer.backendVersion
    && manifestRenderer.backendVersion !== hostInfo.renderer.backendVersion
  ) {
    diagnostics.push(
      `Native target bundle manifest renderer backendVersion "${manifestRenderer.backendVersion}" does not match host renderer backendVersion "${hostInfo.renderer.backendVersion ?? '<none>'}".`,
    )
  }
  if (
    manifestRenderer.capabilityManifestHash
    && manifestRenderer.capabilityManifestHash !== hostInfo.renderer.capabilityManifestHash
  ) {
    diagnostics.push(
      `Native target bundle manifest renderer capability hash "${manifestRenderer.capabilityManifestHash}" does not match host renderer capability hash "${hostInfo.renderer.capabilityManifestHash}".`,
    )
  }

  const hostCapabilityIds = new Set(hostInfo.renderer.capabilities.map(capability => capability.id))
  for (const capabilityId of manifestRenderer.capabilityIds || []) {
    if (!hostCapabilityIds.has(capabilityId)) {
      diagnostics.push(
        `Native target bundle manifest renderer capability "${capabilityId}" is not provided by the native host.`,
      )
    }
  }
  return diagnostics
}

export async function readNativeHostInfo(host: QuaNativeHostApi): Promise<QuaNativeHostInfo> {
  return await host.getHostInfo()
}

export function checkNativeTargetBootstrap(
  packageNames: readonly string[],
): ExclusiveTargetBootstrapValidationResult {
  return validateExclusiveTargetBootstrap(packageNames, {
    expectedTarget: 'native',
  })
}

export function assertNativeTargetBootstrap(
  packageNames: readonly string[],
): ExclusiveTargetBootstrapValidationResult {
  const result = checkNativeTargetBootstrap(packageNames)
  if (!result.ok)
    throw new Error(formatNativeTargetBootstrapError(result))
  return result
}

export function checkNativeTargetBundleManifest(
  manifest: TargetBundleManifest,
): TargetBundleManifestValidationResult {
  return validateTargetBundleManifest(manifest, {
    expectedTarget: 'native',
  })
}

export function assertNativeTargetBundleManifest(
  manifest: TargetBundleManifest,
): TargetBundleManifestValidationResult {
  const result = checkNativeTargetBundleManifest(manifest)
  if (!result.ok)
    throw new Error(formatNativeTargetBundleManifestError(result))
  return result
}

function formatNativeTargetBootstrapError(result: ExclusiveTargetBootstrapValidationResult): string {
  const diagnostics = [
    ...result.diagnostics,
    ...(result.targetValidation?.diagnostics || []),
  ].map(diagnostic => diagnostic.message)

  return [
    'Native target bootstrap validation failed.',
    ...diagnostics,
  ].join(' ')
}

function formatNativeTargetBundleManifestError(result: TargetBundleManifestValidationResult): string {
  const diagnostics = result.diagnostics.map(diagnostic => diagnostic.message)

  return [
    'Native target bundle manifest validation failed.',
    ...diagnostics,
  ].join(' ')
}

function formatNativeManifestCompatibilityError(diagnostics: readonly string[]): string {
  return [
    'Native manifest compatibility validation failed.',
    ...diagnostics,
  ].join(' ')
}
