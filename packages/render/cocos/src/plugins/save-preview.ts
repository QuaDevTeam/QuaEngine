import { LogicToRenderEvents, RenderToLogicEvents } from '@quajs/render-core'
import { captureCocosSavePreview } from '../projection'
import { defineCocosRendererPlugin } from './core'

export function createSavePreviewCocosRendererPlugin() {
  return defineCocosRendererPlugin({
    name: '@quajs/renderer-cocos/save-preview',
    setup(context) {
      context.addDisposer(context.onLogicToRender(LogicToRenderEvents.SAVE_PREVIEW_CAPTURE_REQUEST, async (payload) => {
        try {
          await captureCocosSavePreview(context.cocos, context.getViewState(), payload)
        }
        catch (error) {
          await context.emitRenderToLogic(RenderToLogicEvents.SAVE_PREVIEW_CAPTURE_ERROR, {
            requestId: payload.requestId,
            saveOpId: payload.saveOpId,
            slotId: payload.slotId,
            timestamp: context.cocos.host.runtime.now(),
            message: error instanceof Error ? error.message : String(error),
            recoverable: true,
          })
        }
      }))
    },
  })
}

export const savePreviewCocosRendererPlugin = createSavePreviewCocosRendererPlugin()
