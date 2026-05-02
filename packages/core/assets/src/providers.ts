import type {
  AssetChange,
  AssetChangeListener,
  AssetLocale,
  AssetManifest,
  AssetManifestRecord,
  AssetProvider,
  AssetType,
} from './types'

export interface DevVfsAssetProviderOptions {
  manifestUrl?: string
  assetBaseUrl?: string
  hmr?: {
    on: (event: string, listener: (change: AssetChange) => void) => void
    off?: (event: string, listener: (change: AssetChange) => void) => void
  }
  fetcher?: typeof fetch
}

export class DevVfsAssetProvider implements AssetProvider {
  mode = 'dev-vfs' as const

  private manifestUrl: string
  private assetBaseUrl: string
  private hmr?: DevVfsAssetProviderOptions['hmr']
  private fetcher: typeof fetch
  private manifest: AssetManifest | null = null
  private recordsById = new Map<string, AssetManifestRecord>()

  constructor(options: DevVfsAssetProviderOptions = {}) {
    this.manifestUrl = options.manifestUrl || '/@qua-assets/manifest.json'
    this.assetBaseUrl = options.assetBaseUrl || '/@qua-assets/'
    this.hmr = options.hmr
    this.fetcher = options.fetcher || fetch
  }

  async init(): Promise<void> {
    await this.refreshManifest()
  }

  async getManifest(): Promise<AssetManifest> {
    if (!this.manifest) {
      await this.refreshManifest()
    }

    return this.manifest!
  }

  async getAsset(id: string, record?: AssetManifestRecord): Promise<Blob> {
    const assetRecord = record || this.recordsById.get(id)
    if (!assetRecord) {
      throw new Error(`Asset not found in dev VFS manifest: ${id}`)
    }

    const response = await this.fetcher(this.getAssetUrl(assetRecord), {
      cache: 'no-cache',
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch dev VFS asset ${id}: ${response.status} ${response.statusText}`)
    }

    return await response.blob()
  }

  watch(listener: AssetChangeListener): () => void {
    if (!this.hmr) {
      return () => {}
    }

    const handler = (change: AssetChange) => {
      this.applyManifestChange(change)
      listener(change)
    }

    this.hmr.on('qua-assets:update', handler)

    return () => {
      this.hmr?.off?.('qua-assets:update', handler)
    }
  }

  private async refreshManifest(): Promise<void> {
    const response = await this.fetcher(this.manifestUrl, {
      cache: 'no-cache',
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch dev VFS manifest: ${response.status} ${response.statusText}`)
    }

    const manifest = await response.json() as AssetManifest
    this.setManifest(manifest)
  }

  private setManifest(manifest: AssetManifest): void {
    this.manifest = manifest
    this.recordsById.clear()

    for (const record of manifest.assets) {
      this.recordsById.set(record.id, record)
    }
  }

  private applyManifestChange(change: AssetChange): void {
    if (!this.manifest)
      return

    if (change.type === 'removed') {
      this.recordsById.delete(change.assetId)
      this.manifest.assets = this.manifest.assets.filter(record => record.id !== change.assetId)
      return
    }

    if (!change.record)
      return

    const existingIndex = this.manifest.assets.findIndex(record => record.id === change.assetId)
    if (existingIndex === -1) {
      this.manifest.assets.push(change.record)
    }
    else {
      this.manifest.assets[existingIndex] = change.record
    }

    this.recordsById.set(change.assetId, change.record)
  }

  private getAssetUrl(record: AssetManifestRecord): string {
    if (/^https?:\/\//.test(record.path) || record.path.startsWith('/')) {
      return record.path
    }

    return `${this.assetBaseUrl.replace(/\/$/, '')}/${record.path.replace(/^\//, '')}`
  }
}

export function createDevVfsProvider(options?: DevVfsAssetProviderOptions): DevVfsAssetProvider {
  return new DevVfsAssetProvider(options)
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

  return (
    matches.find(record => (record.locale || 'default') === locale)
    || matches.find(record => (record.locale || 'default') === 'default')
    || matches[0]
  )
}
