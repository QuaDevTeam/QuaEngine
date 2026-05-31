import type { QuaWebDomLayerContext, QuaWebDomRendererPlugin } from './core'
import { motionProjectionVars, projectChoices } from '../projection'
import { bindUiControlSkin } from '../ui-skin'
import { defineWebRendererPlugin } from './core'
import { applyStyleVars, dispatchRendererIntent } from './shared'

export function createChoicesWebRendererPlugin(): QuaWebDomRendererPlugin {
  return defineWebRendererPlugin({
    name: '@quajs/renderer-web/choices',
    setup() {},
    layers: [{
      id: 'choices',
      order: 60,
      plane: 'safe',
      render: renderChoicesLayer,
      update: updateChoicesLayer,
    }],
  })
}

export const choicesWebRendererPlugin = createChoicesWebRendererPlugin()

function renderChoicesLayer(context: QuaWebDomLayerContext): Node | undefined {
  const projection = projectChoices(context.view.choices, context.view.animations, Date.now(), context.view.plugins.choices as Record<string, unknown> | undefined)
  if (projection.choices.length === 0) {
    return undefined
  }

  const panel = context.document.createElement('div')
  panel.className = 'qua-choice-panel'
  applyStyleVars(panel, motionProjectionVars(projection.panel, '--qua-choices'))
  bindUiControlSkin(context, panel, {
    kind: 'panel',
  })
  panel.addEventListener('click', event => event.stopPropagation())
  for (const choice of projection.choices) {
    const button = context.document.createElement('button')
    button.className = 'qua-choice-button'
    button.setAttribute('data-choice-id', choice.id)
    button.disabled = !choice.enabled
    button.textContent = choice.text
    applyStyleVars(button, motionProjectionVars(choice as unknown as Record<string, unknown>, '--qua-choice'))
    bindUiControlSkin(context, button, {
      kind: 'button',
      skinId: choice.presentation?.skinId,
      disabled: !choice.enabled,
    })
    button.addEventListener('click', (event) => {
      event.stopPropagation()
      dispatchRendererIntent(context, () => context.actions.selectChoice(choice.id), {
        phase: 'choices:select',
        metadata: { choiceId: choice.id },
      })
    })
    panel.append(button)
  }
  return panel
}

function updateChoicesLayer(context: QuaWebDomLayerContext, node: Node): void {
  if (!(node instanceof HTMLElement))
    return
  const projection = projectChoices(context.view.choices, context.view.animations, Date.now(), context.view.plugins.choices as Record<string, unknown> | undefined)
  applyStyleVars(node, motionProjectionVars(projection.panel, '--qua-choices'))
  for (const choice of projection.choices) {
    const button = node.querySelector(`[data-choice-id="${cssEscape(choice.id)}"]`)
    if (button instanceof HTMLElement) {
      applyStyleVars(button, motionProjectionVars(choice as unknown as Record<string, unknown>, '--qua-choice'))
    }
  }
}

function cssEscape(value: string): string {
  return typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
    ? CSS.escape(value)
    : value.replace(/"/g, '\\"')
}
