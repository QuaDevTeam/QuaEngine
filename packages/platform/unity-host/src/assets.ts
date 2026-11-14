import type { AssetRuntimeAdapter, QuaAssetsConfig } from '@quajs/assets'
import type { UnityNativeBridge } from './bridge'
import { QuaAssets } from '@quajs/assets'
import { createSceneAssetsAdapter } from '@quajs/scene-runtime/assets'
import { nativeBridge, resourcePath } from './bridge'

export function createUnityAssetsAdapter(bridge: UnityNativeBridge = nativeBridge()): AssetRuntimeAdapter {
  return createSceneAssetsAdapter(bridge, resourcePath)
}

export function createUnityAssets(config: Omit<QuaAssetsConfig, 'adapter'> & { adapter?: AssetRuntimeAdapter } = {}): QuaAssets {
  const assets = new QuaAssets({ ...config, adapter: config.adapter || createUnityAssetsAdapter() })
  return Object.assign(assets, {
    async loadDynamicBundle(): Promise<never> {
      throw new Error('Unity currently accepts build-time QPKs only; dynamic Runtime Package activation is unavailable.')
    },
  })
}
