import { SettingsRenderToLogicEvents } from '@quajs/plugin-settings/contracts'
import { defineCocosRendererPlugin } from './core'
import { bindProjectionIntent, readPluginProjection, syncProjectionLayer } from './projection-utils'

export function createSettingsCocosRendererPlugin() {
  return defineCocosRendererPlugin({
    name: '@quajs/renderer-cocos/settings',
    setup(context) {
      syncProjectionLayer(context, {
        pluginName: '@quajs/renderer-cocos/settings',
        projectionKey: 'settings',
        layerId: 'settings',
        layerKind: 'settings-layer',
        order: 100,
        itemKey: 'scopes',
        itemKind: 'settings-scope',
        itemLabel: item => String(item.title || item.scope || 'settings'),
        itemMetadata: item => ({ settingsScope: item.scope }),
      })
      const node = context.cocos.getLayerNode('settings', 'settings-layer', 100)
      context.cocos.host.nodes.setNodeMetadata?.(node, {
        plugin: 'settings',
        projection: readPluginProjection(context, 'settings'),
      })
      bindProjectionIntent(context, {
        pluginKey: 'settings',
        metadataKey: 'settingsScope',
        eventType: SettingsRenderToLogicEvents.RESET_SCOPE_REQUEST,
        payload: metadata => typeof metadata.settingsScope === 'string' ? { scope: metadata.settingsScope } : undefined,
      })
    },
  })
}

export const settingsCocosRendererPlugin = createSettingsCocosRendererPlugin()
