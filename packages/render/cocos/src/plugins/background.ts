import { LogicToRenderEvents } from '@quajs/render-core'
import { renderCocosBackground } from '../projection'
import { defineCocosRendererPlugin } from './core'

export function createBackgroundCocosRendererPlugin() {
  return defineCocosRendererPlugin({
    name: '@quajs/renderer-cocos/background',
    setup(context) {
      const sync = () => {
        void renderCocosBackground(context.cocos).catch(error => context.reportError(error, {
          message: 'Cocos background projection failed.',
          phase: 'renderer-cocos:background',
          pluginName: '@quajs/renderer-cocos/background',
        }))
      }
      context.addDisposer(context.onLogicToRender(LogicToRenderEvents.VIEW_UPDATE, sync))
      context.addDisposer(context.onLogicToRender(LogicToRenderEvents.ASSET_CHANGED, sync))
      context.addDisposer(context.cocos.registerAnimationSync(sync))
      sync()
    },
  })
}

export const backgroundCocosRendererPlugin = createBackgroundCocosRendererPlugin()
