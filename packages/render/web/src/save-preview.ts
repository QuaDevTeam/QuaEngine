import type {
  RendererPlugin,
  RendererPluginContext,
  SavePreviewCapturePolicy,
  SavePreviewCaptureRequestPayload,
} from '@quajs/render-core'
import type {
  QuaGameSavePreviewPayload,
  QuaGameSavePreviewReadOptions,
  QuaGameSaveSlotMeta,
} from '@quajs/store'
import { LogicToRenderEvents, RenderToLogicEvents } from '@quajs/render-core'

export interface SaveSlotDataSource {
  listSlots: () => Promise<QuaGameSaveSlotMeta[]>
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
      URL.revokeObjectURL(cached.src)
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

export interface WebSavePreviewCapturePluginOptions {
  getStageElement: () => HTMLElement | null | undefined
  rendererId?: string
}

interface FrozenStageCapture {
  clone: HTMLElement
  width: number
  height: number
}

export function createWebSavePreviewCapturePlugin(options: WebSavePreviewCapturePluginOptions): RendererPlugin {
  return {
    name: '@quajs/renderer-web/save-preview-capture',
    setup(context) {
      context.addDisposer(context.onLogicToRender(LogicToRenderEvents.SAVE_PREVIEW_CAPTURE_REQUEST, async (payload) => {
        const task = handleCaptureRequest(context, payload, options)
        if (payload.transaction === 'async-clone') {
          void task
          return
        }
        await task
      }))
    },
  }
}

async function handleCaptureRequest(
  context: RendererPluginContext,
  payload: SavePreviewCaptureRequestPayload,
  options: WebSavePreviewCapturePluginOptions,
): Promise<void> {
  try {
    const stage = options.getStageElement()
    if (!stage) {
      throw new Error('Save preview capture requires a mounted .qua-stage element.')
    }

    const frozen = freezeStageCapture(stage, payload.policy)
    const encoded = await encodeFrozenStage(stage.ownerDocument, frozen, payload.policy)
    await context.emitRenderToLogic(RenderToLogicEvents.SAVE_PREVIEW_CAPTURE_RESULT, {
      requestId: payload.requestId,
      saveOpId: payload.saveOpId,
      slotId: payload.slotId,
      rendererId: options.rendererId,
      timestamp: Date.now(),
      mimeType: encoded.mimeType,
      image: {
        kind: 'bytes',
        bytes: encoded.bytes,
      },
      width: encoded.width,
      height: encoded.height,
      capturedAt: encoded.capturedAt,
    })
  }
  catch (error) {
    await context.emitRenderToLogic(RenderToLogicEvents.SAVE_PREVIEW_CAPTURE_ERROR, {
      requestId: payload.requestId,
      saveOpId: payload.saveOpId,
      slotId: payload.slotId,
      rendererId: options.rendererId,
      timestamp: Date.now(),
      message: error instanceof Error ? error.message : 'Save preview capture failed.',
      recoverable: true,
    })
  }
}

function freezeStageCapture(stage: HTMLElement, policy: SavePreviewCapturePolicy): FrozenStageCapture {
  const rect = stage.getBoundingClientRect()
  const width = Math.max(1, Math.round(rect.width))
  const height = Math.max(1, Math.round(rect.height))
  const clone = stage.cloneNode(true) as HTMLElement

  clone.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml')
  copyComputedTree(stage, clone)
  freezeDynamicMedia(stage, clone)
  applyCapturePolicy(clone, policy)

  return {
    clone,
    width,
    height,
  }
}

async function encodeFrozenStage(
  document: Document,
  frozen: FrozenStageCapture,
  policy: SavePreviewCapturePolicy,
): Promise<{
    bytes: Uint8Array
    mimeType: string
    width: number
    height: number
    capturedAt: number
  }> {
  const mimeType = policy.format || 'image/webp'
  const pixelRatio = typeof policy.pixelRatio === 'number' && Number.isFinite(policy.pixelRatio) && policy.pixelRatio > 0
    ? policy.pixelRatio
    : 1
  const scale = resolveCaptureScale(frozen.width, frozen.height, policy.maxWidth, policy.maxHeight)
  const outputWidth = Math.max(1, Math.round(frozen.width * scale * pixelRatio))
  const outputHeight = Math.max(1, Math.round(frozen.height * scale * pixelRatio))
  const svgMarkup = createCaptureSvgMarkup(frozen, outputWidth, outputHeight, mimeType, policy.background)
  const image = await loadSvgImage(document, svgMarkup)

  try {
    const canvas = createCaptureCanvas(document, outputWidth, outputHeight)
    const context = canvas.getContext('2d')
    if (!context) {
      throw new Error('Save preview capture could not create a 2D canvas context.')
    }

    if (policy.background !== null) {
      const background = policy.background || (mimeType === 'image/jpeg' ? '#000000' : undefined)
      if (background) {
        context.fillStyle = background
        context.fillRect(0, 0, outputWidth, outputHeight)
      }
    }

    context.drawImage(image, 0, 0, outputWidth, outputHeight)
    const blob = await canvasToBlob(canvas, mimeType, policy.quality)
    return {
      bytes: new Uint8Array(await blob.arrayBuffer()),
      mimeType: blob.type || mimeType,
      width: outputWidth,
      height: outputHeight,
      capturedAt: Date.now(),
    }
  }
  finally {
    image.remove()
  }
}

function resolveCaptureScale(
  width: number,
  height: number,
  maxWidth?: number,
  maxHeight?: number,
): number {
  const candidates = [1]
  if (typeof maxWidth === 'number' && Number.isFinite(maxWidth) && maxWidth > 0) {
    candidates.push(maxWidth / width)
  }
  if (typeof maxHeight === 'number' && Number.isFinite(maxHeight) && maxHeight > 0) {
    candidates.push(maxHeight / height)
  }
  return Math.min(...candidates.filter(candidate => candidate > 0))
}

function createCaptureSvgMarkup(
  frozen: FrozenStageCapture,
  outputWidth: number,
  outputHeight: number,
  mimeType: string,
  background?: string | null,
): string {
  const backgroundFill = background === null
    ? ''
    : `<rect width="100%" height="100%" fill="${escapeHtmlAttribute(background || (mimeType === 'image/jpeg' ? '#000000' : 'transparent'))}" />`
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${outputWidth}" height="${outputHeight}" viewBox="0 0 ${frozen.width} ${frozen.height}">`,
    backgroundFill,
    `<foreignObject width="${frozen.width}" height="${frozen.height}">`,
    new XMLSerializer().serializeToString(frozen.clone),
    '</foreignObject>',
    '</svg>',
  ].join('')
}

