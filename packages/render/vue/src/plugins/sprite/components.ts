import type { AssetType } from '@quajs/assets'
import type {
  SpriteManifest,
  SpriteReference,
  SpriteResolvedLayer,
} from '@quajs/plugin-sprite/contracts'
import type { ActiveAnimationProjection } from '@quajs/render-core'
import {
  resolveSpriteProjection,
  resolveSpriteReference,
} from '@quajs/plugin-sprite/contracts'
import {
  applyTrackValues,
  collectTrackValues,
  type UiSkinControlKind,
} from '@quajs/renderer-web'
import { computed, defineComponent, h, ref, watch } from 'vue'
import { useAnimationClock, useAnimations, useAssetUrl, useUiControlSkin } from '../../composables'
import { useQuaRenderer } from '../../context'

export const QuaSpriteLayerItem = defineComponent({
  name: 'QuaSpriteLayerItem',
  props: {
    layer: {
      type: Object,
      required: true,
    },
    isBase: Boolean,
    alt: {
      type: String,
      default: '',
    },
  },
  setup(props: any) {
    const activeAsset = ref<string>(props.layer.asset)
    const asset = useAssetUrl('characters' as AssetType, () => activeAsset.value)
    const mask = useAssetUrl('characters' as AssetType, () => props.layer.mask)

    watch(
      () => [props.layer.asset, props.layer.fallback, props.layer.frame?.x, props.layer.frame?.y, props.layer.frame?.width, props.layer.frame?.height].join('|'),
      () => {
        activeAsset.value = props.layer.asset
      },
      { immediate: true },
    )

    const onError = () => {
      if (props.layer.fallback && activeAsset.value !== props.layer.fallback) {
        activeAsset.value = props.layer.fallback
      }
    }

    return () => props.layer.frame
      ? h('div', {
          'class': [
            'qua-sprite-layer',
            'qua-sprite-layer--atlas',
            props.isBase ? 'qua-sprite-layer--base' : 'qua-sprite-layer--expression',
            props.layer.visible === false ? 'is-hidden' : undefined,
          ],
          'style': spriteLayerStyle(props.layer, props.isBase, mask.url.value),
          'data-sprite-layer-kind': props.layer.kind,
          'aria-hidden': 'true',
        }, [
          h('img', {
            class: 'qua-sprite-layer__atlas',
            src: asset.url.value,
            alt: props.alt,
            onError,
            style: atlasImageStyle(props.layer.frame),
          }),
        ])
      : h('img', {
          'class': [
            'qua-sprite-layer',
            props.isBase ? 'qua-sprite-layer--base' : 'qua-sprite-layer--expression',
            props.layer.visible === false ? 'is-hidden' : undefined,
          ],
          'src': asset.url.value,
          'alt': props.alt,
          onError,
          'data-sprite-layer-kind': props.layer.kind,
          'aria-hidden': 'true',
          'style': spriteLayerStyle(props.layer, props.isBase, mask.url.value),
        })
  },
})

export const QuaSprite = defineComponent({
  name: 'QuaSprite',
  props: {
    sprite: {
      type: String,
      required: true,
    },
    expression: String,
    alt: {
      type: String,
      default: '',
    },
    animationTargetPrefix: String,
  },
  setup(props) {
    const { assets, assetRevision } = useQuaRenderer()
    const animations = useAnimations()
    const animationNow = useAnimationClock()
    const manifest = ref<SpriteManifest>()
    const manifestRequest = ref(0)
    const reference = computed<SpriteReference | undefined>(() => resolveSpriteReference(props.sprite))
    const resolvedProjection = computed(() => resolveSpriteProjection(manifest.value, props.sprite, props.expression))

    watch(
      [() => props.sprite, () => assetRevision.value, () => assets.value],
      async () => {
        const currentRequest = ++manifestRequest.value
        const spriteReference = reference.value
        if (!spriteReference || !assets.value) {
          manifest.value = undefined
          return
        }

        try {
          const nextManifest = await assets.value.getJSON<SpriteManifest>('characters', spriteReference.manifestPath)
          if (currentRequest === manifestRequest.value) {
            manifest.value = nextManifest
          }
        }
        catch {
          if (currentRequest === manifestRequest.value) {
            manifest.value = undefined
          }
        }
      },
      { immediate: true },
    )

    return () => {
      const projection = resolvedProjection.value
      if (!projection) {
        return null
      }

      return h('div', {
        'class': ['qua-sprite', props.expression ? 'has-expression' : undefined],
        'style': {
          position: 'relative',
          display: 'inline-block',
          lineHeight: 0,
        },
        'data-sprite-family': projection.family,
        'data-sprite': projection.sprite,
        'data-sprite-expression': projection.expression || '',
      }, projection.layers.map((layer, index) =>
        h(QuaSpriteLayerItem, {
          key: `${projection.family}:${layer.kind}:${index}:${layer.asset}:${layer.frame ? `${layer.frame.x},${layer.frame.y},${layer.frame.width},${layer.frame.height}` : 'image'}`,
          layer: projectSpriteLayerForAnimation(layer, props.animationTargetPrefix, index, animations.value, animationNow.value),
          isBase: index === 0,
          alt: props.alt,
        }),
      ))
    }
  },
})

