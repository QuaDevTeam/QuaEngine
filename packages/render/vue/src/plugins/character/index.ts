import type { QuaVueRendererPlugin } from '../core'
import { defineVueRendererPlugin } from '../core'
import { QuaCharacterLayer } from './components'

export { QuaCharacter, QuaCharacterLayer } from './components'

export function createCharacterRendererPlugin(): QuaVueRendererPlugin {
  return defineVueRendererPlugin({
    name: '@quajs/renderer-vue/character',
    setup() {},
    layers: [{
      id: 'characters',
      slot: 'characters',
      component: QuaCharacterLayer,
      order: 30,
      plane: 'subject',
    }],
  })
}

export const characterRendererPlugin = createCharacterRendererPlugin()
