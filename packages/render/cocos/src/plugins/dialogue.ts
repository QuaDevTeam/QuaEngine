import { LogicToRenderEvents } from '@quajs/render-core'
import { renderCocosDialogue } from '../projection'
import { defineCocosRendererPlugin } from './core'

export function createDialogueCocosRendererPlugin() {
  return defineCocosRendererPlugin({
    name: '@quajs/renderer-cocos/dialogue',
    setup(context) {
      const sync = () => renderCocosDialogue(context.cocos)
      context.addDisposer(context.onLogicToRender(LogicToRenderEvents.VIEW_UPDATE, sync))
      sync()
    },
  })
}

export const dialogueCocosRendererPlugin = createDialogueCocosRendererPlugin()
