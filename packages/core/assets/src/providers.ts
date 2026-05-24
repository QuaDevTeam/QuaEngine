import type {
  AssetLocale,
  AssetManifestRecord,
  AssetType,
  VersionCompatibility,
} from './types'
import { isCompatibleWithGameVersion } from './compatibility'

export interface RankableAssetRecord {
  locale?: AssetLocale
  bundlePriority?: number
  version?: number
  bundleVersion?: number
  loadedAt?: number
  compatibility?: VersionCompatibility
}

export function findBestAssetRecord(
  records: AssetManifestRecord[],
  type: AssetType,
  name: string,
  locale: AssetLocale,
  bundleName?: string,
  appVersion?: string,
): AssetManifestRecord | undefined {
  const matches = records.filter(record =>
    record.type === type
    && record.name === name
    && (!bundleName || record.bundleName === bundleName),
  )

  return findBestRankedAssetRecord(matches, locale, appVersion)
}

export function findBestRankedAssetRecord<T extends RankableAssetRecord>(
  records: readonly T[],
  preferredLocale: AssetLocale,
  appVersion?: string,
): T | undefined {
  const compatibleRecords = filterCompatibleRecords(records, appVersion)
  const fallbackChain = createLocaleFallbackChain(preferredLocale)
  const localeCandidates = compatibleRecords.filter(record => fallbackChain.includes(normalizeLocale(record.locale || 'default')))
  const candidates = localeCandidates.length > 0 ? localeCandidates : compatibleRecords
  return [...candidates].sort((left, right) => compareRankedAssetRecords(left, right, preferredLocale))[0]
}

export function findBestTargetRankedAssetRecord<T extends RankableAssetRecord>(
  records: readonly T[],
  preferredLocale: AssetLocale,
  appVersion?: string,
): T | undefined {
  const fallbackChain = createLocaleFallbackChain(preferredLocale)
  const candidates = filterCompatibleRecords(records, appVersion)
    .filter(record => fallbackChain.includes(normalizeLocale(record.locale || 'default')))
  return [...candidates].sort((left, right) => compareTargetRankedAssetRecords(left, right, preferredLocale))[0]
}

function filterCompatibleRecords<T extends RankableAssetRecord>(records: readonly T[], appVersion?: string): T[] {
  return records.filter(record => isCompatibleWithGameVersion(record.compatibility, appVersion))
}

function compareRankedAssetRecords(
  left: RankableAssetRecord,
  right: RankableAssetRecord,
  preferredLocale: AssetLocale,
): number {
  const priorityDelta = (right.bundlePriority || 0) - (left.bundlePriority || 0)
  if (priorityDelta !== 0)
    return priorityDelta

  const versionDelta = (right.bundleVersion ?? right.version ?? 1) - (left.bundleVersion ?? left.version ?? 1)
  if (versionDelta !== 0)
    return versionDelta

  const loadedAtDelta = (right.loadedAt || 0) - (left.loadedAt || 0)
  if (loadedAtDelta !== 0)
    return loadedAtDelta

  const leftLocaleRank = localeRank(left.locale, preferredLocale)
  const rightLocaleRank = localeRank(right.locale, preferredLocale)
  return rightLocaleRank - leftLocaleRank
}

function compareTargetRankedAssetRecords(
  left: RankableAssetRecord,
  right: RankableAssetRecord,
  preferredLocale: AssetLocale,
): number {
  const leftLocaleRank = localeRank(left.locale, preferredLocale)
  const rightLocaleRank = localeRank(right.locale, preferredLocale)
  const localeDelta = rightLocaleRank - leftLocaleRank
  if (localeDelta !== 0)
    return localeDelta

  return compareRankedAssetRecords(left, right, preferredLocale)
}

function localeRank(locale: AssetLocale | undefined, preferredLocale: AssetLocale): number {
  const normalized = normalizeLocale(locale || 'default')
  const fallbackChain = createLocaleFallbackChain(preferredLocale)
  const index = fallbackChain.indexOf(normalized)
  return index === -1 ? 0 : fallbackChain.length - index
}

export function createLocaleFallbackChain(locale: AssetLocale): AssetLocale[] {
  const normalized = normalizeLocale(locale || 'default')
  const chain = [normalized]
  const baseLocale = normalized.split('-')[0]
  if (baseLocale && baseLocale !== normalized && baseLocale !== 'default') {
    chain.push(baseLocale)
  }
  if (!chain.includes('default')) {
    chain.push('default')
  }
  return chain
}

export function normalizeLocale(locale: AssetLocale): AssetLocale {
  return locale.toLowerCase().replace(/_/g, '-')
}
