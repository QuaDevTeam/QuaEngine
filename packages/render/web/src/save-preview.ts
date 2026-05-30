import type {
  QuaGameSavePreviewPayload,
  QuaGameSavePreviewReadOptions,
  QuaGameSaveSlotIndex,
} from '@quajs/store'

export interface SaveSlotDataSource {
  listSlots: () => Promise<QuaGameSaveSlotIndex[]>
  getSlotPreview: (slotId: string, options?: QuaGameSavePreviewReadOptions) => Promise<QuaGameSavePreviewPayload | undefined>
  getSlotPreviews?: (
    slotIds: readonly string[],
    options?: QuaGameSavePreviewReadOptions,
  ) => Promise<Record<string, QuaGameSavePreviewPayload | undefined>>
}

export interface WebSaveSlotPreviewCacheOptions {
  format?: QuaGameSavePreviewReadOptions['format']
  ttlMs?: number
}

interface CachedPreviewSource {
  src: string
  kind: 'data-url' | 'object-url'
  expiresAt: number
}

export class WebSaveSlotPreviewCache {
  private readonly format: QuaGameSavePreviewReadOptions['format']
  private readonly ttlMs: number
  private readonly cache = new Map<string, CachedPreviewSource>()

  constructor(
    private readonly source: Pick<SaveSlotDataSource, 'getSlotPreview' | 'getSlotPreviews'>,
    options: WebSaveSlotPreviewCacheOptions = {},
  ) {
    this.format = options.format || 'bytes'
    this.ttlMs = Math.max(1, options.ttlMs || 30_000)
  }

  async resolve(slotId: string): Promise<string | undefined> {
    this.pruneExpired()
    const cached = this.cache.get(slotId)
    if (cached) {
      cached.expiresAt = Date.now() + this.ttlMs
      return cached.src
    }

    const preview = await this.source.getSlotPreview(slotId, { format: this.format })
    return this.storeResolvedPreview(slotId, preview)
  }

  async resolveMany(slotIds: readonly string[]): Promise<Record<string, string | undefined>> {
    this.pruneExpired()
    const uniqueSlotIds = [...new Set(slotIds)]
    const result: Record<string, string | undefined> = {}
    const missing: string[] = []

    for (const slotId of uniqueSlotIds) {
      const cached = this.cache.get(slotId)
      if (cached) {
        cached.expiresAt = Date.now() + this.ttlMs
        result[slotId] = cached.src
      }
      else {
        missing.push(slotId)
      }
    }

    if (missing.length === 0) {
      return result
    }

    const previews = this.source.getSlotPreviews
      ? await this.source.getSlotPreviews(missing, { format: this.format })
      : await Promise.all(missing.map(async slotId => [slotId, await this.source.getSlotPreview(slotId, { format: this.format })] as const))
          .then(entries => Object.fromEntries(entries))

    for (const slotId of missing) {
      result[slotId] = this.storeResolvedPreview(slotId, previews[slotId])
    }

    return result
  }

  invalidate(slotIds?: readonly string[]): void {
    if (!slotIds || slotIds.length === 0) {
      for (const slotId of [...this.cache.keys()]) {
        this.invalidateOne(slotId)
      }
      return
    }

    for (const slotId of slotIds) {
      this.invalidateOne(slotId)
    }
  }

  dispose(): void {
    this.invalidate()
  }

  private pruneExpired(): void {
    const now = Date.now()
    for (const [slotId, cached] of this.cache.entries()) {
      if (cached.expiresAt <= now) {
        this.invalidateOne(slotId)
      }
    }
  }

  private invalidateOne(slotId: string): void {
    const cached = this.cache.get(slotId)
    if (!cached) {
      return
    }
    if (cached.kind === 'object-url') {
      try {
        URL.revokeObjectURL(cached.src)
      }
      catch {
        // Preview cache cleanup is best-effort and must not block UI teardown.
      }
    }
    this.cache.delete(slotId)
  }

  private storeResolvedPreview(slotId: string, preview: QuaGameSavePreviewPayload | undefined): string | undefined {
    if (!preview) {
      return undefined
    }

    const resolved = resolvePreviewSource(preview)
    this.invalidateOne(slotId)
    this.cache.set(slotId, {
      src: resolved.src,
      kind: resolved.kind,
      expiresAt: Date.now() + this.ttlMs,
    })
    return resolved.src
  }
}
function resolvePreviewSource(preview: QuaGameSavePreviewPayload): {
  src: string
  kind: 'data-url' | 'object-url'
} {
  if (preview.kind === 'data-url') {
    return {
      src: preview.dataUrl,
      kind: 'data-url',
    }
  }

  const bytes = new Uint8Array(preview.bytes.byteLength)
  bytes.set(preview.bytes)
  const blob = new Blob([bytes.buffer], { type: preview.mimeType || 'application/octet-stream' })
  return {
    src: URL.createObjectURL(blob),
    kind: 'object-url',
  }
}
