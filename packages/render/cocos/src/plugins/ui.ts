import { LogicToRenderEvents } from '@quajs/render-core'
import { renderCocosUi } from '../projection'
import { defineCocosRendererPlugin } from './core'

export function createUiCocosRendererPlugin() {
  return defineCocosRendererPlugin({
    name: '@quajs/renderer-cocos/ui',
    setup(context) {
      const sync = () => renderCocosUi(context.cocos)
      context.addDisposer(context.onLogicToRender(LogicToRenderEvents.VIEW_UPDATE, sync))
      sync()
    },
  })
}

export const uiCocosRendererPlugin = createUiCocosRendererPlugin()
