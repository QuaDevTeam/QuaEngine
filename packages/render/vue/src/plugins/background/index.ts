import type { QuaVueRendererPlugin } from '../core'
import { setupBackgroundPreparation } from '@quajs/renderer-web/plugins/background'
import { defineVueRendererPlugin } from '../core'
import { QuaBackgroundLayer } from './components'

export {
  QuaBackground,
  QuaBackgroundLayer,
  QuaBackgroundLayerItem,
  QuaBackgroundProjection,
  QuaLayeredBackground,
  QuaVideoBackground,
} from './components'

export function createBackgroundRendererPlugin(): QuaVueRendererPlugin {
  return defineVueRendererPlugin({
    name: '@quajs/renderer-vue/background',
    setup: setupBackgroundPreparation,
    layers: [{
      id: 'background',
      slot: 'background',
      component: QuaBackgroundLayer,
      order: 10,
      plane: 'scene',
    }],
  })
}

export const backgroundRendererPlugin = createBackgroundRendererPlugin()
