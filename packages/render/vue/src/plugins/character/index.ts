import type { QuaVueRendererPlugin } from '../core'
import { defineVueRendererPlugin } from '../core'
import { SPRITE_CAPABILITY } from '@quajs/plugin-sprite/contracts'
import { QuaCharacterLayer } from './components'

export { QuaCharacter, QuaCharacterLayer } from './components'

export function createCharacterRendererPlugin(): QuaVueRendererPlugin {
  return defineVueRendererPlugin({
    name: '@quajs/renderer-vue/character',
    provides: ['quajs.character.v1'],
    requires: [SPRITE_CAPABILITY],
    setup() {},
    layers: [{
      id: 'characters',
      slot: 'characters',
      component: QuaCharacterLayer,
      order: 30,
    }],
  })
}

export const characterRendererPlugin = createCharacterRendererPlugin()
