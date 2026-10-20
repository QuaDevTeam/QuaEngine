import { LogicToRenderEvents, RenderToLogicEvents } from '@quajs/render-core'
import { captureSceneSavePreview } from '../projection'
import { defineSceneRendererPlugin } from './core'

export function createSavePreviewSceneRendererPlugin() {
  return defineSceneRendererPlugin({
    name: '@quajs/renderer-scene/save-preview',
    setup(context) {
      context.addDisposer(context.onLogicToRender(LogicToRenderEvents.SAVE_PREVIEW_CAPTURE_REQUEST, async (payload) => {
        try {
          await captureSceneSavePreview(context.scene, context.getViewState(), payload)
        }
        catch (error) {
          await context.emitRenderToLogic(RenderToLogicEvents.SAVE_PREVIEW_CAPTURE_ERROR, {
            requestId: payload.requestId,
            saveOpId: payload.saveOpId,
            slotId: payload.slotId,
            timestamp: context.scene.host.runtime.now(),
            message: error instanceof Error ? error.message : String(error),
            recoverable: true,
          })
        }
      }))
    },
  })
}

export const savePreviewSceneRendererPlugin = createSavePreviewSceneRendererPlugin()
