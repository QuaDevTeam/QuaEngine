import type { BundleLoadProgress } from '@quajs/assets'

export const ASSET_LOADING_PLUGIN_ID = 'asset-loading'
export const ASSET_LOADING_RETRY = 'asset-loading/retry'
export const ASSET_LOADING_RENDERER_PROGRESS = 'asset-loading/renderer-progress'

/** Required GPU images, distinct from optional story lookahead. Bytes stay in QPK. */
export interface AssetLoadingImage {
  assetType: 'images' | 'characters'
  assetName: string
  provenance?: { contentPackageId?: string, requiredRuntimePackages?: readonly string[] }
}

export interface AssetLoadingPreparation {
  id: string
  images: readonly AssetLoadingImage[]
}

export interface AssetLoadingProjection {
  visible: boolean
  title: string
  state: 'loading' | 'error' | 'ready'
  phase: BundleLoadProgress['phase'] | 'preparing' | 'loading-local'
  progress: number | null
  loaded: number
  total: number
  bundleName?: string
  bundleIndex?: number
  bundleCount?: number
  cacheHit?: boolean
  error?: string
  attempt: number
  preparation?: AssetLoadingPreparation
}

export type AssetLoadingUpdate = Partial<Pick<AssetLoadingProjection, 'phase' | 'progress' | 'loaded' | 'total' | 'bundleName' | 'bundleIndex' | 'bundleCount' | 'cacheHit' | 'preparation'>>
