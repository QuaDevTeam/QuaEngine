import type { QuaVueRendererPlugin } from '../core'
import { defineVueRendererPlugin } from '../core'
import { QuaChoicePanel } from './components'

export { QuaChoiceButton, QuaChoicePanel } from './components'

export function createChoicesRendererPlugin(): QuaVueRendererPlugin {
  return defineVueRendererPlugin({
    name: '@quajs/renderer-vue/choices',
    setup() {},
    layers: [{
      id: 'choices',
      slot: 'choices',
      component: QuaChoicePanel,
      order: 60,
      plane: 'safe',
    }],
  })
}

export const choicesRendererPlugin = createChoicesRendererPlugin()
