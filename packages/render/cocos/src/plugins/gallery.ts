import type { CocosHostNode } from '@quajs/cocos-host'
import type { GalleryContentBlock, GalleryEntryProjectionItem, GalleryProjection } from '@quajs/plugin-gallery/contracts'
import type { CocosRendererPluginContext } from '../types'
import { GALLERY_PLUGIN_ID, GalleryRenderToLogicEvents } from '@quajs/plugin-gallery/contracts'
import { DEFAULT_UI_OVERLAY_Z_INDEXES, LogicToRenderEvents } from '@quajs/render-core'
import { resolveCocosOverlayPlacement, resolveCocosOverlayZIndex } from '../overlay-placement'
import { defineCocosRendererPlugin } from './core'
import { resolveAssetWithTargetPackages, runtimePackageCandidatesFromAssetRef } from '../utils'
import { resolveInputMetadataAny, stringValue } from './projection-utils'

export function createGalleryCocosRendererPlugin() {
  return defineCocosRendererPlugin({
    name: '@quajs/renderer-cocos/gallery',
    setup(context) {
      const pages = new Map<string, number>()
      const audioPreviews = new Map<string, GalleryAudioPreviewHandle>()
      const lightbox: GalleryLightboxState = {}
      const sync = () => {
        void renderGalleryLayer(context, pages, audioPreviews, lightbox).catch(error => context.reportError(error, {
          message: 'Cocos gallery projection failed.',
          phase: 'renderer-cocos:gallery',
          pluginName: '@quajs/renderer-cocos/gallery',
        }))
      }
      context.addDisposer(context.onLogicToRender(LogicToRenderEvents.VIEW_UPDATE, sync))
      context.addDisposer(context.onLogicToRender(LogicToRenderEvents.ASSET_CHANGED, sync))
      context.addDisposer(context.cocos.host.input.onInput(async (event) => {
        const metadata = resolveInputMetadataAny(context, event, [
          'galleryEntryId',
          'galleryContentId',
          'galleryCatalogId',
          'galleryAction',
        ])
        if (!metadata || (metadata.plugin !== undefined && metadata.plugin !== 'gallery'))
          return
        switch (stringValue(metadata.galleryAction)) {
          case 'close':
            await context.getPipeline().emit(GalleryRenderToLogicEvents.CLOSE_REQUEST, {})
            break
          case 'selectCatalog':
            await context.getPipeline().emit(GalleryRenderToLogicEvents.SELECT_CATALOG_REQUEST, { catalogId: stringValue(metadata.galleryCatalogId) })
            break
          case 'selectContent':
            await context.getPipeline().emit(GalleryRenderToLogicEvents.SELECT_CONTENT_REQUEST, { contentId: stringValue(metadata.galleryContentId) })
            break
          case 'toggleUnlockedOnly':
            await context.getPipeline().emit(GalleryRenderToLogicEvents.UPDATE_FILTER_REQUEST, {
              filter: { unlockedOnly: metadata.nextUnlockedOnly === true },
            })
            break
          case 'search':
            await context.getPipeline().emit(GalleryRenderToLogicEvents.UPDATE_FILTER_REQUEST, {
              filter: { search: stringValue(metadata.value) || '' },
            })
            break
          case 'page':
            updatePage(pages, stringValue(metadata.galleryPageKey) || 'entries', Number(metadata.galleryPageDelta) || 0)
            sync()
            break
          case 'openLightbox': {
            const entryId = stringValue(metadata.galleryEntryId)
            const contentId = stringValue(metadata.galleryContentId)
            if (entryId) {
              await context.getPipeline().emit(GalleryRenderToLogicEvents.SELECT_ENTRY_REQUEST, { entryId })
            }
            if (resolveGalleryLightboxTarget(getGalleryProjection(context), entryId, contentId)) {
              lightbox.entryId = entryId
              lightbox.contentId = contentId
              sync()
            }
            break
          }
          case 'closeLightbox':
            clearGalleryLightbox(lightbox)
            sync()
            break
          default:
            if (typeof metadata.galleryEntryId === 'string') {
              await context.getPipeline().emit(GalleryRenderToLogicEvents.SELECT_ENTRY_REQUEST, { entryId: metadata.galleryEntryId })
            }
        }
      }))
      context.addDisposer(() => cleanupGalleryAudioPreviews(context, audioPreviews))
      sync()
    },
  })
}

