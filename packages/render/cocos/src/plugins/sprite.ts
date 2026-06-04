import { defineCocosRendererPlugin } from './core'
import { readPluginProjection, syncProjectionLayer } from './projection-utils'

export function createSpriteCocosRendererPlugin() {
  return defineCocosRendererPlugin({
    name: '@quajs/renderer-cocos/sprite',
    setup(context) {
      syncProjectionLayer(context, {
        pluginName: '@quajs/renderer-cocos/sprite',
        projectionKey: 'sprite',
        layerId: 'sprite',
        layerKind: 'sprite-layer',
        order: 20,
        itemKey: 'items',
        itemKind: 'sprite-item',
        itemLabel: item => String(item.name || item.id || item.sprite || 'sprite'),
        itemMetadata: item => ({ spriteId: item.id || item.sprite }),
      })
      const node = context.cocos.getLayerNode('sprite', 'sprite-layer', 20)
      context.cocos.host.nodes.setNodeMetadata?.(node, {
        plugin: 'sprite',
        projection: readPluginProjection(context, 'sprite'),
      })
    },
  })
}

export const spriteCocosRendererPlugin = createSpriteCocosRendererPlugin()
