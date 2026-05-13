import type { QuaVueRendererPlugin } from '../core'
import { defineVueRendererPlugin } from '../core'
import { QuaAudioController } from './components'

export { QuaAudioController, WebAudioAudioRuntime } from './components'

export interface AudioRendererPluginOptions {
  autoUnlock?: boolean
  document?: Document
  unlockEvents?: readonly (keyof DocumentEventMap)[]
}

export function createAudioRendererPlugin(options: AudioRendererPluginOptions = {}): QuaVueRendererPlugin {
  return defineVueRendererPlugin({
    name: '@quajs/renderer-vue/plugins/audio',
    setup() {},
    layers: [{
      id: 'audio',
      slot: 'audio',
      component: QuaAudioController,
      order: 70,
      plane: 'stage',
      props: { ...options },
    }],
  })
}

export const audioRendererPlugin = createAudioRendererPlugin()
