import type { StageContainerSize } from '@quajs/renderer-web'
import type { PropType } from 'vue'
import type { QuaVueRendererLayer } from '../plugins/core'
import { projectStageMotion, readCssSafeAreaInsets, readDevicePixelRatio, resolveStageLayout, stageContentStyle, stageFrameStyle, stageMotionVars, stagePlaneStyle, stageSafeAreaStyle, stageSceneStyle, stageViewportStyle } from '@quajs/renderer-web'
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
    const sceneLayers = computed(() => layers.value.filter(layer => (layer.plane || 'scene') === 'scene'))
    const subjectLayers = computed(() => layers.value.filter(layer => layer.plane === 'subject'))
    const stageLayers = computed(() => layers.value.filter(layer => layer.plane === 'stage'))
    const safeLayers = computed(() => layers.value.filter(layer => layer.plane === 'safe'))
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
    const sceneStyle = computed(() => ({
      ...stageSceneStyle(),
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
          style: stageContentStyle(stageLayout.value),
          onClick: () => actions.advance('stage-click'),
        }, [
          h('div', {
            class: 'qua-stage-scene',
            style: sceneStyle.value,
          }, [
            h('div', {
              class: 'qua-stage-scene-content',
              style: stagePlaneStyle(),
            }, renderLayers(sceneLayers.value, slots, slotProps)),
            h('div', {
              class: 'qua-stage-subject',
              style: stagePlaneStyle(),
            }, renderLayers(subjectLayers.value, slots, slotProps)),
          ]),
          h('div', {
            class: 'qua-stage-plane',
            style: stagePlaneStyle(),
          }, renderLayers(stageLayers.value, slots, slotProps)),
          h('div', {
            class: 'qua-stage-safe',
            style: stageSafeAreaStyle(stageLayout.value),
          }, renderLayers(safeLayers.value, slots, slotProps)),
        ]),
      ]),
    ])
  },
})

function renderLayers(
  layers: readonly QuaVueRendererLayer[],
  slots: Record<string, any>,
  slotProps: () => Record<string, unknown>,
) {
  return layers.map((layer) => {
    const props = { key: layer.id, ...(layer.props || {}) }
    const slot = slots[layer.slot || layer.id]
    return slot?.(slotProps()) || h(layer.component as any, props)
  })
}
