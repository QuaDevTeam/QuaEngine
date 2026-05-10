import type { QuaVueRendererPlugin } from '../core'
import { SPRITE_CAPABILITY } from '@quajs/plugin-sprite/contracts'
import { defineVueRendererPlugin } from '../core'

export { QuaSprite, QuaSpriteLayerItem } from './components'

export function createSpriteRendererPlugin(): QuaVueRendererPlugin {
  return defineVueRendererPlugin({
    name: '@quajs/renderer-vue/sprite',
    provides: [SPRITE_CAPABILITY],
    setup() {},
  })
}

export const spriteRendererPlugin = createSpriteRendererPlugin()
