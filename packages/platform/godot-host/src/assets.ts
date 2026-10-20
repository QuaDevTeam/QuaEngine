import type { AssetRuntimeAdapter, QuaAssetsConfig } from '@quajs/assets'
import type { GodotNativeBridge } from './bridge'
import { MemoryAssetStorage, QuaAssets } from '@quajs/assets'
import { nativeBridge, resourcePath } from './bridge'

export function createGodotAssetsAdapter(bridge: GodotNativeBridge = nativeBridge()): AssetRuntimeAdapter {
  return {
    name: 'godot',
    storage: new MemoryAssetStorage(),
    now: () => Date.now(),
    fetcher: {
      async fetchBytes(url, options = {}) {
        (options.signal as { throwIfAborted?: () => void } | undefined)?.throwIfAborted?.()
        const data = bridge.read(resourcePath(url))
        options.onProgress?.(data.byteLength, data.byteLength)
        return { data, size: data.byteLength }
      },
      async fetchJSON<T>(url: string): Promise<T> {
        return JSON.parse(new TextDecoder().decode(bridge.read(resourcePath(url)))) as T
      },
    },
    crypto: {
      async sha256(bytes) {
        // SHA-256 is provided by the host; hash the exact bytes consumed by QuaAssets.
        const result = JSON.parse(bridge.resource(JSON.stringify({ kind: 'sha256' }), bytes))
        if (result.error)
          throw new Error(result.error)
        return result.value as string
      },
    },
  }
}

export function createGodotAssets(config: Omit<QuaAssetsConfig, 'adapter'> & { adapter?: AssetRuntimeAdapter } = {}): QuaAssets {
  const assets = new QuaAssets({ ...config, adapter: config.adapter || createGodotAssetsAdapter() })
  return Object.assign(assets, {
    async loadDynamicBundle(): Promise<never> {
      throw new Error('Godot currently accepts build-time QPKs only; dynamic Runtime Package activation is unavailable.')
    },
  })
}