function createCaptureCanvas(document: Document, width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas
}

function loadSvgImage(document: Document, markup: string): Promise<HTMLImageElement> {
  const blob = new Blob([markup], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(blob)

  return new Promise((resolve, reject) => {
    const image = document.createElement('img')
    image.onload = () => {
      URL.revokeObjectURL(url)
      resolve(image)
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Save preview capture could not rasterize the frozen stage.'))
    }
    image.src = url
  })
}

function canvasToBlob(canvas: HTMLCanvasElement, mimeType: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Save preview capture failed to encode the captured canvas.'))
        return
      }
      resolve(blob)
    }, mimeType, quality)
  })
}

function copyComputedTree(source: Element, clone: Element): void {
  copyComputedStyles(source, clone)

  const sourceChildren = [...source.children]
  const cloneChildren = [...clone.children]
  const count = Math.min(sourceChildren.length, cloneChildren.length)
  for (let index = 0; index < count; index += 1) {
    copyComputedTree(sourceChildren[index], cloneChildren[index])
  }
}

function copyComputedStyles(source: Element, clone: Element): void {
  const view = source.ownerDocument.defaultView
  const computed = view?.getComputedStyle(source)
  if (!computed) {
    return
  }

  const cloneElement = clone as HTMLElement
  cloneElement.style.cssText = Array.from(computed)
    .map(property => `${property}:${computed.getPropertyValue(property)};`)
    .join('')
}

function freezeDynamicMedia(source: Element, clone: Element): void {
  const sourceChildren = [...source.children]
  const cloneChildren = [...clone.children]
  const count = Math.min(sourceChildren.length, cloneChildren.length)

  for (let index = 0; index < count; index += 1) {
    freezeDynamicMedia(sourceChildren[index], cloneChildren[index])
  }

  if (source instanceof HTMLCanvasElement && clone instanceof HTMLCanvasElement) {
    replaceCloneWithImage(clone, source.toDataURL('image/png'))
    return
  }

  if (source instanceof HTMLVideoElement && clone instanceof HTMLVideoElement) {
    const frame = snapshotVideoFrame(source)
    if (frame) {
      replaceCloneWithImage(clone, frame)
    }
  }
}

function snapshotVideoFrame(video: HTMLVideoElement): string | undefined {
  const width = video.videoWidth || video.clientWidth
  const height = video.videoHeight || video.clientHeight
  if (width <= 0 || height <= 0) {
    return undefined
  }

  const canvas = video.ownerDocument.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) {
    return undefined
  }

  try {
    context.drawImage(video, 0, 0, width, height)
    return canvas.toDataURL('image/png')
  }
  catch {
    return undefined
  }
}

function replaceCloneWithImage(target: HTMLElement, dataUrl: string): void {
  const image = target.ownerDocument.createElement('img')
  image.src = dataUrl
  image.alt = ''
  image.style.cssText = target.style.cssText

  for (const attributeName of target.getAttributeNames()) {
    if (attributeName === 'src' || attributeName === 'poster') {
      continue
    }
    image.setAttribute(attributeName, target.getAttribute(attributeName) || '')
  }

  target.replaceWith(image)
}

function applyCapturePolicy(clone: HTMLElement, policy: SavePreviewCapturePolicy): void {
  const hiddenRoles = new Set<string>()

  switch (policy.uiMode) {
    case 'hide-overlays':
      hiddenRoles.add('overlay')
      break
    case 'scene-only':
      hiddenRoles.add('overlay')
      hiddenRoles.add('safe-ui')
      hiddenRoles.add('debug')
      break
    case 'custom':
      for (const role of getRendererHintStringArray(policy.rendererHints, 'hiddenRoles')) {
        hiddenRoles.add(role)
      }
      break
    default:
      break
  }

  if (hiddenRoles.size > 0) {
    for (const element of clone.querySelectorAll<HTMLElement>('[data-qua-capture-role]')) {
      const role = element.getAttribute('data-qua-capture-role')
      if (role && hiddenRoles.has(role)) {
        element.remove()
      }
    }
  }

  if (policy.uiMode === 'custom') {
    for (const selector of getRendererHintStringArray(policy.rendererHints, 'hideSelectors')) {
      for (const element of clone.querySelectorAll<HTMLElement>(selector)) {
        element.remove()
      }
    }
  }
}

function getRendererHintStringArray(
  hints: SavePreviewCapturePolicy['rendererHints'],
  key: string,
): string[] {
  const value = hints?.[key]
  if (!Array.isArray(value)) {
    return []
  }
  return value.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0)
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

function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}
