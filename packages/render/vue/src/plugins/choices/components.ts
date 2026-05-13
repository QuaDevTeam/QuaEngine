import { motionProjectionVars, projectChoices } from '@quajs/renderer-web'
import { defineComponent, h } from 'vue'
import { useProjectionProps } from '../../components/projection'
import { useAnimationClock, useAnimations, useChoices, usePluginProjection, useRendererActions } from '../../composables'

export const QuaChoiceButton = defineComponent({
  name: 'QuaChoiceButton',
  props: {
    choice: {
      type: Object,
      required: true,
    },
  },
  emits: ['select'],
  setup(props: any, { emit }) {
    return () => h('button', {
      class: 'qua-choice-button',
      style: motionProjectionVars(props.choice as unknown as Record<string, unknown>, '--qua-choice'),
      disabled: !props.choice.enabled,
      onClick: (event: Event) => {
        event.stopPropagation()
        emit('select')
      },
    }, props.choice.text)
  },
})

export const QuaChoicePanel = defineComponent({
  name: 'QuaChoicePanel',
  setup(_, { slots }) {
    const choices = useChoices()
    const choicesProjection = usePluginProjection<Record<string, unknown>>('choices')
    const animations = useAnimations()
    const animationNow = useAnimationClock()
    const actions = useRendererActions()
    return () => {
      const projected = projectChoices(choices.value, animations.value, animationNow.value, choicesProjection.value)
      return projected.choices.length
        ? h('div', {
            class: 'qua-choice-panel',
            style: motionProjectionVars(projected.panel, '--qua-choices'),
            onClick: (event: Event) => event.stopPropagation(),
          }, slots.default?.({ ...useProjectionProps(), choices: projected.choices, actions }) || projected.choices.map(choice =>
            slots.choice?.({ ...useProjectionProps(), choice, actions }) || h(QuaChoiceButton, {
              key: choice.id,
              choice,
              onSelect: () => actions.selectChoice(choice.id),
            }),
          ))
        : null
    }
  },
})
