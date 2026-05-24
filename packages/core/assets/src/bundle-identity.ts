import type { StoredBundle } from './types'

export function createBundleVersionKey(
  logicalName: string,
  bundleVersion: number | undefined,
  buildNumber: string | undefined,
): string {
  return `${logicalName}@${bundleVersion ?? 1}#${buildNumber || 'unknown'}`
}

export function getBundleLogicalName(bundle: Pick<StoredBundle, 'name' | 'logicalName'>): string {
  return bundle.logicalName || bundle.name
}

export function getBundleStorageKey(bundle: Pick<StoredBundle, 'name' | 'versionKey'>): string {
  return bundle.versionKey || bundle.name
}

export function isBundleIdentityMatch(bundle: StoredBundle, name: string): boolean {
  return bundle.name === name
    || bundle.versionKey === name
    || getBundleLogicalName(bundle) === name
}

export function compareStoredBundles(left: StoredBundle, right: StoredBundle): number {
  const priorityDelta = (right.priority || 0) - (left.priority || 0)
  if (priorityDelta !== 0)
    return priorityDelta

  const activeDelta = Number(right.active === true) - Number(left.active === true)
  if (activeDelta !== 0)
    return activeDelta

  const versionDelta = (right.version || 0) - (left.version || 0)
  if (versionDelta !== 0)
    return versionDelta

  const loadedAtDelta = (right.loadedAt || 0) - (left.loadedAt || 0)
  if (loadedAtDelta !== 0)
    return loadedAtDelta

  return (right.lastUpdated || 0) - (left.lastUpdated || 0)
}

export function selectBestStoredBundle(bundles: readonly StoredBundle[]): StoredBundle | undefined {
  return [...bundles].sort(compareStoredBundles)[0]
}
