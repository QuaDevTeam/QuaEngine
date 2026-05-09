import { defineComponent, h } from 'vue'
import { useProjectionProps } from '../../components/projection'
import { useRendererActions } from '../../composables'
import { useQuaRenderer } from '../../context'

export const QuaOverlayLayer = defineComponent({
  name: 'QuaOverlayLayer',
  setup(_, { slots }) {
    const { view } = useQuaRenderer()
    const actions = useRendererActions()
    return () => slots.default
      ? h('div', {
          class: 'qua-overlay-layer',
          onClick: (event: Event) => event.stopPropagation(),
        }, slots.default?.({ ...useProjectionProps(), ui: view.value.ui, actions }))
      : null
  },
})
