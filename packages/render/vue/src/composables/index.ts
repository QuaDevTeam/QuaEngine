import type { AssetType } from '@quajs/assets'
import { computed, onBeforeUnmount, readonly, ref, watch } from 'vue'
import { createObjectURL, revokeObjectURL } from '@quajs/assets-web'
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

export function useAudio() {
  const { view } = useQuaRenderer()
  return computed(() => view.value.audio)
}

export function useEffects() {
  const { view } = useQuaRenderer()
  return computed(() => view.value.effects)
}

export function useRendererActions() {
  return useQuaRenderer().actions
}

export function useAssetUrl(type: AssetType, name: () => string | undefined) {
  const { assets, assetRevision } = useQuaRenderer()
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

  watch([name, () => assetRevision.value, () => assets.value], async ([assetName]) => {
    const currentRequestId = ++requestId
    revoke()
    error.value = undefined
    const assetRuntime = assets.value
    if (!assetName || !assetRuntime)
      return

    loading.value = true
    try {
      const asset = await assetRuntime.getAsset(type, assetName)
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
