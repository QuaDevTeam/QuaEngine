import type { AssetChange } from '@quajs/assets'
import type { AudioViewProjection } from '@quajs/plugin-audio/contracts'
import {
  AUDIO_PLUGIN_ID,
  AudioRenderToLogicEvents,
  emitAudioRenderToLogic,
} from '@quajs/plugin-audio/contracts'
import { onRenderToLogic, RenderToLogicEvents } from '@quajs/render-core'
import { defineComponent, onBeforeUnmount, watch } from 'vue'
import { useQuaRenderer } from '../../context'
import { WebAudioAudioRuntime } from './runtime'

export const QuaAudioController = defineComponent({
  name: 'QuaAudioController',
  setup() {
    const { assets, pipeline, view } = useQuaRenderer()
    const runtime = new WebAudioAudioRuntime(
      () => assets.value,
      {
        emit: (type, payload) => emitAudioRenderToLogic(
          pipeline.value,
          type as any,
          payload as any,
        ),
      },
    )
    const projection = () => view.value.plugins[AUDIO_PLUGIN_ID] as AudioViewProjection | undefined

    const stopProjectionWatch = watch(
      () => projection()?.revision,
      () => {
        void syncRuntime()
      },
      { immediate: true },
    )

    const stopAssetsWatch = watch(
      () => assets.value,
      (currentAssets, _previous, onCleanup) => {
        if (!currentAssets) {
          return
        }

        const handleAssetChange = (change: AssetChange) => {
          runtime.handleAssetChange(change)
          void syncRuntime()
        }

        currentAssets.on('asset:changed', handleAssetChange)
        onCleanup(() => currentAssets.off('asset:changed', handleAssetChange))
      },
      { immediate: true },
    )

    const stopAdvanceSubscription = onRenderToLogic(
      pipeline.value,
      RenderToLogicEvents.USER_ADVANCE,
      async payload => {
        const interrupted = runtime.interruptVoice(payload.source || 'user-advance')
        for (const track of interrupted) {
          await emitAudioRenderToLogic(pipeline.value, AudioRenderToLogicEvents.INTERRUPTED, track)
        }
      },
    )

    const unlockEvents: Array<keyof DocumentEventMap> = ['pointerdown', 'keydown', 'touchstart', 'mousedown']
    const unlockListener = () => {
      void runtime.unlock().catch(() => {})
    }

    for (const eventName of unlockEvents) {
      document.addEventListener(eventName, unlockListener, { capture: true, passive: true })
    }

    async function syncRuntime(): Promise<void> {
      const currentProjection = projection()
      if (!currentProjection) {
        return
      }

      try {
        await runtime.sync(currentProjection)
      }
      catch (error) {
        await emitAudioRenderToLogic(pipeline.value, AudioRenderToLogicEvents.ERROR, {
          message: error instanceof Error ? error.message : 'Failed to synchronize audio runtime',
          error,
        })
      }
    }

    onBeforeUnmount(async () => {
      stopProjectionWatch()
      stopAssetsWatch()
      stopAdvanceSubscription()
      for (const eventName of unlockEvents) {
        document.removeEventListener(eventName, unlockListener, { capture: true } as AddEventListenerOptions)
      }
      await runtime.destroy()
    })

    return () => null
  },
})

export { WebAudioAudioRuntime } from './runtime'
