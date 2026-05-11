import type { AudioViewProjection } from '@quajs/plugin-audio/contracts'
import type { PropType } from 'vue'
import { AUDIO_PLUGIN_ID } from '@quajs/plugin-audio/contracts'
import { WebAudioRendererController } from '@quajs/renderer-web/audio'
import { defineComponent, onBeforeUnmount, watch } from 'vue'
import { useQuaRenderer } from '../../context'

export const QuaAudioController = defineComponent({
  name: 'QuaAudioController',
  props: {
    autoUnlock: {
      type: Boolean as PropType<boolean | undefined>,
      default: undefined,
    },
    document: {
      type: Object as PropType<Document | undefined>,
      default: undefined,
    },
    unlockEvents: {
      type: Array as PropType<readonly (keyof DocumentEventMap)[] | undefined>,
      default: undefined,
    },
  },
  setup(props) {
    const { assets, pipeline, view } = useQuaRenderer()
    const controller = new WebAudioRendererController({
      getPipeline: () => pipeline.value,
      getAssets: () => assets.value,
      getViewState: () => view.value,
      autoUnlock: props.autoUnlock,
      document: props.document || globalThis.document,
      unlockEvents: props.unlockEvents,
    })
    const projection = () => view.value.plugins[AUDIO_PLUGIN_ID] as AudioViewProjection | undefined
    controller.start()

    const stopSyncWatch = watch(
      [() => projection()?.revision, () => assets.value],
      () => {
        void controller.sync()
      },
      { immediate: true },
    )

    onBeforeUnmount(async () => {
      stopSyncWatch()
      await controller.destroy()
    })

    return () => null
  },
})

export { WebAudioAudioRuntime } from './runtime'
