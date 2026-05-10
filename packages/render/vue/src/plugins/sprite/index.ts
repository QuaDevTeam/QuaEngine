import type { QuaVueRendererPlugin } from '../core'
import { defineVueRendererPlugin } from '../core'

export { QuaSprite, QuaSpriteLayerItem } from './components'

export function createSpriteRendererPlugin(): QuaVueRendererPlugin {
  return defineVueRendererPlugin({
    name: '@quajs/renderer-vue/sprite',
    setup() {},
  })
}

export const spriteRendererPlugin = createSpriteRendererPlugin()
