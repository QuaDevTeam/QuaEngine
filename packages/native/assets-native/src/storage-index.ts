import type { StoredAsset, StoredBundle } from '@quajs/assets'
import { getBundleStorageKey } from '@quajs/assets'
import {
  cloneStoredAsset,
  cloneStoredBundle,
  decodeJson,
  encodeJson,
  type NativeAssetStorageIndex,
} from './storage-records'

export interface NativeAssetStorageIndexMaps {
  assets: Map<string, StoredAsset>
  bundles: Map<string, StoredBundle>
}

export function decodeNativeAssetStorageIndex(data: Uint8Array | undefined): NativeAssetStorageIndexMaps {
  if (!data) {
    return {
      assets: new Map(),
      bundles: new Map(),
    }
  }

  const parsed = decodeJson<NativeAssetStorageIndex>(data)
  return {
    assets: new Map((parsed.assets || []).map(asset => [asset.id, cloneStoredAsset({
      ...asset,
      data: new Uint8Array(),
    })])),
    bundles: new Map((parsed.bundles || []).map(bundle => [getBundleStorageKey(bundle), cloneStoredBundle(bundle)])),
  }
}

export function encodeNativeAssetStorageIndex(
  assets: Iterable<StoredAsset>,
  bundles: Iterable<StoredBundle>,
): Uint8Array {
  const index: NativeAssetStorageIndex = {
    format: 'qua-native-assets',
    version: 1,
    assets: Array.from(assets).map(asset => cloneStoredAsset({
      ...asset,
      data: new Uint8Array(),
    })),
    bundles: Array.from(bundles).map(cloneStoredBundle),
  }
  return encodeJson(index)
}
