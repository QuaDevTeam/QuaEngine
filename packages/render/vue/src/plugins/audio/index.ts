import type { QuaVueRendererPlugin } from '../core'
import { defineVueRendererPlugin } from '../core'
import { QuaAudioController } from './components'

export { QuaAudioController, WebAudioAudioRuntime } from './components'

export function createAudioRendererPlugin(): QuaVueRendererPlugin {
  return defineVueRendererPlugin({
    name: '@quajs/renderer-vue/plugins/audio',
    setup() {},
    layers: [{
      id: 'audio',
      slot: 'audio',
      component: QuaAudioController,
      order: 70,
    }],
  })
}

export const audioRendererPlugin = createAudioRendererPlugin()
