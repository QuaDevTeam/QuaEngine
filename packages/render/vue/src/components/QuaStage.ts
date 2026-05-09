import type { PropType } from 'vue'
import type { QuaVueRendererLayer } from '../plugins/core'
import { computed, defineComponent, h } from 'vue'
import { useRendererActions } from '../composables'
import { projectionProps, useProjectionProps } from './projection'

export const QuaStage = defineComponent({
  name: 'QuaStage',
  props: {
    ...projectionProps(),
    layers: {
      type: Array as PropType<readonly QuaVueRendererLayer[]>,
      default: () => [],
    },
  },
  setup(props, { slots }) {
    const actions = useRendererActions()
    const slotProps = () => ({ ...useProjectionProps(), actions })
    const layers = computed(() => props.layers || [])

    return () => h('section', {
      class: 'qua-stage',
      onClick: () => actions.advance('stage-click'),
    }, [
      ...layers.value.map((layer) => {
        const props = { key: layer.id, ...(layer.props || {}) }
        const slot = slots[layer.slot || layer.id]
        return slot?.(slotProps()) || h(layer.component as any, props)
      }),
    ])
  },
})
