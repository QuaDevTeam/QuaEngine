import type { QuaVueRendererPlugin } from '../core'
import { defineVueRendererPlugin } from '../core'
import { QuaEffectLayer } from './components'

export { QuaEffectLayer } from './components'

export function createEffectsRendererPlugin(): QuaVueRendererPlugin {
  return defineVueRendererPlugin({
    name: '@quajs/renderer-vue/effects',
    setup() {},
    layers: [{
      id: 'effects',
      slot: 'effects',
      component: QuaEffectLayer,
      order: 40,
      plane: 'stage',
    }],
  })
}

export const effectsRendererPlugin = createEffectsRendererPlugin()
