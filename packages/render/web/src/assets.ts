import type { AssetType, QuaAssets } from '@quajs/assets'
import { createObjectURL, revokeObjectURL } from '@quajs/assets-web'

export interface WebAssetUrlState {
  url?: string
  loading: boolean
  error?: Error
}

export interface WebAssetUrlHandleOptions {
  getAssets: () => QuaAssets | undefined
  getType: () => AssetType
  getName: () => string | undefined
  onChange?: (state: Readonly<WebAssetUrlState>) => void
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
      const asset = await assets.getAsset(this.options.getType(), assetName)
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
    this.options.onChange?.(this.state)
  }
}