export const galleryCocosRendererPlugin = createGalleryCocosRendererPlugin()

interface GalleryAudioPreviewHandle {
  handle: {
    stop: () => void | Promise<void>
    dispose: () => void | Promise<void>
  }
  resourceKey: string
}

interface GalleryLightboxState {
  entryId?: string
  contentId?: string
}

type GalleryAssetRef = NonNullable<GalleryEntryProjectionItem['thumbnail']>

async function renderGalleryLayer(
  context: CocosRendererPluginContext,
  pages: Map<string, number>,
  audioPreviews: Map<string, GalleryAudioPreviewHandle>,
  lightbox: GalleryLightboxState,
): Promise<void> {
  const projection = getGalleryProjection(context)
  const layer = context.cocos.getLayerNode('gallery', 'gallery-layer', resolveCocosOverlayZIndex(projection, {
    overlayStack: 'overlay',
    zIndex: DEFAULT_UI_OVERLAY_Z_INDEXES.gallery,
  }))
  context.cocos.host.nodes.clearChildren(layer)
  context.cocos.releaseLayerResources('gallery')
  context.cocos.host.nodes.setNodeMetadata?.(layer, {
    plugin: 'gallery',
    overlayPlacement: resolveCocosOverlayPlacement(projection, {
      overlayStack: 'overlay',
      zIndex: DEFAULT_UI_OVERLAY_Z_INDEXES.gallery,
    }),
    visible: projection?.sceneActive === true,
    projection,
  })
  if (!projection?.sceneActive) {
    clearGalleryLightbox(lightbox)
    cleanupGalleryAudioPreviews(context, audioPreviews)
    return
  }

  const safeArea = context.cocos.getStageLayout().safeArea
  const panel = context.cocos.host.nodes.createNode('gallery-panel', { parent: layer, name: 'gallery:panel' })
  context.cocos.host.nodes.setNodeTransform(panel, { x: safeArea.x, y: safeArea.y, width: safeArea.width, height: safeArea.height, zIndex: 0 })
  context.cocos.host.nodes.setNodeControl?.(panel, { kind: 'panel', label: 'Gallery' })
  context.cocos.host.nodes.setNodeMetadata?.(panel, { plugin: 'gallery', galleryAction: 'panel' })

  const selectedCatalog = projection.catalogs.find(catalog => catalog.id === projection.selectedCatalogId) || projection.catalogs[0]
  const selectedEntry = projection.entries.find(entry => entry.id === projection.selectedEntryId)
    || projection.entries.find(entry => projection.filteredEntryIds.includes(entry.id))
    || projection.entries[0]
  const selectedContent = selectedEntry?.contents.find(content => content.id === projection.selectedContentId)
    || selectedEntry?.contents[0]

  renderButton(context, panel, 'gallery:close', 'Close', safeArea.width - 140, 24, 112, 44, {
    plugin: 'gallery',
    galleryAction: 'close',
  })
  const title = context.cocos.host.nodes.createNode('gallery-title', { parent: panel, name: 'gallery:title' })
  context.cocos.host.nodes.setNodeText(title, selectedCatalog?.title || 'Gallery', { fontSize: 32, color: '#ffffff' })
  context.cocos.host.nodes.setNodeTransform(title, { x: 28, y: 24, width: safeArea.width - 180, height: 48, zIndex: 1 })
  const meta = context.cocos.host.nodes.createNode('gallery-meta', { parent: panel, name: 'gallery:meta' })
  context.cocos.host.nodes.setNodeText(meta, `${projection.filteredEntryIds.length}/${projection.entries.length} entries`, { fontSize: 18, color: '#d8d8d8' })
  context.cocos.host.nodes.setNodeTransform(meta, { x: 28, y: 62, width: safeArea.width - 180, height: 28, zIndex: 1 })

  const catalogPage = pageItems(projection.catalogs, pages.get('catalogs') || 0, 6)
  catalogPage.items.forEach((catalog, index) => {
    renderButton(context, panel, `gallery:catalog:${catalog.id}`, `${catalog.title} ${catalog.unlockedEntries}/${catalog.totalEntries}`, 28 + index * 150, 84, 136, 42, {
      plugin: 'gallery',
      galleryAction: 'selectCatalog',
      galleryCatalogId: catalog.id,
      unlockedEntries: catalog.unlockedEntries,
      totalEntries: catalog.totalEntries,
      selected: catalog.id === selectedCatalog?.id,
    }, catalog.id === selectedCatalog?.id)
  })
  renderPager(context, panel, 'gallery:catalogs', 'catalogs', catalogPage, 28 + 6 * 150, 84)
  renderButton(context, panel, 'gallery:filter:unlocked', 'Unlocked', safeArea.width - 250, 84, 110, 42, {
    plugin: 'gallery',
    galleryAction: 'toggleUnlockedOnly',
    nextUnlockedOnly: !projection.filter.unlockedOnly,
  }, projection.filter.unlockedOnly === true)
  const search = context.cocos.host.nodes.createNode('gallery-search', { parent: panel, name: 'gallery:search' })
  context.cocos.host.nodes.setNodeText(search, `Search: ${projection.filter.search || ''}`, { fontSize: 20, color: '#d8d8d8' })
  context.cocos.host.nodes.setNodeControl?.(search, {
    kind: 'input',
    value: projection.filter.search || '',
    placeholder: 'Search',
    label: 'Search',
    metadata: {
      plugin: 'gallery',
      galleryAction: 'search',
    },
  })
  context.cocos.host.nodes.setNodeTransform(search, { x: safeArea.width - 500, y: 84, width: 220, height: 42, zIndex: 10 })
  context.cocos.host.nodes.setNodeMetadata?.(search, {
    plugin: 'gallery',
    galleryAction: 'search',
  })

  const entries = projection.entries.filter(entry => projection.filteredEntryIds.includes(entry.id))
  const entryPage = pageItems(entries, pages.get('entries') || 0, 10)
  if (entries.length === 0) {
    renderEmptyState(context, panel, 'No entries', 28, 144, 330)
  }
  for (const [index, entry] of entryPage.items.entries()) {
    await renderGalleryEntry(context, panel, entry, index, 28, 144, 330, entry.id === selectedEntry?.id)
  }
  renderPager(context, panel, 'gallery:entries', 'entries', entryPage, 28, 144 + 10 * 58)

  if (selectedEntry) {
    await renderSelectedGalleryEntry(context, panel, selectedEntry, selectedContent, 390, 144, safeArea.width - 420, audioPreviews)
  }
  else {
    renderEmptyState(context, panel, 'No entry selected', 390, 144, safeArea.width - 420)
  }
  cleanupInactiveGalleryAudioPreviews(context, audioPreviews, selectedContent?.kind === 'audio' ? selectedContent.id : undefined)
  await renderGalleryLightbox(context, layer, projection, lightbox)
}

