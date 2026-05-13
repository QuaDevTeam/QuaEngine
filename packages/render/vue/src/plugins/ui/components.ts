import { projectUiOverlay } from '@quajs/renderer-web'
import { computed, defineComponent, h } from 'vue'
import { useProjectionProps } from '../../components/projection'
import { useAnimationClock, useAnimations, useRendererActions } from '../../composables'
import { useQuaRenderer } from '../../context'

export const QuaOverlayLayer = defineComponent({
  name: 'QuaOverlayLayer',
  setup(_, { slots }) {
    const { view } = useQuaRenderer()
    const animations = useAnimations()
    const animationNow = useAnimationClock()
    const actions = useRendererActions()
    const projectedUi = computed(() => ({
      ...view.value.ui,
      overlays: view.value.ui.overlays
        ? Object.fromEntries(Object.entries(view.value.ui.overlays).map(([elementId, overlay]) => [
            elementId,
            projectUiOverlay(overlay as Readonly<Record<string, unknown>>, elementId, animations.value, animationNow.value),
          ]))
        : undefined,
    }))
    return () => slots.default
      ? h('div', {
          class: 'qua-overlay-layer',
          onClick: (event: Event) => event.stopPropagation(),
        }, slots.default?.({ ...useProjectionProps(), ui: projectedUi.value, actions }))
      : null
  },
})
