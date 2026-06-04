import { GalleryRenderToLogicEvents } from '@quajs/plugin-gallery/contracts'
import { defineCocosRendererPlugin } from './core'
import { bindProjectionIntent, readPluginProjection, syncProjectionLayer } from './projection-utils'

export function createGalleryCocosRendererPlugin() {
  return defineCocosRendererPlugin({
    name: '@quajs/renderer-cocos/gallery',
    setup(context) {
      syncProjectionLayer(context, {
        pluginName: '@quajs/renderer-cocos/gallery',
        projectionKey: 'gallery',
        layerId: 'gallery',
        layerKind: 'gallery-layer',
        order: 120,
        itemKey: 'entries',
        itemKind: 'gallery-entry',
        itemLabel: item => String(item.title || item.id || 'gallery'),
        itemMetadata: item => ({
          galleryEntryId: item.id,
          unlocked: item.unlocked,
        }),
      })
      const node = context.cocos.getLayerNode('gallery', 'gallery-layer', 120)
      context.cocos.host.nodes.setNodeMetadata?.(node, {
        plugin: 'gallery',
        projection: readPluginProjection(context, 'gallery'),
      })
      bindProjectionIntent(context, {
        pluginKey: 'gallery',
        metadataKey: 'galleryEntryId',
        eventType: GalleryRenderToLogicEvents.SELECT_ENTRY_REQUEST,
        payload: metadata => typeof metadata.galleryEntryId === 'string'
          ? { entryId: metadata.galleryEntryId }
          : undefined,
      })
    },
  })
}

export const galleryCocosRendererPlugin = createGalleryCocosRendererPlugin()