async function renderGalleryEntry(
  context: CocosRendererPluginContext,
  parent: CocosHostNode,
  entry: GalleryEntryProjectionItem,
  index: number,
  x: number,
  startY: number,
  width: number,
  selected: boolean,
): Promise<void> {
  const node = renderButton(context, parent, `gallery:entry:${entry.id}`, entry.title || 'Locked', x, startY + index * 58, width, 50, {
    plugin: 'gallery',
    galleryAction: 'openLightbox',
    galleryEntryId: entry.id,
    galleryContentId: entry.contents[0]?.id,
    unlocked: entry.unlocked,
    selected,
  }, selected)
  context.cocos.host.nodes.setNodeMetadata?.(node, {
    ...(context.cocos.host.nodes.getNodeMetadata?.(node) || {}),
    summary: entry.summary,
    tags: entry.tags,
    unlocked: entry.unlocked,
  })
  const bodyX = previewBodyX(entry)
  const status = context.cocos.host.nodes.createNode('gallery-entry-status', { parent: node, name: `gallery:entry:${entry.id}:status` })
  const badges = [entry.unlocked ? 'Unlocked' : 'Locked', ...(entry.tags || [])]
  context.cocos.host.nodes.setNodeText(status, badges.join('  '), { fontSize: 14, color: '#d8d8d8' })
  context.cocos.host.nodes.setNodeTransform(status, { x: bodyX, y: 6, width: Math.max(0, width - bodyX - 8), height: 18, zIndex: 13 })
  if (entry.summary) {
    const summary = context.cocos.host.nodes.createNode('gallery-entry-summary', { parent: node, name: `gallery:entry:${entry.id}:summary` })
    context.cocos.host.nodes.setNodeText(summary, entry.summary, { fontSize: 15, color: '#d8d8d8' })
    context.cocos.host.nodes.setNodeTransform(summary, { x: bodyX, y: 28, width: Math.max(0, width - bodyX - 8), height: 18, zIndex: 13 })
  }
  const preview = resolveGalleryEntryPreviewAsset(entry)
  const previewName = stringValue(preview?.name)
  if (preview?.type === 'images' && previewName) {
    const previewNode = context.cocos.host.nodes.createNode('gallery-entry-preview', { parent: node, name: `gallery:entry:${entry.id}:preview` })
    const resource = await resolveAssetWithTargetPackages(context.cocos, 'images', previewName, runtimePackageCandidatesFromGalleryAsset(preview))
    context.cocos.setLayerResource('gallery', `entry:${entry.id}:preview`, resource)
    context.cocos.host.nodes.setNodeSprite(previewNode, resource)
    context.cocos.host.nodes.setNodeTransform(previewNode, { x: 6, y: 6, width: 42, height: 38, zIndex: 13 })
  }
  else {
    const placeholder = context.cocos.host.nodes.createNode('gallery-entry-placeholder', { parent: node, name: `gallery:entry:${entry.id}:placeholder` })
    context.cocos.host.nodes.setNodeText(placeholder, entry.unlocked ? 'Open' : 'Locked', { fontSize: 14, color: '#d8d8d8' })
    context.cocos.host.nodes.setNodeTransform(placeholder, { x: 6, y: 6, width: 42, height: 38, zIndex: 13 })
  }
}

