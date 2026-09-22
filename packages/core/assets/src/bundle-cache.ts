import type { AssetStorage, BundleIdentity, BundleManifest, StoredAsset, StoredBundle } from './types'

export function assertLoadNotAborted(signal: unknown): void {
  const state = signal as { aborted?: boolean, reason?: unknown } | undefined
  if (state?.aborted)
    throw state.reason instanceof Error ? state.reason : new Error('Bundle loading aborted')
}

export function assertBundleIdentity(manifest: BundleManifest, hash: string, expected?: BundleIdentity): void {
  if (!expected)
    return
  if (manifest.name !== expected.name || (manifest.bundleVersion || 1) !== expected.version
    || (manifest.buildNumber || 'unknown') !== expected.buildNumber || hash !== expected.hash
    || manifest.assetTarget?.name !== expected.target) {
    throw new Error(`Bundle does not match the deployment manifest: ${expected.name}`)
  }
}

export async function hasCompleteBundle(storage: AssetStorage, bundle: StoredBundle): Promise<boolean> {
  if (!bundle.assetIds || bundle.assetIds.length !== bundle.assetCount)
    return false
  if (storage.hasAssets)
    return await storage.hasAssets(bundle.assetIds)
  // Adapter fallback is sequential to avoid duplicating all QPK payloads in RAM.
  for (const id of bundle.assetIds) {
    if (!await storage.getAsset(id))
      return false
  }
  return true
}

export async function commitBundle(storage: AssetStorage, bundle: StoredBundle, assets: StoredAsset[]): Promise<void> {
  const committed = { ...bundle, assetIds: assets.map(asset => asset.id) }
  if (storage.commitBundle) {
    await storage.commitBundle(committed, assets)
  }
  else {
    // Publish metadata last. An interrupted new version cannot become active.
    await storage.storeAssets(assets)
    await storage.storeBundle(committed)
  }
}
