import type { QuaNativeHostApi } from '@quajs/native-contracts'
import { normalizeRoot } from './storage-records'

export interface NativeAssetStoragePaths {
  readonly root: string
  readonly prefix: string
  indexPath: () => string
  assetPath: (id: string) => string
}

export function createNativeAssetStoragePaths(root?: string): NativeAssetStoragePaths {
  const normalizedRoot = normalizeRoot(root || 'qua-native-assets-cache')
  return {
    root: normalizedRoot,
    prefix: `${normalizedRoot}/`,
    indexPath: () => `${normalizedRoot}/index.json`,
    assetPath: id => `${normalizedRoot}/assets/${encodeURIComponent(id)}.bin`,
  }
}

export async function deleteNativeAssetStoragePrefix(
  host: QuaNativeHostApi,
  paths: NativeAssetStoragePaths,
  indexedAssetIds: Iterable<string>,
): Promise<void> {
  if (host.listStorageKeys) {
    const keys = await host.listStorageKeys(paths.prefix)
    await Promise.all(keys.map(key => host.deleteStorage(key)))
    return
  }

  for (const assetId of indexedAssetIds) {
    await host.deleteStorage(paths.assetPath(assetId))
  }
  await host.deleteStorage(paths.indexPath())
}
