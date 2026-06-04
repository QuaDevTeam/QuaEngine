import { LogicToRenderEvents } from '@quajs/render-core'
import { renderCocosEffects } from '../projection'
import { defineCocosRendererPlugin } from './core'

export function createEffectsCocosRendererPlugin() {
  return defineCocosRendererPlugin({
    name: '@quajs/renderer-cocos/effects',
    setup(context) {
      const sync = () => renderCocosEffects(context.cocos)
      context.addDisposer(context.onLogicToRender(LogicToRenderEvents.VIEW_UPDATE, sync))
      sync()
    },
  })
}

export const effectsCocosRendererPlugin = createEffectsCocosRendererPlugin()