async function renderSelectedGalleryEntry(
  context: CocosRendererPluginContext,
  parent: CocosHostNode,
  entry: GalleryEntryProjectionItem,
  content: GalleryContentBlock | undefined,
  x: number,
  y: number,
  width: number,
  audioPreviews: Map<string, GalleryAudioPreviewHandle>,
): Promise<void> {
  const title = context.cocos.host.nodes.createNode('gallery-entry-title', { parent, name: `gallery:selected:${entry.id}:title` })
  context.cocos.host.nodes.setNodeText(title, entry.title, { fontSize: 30, color: '#ffffff' })
  context.cocos.host.nodes.setNodeTransform(title, { x, y, width, height: 42, zIndex: 4 })
  if (entry.description || entry.summary) {
    const description = context.cocos.host.nodes.createNode('gallery-entry-description', { parent, name: `gallery:selected:${entry.id}:description` })
    context.cocos.host.nodes.setNodeText(description, entry.description || entry.summary || '', { fontSize: 22, color: '#d8d8d8' })
    context.cocos.host.nodes.setNodeTransform(description, { x, y: y + 48, width, height: 84, zIndex: 4 })
  }
  const state = context.cocos.host.nodes.createNode('gallery-entry-state', { parent, name: `gallery:selected:${entry.id}:state` })
  context.cocos.host.nodes.setNodeText(state, [entry.unlocked ? 'Unlocked' : 'Locked', ...(entry.tags || [])].join('  '), { fontSize: 18, color: '#d8d8d8' })
  context.cocos.host.nodes.setNodeTransform(state, { x, y: y + 112, width, height: 28, zIndex: 4 })
  entry.contents.forEach((item, index) => {
    renderButton(context, parent, `gallery:content:${item.id}`, item.title || item.kind, x + index * 126, y + 136, 116, 40, {
      plugin: 'gallery',
      galleryAction: 'selectContent',
      galleryContentId: item.id,
      selected: item.id === content?.id,
    }, item.id === content?.id)
  })
  await renderGalleryContentPreview(context, parent, entry.id, content, x, y + 190, width, audioPreviews)
}

