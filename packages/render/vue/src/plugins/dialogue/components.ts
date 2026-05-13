import { motionProjectionVars, projectDialogue } from '@quajs/renderer-web'
import { defineComponent, h } from 'vue'
import { useProjectionProps } from '../../components/projection'
import { useAnimationClock, useAnimations, useDialogue, usePluginProjection, useRendererActions } from '../../composables'

export const QuaDialogueBox = defineComponent({
  name: 'QuaDialogueBox',
  setup(_, { slots }) {
    const dialogue = useDialogue()
    const dialogueProjection = usePluginProjection<Record<string, unknown>>('dialogue')
    const animations = useAnimations()
    const animationNow = useAnimationClock()
    const actions = useRendererActions()
    return () => {
      const projectedDialogue = projectDialogue(dialogue.value, animations.value, animationNow.value, dialogueProjection.value)
      return projectedDialogue.visible
        ? h('div', {
            class: 'qua-dialogue-box',
            style: motionProjectionVars(projectedDialogue as unknown as Record<string, unknown>, '--qua-dialogue'),
            onClick: (event: Event) => {
              event.stopPropagation()
              actions.advance('dialogue')
            },
          }, slots.default?.({ ...useProjectionProps(), dialogue: projectedDialogue, actions }) || [
            projectedDialogue.characterName ? h('div', { class: 'qua-dialogue-speaker' }, projectedDialogue.characterName) : null,
            h('p', { class: 'qua-dialogue-text' }, projectedDialogue.text),
          ])
        : null
    }
  },
})
