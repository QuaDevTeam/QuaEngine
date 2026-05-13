import type { QuaVueRendererPlugin } from '../core'
import { computed, defineComponent, h } from 'vue'
import { useAudio, useRendererActions } from '../../composables'
import { useQuaRenderer } from '../../context'
import { defineVueRendererPlugin } from '../core'
import { QuaOverlayLayer } from './components'

export { QuaOverlayLayer } from './components'

export interface QuaUiOverlayProps {
  elementId?: string
}

export function createUiRendererPlugin(): QuaVueRendererPlugin {
  return defineVueRendererPlugin({
    name: '@quajs/renderer-vue/ui',
    setup() {},
    layers: [{
      id: 'overlay',
      slot: 'overlay',
      component: QuaOverlayLayer,
      order: 90,
      plane: 'safe',
    }],
  })
}

export const uiRendererPlugin = createUiRendererPlugin()

export const QuaUiOverlay = defineComponent({
  name: 'QuaUiOverlay',
  props: {
    elementId: {
      type: String,
      default: 'overlay',
    },
  },
  setup(props, { slots }) {
    const { view } = useQuaRenderer()
    const actions = useRendererActions()
    const config = computed(() => view.value.ui.overlays?.[props.elementId])
    return () => config.value
      ? h('div', {
          'class': 'qua-ui-overlay',
          'data-overlay': props.elementId,
          'onClick': (event: Event) => event.stopPropagation(),
        }, slots.default?.({
          view: view.value,
          ui: view.value.ui,
          overlay: config.value,
          actions,
        }) || undefined)
      : null
  },
})

export const QuaMenuOverlay = defineComponent({
  name: 'QuaMenuOverlay',
  props: {
    elementId: {
      type: String,
      default: 'menu',
    },
  },
  setup(props, { slots }) {
    const { view } = useQuaRenderer()
    const actions = useRendererActions()
    const config = computed(() => view.value.ui.overlays?.[props.elementId])
    return () => config.value
      ? h('div', {
          'class': 'qua-menu-overlay',
          'data-overlay': props.elementId,
          'onClick': (event: Event) => event.stopPropagation(),
        }, slots.default?.({
          view: view.value,
          ui: view.value.ui,
          overlay: config.value,
          actions,
        }) || undefined)
      : null
  },
})

export const QuaSaveLoadPanel = defineComponent({
  name: 'QuaSaveLoadPanel',
  props: {
    elementId: {
      type: String,
      default: 'saveLoad',
    },
  },
  setup(props, { slots }) {
    const { view } = useQuaRenderer()
    const actions = useRendererActions()
    const config = computed(() => view.value.ui.overlays?.[props.elementId])
    return () => config.value
      ? h('div', {
          'class': 'qua-save-load-panel',
          'data-overlay': props.elementId,
          'onClick': (event: Event) => event.stopPropagation(),
        }, slots.default?.({
          view: view.value,
          ui: view.value.ui,
          overlay: config.value,
          actions,
        }) || undefined)
      : null
  },
})

export const QuaSettingsPanel = defineComponent({
  name: 'QuaSettingsPanel',
  props: {
    elementId: {
      type: String,
      default: 'settings',
    },
  },
  setup(props, { slots }) {
    const { view } = useQuaRenderer()
    const audio = useAudio()
    const actions = useRendererActions()
    const config = computed(() => view.value.ui.overlays?.[props.elementId])
    return () => config.value
      ? h('div', {
          'class': 'qua-settings-panel',
          'data-overlay': props.elementId,
          'onClick': (event: Event) => event.stopPropagation(),
        }, slots.default?.({
          view: view.value,
          ui: view.value.ui,
          overlay: config.value,
          audio: audio.value,
          actions,
        }) || undefined)
      : null
  },
})
