import type { StageContainerSize } from '@quajs/renderer-web'
import type { PropType } from 'vue'
import type { QuaVueRendererLayer } from '../plugins/core'
import { observeStageViewportEnvironment, projectStageMotion, readCssSafeAreaInsets, readDevicePixelRatio, resolveStageLayout, stageContentStyle, stageFrameStyle, stageMotionVars, stagePlaneStyle, stageSafeAreaStyle, stageSceneStyle, stageViewportStyle } from '@quajs/renderer-web'
import { computed, defineComponent, h, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useAnimationClock } from '../composables'
import { useQuaRenderer } from '../context'
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
    const animationNow = useAnimationClock()
    const renderer = useQuaRenderer()
    const actions = props.actions
    const slotProps = () => ({ ...useProjectionProps(), actions })
    const layers = computed(() => props.layers || [])
    const sceneLayers = computed(() => layers.value.filter(layer => (layer.plane || 'scene') === 'scene'))
    const subjectLayers = computed(() => layers.value.filter(layer => layer.plane === 'subject'))
    const stageLayers = computed(() => layers.value.filter(layer => layer.plane === 'stage'))
    const safeLayers = computed(() => layers.value.filter(layer => layer.plane === 'safe'))
    const frame = ref<HTMLElement>()
    const frameSize = ref<Partial<StageContainerSize>>({ width: 0, height: 0 })
    let resizeObserver: ResizeObserver | undefined
    let viewportEnvironmentDisposer: (() => void) | undefined

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
      viewportEnvironmentDisposer = observeStageViewportEnvironment(frame.value, measure)
    })

    onBeforeUnmount(() => {
      resizeObserver?.disconnect()
      resizeObserver = undefined
      viewportEnvironmentDisposer?.()
      viewportEnvironmentDisposer = undefined
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
        }, [
          h('div', {
            class: 'qua-stage-scene',
            'data-qua-capture-role': 'scene',
            style: sceneStyle.value,
          }, [
            h('div', {
              class: 'qua-stage-scene-content',
              'data-qua-capture-role': 'scene',
              style: stagePlaneStyle(),
            }, renderLayers(sceneLayers.value, slots, slotProps, renderer.web.reportError.bind(renderer.web))),
            h('div', {
              class: 'qua-stage-subject',
              'data-qua-capture-role': 'scene',
              style: stagePlaneStyle(),
            }, renderLayers(subjectLayers.value, slots, slotProps, renderer.web.reportError.bind(renderer.web))),
          ]),
          h('div', {
            class: 'qua-stage-plane',
            'data-qua-capture-role': 'scene',
            style: stagePlaneStyle(),
          }, renderLayers(stageLayers.value, slots, slotProps, renderer.web.reportError.bind(renderer.web))),
          h('div', {
            class: 'qua-stage-safe',
            'data-qua-capture-role': 'safe-ui',
            style: stageSafeAreaStyle(stageLayout.value),
          }, renderLayers(safeLayers.value, slots, slotProps, renderer.web.reportError.bind(renderer.web))),
        ]),
      ]),
    ])
  },
})

function renderLayers(
  layers: readonly QuaVueRendererLayer[],
  slots: Record<string, any>,
  slotProps: () => Record<string, unknown>,
  reportError: (error: unknown, payload?: { message?: string, phase?: string, metadata?: Record<string, unknown> }) => Promise<void>,
) {
  return layers.map((layer) => {
    const props = { key: layer.id, ...(layer.props || {}) }
    const slot = slots[layer.slot || layer.id]
    try {
      return slot?.(slotProps()) || h(layer.component as any, props)
    }
    catch (error) {
      void reportError(error, {
        message: `Vue renderer layer "${layer.id}" failed during render.`,
        phase: 'vue-layer:render',
        metadata: { layerId: layer.id },
      })
      return null
    }
  })
}
