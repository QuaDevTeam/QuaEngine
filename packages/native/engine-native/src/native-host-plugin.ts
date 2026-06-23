import type { EngineContext, EnginePlugin } from '@quajs/engine'
import type { QuaNativeHostApi, QuaNativeHostInfo } from '@quajs/native-contracts'

export interface NativeHostPluginOptions {
  host: QuaNativeHostApi
  info?: QuaNativeHostInfo
}

export class NativeHostPlugin implements EnginePlugin {
  readonly name = '@quajs/engine-native/native-host'
  readonly version = '0.1.0'

  private hostInfo?: QuaNativeHostInfo

  constructor(private readonly options: NativeHostPluginOptions) {
    this.hostInfo = options.info
  }

  async init(_context: EngineContext): Promise<void> {
    this.hostInfo = await this.resolveHostInfo()
  }

  getHostInfo(): QuaNativeHostInfo | undefined {
    return this.hostInfo
  }

  private async resolveHostInfo(): Promise<QuaNativeHostInfo> {
    if (this.hostInfo)
      return this.hostInfo
    return await this.options.host.getHostInfo()
  }
}

export async function readNativeHostInfo(host: QuaNativeHostApi): Promise<QuaNativeHostInfo> {
  return await host.getHostInfo()
}
