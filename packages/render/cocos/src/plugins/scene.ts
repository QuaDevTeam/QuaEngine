import { LogicToRenderEvents } from '@quajs/render-core'
import { defineCocosRendererPlugin } from './core'

export function createSceneCocosRendererPlugin() {
  return defineCocosRendererPlugin({
    name: '@quajs/renderer-cocos/scene',
    setup(context) {
      context.addDisposer(context.onLogicToRender(LogicToRenderEvents.SCENE_CHANGE, (payload) => {
        const layer = context.cocos.getLayerNode('scene', 'scene-layer', 80)
        context.cocos.host.nodes.setNodeMetadata?.(layer, {
          fromScene: payload.fromScene,
          toScene: payload.toScene,
          transition: payload.transition,
        })
      }))
    },
  })
}

export const sceneCocosRendererPlugin = createSceneCocosRendererPlugin()
