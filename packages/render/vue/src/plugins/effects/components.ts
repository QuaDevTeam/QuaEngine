import { motionProjectionVars, projectEffect } from '@quajs/renderer-web'
import { computed, defineComponent, h } from 'vue'
import { useProjectionProps } from '../../components/projection'
import { useAnimationClock, useAnimations, useEffects, useRendererActions } from '../../composables'

export const QuaEffectLayer = defineComponent({
  name: 'QuaEffectLayer',
  setup(_, { slots }) {
    const effects = useEffects()
    const animations = useAnimations()
    const animationNow = useAnimationClock()
    const actions = useRendererActions()
    const projectedEffects = computed(() => effects.value.map(effect => projectEffect(effect, animations.value, animationNow.value)))
    return () => h('div', { class: 'qua-effect-layer' }, slots.default?.({ ...useProjectionProps(), effects: projectedEffects.value, actions }) || projectedEffects.value.map(effect =>
      h('div', {
        key: effect.id,
        class: ['qua-effect', `qua-effect--${effect.type}`],
        style: motionProjectionVars(effect as unknown as Record<string, unknown>, '--qua-effect'),
      }),
    ))
  },
})
