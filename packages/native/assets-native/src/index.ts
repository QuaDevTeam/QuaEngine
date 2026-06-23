import type {
  AssetFetchResult,
  AssetRuntimeAdapter,
  AssetStorage,
  QuaAssetsConfig,
} from '@quajs/assets'
import type { QuaNativeHostApi } from '@quajs/native-contracts'
import { QuaAssets } from '@quajs/assets'

declare const TextDecoder: {
  new(): { decode: (input: Uint8Array) => string }
}

export interface NativeAssetsAdapterOptions {
  host: QuaNativeHostApi
  storage?: AssetStorage
  now?: () => number
}

export function createNativeAssetsAdapter(options: NativeAssetsAdapterOptions): AssetRuntimeAdapter {
  return {
    name: 'native',
    storage: options.storage || new NativeHostAssetStorage(options.host),
    fetcher: {
      async fetchBytes(url): Promise<AssetFetchResult> {
        const data = await options.host.readAssetBytes({ url })
        return {
          data,
          size: data.byteLength,
        }
      },
      async fetchJSON<T = unknown>(url: string): Promise<T> {
        const data = await options.host.readAssetBytes({ url })
        return JSON.parse(new TextDecoder().decode(data)) as T
      },
    },
    crypto: {
      async sha256(data) {
        return await options.host.hashBytes(data, 'sha256')
      },
    },
    now: options.now,
  }
}

export function createNativeAssets(config: Omit<QuaAssetsConfig, 'adapter'> & {
  adapter?: AssetRuntimeAdapter
  native: NativeAssetsAdapterOptions
}): QuaAssets {
  return new QuaAssets({
    ...config,
    adapter: config.adapter || createNativeAssetsAdapter(config.native),
  })
}

export class NativeHostAssetStorage implements AssetStorage {
  constructor(private readonly host: QuaNativeHostApi) {}

  async getAsset(): Promise<undefined> {
    return undefined
  }

  async storeAsset(): Promise<void> {
    // Runtime bundle bytes are owned by the Rust host at this stage.
  }

  async storeAssets(): Promise<void> {
    // Runtime bundle bytes are owned by the Rust host at this stage.
  }

  async findAssets(): Promise<[]> {
    return []
  }

  async getAssetWithLocaleFallback(): Promise<undefined> {
    return undefined
  }

  async deleteAssetsByBundle(): Promise<number> {
    return 0
  }

  async storeBundle(): Promise<void> {
    // Mounted bundle metadata is surfaced through the native host.
  }

  async getBundle(): Promise<undefined> {
    return undefined
  }

  async getAllBundles(): Promise<[]> {
    await this.host.listMountedBundles?.()
    return []
  }

  async deleteBundle(): Promise<void> {
    // Bundle unload is owned by QuaAssets/RuntimeContentManager plus Rust host.
  }

  async clearAll(): Promise<void> {
    // Host-owned caches are not cleared implicitly by JS.
  }

  async getDatabaseSize(): Promise<number> {
    return 0
  }

  async cleanupAssets(): Promise<number> {
    return 0
  }

  async getCacheStats(): Promise<{ totalAssets: number, totalBundles: number, totalSize: number, oldestAsset: null, newestAsset: null }> {
    return {
      totalAssets: 0,
      totalBundles: 0,
      totalSize: 0,
      oldestAsset: null,
      newestAsset: null,
    }
  }
}
