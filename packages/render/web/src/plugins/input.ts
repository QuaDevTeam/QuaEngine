import type { QuaWebRendererPluginContext } from '../controller'
import type { RendererInputControllerOptions } from '../input'
import type { QuaWebDomRendererPlugin } from './core'
import { createRendererInputController } from '../input'
import { defineWebRendererPlugin } from './core'

export type InputWebRendererPluginOptions = Omit<RendererInputControllerOptions, 'actions' | 'getViewState'>

export function createInputWebRendererPlugin(options: InputWebRendererPluginOptions = {}): QuaWebDomRendererPlugin {
  return defineWebRendererPlugin({
    name: '@quajs/renderer-web/input',
    setup(context) {
      const webContext = context as QuaWebRendererPluginContext
      const controller = createRendererInputController({
        ...options,
        actions: webContext.getActions(),
        getViewState: () => webContext.getViewState(),
      })
      controller.start()
      context.addDisposer(() => controller.dispose())
    },
  })
}

export const inputWebRendererPlugin = createInputWebRendererPlugin()
