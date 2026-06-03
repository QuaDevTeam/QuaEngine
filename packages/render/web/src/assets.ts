import type { AssetData, AssetType, LoadAssetOptions, QuaAssets } from '@quajs/assets'
import { createObjectURL, revokeObjectURL } from '@quajs/assets-web'

export type WebAssetTargetPackageId = string | readonly string[]

export interface WebAssetUrlState {
  url?: string
  loading: boolean
  error?: Error
}

export interface WebAssetUrlHandleOptions {
  getAssets: () => QuaAssets | undefined
  getType: () => AssetType
  getName: () => string | undefined
  getTargetPackageId?: () => WebAssetTargetPackageId | undefined
  getRevision?: () => number | string | undefined
  onChange?: (state: Readonly<WebAssetUrlState>) => void
}

export interface WebAssetUrlDisposeOptions {
  defer?: boolean
}

interface CachedAssetUrl {
  url: string
  refs: number
  revokeTimer?: ReturnType<typeof setTimeout>
}

interface ActiveCachedAssetUrl {
  assets: QuaAssets
  key: string
  entry: CachedAssetUrl
}

const ASSET_URL_REVOKE_GRACE_MS = 250
const assetUrlCache = new WeakMap<QuaAssets, Map<string, CachedAssetUrl>>()

export function runtimePackageCandidatesFromMetadata(
  metadata: Readonly<Record<string, unknown>> | undefined,
): readonly string[] | undefined {
  const contentPackageId = typeof metadata?.contentPackageId === 'string' && metadata.contentPackageId.length > 0
    ? metadata.contentPackageId
    : undefined
  const requiredRuntimePackages = Array.isArray(metadata?.requiredRuntimePackages)
    ? metadata.requiredRuntimePackages.filter((item): item is string => typeof item === 'string' && item.length > 0)
    : []
  const candidates = [...requiredRuntimePackages].reverse()
  if (contentPackageId && !candidates.includes(contentPackageId)) {
    candidates.push(contentPackageId)
  }
  return candidates.length > 0 ? candidates : undefined
}

export async function getAssetWithTargetPackages(
  assets: QuaAssets,
  type: AssetType,
  name: string,
  targetPackageId?: WebAssetTargetPackageId,
  options: Omit<LoadAssetOptions, 'targetPackageId'> = {},
): Promise<AssetData> {
  const candidates = normalizeTargetPackageIds(targetPackageId)
  if (candidates.length === 0) {
    return await assets.getAsset(type, name, options)
  }

  let lastNotFound: unknown
  for (const candidate of candidates) {
    try {
      return await assets.getAsset(type, name, { ...options, targetPackageId: candidate })
    }
    catch (caught) {
      if (!isAssetNotFoundError(caught)) {
        throw caught
      }
      lastNotFound = caught
    }
  }

  throw lastNotFound || new Error(`Asset not found: ${type}/${name}`)
}

export async function getJSONWithTargetPackages<T = unknown>(
  assets: QuaAssets,
  type: AssetType,
  name: string,
  targetPackageId?: WebAssetTargetPackageId,
  options: Omit<LoadAssetOptions, 'targetPackageId'> = {},
): Promise<T> {
  const candidates = normalizeTargetPackageIds(targetPackageId)
  if (candidates.length === 0) {
    return await assets.getJSON<T>(type, name, options)
  }

  let lastNotFound: unknown
  for (const candidate of candidates) {
    try {
      return await assets.getJSON<T>(type, name, { ...options, targetPackageId: candidate })
    }
    catch (caught) {
      if (!isAssetNotFoundError(caught)) {
        throw caught
      }
      lastNotFound = caught
    }
  }

  throw lastNotFound || new Error(`Asset not found: ${type}/${name}`)
}

export class WebAssetUrlHandle {
  private state: WebAssetUrlState = { loading: false }
  private requestId = 0
  private active?: ActiveCachedAssetUrl

  constructor(private readonly options: WebAssetUrlHandleOptions) {}

  getState(): Readonly<WebAssetUrlState> {
    return this.state
  }

