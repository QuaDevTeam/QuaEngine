import type { RendererPlugin } from '@quajs/render-core'
import type { QuaWebRendererPluginContext } from '../controller'
import { LogicToRenderEvents } from '@quajs/render-core'
import { WebAudioRendererController } from '../audio-controller'

export interface AudioWebRendererPluginOptions {
  autoUnlock?: boolean
  document?: Document
  unlockEvents?: readonly (keyof DocumentEventMap)[]
}

export function createAudioWebRendererPlugin(options: AudioWebRendererPluginOptions = {}): RendererPlugin {
  let controller: WebAudioRendererController | undefined

  return {
    name: '@quajs/renderer-web/audio',
    setup(context) {
      const webContext = context as QuaWebRendererPluginContext
      const getAssets = webContext.getAssets || (() => undefined)
      controller = new WebAudioRendererController({
        getPipeline: webContext.getPipeline,
        getAssets,
        getViewState: webContext.getViewState,
        autoUnlock: options.autoUnlock,
        document: options.document,
        unlockEvents: options.unlockEvents,
        reportError: context.reportError,
      })
      controller.start()
      context.addDisposer(context.onLogicToRender(LogicToRenderEvents.VIEW_UPDATE, () => {
        void controller?.sync()
      }))
      context.addDisposer(context.onLogicToRender(LogicToRenderEvents.ASSET_CHANGED, () => {
        void controller?.sync()
      }))
      void controller.sync()
    },
    async destroy() {
      await controller?.destroy()
      controller = undefined
    },
  }
}

export const audioWebRendererPlugin = createAudioWebRendererPlugin()
