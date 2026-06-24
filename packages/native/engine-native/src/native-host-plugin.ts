import type { EngineContext, EnginePlugin } from '@quajs/engine'
import type {
  ExclusiveTargetBootstrapValidationResult,
  QuaNativeHostApi,
  QuaNativeHostInfo,
} from '@quajs/native-contracts'
import { validateExclusiveTargetBootstrap } from '@quajs/native-contracts'

export interface NativeHostPluginOptions {
  host: QuaNativeHostApi
  info?: QuaNativeHostInfo
  targetBootstrapPackages?: readonly string[]
}

export class NativeHostPlugin implements EnginePlugin {
  readonly name = '@quajs/engine-native/native-host'
  readonly version = '0.1.0'

  private hostInfo?: QuaNativeHostInfo
  private targetBootstrapValidation?: ExclusiveTargetBootstrapValidationResult

  constructor(private readonly options: NativeHostPluginOptions) {
    this.hostInfo = options.info
  }

  async init(_context: EngineContext): Promise<void> {
    this.validateTargetBootstrap()
    this.hostInfo = await this.resolveHostInfo()
  }

  getHostInfo(): QuaNativeHostInfo | undefined {
    return this.hostInfo
  }

  getTargetBootstrapValidation(): ExclusiveTargetBootstrapValidationResult | undefined {
    return this.targetBootstrapValidation
  }

  private async resolveHostInfo(): Promise<QuaNativeHostInfo> {
    if (this.hostInfo)
      return this.hostInfo
    return await this.options.host.getHostInfo()
  }

  private validateTargetBootstrap(): void {
    if (!this.options.targetBootstrapPackages)
      return

    const result = checkNativeTargetBootstrap(this.options.targetBootstrapPackages)
    this.targetBootstrapValidation = result
    if (!result.ok)
      throw new Error(formatNativeTargetBootstrapError(result))
  }
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