async function renderGalleryContentPreview(
  context: CocosRendererPluginContext,
  parent: CocosHostNode,
  entryId: string,
  content: GalleryContentBlock | undefined,
  x: number,
  y: number,
  width: number,
  audioPreviews: Map<string, GalleryAudioPreviewHandle>,
): Promise<void> {
  if (!content)
    return
  const node = context.cocos.host.nodes.createNode('gallery-content-preview', { parent, name: `gallery:preview:${content.id}` })
  context.cocos.host.nodes.setNodeTransform(node, { x, y, width, height: 360, zIndex: 5 })
  context.cocos.host.nodes.setNodeMetadata?.(node, {
    plugin: 'gallery',
    galleryAction: 'openLightbox',
    galleryEntryId: entryId,
    galleryContentId: content.id,
    content,
  })
  if (content.kind === 'text' && 'text' in content) {
    context.cocos.host.nodes.setNodeText(node, content.text, { fontSize: 24, color: '#ffffff' })
    return
  }
  if ((content.kind === 'image' || content.kind === 'video' || content.kind === 'audio') && 'asset' in content) {
    const ref = content.asset
    const resource = ref
      ? await resolveAssetWithTargetPackages(context.cocos, ref.type, ref.name, runtimePackageCandidatesFromAssetRef(ref as unknown as Record<string, unknown>))
      : undefined
    context.cocos.setLayerResource('gallery', `content:${content.id}`, resource)
    if (content.kind === 'audio') {
      context.cocos.host.nodes.setNodeText(node, content.title || ref?.name || 'Audio', { fontSize: 24, color: '#ffffff' })
      context.cocos.host.nodes.setNodeControl?.(node, { kind: 'button', label: content.title || ref?.name || 'Audio' })
      if (resource && !audioPreviews.has(content.id)) {
        const handle = await context.cocos.host.audio.createAudioHandle(resource, {
          id: `gallery:${content.id}:audio`,
          loop: false,
          volume: 1,
          bus: 'sfx',
        })
        const resourceKey = `content:${content.id}:audio`
        context.cocos.setLayerResource('gallery-audio', resourceKey, resource)
        audioPreviews.set(content.id, { handle, resourceKey })
      }
      return
    }
    context.cocos.host.nodes.setNodeSprite(node, resource, { mode: content.kind === 'video' ? 'video' : 'sprite' })
    context.cocos.host.nodes.setNodeControl?.(node, {
      kind: content.kind === 'video' ? 'panel' : 'button',
      label: content.title || ref?.name || content.kind,
      metadata: {
        plugin: 'gallery',
        galleryAction: 'openLightbox',
        galleryEntryId: entryId,
        galleryContentId: content.id,
        mediaKind: content.kind,
      },
    })
    return
  }
  context.cocos.host.nodes.setNodeText(node, JSON.stringify(content, null, 2), { fontSize: 20, color: '#ffffff' })
}

