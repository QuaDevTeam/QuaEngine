import type { AssetManifestRecord } from '../src/types'
import { describe, expect, it } from 'vitest'
import { findBestAssetRecord } from '../src/providers'

describe('core provider helpers', () => {
  const records: AssetManifestRecord[] = [
    {
      id: 'dev:default:data:config.json',
      name: 'config.json',
      type: 'data',
      locale: 'default',
      path: 'data/config.json',
    },
    {
      id: 'dev:zh-cn:data:config.json',
      name: 'config.json',
      type: 'data',
      locale: 'zh-cn',
      path: 'data/config.zh-cn.json',
    },
    {
      id: 'story:default:data:config.json',
      bundleName: 'story',
      name: 'config.json',
      type: 'data',
      locale: 'default',
      path: 'data/config.json',
    },
  ]

  it('selects the preferred locale when present', () => {
    expect(findBestAssetRecord(records, 'data', 'config.json', 'zh-cn')?.id)
      .toBe('dev:zh-cn:data:config.json')
  })

  it('falls back to default locale and respects bundle filters', () => {
    expect(findBestAssetRecord(records, 'data', 'config.json', 'ja-jp')?.id)
      .toBe('dev:default:data:config.json')
    expect(findBestAssetRecord(records, 'data', 'config.json', 'zh-cn', 'story')?.id)
      .toBe('story:default:data:config.json')
  })

  it('ranks provider records by dynamic bundle priority before locale fallback', () => {
    const ranked: AssetManifestRecord[] = [
      {
        id: 'low:zh-cn:data:shared.txt',
        bundleName: 'low',
        name: 'shared.txt',
        type: 'data',
        locale: 'zh-cn',
        path: 'data/shared.txt',
        bundlePriority: 1,
      },
      {
        id: 'high:default:data:shared.txt',
        bundleName: 'high',
        name: 'shared.txt',
        type: 'data',
        locale: 'default',
        path: 'data/shared.txt',
        bundlePriority: 10,
      },
    ]

    expect(findBestAssetRecord(ranked, 'data', 'shared.txt', 'zh-cn')?.id)
      .toBe('high:default:data:shared.txt')
  })

  it('returns undefined for unmatched records', () => {
    expect(findBestAssetRecord(records, 'images', 'bg.png', 'default')).toBeUndefined()
  })
})
