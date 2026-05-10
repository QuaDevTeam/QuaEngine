import type { AssetType } from '@quajs/assets'
import type { AudioViewProjection } from '@quajs/plugin-audio/contracts'
import type { ComputedRef } from 'vue'
import { createObjectURL, revokeObjectURL } from '@quajs/assets-web'
import { computed, onBeforeUnmount, readonly, ref, watch } from 'vue'
import { useQuaRenderer } from '../context'

export { useQuaRenderer } from '../context'

export function useQuaPipeline() {
  return useQuaRenderer().pipeline.value
}

export function useQuaView() {
  return readonly(useQuaRenderer().view)
}

export function useBackground() {
  const { view } = useQuaRenderer()
  return computed(() => view.value.background)
}

export function useCharacters() {
  const { view } = useQuaRenderer()
  return computed(() => view.value.characters)
}

export function useDialogue() {
  const { view } = useQuaRenderer()
  return computed(() => view.value.dialogue)
}

export function useChoices() {
  const { view } = useQuaRenderer()
  return computed(() => view.value.choices)
}

export function usePluginProjection<T = unknown>(pluginId: string) {
  const { view } = useQuaRenderer()
  return computed(() => view.value.plugins[pluginId] as T | undefined)
}

export function useAudio() {
  return usePluginProjection<AudioViewProjection>('audio')
}

export function useEffects() {
  const { view } = useQuaRenderer()
  return computed(() => view.value.effects)
}

export function useAnimations() {
  const { view } = useQuaRenderer()
  return computed(() => view.value.animations)
}

export function useAnimationClock() {
  const { view } = useQuaRenderer()
  const now = ref(Date.now())
  let frameHandle: number | undefined
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined

  const stop = () => {
    if (frameHandle !== undefined && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(frameHandle)
    }
    if (timeoutHandle !== undefined) {
      clearTimeout(timeoutHandle)
    }
    frameHandle = undefined
    timeoutHandle = undefined
  }

  const hasActiveAnimation = () => view.value.animations.some(animation => animation.state === 'running')

  const tick = () => {
    now.value = Date.now()
    if (!hasActiveAnimation()) {
      stop()
      return
    }

    if (typeof requestAnimationFrame === 'function') {
      frameHandle = requestAnimationFrame(() => tick())
    }
    else {
      timeoutHandle = setTimeout(tick, 16)
    }
  }

  watch(() => view.value.animations.map(animation => `${animation.id}:${animation.state}:${animation.startedAt}:${animation.pausedAt ?? ''}`).join('|'), () => {
    stop()
    if (hasActiveAnimation()) {
      tick()
    }
    else {
      now.value = Date.now()
    }
  }, { immediate: true })

  onBeforeUnmount(stop)

  return readonly(now)
}

export function useRendererActions() {
  return useQuaRenderer().actions
}

export function useAssetUrl(type: AssetType | ComputedRef<AssetType>, name: () => string | undefined) {
  const { assets, assetRevision } = useQuaRenderer()
  const assetType = computed(() => typeof type === 'string' ? type : type.value)
  const url = ref<string>()
  const loading = ref(false)
  const error = ref<Error>()
  let requestId = 0

  const revoke = () => {
    if (url.value) {
      revokeObjectURL(url.value)
      url.value = undefined
    }
  }

  watch([name, () => assetRevision.value, () => assets.value, () => assetType.value], async ([assetName]) => {
    const currentRequestId = ++requestId
    revoke()
    error.value = undefined
    const assetRuntime = assets.value
    if (!assetName || !assetRuntime)
      return

    loading.value = true
    try {
      const asset = await assetRuntime.getAsset(assetType.value, assetName)
      const nextUrl = createObjectURL(asset)
      if (currentRequestId === requestId) {
        url.value = nextUrl
      }
      else {
        revokeObjectURL(nextUrl)
      }
    }
    catch (caught) {
      if (currentRequestId === requestId) {
        error.value = caught as Error
      }
    }
    finally {
      if (currentRequestId === requestId) {
        loading.value = false
      }
    }
  }, { immediate: true })

  onBeforeUnmount(() => {
    requestId++
    revoke()
  })

  return {
    url: readonly(url),
    loading: readonly(loading),
    error: readonly(error),
    revoke,
  }
}

export function useAudioAsset(name: () => string | undefined) {
  return useAssetUrl('audio', name)
}
