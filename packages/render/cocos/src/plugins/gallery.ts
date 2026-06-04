import type { CocosHostNode } from '@quajs/cocos-host'
import type { GalleryContentBlock, GalleryEntryProjectionItem, GalleryProjection } from '@quajs/plugin-gallery/contracts'
import type { CocosRendererPluginContext } from '../types'
import { GALLERY_PLUGIN_ID, GalleryRenderToLogicEvents } from '@quajs/plugin-gallery/contracts'
import { LogicToRenderEvents } from '@quajs/render-core'
import { defineCocosRendererPlugin } from './core'
import { resolveInputMetadataAny, stringValue } from './projection-utils'

export function createGalleryCocosRendererPlugin() {
  return defineCocosRendererPlugin({
    name: '@quajs/renderer-cocos/gallery',
    setup(context) {
      const sync = () => {
        void renderGalleryLayer(context).catch(error => context.reportError(error, {
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
          default:
            if (typeof metadata.galleryEntryId === 'string') {
              await context.getPipeline().emit(GalleryRenderToLogicEvents.SELECT_ENTRY_REQUEST, { entryId: metadata.galleryEntryId })
            }
        }
      }))
      sync()
    },
  })
}

export const galleryCocosRendererPlugin = createGalleryCocosRendererPlugin()

async function renderGalleryLayer(context: CocosRendererPluginContext): Promise<void> {
  const projection = context.getViewState().plugins[GALLERY_PLUGIN_ID] as GalleryProjection | undefined
  const layer = context.cocos.getLayerNode('gallery', 'gallery-layer', 120)
  context.cocos.host.nodes.clearChildren(layer)
  context.cocos.releaseLayerResources('gallery')
  context.cocos.host.nodes.setNodeMetadata?.(layer, {
    plugin: 'gallery',
    visible: projection?.sceneActive === true,
    projection,
  })
  if (!projection?.sceneActive)
    return

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

  renderButton(context, panel, 'gallery:close', 'Close', safeArea.x + safeArea.width - 140, safeArea.y + 24, 112, 44, {
    plugin: 'gallery',
    galleryAction: 'close',
  })
  const title = context.cocos.host.nodes.createNode('gallery-title', { parent: panel, name: 'gallery:title' })
  context.cocos.host.nodes.setNodeText(title, selectedCatalog?.title || 'Gallery', { fontSize: 32, color: '#ffffff' })
  context.cocos.host.nodes.setNodeTransform(title, { x: safeArea.x + 28, y: safeArea.y + 24, width: safeArea.width - 180, height: 48, zIndex: 1 })

  projection.catalogs.slice(0, 6).forEach((catalog, index) => {
    renderButton(context, panel, `gallery:catalog:${catalog.id}`, catalog.title, safeArea.x + 28 + index * 150, safeArea.y + 84, 136, 42, {
      plugin: 'gallery',
      galleryAction: 'selectCatalog',
      galleryCatalogId: catalog.id,
      selected: catalog.id === selectedCatalog?.id,
    }, catalog.id === selectedCatalog?.id)
  })
  renderButton(context, panel, 'gallery:filter:unlocked', 'Unlocked', safeArea.x + safeArea.width - 250, safeArea.y + 84, 110, 42, {
    plugin: 'gallery',
    galleryAction: 'toggleUnlockedOnly',
    nextUnlockedOnly: !projection.filter.unlockedOnly,
  }, projection.filter.unlockedOnly === true)

  const entries = projection.entries.filter(entry => projection.filteredEntryIds.includes(entry.id))
  entries.slice(0, 10).forEach((entry, index) => {
    renderGalleryEntry(context, panel, entry, index, safeArea.x + 28, safeArea.y + 144, 330, entry.id === selectedEntry?.id)
  })

  if (selectedEntry) {
    await renderSelectedGalleryEntry(context, panel, selectedEntry, selectedContent, safeArea.x + 390, safeArea.y + 144, safeArea.width - 420)
  }
}

