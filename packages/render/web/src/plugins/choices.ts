import type { QuaWebDomLayerContext, QuaWebDomRendererPlugin } from './core'
import { defineWebRendererPlugin } from './core'

export function createChoicesWebRendererPlugin(): QuaWebDomRendererPlugin {
  return defineWebRendererPlugin({
    name: '@quajs/renderer-web/choices',
    setup() {},
    layers: [{
      id: 'choices',
      order: 60,
      render: renderChoicesLayer,
    }],
  })
}

export const choicesWebRendererPlugin = createChoicesWebRendererPlugin()

function renderChoicesLayer(context: QuaWebDomLayerContext): Node | undefined {
  if (context.view.choices.length === 0) {
    return undefined
  }

  const panel = context.document.createElement('div')
  panel.className = 'qua-choice-panel'
  panel.addEventListener('click', event => event.stopPropagation())
  for (const choice of context.view.choices) {
    const button = context.document.createElement('button')
    button.className = 'qua-choice-button'
    button.disabled = !choice.enabled
    button.textContent = choice.text
    button.addEventListener('click', (event) => {
      event.stopPropagation()
      void context.actions.selectChoice(choice.id)
    })
    panel.append(button)
  }
  return panel
}
