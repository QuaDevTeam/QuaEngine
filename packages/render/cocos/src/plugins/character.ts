import { LogicToRenderEvents } from '@quajs/render-core'
import { renderCocosCharacters } from '../projection'
import { defineCocosRendererPlugin } from './core'

export function createCharacterCocosRendererPlugin() {
  return defineCocosRendererPlugin({
    name: '@quajs/renderer-cocos/character',
    setup(context) {
      const sync = () => {
        void renderCocosCharacters(context.cocos).catch(error => context.reportError(error, {
          message: 'Cocos character projection failed.',
          phase: 'renderer-cocos:character',
          pluginName: '@quajs/renderer-cocos/character',
        }))
      }
      context.addDisposer(context.onLogicToRender(LogicToRenderEvents.VIEW_UPDATE, sync))
      context.addDisposer(context.onLogicToRender(LogicToRenderEvents.ASSET_CHANGED, sync))
      sync()
    },
  })
}

export const characterCocosRendererPlugin = createCharacterCocosRendererPlugin()
