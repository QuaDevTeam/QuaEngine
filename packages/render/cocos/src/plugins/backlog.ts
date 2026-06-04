import { BacklogRenderToLogicEvents } from '@quajs/plugin-backlog/contracts'
import { defineCocosRendererPlugin } from './core'
import { bindProjectionIntent, readPluginProjection, syncProjectionLayer } from './projection-utils'

export function createBacklogCocosRendererPlugin() {
  return defineCocosRendererPlugin({
    name: '@quajs/renderer-cocos/backlog',
    setup(context) {
      syncProjectionLayer(context, {
        pluginName: '@quajs/renderer-cocos/backlog',
        projectionKey: 'backlog',
        layerId: 'backlog',
        layerKind: 'backlog-layer',
        order: 110,
        itemKey: 'entries',
        itemKind: 'backlog-entry',
        itemLabel: item => String(item.text || item.speaker || item.id || 'backlog'),
        itemMetadata: item => ({
          backlogEntryId: item.id,
          rewindable: item.rewindable,
          voiceReplay: item.voiceReplay,
        }),
      })
      const node = context.cocos.getLayerNode('backlog', 'backlog-layer', 110)
      context.cocos.host.nodes.setNodeMetadata?.(node, {
        plugin: 'backlog',
        projection: readPluginProjection(context, 'backlog'),
      })
      bindProjectionIntent(context, {
        pluginKey: 'backlog',
        metadataKey: 'backlogEntryId',
        eventType: BacklogRenderToLogicEvents.JUMP_REQUEST,
        payload: metadata => typeof metadata.backlogEntryId === 'string' && metadata.rewindable !== false
          ? { entryId: metadata.backlogEntryId }
          : undefined,
      })
    },
  })
}

export const backlogCocosRendererPlugin = createBacklogCocosRendererPlugin()
