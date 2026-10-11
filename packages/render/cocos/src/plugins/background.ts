import { renderCocosBackground, syncCocosBackgroundMotion } from '../projection'
import { defineCocosRendererPlugin } from './core'
import { createCocosProjectionTask, subscribeCocosProjection } from './projection-task'

export function createBackgroundCocosRendererPlugin() {
  return defineCocosRendererPlugin({
    name: '@quajs/renderer-cocos/background',
    setup(context) {
      const project = createCocosProjectionTask(context, 'background', async (cocos) => {
        await renderCocosBackground(cocos)
        syncCocosBackgroundMotion({ ...cocos, getViewState: context.getViewState })
      }, { subscribe: false })
      const motionProperties = new Set(['x', 'y', 'width', 'height', 'scale', 'rotation', 'opacity', 'zIndex'])
      const needsResources = () => !context.cocos.host.nodes.getNodeChildren || context.getViewState().animations.some(animation => animation.resolvedTracks.some(track => track.target.startsWith('background') && !motionProperties.has(track.property)))
      const identity = () => JSON.stringify([context.getViewState().background, context.cocos.getAssetRevision(), context.cocos.getStageLayout()])
      let previous = identity()
      let previousAssets = context.cocos.assets
      context.addDisposer(subscribeCocosProjection(context, () => {
        const next = identity()
        if (next !== previous || context.cocos.assets !== previousAssets || needsResources()) {
          previous = next
          previousAssets = context.cocos.assets
          void project()
        }
        else {
          syncCocosBackgroundMotion(context.cocos)
        }
      }))
      const sync = () => {
        void project()
      }
      context.addDisposer(context.cocos.registerAnimationSync(() => {
        if (needsResources())
          sync()
        else syncCocosBackgroundMotion(context.cocos)
      }))
      sync()
    },
  })
}

export const backgroundCocosRendererPlugin = createBackgroundCocosRendererPlugin()
