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
  onChange?: (state: Readonly<WebAssetUrlState>) => void
}

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

  constructor(private readonly options: WebAssetUrlHandleOptions) {}

  getState(): Readonly<WebAssetUrlState> {
    return this.state
  }

  async load(): Promise<void> {
    const currentRequestId = ++this.requestId
    this.revoke()
    this.state = { loading: false }
    this.notify()

    const assetName = this.options.getName()
    const assets = this.options.getAssets()
    if (!assetName || !assets) {
      return
    }

    this.state = { loading: true }
    this.notify()

    try {
      const asset = await getAssetWithTargetPackages(assets, this.options.getType(), assetName, this.options.getTargetPackageId?.())
      const nextUrl = createObjectURL(asset)
      if (currentRequestId === this.requestId) {
        this.state = { url: nextUrl, loading: false }
        this.notify()
      }
      else {
        revokeObjectURL(nextUrl)
      }
    }
    catch (caught) {
      if (currentRequestId === this.requestId) {
        this.state = {
          loading: false,
          error: caught instanceof Error ? caught : new Error(String(caught)),
        }
        this.notify()
      }
    }
  }

  revoke(): void {
    if (this.state.url) {
      revokeObjectURL(this.state.url)
      this.state = {
        ...this.state,
        url: undefined,
      }
      this.notify()
    }
  }

  dispose(): void {
    this.requestId += 1
    this.revoke()
    this.state = { loading: false }
    this.notify()
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
