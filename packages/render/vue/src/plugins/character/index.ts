import type { QuaVueRendererPlugin } from '../core'
import type { CharacterVueRendererLayerOptions } from './components'
import { defineVueRendererPlugin } from '../core'
import { QuaCharacterLayer } from './components'

export { QuaCharacter, QuaCharacterLayer } from './components'
export type { CharacterVueRendererLayerOptions } from './components'

export type CharacterVueRendererPluginOptions = CharacterVueRendererLayerOptions

export function createCharacterRendererPlugin(options: CharacterVueRendererPluginOptions = {}): QuaVueRendererPlugin {
  return defineVueRendererPlugin({
    name: '@quajs/renderer-vue/character',
    setup() {},
    layers: [{
      id: 'characters',
      slot: 'characters',
      component: QuaCharacterLayer,
      props: { ...options },
      order: 30,
      plane: 'subject',
    }],
  })
}

export const characterRendererPlugin = createCharacterRendererPlugin()
