import type { FontsProjection } from '@quajs/plugin-fonts/contracts'
import type { PropType } from 'vue'
import { FONTS_PLUGIN_ID } from '@quajs/plugin-fonts/contracts'
import { WebFontFaceRegistry } from '@quajs/renderer-web/plugins/fonts'
import { defineComponent, onBeforeUnmount, watch } from 'vue'
import { useQuaRenderer } from '../../context'

export const QuaFontsController = defineComponent({
  name: 'QuaFontsController',
  props: {
    document: {
      type: Object as PropType<Document | undefined>,
      default: undefined,
    },
    onError: {
      type: Function as PropType<ConstructorParameters<typeof WebFontFaceRegistry>[0]['onError']>,
      default: undefined,
    },
  },
  setup(props) {
    const { assets, view, assetRevision } = useQuaRenderer()
    const registry = new WebFontFaceRegistry({
      getAssets: () => assets.value,
      getProjection: () => view.value.plugins[FONTS_PLUGIN_ID] as FontsProjection | undefined,
      document: props.document || globalThis.document,
      onError: props.onError,
    })

    const projection = () => view.value.plugins[FONTS_PLUGIN_ID] as FontsProjection | undefined
    const stopSyncWatch = watch(
      [() => projection()?.revision, () => assets.value, () => assetRevision.value],
      () => {
        void registry.sync()
      },
      { immediate: true },
    )

    onBeforeUnmount(async () => {
      stopSyncWatch()
      await registry.destroy()
    })

    return () => null
  },
})
