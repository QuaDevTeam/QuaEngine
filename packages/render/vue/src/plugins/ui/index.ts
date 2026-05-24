import type { QuaVueRendererPlugin } from '../core'
import { computed, defineComponent, h } from 'vue'
import { useAudio, useRendererActions } from '../../composables'
import { useQuaRenderer } from '../../context'
import { defineVueRendererPlugin } from '../core'
import { QuaOverlayLayer } from './components'
import { useUiControlSkin } from '../../composables'

export { QuaOverlayLayer } from './components'

type UiOverlaySkinConfig = Readonly<Record<string, unknown>> & { skinId?: string }

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
    const config = computed<UiOverlaySkinConfig | undefined>(() => view.value.ui.overlays?.[props.elementId] as UiOverlaySkinConfig | undefined)
    const skin = useUiControlSkin({
      kind: 'panel',
      skinId: () => config.value?.skinId,
    })
    return () => config.value
      ? h('div', {
          'class': 'qua-ui-overlay',
          style: skin.skinStyle.value,
          'data-overlay': props.elementId,
          'data-skin-kind': 'panel',
          'data-skin-reference': skin.skinReference.value || undefined,
          'data-skin-state': skin.skinState.value,
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
    const config = computed<UiOverlaySkinConfig | undefined>(() => view.value.ui.overlays?.[props.elementId] as UiOverlaySkinConfig | undefined)
    const skin = useUiControlSkin({
      kind: 'panel',
      skinId: () => config.value?.skinId,
    })
    return () => config.value
      ? h('div', {
          'class': 'qua-menu-overlay',
          style: skin.skinStyle.value,
          'data-overlay': props.elementId,
          'data-skin-kind': 'panel',
          'data-skin-reference': skin.skinReference.value || undefined,
          'data-skin-state': skin.skinState.value,
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
    const config = computed<UiOverlaySkinConfig | undefined>(() => view.value.ui.overlays?.[props.elementId] as UiOverlaySkinConfig | undefined)
    const skin = useUiControlSkin({
      kind: 'panel',
      skinId: () => config.value?.skinId,
    })
    return () => config.value
      ? h('div', {
          'class': 'qua-save-load-panel',
          style: skin.skinStyle.value,
          'data-overlay': props.elementId,
          'data-skin-kind': 'panel',
          'data-skin-reference': skin.skinReference.value || undefined,
          'data-skin-state': skin.skinState.value,
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
    const config = computed<UiOverlaySkinConfig | undefined>(() => view.value.ui.overlays?.[props.elementId] as UiOverlaySkinConfig | undefined)
    const skin = useUiControlSkin({
      kind: 'panel',
      skinId: () => config.value?.skinId,
    })
    return () => config.value
      ? h('div', {
          'class': 'qua-settings-panel',
          style: skin.skinStyle.value,
          'data-overlay': props.elementId,
          'data-skin-kind': 'panel',
          'data-skin-reference': skin.skinReference.value || undefined,
          'data-skin-state': skin.skinState.value,
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
