import { motionProjectionVars, projectChoices } from '@quajs/renderer-web'
import { defineComponent, h } from 'vue'
import { useProjectionProps } from '../../components/projection'
import { useAnimationClock, useAnimations, useChoices, usePluginProjection, useUiControlSkin } from '../../composables'
import { useQuaRenderer } from '../../context'
import { dispatchVueRendererIntent } from '../shared/intent'

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
    const skin = useUiControlSkin({
      kind: 'button',
      skinId: () => props.choice.presentation?.skinId,
      disabled: () => !props.choice.enabled,
    })
    return () => h('button', {
      'class': 'qua-choice-button',
      'style': [motionProjectionVars(props.choice as unknown as Record<string, unknown>, '--qua-choice'), skin.skinStyle.value],
      'disabled': !props.choice.enabled,
      'data-skin-kind': 'button',
      'data-skin-reference': skin.skinReference.value || undefined,
      'data-skin-state': skin.skinState.value,
      'onMouseenter': () => skin.setInteractiveState('hover'),
      'onMouseleave': () => skin.setInteractiveState('default'),
      'onMousedown': (event: MouseEvent) => {
        if (event.button === 0) {
          skin.setInteractiveState('pressed')
        }
      },
      'onMouseup': () => skin.setInteractiveState('hover'),
      'onFocus': () => skin.setInteractiveState('hover'),
      'onBlur': () => skin.setInteractiveState('default'),
      'onClick': (event: Event) => {
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
    const renderer = useQuaRenderer()
    const actions = renderer.actions
    const skin = useUiControlSkin({ kind: 'panel' })
    return () => {
      const projected = projectChoices(choices.value, animations.value, animationNow.value, choicesProjection.value)
      return projected.choices.length
        ? h('div', {
            'class': 'qua-choice-panel',
            'style': [motionProjectionVars(projected.panel, '--qua-choices'), skin.skinStyle.value],
            'data-skin-kind': 'panel',
            'data-skin-reference': skin.skinReference.value || undefined,
            'data-skin-state': skin.skinState.value,
            'onClick': (event: Event) => event.stopPropagation(),
          }, slots.default?.({ ...useProjectionProps(), choices: projected.choices, actions }) || projected.choices.map(choice =>
            slots.choice?.({ ...useProjectionProps(), choice, actions }) || h(QuaChoiceButton, {
              key: choice.id,
              choice,
              onSelect: () => dispatchVueRendererIntent(renderer, () => actions.selectChoice(choice.id), {
                phase: 'choices:select',
                metadata: { choiceId: choice.id },
              }),
            }),
          ))
        : null
    }
  },
})
