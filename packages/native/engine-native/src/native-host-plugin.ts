import type { EngineContext, EnginePlugin } from '@quajs/engine'
import type {
  ExclusiveTargetBootstrapValidationResult,
  QuaNativeHostApi,
  QuaNativeHostInfo,
  TargetBundleNativeRendererInfo,
  TargetBundleManifest,
  TargetBundleManifestValidationResult,
} from '@quajs/native-contracts'
import { validateExclusiveTargetBootstrap, validateTargetBundleManifest } from '@quajs/native-contracts'

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

  constructor(private readonly options: NativeHostPluginOptions) {
    this.hostInfo = options.info
  }

  async init(_context: EngineContext): Promise<void> {
    this.validateTargetBootstrap()
    const hostInfo = await this.resolveHostInfo()
    this.validateNativeRendererManifest(hostInfo)
    this.hostInfo = hostInfo
  }

  getHostInfo(): QuaNativeHostInfo | undefined {
    return this.hostInfo
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

  private validateNativeRendererManifest(hostInfo: QuaNativeHostInfo): void {
    const manifestRenderer = this.options.targetBundleManifest?.nativeRenderer
    if (!manifestRenderer)
      return
    const diagnostics = checkNativeRendererManifestCompatibility(hostInfo, manifestRenderer)
    if (diagnostics.length > 0)
      throw new Error(formatNativeRendererManifestCompatibilityError(diagnostics))
  }
}

export function checkNativeRendererManifestCompatibility(
  hostInfo: QuaNativeHostInfo,
  manifestRenderer: TargetBundleNativeRendererInfo,
): string[] {
  const diagnostics: string[] = []
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

function formatNativeRendererManifestCompatibilityError(diagnostics: readonly string[]): string {
  return [
    'Native renderer manifest compatibility validation failed.',
    ...diagnostics,
  ].join(' ')
}
