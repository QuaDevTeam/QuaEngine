import type { SpriteSkinManifest, SpriteSkinStateName } from '@quajs/plugin-sprite/contracts'
import type { UiSkinControlKind } from '@quajs/renderer-web'
import {
  resolveSpriteSkinReference,
} from '@quajs/plugin-sprite/contracts'
import { resolveSpriteSkin, resolveUiControlSkinReference, spriteSkinStyle, WebAssetUrlHandle } from '@quajs/renderer-web'
import { computed, onBeforeUnmount, readonly, ref, watch } from 'vue'
import { useQuaRenderer } from '../context'

export interface UseUiControlSkinOptions {
  kind: UiSkinControlKind
  skinId?: () => string | undefined
  disabled?: () => boolean
  selected?: () => boolean
}

export function useUiControlSkin(options: UseUiControlSkinOptions) {
  const { assets, assetRevision, view } = useQuaRenderer()
  const skinState = ref<SpriteSkinStateName>('default')
  const skinManifest = ref<SpriteSkinManifest>()
  const skinManifestRequest = ref(0)
  const skinReference = computed(() => resolveUiControlSkinReference(view.value, options.kind, options.skinId?.()))
  const skinReferenceDetails = computed(() => skinReference.value ? resolveSpriteSkinReference(skinReference.value) : undefined)
  const skinProjection = computed(() => resolveSpriteSkin(skinManifest.value, skinReference.value, skinState.value))
  const skinTargetPackageId = computed(() => hasContentPackageId(skinProjection.value?.manifest?.metadata))
  const skinAssetUrl = ref<string>()
  const skinAssetLoading = ref(false)
  const skinAssetError = ref<Error>()

  const skinAssetHandle = new WebAssetUrlHandle({
    getAssets: () => assets.value,
    getType: () => 'images',
    getName: () => skinProjection.value?.active.asset,
    getTargetPackageId: () => skinTargetPackageId.value,
    onChange: (state) => {
      skinAssetUrl.value = state.url
      skinAssetLoading.value = state.loading
      skinAssetError.value = state.error
    },
  })

  watch([
    skinReferenceDetails,
    () => assetRevision.value,
    () => assets.value,
  ], async () => {
    const currentRequest = ++skinManifestRequest.value
    const reference = skinReferenceDetails.value
    if (!reference || !assets.value) {
      skinManifest.value = undefined
      skinAssetHandle.dispose()
      return
    }

    try {
      const nextManifest = await assets.value.getJSON<SpriteSkinManifest>('data', reference.manifestPath)
      if (currentRequest === skinManifestRequest.value) {
        skinManifest.value = nextManifest
      }
    }
    catch {
      if (currentRequest === skinManifestRequest.value) {
        skinManifest.value = undefined
      }
    }
  }, { immediate: true })

  watch([
    skinProjection,
    () => assetRevision.value,
    () => assets.value,
  ], async ([projection]) => {
    if (!projection || !projection.active.asset || !assets.value) {
      skinAssetHandle.dispose()
      return
    }
    await skinAssetHandle.load()
  }, { immediate: true })

  watch([
    () => options.disabled?.(),
    () => options.selected?.(),
  ], () => {
    if (options.disabled?.()) {
      skinState.value = 'disabled'
    }
    else if (options.selected?.()) {
      skinState.value = 'selected'
    }
    else {
      skinState.value = 'default'
    }
  }, { immediate: true })

  const setInteractiveState = (next: SpriteSkinStateName) => {
    if (options.disabled?.() || options.selected?.()) {
      return
    }
    skinState.value = next
  }

  onBeforeUnmount(() => {
    skinAssetHandle.dispose()
  })

  return {
    skinReference: readonly(skinReference),
    skinProjection: readonly(skinProjection),
    skinAssetUrl: readonly(skinAssetUrl),
    skinAssetLoading: readonly(skinAssetLoading),
    skinAssetError: readonly(skinAssetError),
    skinState: readonly(skinState),
    skinStyle: computed(() => spriteSkinStyle(skinProjection.value, {
      assetUrl: skinAssetUrl.value,
      state: skinState.value,
    })),
    setInteractiveState,
  }
}

function hasContentPackageId(metadata: Readonly<Record<string, unknown>> | undefined): string | undefined {
  return typeof metadata?.contentPackageId === 'string' ? metadata.contentPackageId : undefined
}
