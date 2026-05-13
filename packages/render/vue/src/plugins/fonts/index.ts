import type { QuaVueRendererPlugin } from '../core'
import type { WebFontFaceRegistryOptions } from '@quajs/renderer-web/plugins/fonts'
import { defineVueRendererPlugin } from '../core'
import { QuaFontsController } from './components'

export { QuaFontsController } from './components'

export interface FontsRendererPluginOptions {
  document?: Document
  onError?: WebFontFaceRegistryOptions['onError']
}

export function createFontsRendererPlugin(options: FontsRendererPluginOptions = {}): QuaVueRendererPlugin {
  return defineVueRendererPlugin({
    name: '@quajs/renderer-vue/plugins/fonts',
    setup() {},
    layers: [{
      id: 'fonts',
      slot: 'fonts',
      component: QuaFontsController,
      order: 5,
      plane: 'stage',
      props: { ...options },
    }],
  })
}

export const fontsRendererPlugin = createFontsRendererPlugin()