function renderGalleryEntry(
  context: CocosRendererPluginContext,
  parent: CocosHostNode,
  entry: GalleryEntryProjectionItem,
  index: number,
  x: number,
  startY: number,
  width: number,
  selected: boolean,
): void {
  const node = renderButton(context, parent, `gallery:entry:${entry.id}`, entry.unlocked ? entry.title : 'Locked', x, startY + index * 58, width, 50, {
    plugin: 'gallery',
    galleryEntryId: entry.id,
    unlocked: entry.unlocked,
    selected,
  }, selected)
  context.cocos.host.nodes.setNodeMetadata?.(node, {
    ...(context.cocos.host.nodes.getNodeMetadata?.(node) || {}),
    summary: entry.summary,
    tags: entry.tags,
  })
}

async function renderSelectedGalleryEntry(
  context: CocosRendererPluginContext,
  parent: CocosHostNode,
  entry: GalleryEntryProjectionItem,
  content: GalleryContentBlock | undefined,
  x: number,
  y: number,
  width: number,
): Promise<void> {
  const title = context.cocos.host.nodes.createNode('gallery-entry-title', { parent, name: `gallery:selected:${entry.id}:title` })
  context.cocos.host.nodes.setNodeText(title, entry.title, { fontSize: 30, color: '#ffffff' })
  context.cocos.host.nodes.setNodeTransform(title, { x, y, width, height: 42, zIndex: 4 })
  if (entry.description || entry.summary) {
    const description = context.cocos.host.nodes.createNode('gallery-entry-description', { parent, name: `gallery:selected:${entry.id}:description` })
    context.cocos.host.nodes.setNodeText(description, entry.description || entry.summary || '', { fontSize: 22, color: '#d8d8d8' })
    context.cocos.host.nodes.setNodeTransform(description, { x, y: y + 48, width, height: 84, zIndex: 4 })
  }
  entry.contents.forEach((item, index) => {
    renderButton(context, parent, `gallery:content:${item.id}`, item.title || item.kind, x + index * 126, y + 136, 116, 40, {
      plugin: 'gallery',
      galleryAction: 'selectContent',
      galleryContentId: item.id,
      selected: item.id === content?.id,
    }, item.id === content?.id)
  })
  await renderGalleryContentPreview(context, parent, content, x, y + 190, width)
}

async function renderGalleryContentPreview(
  context: CocosRendererPluginContext,
  parent: CocosHostNode,
  content: GalleryContentBlock | undefined,
  x: number,
  y: number,
  width: number,
): Promise<void> {
  if (!content)
    return
  const node = context.cocos.host.nodes.createNode('gallery-content-preview', { parent, name: `gallery:preview:${content.id}` })
  context.cocos.host.nodes.setNodeTransform(node, { x, y, width, height: 360, zIndex: 5 })
  context.cocos.host.nodes.setNodeMetadata?.(node, { plugin: 'gallery', content })
  if (content.kind === 'text' && 'text' in content) {
    context.cocos.host.nodes.setNodeText(node, content.text, { fontSize: 24, color: '#ffffff' })
    return
  }
  if ((content.kind === 'image' || content.kind === 'video' || content.kind === 'audio') && 'asset' in content) {
    const ref = content.asset
    const resource = ref
      ? await context.cocos.resolveAsset(ref.type, ref.name, { targetPackageId: ref.runtimePackageId })
      : undefined
    context.cocos.setLayerResource('gallery', `content:${content.id}`, resource)
    if (content.kind === 'audio') {
      context.cocos.host.nodes.setNodeText(node, content.title || ref?.name || 'Audio', { fontSize: 24, color: '#ffffff' })
      context.cocos.host.nodes.setNodeControl?.(node, { kind: 'button', label: content.title || ref?.name || 'Audio' })
      return
    }
    context.cocos.host.nodes.setNodeSprite(node, resource, { mode: content.kind === 'video' ? 'video' : 'sprite' })
  }
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
