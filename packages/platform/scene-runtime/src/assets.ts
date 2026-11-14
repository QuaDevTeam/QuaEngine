import type { AssetRuntimeAdapter } from '@quajs/assets'
import type { SceneScriptBridge } from './bridge'
import { MemoryAssetStorage } from '@quajs/assets'

export function createSceneAssetsAdapter(bridge: SceneScriptBridge, resourcePath: (path: string) => string): AssetRuntimeAdapter {
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
