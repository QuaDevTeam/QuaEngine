import type { FontsProjection } from '@quajs/plugin-fonts/contracts'
import type { RendererPlugin } from '@quajs/render-core'
import type { QuaWebRendererPluginContext } from '../controller'
import { FONTS_PLUGIN_ID } from '@quajs/plugin-fonts/contracts'
import { LogicToRenderEvents } from '@quajs/render-core'
import { WebFontFaceRegistry } from '../fonts'

export type {
  WebFontFaceLoadState,
  WebFontFaceRecord,
  WebFontFaceRegistryOptions,
} from '../fonts'
export { WebFontFaceRegistry } from '../fonts'

export interface FontsWebRendererPluginOptions {
  document?: Document
  onError?: ConstructorParameters<typeof WebFontFaceRegistry>[0]['onError']
}

export function createFontsWebRendererPlugin(options: FontsWebRendererPluginOptions = {}): RendererPlugin {
  let registry: WebFontFaceRegistry | undefined

  return {
    name: '@quajs/renderer-web/fonts',
    setup(context) {
      const webContext = context as QuaWebRendererPluginContext
      registry = new WebFontFaceRegistry({
        getAssets: webContext.getAssets || (() => undefined),
        getProjection: () => webContext.getViewState().plugins[FONTS_PLUGIN_ID] as FontsProjection | undefined,
        document: options.document,
        onError: options.onError,
      })
      context.addDisposer(context.onLogicToRender(LogicToRenderEvents.VIEW_UPDATE, () => {
        void registry?.sync()
      }))
      context.addDisposer(context.onLogicToRender(LogicToRenderEvents.ASSET_CHANGED, () => {
        void registry?.sync({ retryFailed: true })
      }))
      void registry.sync()
    },
    async destroy() {
      await registry?.destroy()
      registry = undefined
    },
  }
}

export const fontsWebRendererPlugin = createFontsWebRendererPlugin()
