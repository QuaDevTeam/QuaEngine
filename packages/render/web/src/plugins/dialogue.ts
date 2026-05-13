import type { QuaWebDomLayerContext, QuaWebDomRendererPlugin } from './core'
import { motionProjectionVars, projectDialogue } from '../projection'
import { defineWebRendererPlugin } from './core'
import { applyStyleVars } from './shared'

export function createDialogueWebRendererPlugin(): QuaWebDomRendererPlugin {
  return defineWebRendererPlugin({
    name: '@quajs/renderer-web/dialogue',
    setup() {},
    layers: [{
      id: 'dialogue',
      order: 50,
      plane: 'safe',
      render: renderDialogueLayer,
      update: updateDialogueLayer,
    }],
  })
}

export const dialogueWebRendererPlugin = createDialogueWebRendererPlugin()

function renderDialogueLayer(context: QuaWebDomLayerContext): Node | undefined {
  const dialogue = projectDialogue(context.view.dialogue, context.view.animations, Date.now(), context.view.plugins.dialogue as Record<string, unknown> | undefined)
  if (!dialogue.visible) {
    return undefined
  }

  const box = context.document.createElement('div')
  box.className = 'qua-dialogue-box'
  applyStyleVars(box, motionProjectionVars(dialogue as unknown as Record<string, unknown>, '--qua-dialogue'))
  box.addEventListener('click', (event) => {
    event.stopPropagation()
    void context.actions.advance('dialogue')
  })

  if (dialogue.characterName) {
    const speaker = context.document.createElement('div')
    speaker.className = 'qua-dialogue-speaker'
    speaker.textContent = dialogue.characterName
    box.append(speaker)
  }

  const text = context.document.createElement('p')
  text.className = 'qua-dialogue-text'
  text.textContent = dialogue.text
  box.append(text)
  return box
}

function updateDialogueLayer(context: QuaWebDomLayerContext, node: Node): void {
  if (!(node instanceof HTMLElement))
    return
  const dialogue = projectDialogue(context.view.dialogue, context.view.animations, Date.now(), context.view.plugins.dialogue as Record<string, unknown> | undefined)
  applyStyleVars(node, motionProjectionVars(dialogue as unknown as Record<string, unknown>, '--qua-dialogue'))
}
