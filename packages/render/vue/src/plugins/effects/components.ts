import { defineComponent, h } from 'vue'
import { useProjectionProps } from '../../components/projection'
import { useEffects, useRendererActions } from '../../composables'

export const QuaEffectLayer = defineComponent({
  name: 'QuaEffectLayer',
  setup(_, { slots }) {
    const effects = useEffects()
    const actions = useRendererActions()
    return () => h('div', { class: 'qua-effect-layer' }, slots.default?.({ ...useProjectionProps(), effects: effects.value, actions }) || effects.value.map(effect =>
      h('div', { key: effect.id, class: ['qua-effect', `qua-effect--${effect.type}`] }),
    ))
  },
})
