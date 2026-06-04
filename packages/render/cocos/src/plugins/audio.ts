import { LogicToRenderEvents } from '@quajs/render-core'
import { renderCocosAudio } from '../projection'
import { defineCocosRendererPlugin } from './core'

export function createAudioCocosRendererPlugin() {
  return defineCocosRendererPlugin({
    name: '@quajs/renderer-cocos/audio',
    setup(context) {
      const sync = () => {
        void renderCocosAudio(context.cocos).catch(error => context.reportError(error, {
          message: 'Cocos audio projection failed.',
          phase: 'renderer-cocos:audio',
          pluginName: '@quajs/renderer-cocos/audio',
        }))
      }
      if (!context.cocos.host.capabilities?.audioEq) {
        context.cocos.reportWarning('Cocos host does not expose audio EQ/DSP capability; audio projection will skip EQ controls.', {
          pluginName: '@quajs/renderer-cocos/audio',
        })
      }
      context.addDisposer(context.onLogicToRender(LogicToRenderEvents.VIEW_UPDATE, sync))
      context.addDisposer(context.onLogicToRender(LogicToRenderEvents.ASSET_CHANGED, sync))
      sync()
    },
  })
}

export const audioCocosRendererPlugin = createAudioCocosRendererPlugin()
