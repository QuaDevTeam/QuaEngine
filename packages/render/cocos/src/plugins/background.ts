import { renderCocosBackground } from '../projection'
import { defineCocosRendererPlugin } from './core'
import { createCocosProjectionTask } from './projection-task'

export function createBackgroundCocosRendererPlugin() {
  return defineCocosRendererPlugin({
    name: '@quajs/renderer-cocos/background',
    setup(context) {
      const project = createCocosProjectionTask(context, 'background', cocos => renderCocosBackground(cocos))
      const sync = () => {
        void project()
      }
      context.addDisposer(context.cocos.registerAnimationSync(sync))
      sync()
    },
  })
}

export const backgroundCocosRendererPlugin = createBackgroundCocosRendererPlugin()
