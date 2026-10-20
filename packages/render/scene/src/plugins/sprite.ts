import { defineSceneRendererPlugin } from './core'
import { readPluginProjection, syncProjectionLayer } from './projection-utils'

export function createSpriteSceneRendererPlugin() {
  return defineSceneRendererPlugin({
    name: '@quajs/renderer-scene/sprite',
    setup(context) {
      syncProjectionLayer(context, {
        pluginName: '@quajs/renderer-scene/sprite',
        projectionKey: 'sprite',
        layerId: 'sprite',
        layerKind: 'sprite-layer',
        order: 20,
        itemKey: 'items',
        itemKind: 'sprite-item',
        itemLabel: item => String(item.name || item.id || item.sprite || 'sprite'),
        itemMetadata: item => ({ spriteId: item.id || item.sprite }),
      })
      const node = context.scene.getLayerNode('sprite', 'sprite-layer', 20)
      context.scene.host.nodes.setNodeMetadata?.(node, {
        plugin: 'sprite',
        projection: readPluginProjection(context, 'sprite'),
      })
    },
  })
}

export const spriteSceneRendererPlugin = createSpriteSceneRendererPlugin()
