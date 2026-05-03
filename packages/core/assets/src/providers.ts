import type {
  AssetLocale,
  AssetManifestRecord,
  AssetType,
} from './types'

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

  return matches.find(record => (record.locale || 'default') === locale)
    || matches.find(record => (record.locale || 'default') === 'default')
    || matches[0]
}