  async load(): Promise<void> {
    const currentRequestId = ++this.requestId
    const assetName = this.options.getName()
    const assets = this.options.getAssets()
    if (!assetName || !assets) {
      this.releaseActive({ defer: false })
      this.state = { loading: false }
      this.notify()
      return
    }

    const cacheKey = createAssetUrlCacheKey(
      this.options.getType(),
      assetName,
      this.options.getTargetPackageId?.(),
      this.options.getRevision?.(),
    )
    const cached = getCachedAssetUrl(assets, cacheKey)
    if (cached) {
      this.useCachedAssetUrl(assets, cacheKey, cached)
      return
    }

    this.state = {
      url: this.state.url,
      loading: true,
    }
    this.notify()

    try {
      const asset = await getAssetWithTargetPackages(assets, this.options.getType(), assetName, this.options.getTargetPackageId?.())
      if (currentRequestId !== this.requestId) {
        return
      }
      const nextCached = getCachedAssetUrl(assets, cacheKey)
      if (nextCached) {
        this.useCachedAssetUrl(assets, cacheKey, nextCached)
      }
      else {
        this.useCachedAssetUrl(assets, cacheKey, createCachedAssetUrl(assets, cacheKey, createObjectURL(asset)))
      }
    }
    catch (caught) {
      if (currentRequestId === this.requestId) {
        this.state = {
          url: this.state.url,
          loading: false,
          error: caught instanceof Error ? caught : new Error(String(caught)),
        }
        this.notify()
      }
    }
  }

  revoke(): void {
    this.releaseActive({ defer: false })
    this.state = {
      ...this.state,
      url: undefined,
      loading: false,
    }
    this.notify()
  }

  dispose(options: WebAssetUrlDisposeOptions = {}): void {
    this.requestId += 1
    this.releaseActive({ defer: options.defer === true })
    this.state = { loading: false }
    this.notify()
  }

  private useCachedAssetUrl(assets: QuaAssets, key: string, entry: CachedAssetUrl): void {
    if (this.active?.assets === assets && this.active.key === key && this.active.entry === entry) {
      this.state = { url: entry.url, loading: false }
      this.notify()
      return
    }

    const previous = this.active
    retainCachedAssetUrl(entry)
    this.active = { assets, key, entry }
    this.state = { url: entry.url, loading: false }
    this.notify()
    releaseCachedAssetUrl(previous, { defer: true })
  }

  private releaseActive(options: WebAssetUrlDisposeOptions): void {
    const active = this.active
    this.active = undefined
    releaseCachedAssetUrl(active, options)
  }

  private notify(): void {
    try {
      this.options.onChange?.(this.state)
    }
    catch {
      // Resource projection callbacks must not break renderer progress.
    }
  }
}

function createAssetUrlCacheKey(
  type: AssetType,
  name: string,
  targetPackageId: WebAssetTargetPackageId | undefined,
  revision: number | string | undefined,
): string {
  return JSON.stringify({
    revision: revision ?? 0,
    type,
    name,
    targetPackageIds: normalizeTargetPackageIds(targetPackageId),
  })
}

function getAssetUrlCache(assets: QuaAssets): Map<string, CachedAssetUrl> {
  let cache = assetUrlCache.get(assets)
  if (!cache) {
    cache = new Map()
    assetUrlCache.set(assets, cache)
  }
  return cache
}

function getCachedAssetUrl(assets: QuaAssets, key: string): CachedAssetUrl | undefined {
  return assetUrlCache.get(assets)?.get(key)
}

function createCachedAssetUrl(assets: QuaAssets, key: string, url: string): CachedAssetUrl {
  const entry = { url, refs: 0 }
  getAssetUrlCache(assets).set(key, entry)
  return entry
}

function retainCachedAssetUrl(entry: CachedAssetUrl): void {
  entry.refs += 1
  if (entry.revokeTimer) {
    clearTimeout(entry.revokeTimer)
    entry.revokeTimer = undefined
  }
}

function releaseCachedAssetUrl(
  active: ActiveCachedAssetUrl | undefined,
  options: WebAssetUrlDisposeOptions,
): void {
  if (!active) {
    return
  }

  active.entry.refs = Math.max(0, active.entry.refs - 1)
  if (active.entry.refs > 0) {
    return
  }

  const revoke = () => {
    if (active.entry.refs > 0) {
      return
    }
    assetUrlCache.get(active.assets)?.delete(active.key)
    try {
      revokeObjectURL(active.entry.url)
    }
    catch {
      // Object URL cleanup is best-effort and must not break renderer teardown.
    }
  }

  if (options.defer) {
    active.entry.revokeTimer = setTimeout(revoke, ASSET_URL_REVOKE_GRACE_MS)
  }
  else {
    if (active.entry.revokeTimer) {
      clearTimeout(active.entry.revokeTimer)
      active.entry.revokeTimer = undefined
    }
    revoke()
  }
}

function normalizeTargetPackageIds(targetPackageId: WebAssetTargetPackageId | undefined): string[] {
  if (typeof targetPackageId === 'string') {
    return targetPackageId.length > 0 ? [targetPackageId] : []
  }
  if (!targetPackageId) {
    return []
  }
  return Array.from(new Set(targetPackageId.filter(packageId => packageId.length > 0)))
}

function isAssetNotFoundError(error: unknown): boolean {
  return Boolean(
    error
    && typeof error === 'object'
    && 'code' in error
    && (error as { code?: unknown }).code === 'ASSET_NOT_FOUND',
  )
}