function renderPager(
  context: CocosRendererPluginContext,
  parent: CocosHostNode,
  prefix: string,
  pageKey: string,
  page: PageResult<unknown>,
  x: number,
  y: number,
): void {
  renderButton(context, parent, `${prefix}:prev`, 'Prev', x, y, 72, 42, {
    plugin: 'gallery',
    galleryAction: 'page',
    galleryPageKey: pageKey,
    galleryPageDelta: -1,
  }, false)
  renderButton(context, parent, `${prefix}:next`, 'Next', x + 82, y, 72, 42, {
    plugin: 'gallery',
    galleryAction: 'page',
    galleryPageKey: pageKey,
    galleryPageDelta: 1,
  }, false)
  const label = context.cocos.host.nodes.createNode('gallery-page-label', { parent, name: `${prefix}:label` })
  context.cocos.host.nodes.setNodeText(label, `${page.page + 1}/${page.pageCount}`, { fontSize: 18, color: '#d8d8d8' })
  context.cocos.host.nodes.setNodeTransform(label, { x: x + 164, y, width: 72, height: 42, zIndex: 10 })
}

interface PageResult<T> {
  items: readonly T[]
  page: number
  pageCount: number
}

function pageItems<T>(items: readonly T[], requestedPage: number, pageSize: number): PageResult<T> {
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize))
  const page = Math.min(pageCount - 1, Math.max(0, requestedPage))
  return {
    items: items.slice(page * pageSize, page * pageSize + pageSize),
    page,
    pageCount,
  }
}

function updatePage(pages: Map<string, number>, key: string, delta: number): void {
  pages.set(key, Math.max(0, (pages.get(key) || 0) + delta))
}

function getGalleryProjection(context: CocosRendererPluginContext): GalleryProjection | undefined {
  return context.getViewState().plugins[GALLERY_PLUGIN_ID] as GalleryProjection | undefined
}

function clearGalleryLightbox(lightbox: GalleryLightboxState): void {
  lightbox.entryId = undefined
  lightbox.contentId = undefined
}

function resolveGalleryLightboxTarget(
  projection: GalleryProjection | undefined,
  entryId: string | undefined,
  contentId: string | undefined,
): { entry: GalleryEntryProjectionItem, content?: GalleryContentBlock, asset?: GalleryAssetRef } | undefined {
  const entry = entryId ? projection?.entries.find(item => item.id === entryId) : undefined
  if (!entry)
    return undefined

  const content = contentId
    ? entry.contents.find(item => item.id === contentId) || entry.contents[0]
    : entry.contents[0]
  const asset = content ? resolveGalleryContentAsset(content) : resolveGalleryEntryPreviewAsset(entry)
  if (!content && !asset)
    return undefined
  return { entry, content, asset }
}

