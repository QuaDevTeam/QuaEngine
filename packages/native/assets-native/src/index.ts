import type {
  AssetFetchResult,
  AssetRuntimeAdapter,
  AssetStorage,
  QuaAssetsConfig,
} from '@quajs/assets'
import type { QuaNativeHostApi } from '@quajs/native-contracts'
import { QuaAssets } from '@quajs/assets'
import { NativeHostAssetStorage } from './storage'

declare const TextDecoder: {
  new(): { decode: (input: Uint8Array) => string }
}

export { NativeHostAssetStorage } from './storage'

export interface NativeAssetsAdapterOptions {
  host: QuaNativeHostApi
  storage?: AssetStorage
  now?: () => number
  cacheRoot?: string
}

export function createNativeAssetsAdapter(options: NativeAssetsAdapterOptions): AssetRuntimeAdapter {
  return {
    name: 'native',
    storage: options.storage || new NativeHostAssetStorage(options.host, {
      root: options.cacheRoot,
      now: options.now,
    }),
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
