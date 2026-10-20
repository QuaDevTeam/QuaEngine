import { LogicToRenderEvents } from '@quajs/render-core'
import { renderSceneEffects } from '../projection'
import { defineSceneRendererPlugin } from './core'

export function createEffectsSceneRendererPlugin() {
  return defineSceneRendererPlugin({
    name: '@quajs/renderer-scene/effects',
    setup(context) {
      const sync = () => renderSceneEffects(context.scene)
      context.addDisposer(context.onLogicToRender(LogicToRenderEvents.VIEW_UPDATE, sync))
      context.addDisposer(context.scene.registerAnimationSync(sync))
      sync()
    },
  })
}

export const effectsSceneRendererPlugin = createEffectsSceneRendererPlugin()
