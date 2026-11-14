import type { AssetRuntimeAdapter, QuaAssetsConfig } from '@quajs/assets'
import type { GodotNativeBridge } from './bridge'
import { QuaAssets } from '@quajs/assets'
import { createSceneAssetsAdapter } from '@quajs/scene-runtime/assets'
import { nativeBridge, resourcePath } from './bridge'

export function createGodotAssetsAdapter(bridge: GodotNativeBridge = nativeBridge()): AssetRuntimeAdapter {
  return createSceneAssetsAdapter(bridge, resourcePath)
}

export function createGodotAssets(config: Omit<QuaAssetsConfig, 'adapter'> & { adapter?: AssetRuntimeAdapter } = {}): QuaAssets {
  const assets = new QuaAssets({ ...config, adapter: config.adapter || createGodotAssetsAdapter() })
  return Object.assign(assets, {
    async loadDynamicBundle(): Promise<never> {
      throw new Error('Godot currently accepts build-time QPKs only; dynamic Runtime Package activation is unavailable.')
    },
  })
}
