import type { StageContainerSize } from '@quajs/renderer-web'
import type { PropType } from 'vue'
import type { QuaVueRendererLayer } from '../plugins/core'
import { projectStageMotion, readCssSafeAreaInsets, readDevicePixelRatio, resolveStageLayout, stageContentStyle, stageFrameStyle, stageMotionVars, stageViewportStyle } from '@quajs/renderer-web'
import { computed, defineComponent, h, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useAnimationClock, useRendererActions } from '../composables'
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
    const animationNow = useAnimationClock()
    const slotProps = () => ({ ...useProjectionProps(), actions })
    const layers = computed(() => props.layers || [])
    const frame = ref<HTMLElement>()
    const frameSize = ref<Partial<StageContainerSize>>({ width: 0, height: 0 })
    let resizeObserver: ResizeObserver | undefined

    const measure = () => {
      const rect = frame.value?.getBoundingClientRect()
      frameSize.value = {
        width: rect?.width || 0,
        height: rect?.height || 0,
        devicePixelRatio: readDevicePixelRatio(frame.value),
        safeAreaInsets: readCssSafeAreaInsets(frame.value),
      }
    }

    onMounted(() => {
      measure()
      const ResizeObserverCtor = frame.value?.ownerDocument.defaultView?.ResizeObserver
      if (ResizeObserverCtor && frame.value) {
        resizeObserver = new ResizeObserverCtor(measure)
        resizeObserver.observe(frame.value)
      }
    })

    onBeforeUnmount(() => {
      resizeObserver?.disconnect()
      resizeObserver = undefined
    })

    watch(() => props.view?.layout, async () => {
      await nextTick()
      measure()
    }, { deep: true })

    const stageLayout = computed(() => resolveStageLayout(props.view?.layout as any, frameSize.value))
    const stageStyle = computed(() => ({
      ...stageContentStyle(stageLayout.value),
      ...stageMotionVars(projectStageMotion(props.view as any, animationNow.value)),
    }))

    return () => h('div', {
      ref: frame,
      class: 'qua-stage-frame',
      style: stageFrameStyle(),
    }, [
      h('div', {
        class: 'qua-stage-viewport',
        style: stageViewportStyle(stageLayout.value),
      }, [
        h('section', {
          class: 'qua-stage',
          style: stageStyle.value,
          onClick: () => actions.advance('stage-click'),
        }, [
          ...layers.value.map((layer) => {
            const props = { key: layer.id, ...(layer.props || {}) }
            const slot = slots[layer.slot || layer.id]
            return slot?.(slotProps()) || h(layer.component as any, props)
          }),
        ]),
      ]),
    ])
  },
})