async function renderGalleryLightbox(
  context: CocosRendererPluginContext,
  parent: CocosHostNode,
  projection: GalleryProjection,
  lightbox: GalleryLightboxState,
): Promise<void> {
  const target = resolveGalleryLightboxTarget(projection, lightbox.entryId, lightbox.contentId)
  if (!target) {
    clearGalleryLightbox(lightbox)
    return
  }

  const safeArea = context.cocos.getStageLayout().safeArea
  const overlay = context.cocos.host.nodes.createNode('gallery-lightbox', { parent, name: 'gallery:lightbox' })
  context.cocos.host.nodes.setNodeTransform(overlay, { x: safeArea.x, y: safeArea.y, width: safeArea.width, height: safeArea.height, zIndex: 100 })
  context.cocos.host.nodes.setNodeControl?.(overlay, { kind: 'panel', label: target.entry.title })
  context.cocos.host.nodes.setNodeMetadata?.(overlay, {
    plugin: 'gallery',
    galleryAction: 'closeLightbox',
    galleryEntryId: target.entry.id,
    galleryContentId: target.content?.id,
  })

  const frameInsetX = Math.max(48, safeArea.width * 0.06)
  const frameInsetY = Math.max(56, safeArea.height * 0.08)
  const frameWidth = Math.max(0, safeArea.width - frameInsetX * 2)
  const frameHeight = Math.max(0, safeArea.height - frameInsetY * 2)
  const frame = context.cocos.host.nodes.createNode('gallery-lightbox-frame', { parent: overlay, name: 'gallery:lightbox:frame' })
  context.cocos.host.nodes.setNodeTransform(frame, {
    x: frameInsetX,
    y: frameInsetY,
    width: frameWidth,
    height: frameHeight,
    zIndex: 101,
  })
  context.cocos.host.nodes.setNodeControl?.(frame, { kind: 'panel', label: target.entry.title })
  context.cocos.host.nodes.setNodeMetadata?.(frame, {
    plugin: 'gallery',
    galleryAction: 'panel',
    galleryEntryId: target.entry.id,
    galleryContentId: target.content?.id,
  })

  renderButton(context, frame, 'gallery:lightbox:close', 'Close', Math.max(0, frameWidth - 132), 18, 112, 44, {
    plugin: 'gallery',
    galleryAction: 'closeLightbox',
    galleryEntryId: target.entry.id,
    galleryContentId: target.content?.id,
  })

  const mediaX = 32
  const mediaY = 78
  const mediaWidth = Math.max(0, frameWidth - 64)
  const mediaHeight = Math.max(0, frameHeight - 150)
  await renderGalleryLightboxMedia(context, frame, target, mediaX, mediaY, mediaWidth, mediaHeight)

  const caption = context.cocos.host.nodes.createNode('gallery-lightbox-caption', { parent: frame, name: 'gallery:lightbox:caption' })
  context.cocos.host.nodes.setNodeText(caption, target.content?.title || target.entry.title, { fontSize: 24, color: '#ffffff' })
  context.cocos.host.nodes.setNodeTransform(caption, { x: mediaX, y: mediaY + mediaHeight + 20, width: mediaWidth, height: 42, zIndex: 102 })
}

async function renderGalleryLightboxMedia(
  context: CocosRendererPluginContext,
  parent: CocosHostNode,
  target: { entry: GalleryEntryProjectionItem, content?: GalleryContentBlock, asset?: GalleryAssetRef },
  x: number,
  y: number,
  width: number,
  height: number,
): Promise<void> {
  const media = context.cocos.host.nodes.createNode('gallery-lightbox-media', { parent, name: 'gallery:lightbox:media' })
  context.cocos.host.nodes.setNodeTransform(media, { x, y, width, height, zIndex: 102 })
  context.cocos.host.nodes.setNodeMetadata?.(media, {
    plugin: 'gallery',
    galleryAction: 'panel',
    galleryEntryId: target.entry.id,
    galleryContentId: target.content?.id,
    mediaKind: target.content?.kind,
  })

  if (target.asset) {
    const resource = await resolveAssetWithTargetPackages(
      context.cocos,
      target.asset.type,
      target.asset.name,
      runtimePackageCandidatesFromGalleryAsset(target.asset),
    )
    context.cocos.setLayerResource('gallery', `lightbox:${target.entry.id}:${target.content?.id || 'preview'}`, resource)
    if (target.asset.type === 'audio') {
      context.cocos.host.nodes.setNodeText(media, target.content?.title || target.asset.name || target.entry.title, { fontSize: 28, color: '#ffffff' })
      context.cocos.host.nodes.setNodeControl?.(media, { kind: 'panel', label: target.content?.title || target.asset.name || target.entry.title })
      return
    }
    context.cocos.host.nodes.setNodeSprite(media, resource, { mode: target.asset.type === 'video' ? 'video' : 'sprite' })
    context.cocos.host.nodes.setNodeControl?.(media, { kind: 'panel', label: target.content?.title || target.asset.name || target.entry.title })
    return
  }

  if (target.content?.kind === 'text' && 'text' in target.content) {
    context.cocos.host.nodes.setNodeText(media, target.content.text, { fontSize: 28, color: '#ffffff' })
    return
  }

  if (target.content) {
    context.cocos.host.nodes.setNodeText(media, JSON.stringify(target.content, null, 2), { fontSize: 20, color: '#ffffff' })
  }
}

