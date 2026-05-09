import { defineComponent, h } from 'vue'
import { useProjectionProps } from '../../components/projection'
import { useDialogue, useRendererActions } from '../../composables'

export const QuaDialogueBox = defineComponent({
  name: 'QuaDialogueBox',
  setup(_, { slots }) {
    const dialogue = useDialogue()
    const actions = useRendererActions()
    return () => dialogue.value.visible
      ? h('div', {
          class: 'qua-dialogue-box',
          onClick: (event: Event) => {
            event.stopPropagation()
            actions.advance('dialogue')
          },
        }, slots.default?.({ ...useProjectionProps(), dialogue: dialogue.value, actions }) || [
          dialogue.value.characterName ? h('div', { class: 'qua-dialogue-speaker' }, dialogue.value.characterName) : null,
          h('p', { class: 'qua-dialogue-text' }, dialogue.value.text),
        ])
      : null
  },
})
