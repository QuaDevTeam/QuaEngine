import type { AssetType } from '@quajs/assets'
import type { ComputedRef } from 'vue'
import { WebAssetUrlHandle } from '@quajs/renderer-web'
import { computed, onBeforeUnmount, readonly, ref, watch } from 'vue'
import { useQuaRenderer } from '../context'

export { useQuaRenderer } from '../context'

export function useQuaPipeline() {
  return useQuaRenderer().pipeline.value
}

export function useQuaView() {
  return readonly(useQuaRenderer().view)
}

export function useLayout() {
  const { view } = useQuaRenderer()
  return computed(() => view.value.layout)
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

export function useFlowControl() {
  const { view } = useQuaRenderer()
  return computed(() => view.value.flowControl)
}

export function usePluginProjection<T = unknown>(pluginId: string) {
  const { view } = useQuaRenderer()
  return computed(() => view.value.plugins[pluginId] as T | undefined)
}

export function useAudio<T = unknown>() {
  return usePluginProjection<T>('audio')
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

  watch(() => view.value.animations.map(animation => [
    animation.id,
    animation.state,
    animation.startedAt,
    animation.pausedAt ?? '',
    animation.endedAt ?? '',
    animation.delay ?? '',
    animation.duration,
    animation.playbackRate,
    animation.direction ?? '',
  ].join(':')).join('|'), () => {
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

export function useAssetUrl(
  type: AssetType | ComputedRef<AssetType>,
  name: () => string | undefined,
  targetPackageId?: () => string | undefined,
) {
  const { assets, assetRevision } = useQuaRenderer()
  const assetType = computed(() => typeof type === 'string' ? type : type.value)
  const url = ref<string>()
  const loading = ref(false)
  const error = ref<Error>()
  const handle = new WebAssetUrlHandle({
    getAssets: () => assets.value,
    getType: () => assetType.value,
    getName: name,
    getTargetPackageId: targetPackageId,
    onChange: (state) => {
      url.value = state.url
      loading.value = state.loading
      error.value = state.error
    },
  })

  watch([name, () => assetRevision.value, () => assets.value, () => assetType.value, () => targetPackageId?.()], async ([assetName]) => {
    if (!assetName || !assets.value) {
      handle.dispose()
      return
    }
    await handle.load()
  }, { immediate: true })

  onBeforeUnmount(() => {
    handle.dispose()
  })

  return {
    url: readonly(url),
    loading: readonly(loading),
    error: readonly(error),
    revoke: () => handle.revoke(),
  }
}

export function useAudioAsset(name: () => string | undefined) {
  return useAssetUrl('audio', name)
}

export { useUiControlSkin } from './useUiControlSkin'
