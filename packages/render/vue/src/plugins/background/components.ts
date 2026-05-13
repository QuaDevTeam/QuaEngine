import {
  backgroundLayerProjectionVars,
  backgroundMaskImageVars,
  backgroundProjectionVars,
  normalizeBackgroundLayerAssetType,
  projectBackground,
} from '@quajs/renderer-web'
import { computed, defineComponent, h } from 'vue'
import { useProjectionProps } from '../../components/projection'
import { useAnimationClock, useAnimations, useAssetUrl, useBackground, useRendererActions } from '../../composables'

export const QuaBackground = defineComponent({
  name: 'QuaBackground',
  props: {
    assetName: String,
    background: Object,
  },
  setup(props) {
    const asset = useAssetUrl('images', () => props.assetName)
    const maskStyle = useBackgroundMaskStyle(() => (props.background as any)?.composition?.mask)
    return () => h('img', {
      'class': 'qua-background',
      'src': asset.url.value,
      'alt': '',
      'style': mergeStyles(backgroundProjectionVars(props.background), maskStyle.value),
      'aria-hidden': 'true',
    })
  },
})

export const QuaVideoBackground = defineComponent({
  name: 'QuaVideoBackground',
  props: {
    video: {
      type: Object,
      required: true,
    },
    background: Object,
  },
  setup(props: any) {
    const videoAsset = useAssetUrl('video', () => props.video.assetName)
    const posterAsset = useAssetUrl('images', () => props.video.poster)
    const maskStyle = useBackgroundMaskStyle(() => props.background?.composition?.mask)
    return () => h('video', {
      'class': 'qua-background qua-background--video',
      'src': videoAsset.url.value,
      'poster': posterAsset.url.value,
      'autoplay': true,
      'playsinline': true,
      'loop': props.video.loop !== false,
      'muted': props.video.muted !== false,
      'volume': props.video.volume,
      'playbackRate': props.video.playbackRate,
      'style': mergeStyles(backgroundProjectionVars(props.background), maskStyle.value),
      'aria-hidden': 'true',
    })
  },
})

export const QuaBackgroundLayerItem = defineComponent({
  name: 'QuaBackgroundLayerItem',
  props: {
    layer: {
      type: Object,
      required: true,
    },
  },
  setup(props: any) {
    const assetType = computed(() => normalizeBackgroundLayerAssetType(props.layer.assetType))
    const asset = useAssetUrl(assetType, () => props.layer.assetName)
    const maskStyle = useBackgroundMaskStyle(() => props.layer.composition?.mask)
    return () => props.layer.assetType === 'video'
      ? h('video', {
          'class': ['qua-background-layer-item', 'qua-background-layer-item--video', props.layer.visible === false ? 'is-hidden' : undefined],
          'src': asset.url.value,
          'autoplay': true,
          'playsinline': true,
          'loop': true,
          'muted': true,
          'data-background-layer-id': props.layer.id,
          'data-background-layer-type': props.layer.assetType || 'images',
          'style': mergeStyles(backgroundLayerProjectionVars(props.layer), maskStyle.value),
          'aria-hidden': 'true',
        })
      : h('img', {
          'class': ['qua-background-layer-item', props.layer.visible === false ? 'is-hidden' : undefined],
          'src': asset.url.value,
          'alt': '',
          'data-background-layer-id': props.layer.id,
          'data-background-layer-type': props.layer.assetType || 'images',
          'style': mergeStyles(backgroundLayerProjectionVars(props.layer), maskStyle.value),
          'aria-hidden': 'true',
        })
  },
})

export const QuaLayeredBackground = defineComponent({
  name: 'QuaLayeredBackground',
  props: {
    layers: {
      type: Array,
      required: true,
    },
    background: Object,
  },
  setup(props: any, { slots }) {
    const maskStyle = useBackgroundMaskStyle(() => props.background?.composition?.mask)
    return () => h('div', { class: 'qua-layered-background', style: mergeStyles(backgroundProjectionVars(props.background), maskStyle.value) }, props.layers.map((layer: any) =>
      slots.layer?.({ layer }) || h(QuaBackgroundLayerItem, { key: layer.id, layer }),
    ))
  },
})

export const QuaBackgroundProjection = defineComponent({
  name: 'QuaBackgroundProjection',
  props: {
    background: {
      type: Object,
      required: true,
    },
  },
  setup(props: any) {
    return () => {
      const background = props.background
      if (background.mode === 'video' && background.video) {
        return h(QuaVideoBackground, { video: background.video, background })
      }
      if (background.mode === 'layered') {
        return h(QuaLayeredBackground, { layers: background.layers || [], background })
      }
      return background.assetName
        ? h(QuaBackground, { assetName: background.assetName, background })
        : null
    }
  },
})

function useBackgroundMaskStyle(getMask: () => { assetName?: string, assetType?: string } | undefined) {
  const assetType = computed(() => normalizeBackgroundLayerAssetType(getMask()?.assetType))
  const asset = useAssetUrl(assetType, () => getMask()?.assetName)
  return computed(() => backgroundMaskImageVars(asset.url.value))
}

function mergeStyles(
  ...styles: Array<Record<string, string | number> | undefined>
): Record<string, string | number> | undefined {
  const merged = Object.assign({}, ...styles.filter(Boolean))
  return Object.keys(merged).length > 0 ? merged : undefined
}

export const QuaBackgroundLayer = defineComponent({
  name: 'QuaBackgroundLayer',
  setup(_, { slots }) {
    const background = useBackground()
    const animations = useAnimations()
    const animationNow = useAnimationClock()
    const actions = useRendererActions()
    const projectedBackground = computed(() => projectBackground(background.value, animations.value, animationNow.value))
    return () => h('div', { class: 'qua-background-layer' }, slots.default?.({ ...useProjectionProps(), background: background.value, actions }) || [
      projectedBackground.value ? h(QuaBackgroundProjection, { background: projectedBackground.value }) : null,
    ])
  },
})
