import type { QuaWebDomLayerContext, QuaWebDomRendererPlugin } from './core'
import { defineWebRendererPlugin } from './core'

export function createDialogueWebRendererPlugin(): QuaWebDomRendererPlugin {
  return defineWebRendererPlugin({
    name: '@quajs/renderer-web/dialogue',
    setup() {},
    layers: [{
      id: 'dialogue',
      order: 50,
      render: renderDialogueLayer,
    }],
  })
}

export const dialogueWebRendererPlugin = createDialogueWebRendererPlugin()

function renderDialogueLayer(context: QuaWebDomLayerContext): Node | undefined {
  const dialogue = context.view.dialogue
  if (!dialogue.visible) {
    return undefined
  }

  const box = context.document.createElement('div')
  box.className = 'qua-dialogue-box'
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
