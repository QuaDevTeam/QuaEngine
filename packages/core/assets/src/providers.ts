import type {
  AssetLocale,
  AssetManifestRecord,
  AssetType,
} from './types'

export interface RankableAssetRecord {
  locale?: AssetLocale
  bundlePriority?: number
  version?: number
  loadedAt?: number
}

export function findBestAssetRecord(
  records: AssetManifestRecord[],
  type: AssetType,
  name: string,
  locale: AssetLocale,
  bundleName?: string,
): AssetManifestRecord | undefined {
  const matches = records.filter(record =>
    record.type === type
    && record.name === name
    && (!bundleName || record.bundleName === bundleName),
  )

  return findBestRankedAssetRecord(matches, locale)
}

export function findBestRankedAssetRecord<T extends RankableAssetRecord>(
  records: readonly T[],
  preferredLocale: AssetLocale,
): T | undefined {
  const localeCandidates = records.filter(record => (record.locale || 'default') === preferredLocale || (record.locale || 'default') === 'default')
  const candidates = localeCandidates.length > 0 ? localeCandidates : records
  return [...candidates].sort((left, right) => compareRankedAssetRecords(left, right, preferredLocale))[0]
}

function compareRankedAssetRecords(
  left: RankableAssetRecord,
  right: RankableAssetRecord,
  preferredLocale: AssetLocale,
): number {
  const priorityDelta = (right.bundlePriority || 0) - (left.bundlePriority || 0)
  if (priorityDelta !== 0)
    return priorityDelta

  const versionDelta = (right.version ?? 1) - (left.version ?? 1)
  if (versionDelta !== 0)
    return versionDelta

  const loadedAtDelta = (right.loadedAt || 0) - (left.loadedAt || 0)
  if (loadedAtDelta !== 0)
    return loadedAtDelta

  const leftLocaleRank = localeRank(left.locale, preferredLocale)
  const rightLocaleRank = localeRank(right.locale, preferredLocale)
  return rightLocaleRank - leftLocaleRank
}

function localeRank(locale: AssetLocale | undefined, preferredLocale: AssetLocale): number {
  const normalized = locale || 'default'
  if (normalized === preferredLocale)
    return 2
  if (normalized === 'default')
    return 1
  return 0
}
