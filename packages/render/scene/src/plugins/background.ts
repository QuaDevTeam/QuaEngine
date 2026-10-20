import { renderSceneBackground, syncSceneBackgroundMotion } from '../projection'
import { defineSceneRendererPlugin } from './core'
import { createSceneProjectionTask, subscribeSceneProjection } from './projection-task'

export function createBackgroundSceneRendererPlugin() {
  return defineSceneRendererPlugin({
    name: '@quajs/renderer-scene/background',
    setup(context) {
      const project = createSceneProjectionTask(context, 'background', async (scene) => {
        await renderSceneBackground(scene)
        syncSceneBackgroundMotion({ ...scene, getViewState: context.getViewState })
      }, { subscribe: false })
      const motionProperties = new Set(['x', 'y', 'width', 'height', 'scale', 'rotation', 'opacity', 'zIndex'])
      const needsResources = () => !context.scene.host.nodes.getNodeChildren || context.getViewState().animations.some(animation => animation.resolvedTracks.some(track => track.target.startsWith('background') && !motionProperties.has(track.property)))
      const identity = () => JSON.stringify([context.getViewState().background, context.scene.getAssetRevision(), context.scene.getStageLayout()])
      let previous = identity()
      let previousAssets = context.scene.assets
      context.addDisposer(subscribeSceneProjection(context, () => {
        const next = identity()
        if (next !== previous || context.scene.assets !== previousAssets || needsResources()) {
          previous = next
          previousAssets = context.scene.assets
          void project()
        }
        else {
          syncSceneBackgroundMotion(context.scene)
        }
      }))
      const sync = () => {
        void project()
      }
      context.addDisposer(context.scene.registerAnimationSync(() => {
        if (needsResources())
          sync()
        else syncSceneBackgroundMotion(context.scene)
      }))
      sync()
    },
  })
}

export const backgroundSceneRendererPlugin = createBackgroundSceneRendererPlugin()