export const QuaSpriteSkinBox = defineComponent({
  name: 'QuaSpriteSkinBox',
  props: {
    kind: {
      type: String as () => UiSkinControlKind,
      default: 'panel',
    },
    skinId: String,
    as: {
      type: String,
      default: 'div',
    },
    disabled: Boolean,
    selected: Boolean,
  },
  setup(props, { slots }) {
    const skin = useUiControlSkin({
      kind: props.kind,
      skinId: () => props.skinId,
      disabled: () => props.disabled,
      selected: () => props.selected,
    })

    return () => h(props.as as any, {
      class: [
        'qua-sprite-skin-box',
        `qua-sprite-skin-box--${props.kind}`,
        `is-${skin.skinState.value}`,
      ],
      style: skin.skinStyle.value,
      'data-skin-kind': props.kind,
      'data-skin-reference': skin.skinReference.value || undefined,
      'data-skin-state': skin.skinState.value,
      'aria-disabled': props.disabled || undefined,
      'aria-selected': props.selected || undefined,
      disabled: props.as === 'button' ? props.disabled || undefined : undefined,
      type: props.as === 'button' ? 'button' : undefined,
      onMouseenter: () => skin.setInteractiveState('hover'),
      onMouseleave: () => skin.setInteractiveState('default'),
      onMousedown: (event: MouseEvent) => {
        if (event.button === 0) {
          skin.setInteractiveState('pressed')
        }
      },
      onMouseup: () => skin.setInteractiveState('hover'),
      onFocus: () => skin.setInteractiveState('hover'),
      onBlur: () => skin.setInteractiveState('default'),
    }, slots.default?.({
      skin: skin.skinProjection.value,
      skinState: skin.skinState.value,
      skinAsset: skin.skinAssetUrl.value,
      reference: skin.skinReference.value,
    }))
  },
})

export function spriteLayerStyle(layer: SpriteResolvedLayer, isBase: boolean, maskUrl?: string): Record<string, string | number | undefined> {
  const style: Record<string, string | number | undefined> = {
    position: isBase ? 'relative' : 'absolute',
    left: isBase ? undefined : '0',
    top: isBase ? undefined : '0',
    zIndex: layer.zIndex,
    opacity: layer.opacity,
    mixBlendMode: layer.blendMode,
    pointerEvents: 'none',
    display: layer.visible === false ? 'none' : undefined,
    transform: createSpriteTransform(layer),
  }

  if (maskUrl) {
    style.maskImage = `url(${maskUrl})`
    style.WebkitMaskImage = `url(${maskUrl})`
    style.maskRepeat = 'no-repeat'
    style.WebkitMaskRepeat = 'no-repeat'
  }

  return style
}

export function atlasImageStyle(frame: NonNullable<SpriteResolvedLayer['frame']>): Record<string, string | number> {
  return {
    position: 'absolute',
    left: `${-frame.x}px`,
    top: `${-frame.y}px`,
    display: 'block',
  }
}

function createSpriteTransform(layer: SpriteResolvedLayer): string | undefined {
  const transforms: string[] = []
  if (layer.offsetX || layer.offsetY) {
    transforms.push(`translate(${layer.offsetX || 0}px, ${layer.offsetY || 0}px)`)
  }
  if (layer.scale !== undefined) {
    transforms.push(`scale(${layer.scale})`)
  }
  if (layer.rotation !== undefined) {
    transforms.push(`rotate(${layer.rotation}deg)`)
  }
  return transforms.length > 0 ? transforms.join(' ') : undefined
}

function projectSpriteLayerForAnimation(
  layer: SpriteResolvedLayer,
  animationTargetPrefix: string | undefined,
  layerIndex: number,
  animations: readonly Readonly<ActiveAnimationProjection>[],
  now: number,
): SpriteResolvedLayer {
  if (!animationTargetPrefix)
    return layer
  const tracks = [
    ...collectTrackValues(animations, `spriteLayer:${animationTargetPrefix}:${layer.kind}:${layerIndex}`, now),
    ...collectTrackValues(animations, `spriteLayer:${animationTargetPrefix}:${layer.kind}`, now),
    ...collectTrackValues(animations, `spriteLayer:${animationTargetPrefix}:${layerIndex}`, now),
  ]
  if (tracks.length === 0)
    return layer
  const projected = {
    ...layer,
    frame: layer.frame ? { ...layer.frame } : undefined,
  }
  applyTrackValues(projected as unknown as Record<string, unknown>, tracks)
  return projected
}