function resolveGalleryEntryPreviewAsset(entry: GalleryEntryProjectionItem | undefined): GalleryAssetRef | undefined {
  if (!entry)
    return undefined
  if (entry.thumbnail)
    return entry.thumbnail
  if (entry.poster)
    return entry.poster
  for (const content of entry.contents) {
    const asset = resolveGalleryContentPreviewAsset(content)
    if (asset)
      return asset
  }
  return undefined
}

function resolveGalleryContentPreviewAsset(content: GalleryContentBlock | undefined): GalleryAssetRef | undefined {
  if (!content || !('asset' in content))
    return undefined
  if (content.kind === 'video' && 'poster' in content && content.poster)
    return content.poster
  if (content.kind === 'audio' && 'poster' in content && content.poster)
    return content.poster
  if (content.kind === 'image' || content.kind === 'video' || content.kind === 'audio')
    return content.asset
  return undefined
}

function resolveGalleryContentAsset(content: GalleryContentBlock | undefined): GalleryAssetRef | undefined {
  if (!content || !('asset' in content))
    return undefined
  if (content.kind === 'image' || content.kind === 'video' || content.kind === 'audio')
    return content.asset
  return undefined
}

function runtimePackageCandidatesFromGalleryAsset(asset: GalleryAssetRef): readonly string[] | undefined {
  return runtimePackageCandidatesFromAssetRef(asset as unknown as Record<string, unknown>)
}

function previewBodyX(entry: GalleryEntryProjectionItem): number {
  return resolveGalleryEntryPreviewAsset(entry) ? 58 : 12
}

function renderEmptyState(
  context: CocosRendererPluginContext,
  parent: CocosHostNode,
  label: string,
  x: number,
  y: number,
  width: number,
): void {
  const node = context.cocos.host.nodes.createNode('gallery-empty', { parent, name: `gallery:empty:${label}` })
  context.cocos.host.nodes.setNodeText(node, label, { fontSize: 22, color: '#d8d8d8' })
  context.cocos.host.nodes.setNodeTransform(node, { x, y, width, height: 48, zIndex: 10 })
}

function cleanupInactiveGalleryAudioPreviews(
  context: CocosRendererPluginContext,
  handles: Map<string, GalleryAudioPreviewHandle>,
  activeContentId?: string,
): void {
  for (const [contentId, record] of [...handles]) {
    if (contentId === activeContentId)
      continue
    void record.handle.stop()
    void record.handle.dispose()
    context.cocos.setLayerResource('gallery-audio', record.resourceKey, undefined)
    handles.delete(contentId)
  }
}

function cleanupGalleryAudioPreviews(context: CocosRendererPluginContext, handles: Map<string, GalleryAudioPreviewHandle>): void {
  cleanupInactiveGalleryAudioPreviews(context, handles, undefined)
}

function renderButton(
  context: CocosRendererPluginContext,
  parent: CocosHostNode,
  name: string,
  label: string,
  x: number,
  y: number,
  width: number,
  height: number,
  metadata: Record<string, unknown>,
  selected = false,
): CocosHostNode {
  const node = context.cocos.host.nodes.createNode('gallery-button', { parent, name })
  context.cocos.host.nodes.setNodeText(node, label, { fontSize: 20, color: selected ? '#ffffff' : '#d8d8d8' })
  context.cocos.host.nodes.setNodeControl?.(node, { kind: 'button', label, selected })
  context.cocos.host.nodes.setNodeTransform(node, { x, y, width, height, zIndex: selected ? 12 : 10 })
  context.cocos.host.nodes.setNodeMetadata?.(node, metadata)
  return node
}
