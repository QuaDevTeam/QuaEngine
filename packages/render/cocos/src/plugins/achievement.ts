import { AchievementRenderToLogicEvents } from '@quajs/plugin-achievement/contracts'
import { defineCocosRendererPlugin } from './core'
import { bindProjectionIntent, readPluginProjection, syncProjectionLayer } from './projection-utils'

export function createAchievementCocosRendererPlugin() {
  return defineCocosRendererPlugin({
    name: '@quajs/renderer-cocos/achievement',
    setup(context) {
      syncProjectionLayer(context, {
        pluginName: '@quajs/renderer-cocos/achievement',
        projectionKey: 'achievement',
        layerId: 'achievement',
        layerKind: 'achievement-layer',
        order: 130,
        itemKey: 'achievements',
        itemKind: 'achievement-item',
        itemLabel: item => String(item.title || item.id || 'achievement'),
        itemMetadata: item => ({
          achievementId: item.id,
          unlocked: item.unlocked,
        }),
      })
      const node = context.cocos.getLayerNode('achievement', 'achievement-layer', 130)
      context.cocos.host.nodes.setNodeMetadata?.(node, {
        plugin: 'achievement',
        projection: readPluginProjection(context, 'achievement'),
      })
      bindProjectionIntent(context, {
        pluginKey: 'achievement',
        metadataKey: 'achievementId',
        eventType: AchievementRenderToLogicEvents.SELECT_ACHIEVEMENT_REQUEST,
        payload: metadata => typeof metadata.achievementId === 'string'
          ? { achievementId: metadata.achievementId }
          : undefined,
      })
    },
  })
}

export const achievementCocosRendererPlugin = createAchievementCocosRendererPlugin()
