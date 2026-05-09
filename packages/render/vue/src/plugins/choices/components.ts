import { defineComponent, h } from 'vue'
import { useProjectionProps } from '../../components/projection'
import { useChoices, useRendererActions } from '../../composables'

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
    const actions = useRendererActions()
    return () => choices.value.length
      ? h('div', {
          class: 'qua-choice-panel',
          onClick: (event: Event) => event.stopPropagation(),
        }, slots.default?.({ ...useProjectionProps(), choices: choices.value, actions }) || choices.value.map(choice =>
          slots.choice?.({ ...useProjectionProps(), choice, actions }) || h(QuaChoiceButton, {
            key: choice.id,
            choice,
            onSelect: () => actions.selectChoice(choice.id),
          }),
        ))
      : null
  },
})
