import type { QuaVueRendererPlugin } from '../core'
import { defineVueRendererPlugin } from '../core'
import { QuaDialogueBox } from './components'

export { QuaDialogueBox } from './components'

export function createDialogueRendererPlugin(): QuaVueRendererPlugin {
  return defineVueRendererPlugin({
    name: '@quajs/renderer-vue/dialogue',
    setup() {},
    layers: [{
      id: 'dialogue',
      slot: 'dialogue',
      component: QuaDialogueBox,
      order: 50,
      plane: 'safe',
    }],
  })
}

export const dialogueRendererPlugin = createDialogueRendererPlugin()
