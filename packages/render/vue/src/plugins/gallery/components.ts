import type { AssetType } from '@quajs/assets'
import type {
  GalleryAudioContentBlock,
  GalleryCatalogProjectionItem,
  GalleryContentBlock,
  GalleryCustomContentBlock,
  GalleryEntryProjectionItem,
  GalleryImageContentBlock,
  GalleryProjection,
  GalleryTextContentBlock,
  GalleryVideoContentBlock,
} from '@quajs/plugin-gallery/contracts'
import type { RendererActions } from '@quajs/renderer-web'
import type { GalleryProjectionModel } from '@quajs/renderer-web/plugins/gallery'
import type { QuaViewProjection } from '@quajs/render-core'
import type { PropType } from 'vue'
import type { QuaVueRendererPlugin } from '../core'
import { GALLERY_PLUGIN_ID, GalleryRenderToLogicEvents } from '@quajs/plugin-gallery/contracts'
import {
  createGalleryProjectionModel,
  resolveGalleryContentPreviewAsset,
  resolveGalleryEntryPreviewAsset,
} from '@quajs/renderer-web/plugins/gallery'
import { computed, defineComponent, h } from 'vue'
import type { VNode } from 'vue'
import { useAssetUrl, usePluginProjection, useRendererActions, useUiControlSkin } from '../../composables'
import { useQuaRenderer } from '../../context'
import { defineVueRendererPlugin } from '../core'

export interface GalleryRendererPluginOptions {
  elementId?: string
}

export function useGalleryProjection() {
  return usePluginProjection<GalleryProjection>(GALLERY_PLUGIN_ID)
}

export function useGalleryProjectionModel() {
  const projection = useGalleryProjection()
  return computed(() => createGalleryProjectionModel(projection.value))
}

export interface GalleryRendererSlotProps {
  view: Readonly<QuaViewProjection>
  projection: GalleryProjection
  gallery: GalleryProjectionModel
  actions: RendererActions
}

export const QuaGalleryLayer = defineComponent({
  name: 'QuaGalleryLayer',
  inheritAttrs: false,
  setup(_, { slots }) {
    const { view } = useQuaRenderer()
    const actions = useRendererActions()
    const projection = useGalleryProjection()
    const gallery = computed(() => createGalleryProjectionModel(projection.value))
    const closeSkin = useUiControlSkin({ kind: 'button' })
    const inputSkin = useUiControlSkin({ kind: 'input' })
    const toggleSkin = useUiControlSkin({
      kind: 'toggle',
      selected: () => Boolean(gallery.value?.projection.filter.unlockedOnly),
    })

    return () => {
      if (!gallery.value?.projection.sceneActive) {
        return null
      }

      return h('div', {
        class: 'qua-gallery-layer',
        'data-qua-capture-role': 'overlay',
        onClick: (event: Event) => event.stopPropagation(),
      }, slots.default?.({
        view: view.value,
        projection: gallery.value.projection,
        gallery: gallery.value,
        actions,
      }) || renderGalleryDefault({
        gallery: gallery.value,
        actions,
        closeSkin,
        inputSkin,
        toggleSkin,
      }))
    }
  },
})

export const QuaGalleryCatalogButton = defineComponent({
  name: 'QuaGalleryCatalogButton',
  props: {
    catalog: {
      type: Object as PropType<GalleryCatalogProjectionItem>,
      required: true,
    },
    selected: Boolean,
  },
  setup(props) {
    const actions = useRendererActions()
    const skin = useUiControlSkin({
      kind: 'tab',
      selected: () => props.selected,
    })
    return () => h('button', {
      class: ['qua-gallery-catalog-button', props.selected ? 'is-selected' : undefined],
      type: 'button',
      'data-gallery-catalog-id': props.catalog.id,
      'aria-selected': props.selected ? 'true' : 'false',
      style: skin.skinStyle.value,
      'data-skin-kind': 'tab',
      'data-skin-reference': skin.skinReference.value || undefined,
      'data-skin-state': skin.skinState.value,
      ...createSkinButtonHandlers(skin),
      onClick: () => actions.requestPluginEvent(GalleryRenderToLogicEvents.SELECT_CATALOG_REQUEST, {
        catalogId: props.catalog.id,
      }),
    }, [
      h('span', { class: 'qua-gallery-catalog-title' }, props.catalog.title),
      h('span', { class: 'qua-gallery-catalog-count' }, `${props.catalog.unlockedEntries}/${props.catalog.totalEntries}`),
    ])
  },
})

export const QuaGalleryEntryCard = defineComponent({
  name: 'QuaGalleryEntryCard',
  props: {
    entry: {
      type: Object as PropType<GalleryEntryProjectionItem>,
      required: true,
    },
    selected: Boolean,
  },
  setup(props) {
    const actions = useRendererActions()
    const skin = useUiControlSkin({
      kind: 'button',
      selected: () => props.selected,
    })
    const preview = computed(() => resolveGalleryEntryPreviewAsset(props.entry))
    return () => h('li', { class: 'qua-gallery-entry-item' }, [
      h('button', {
        class: [
          'qua-gallery-entry-card',
          props.entry.unlocked ? 'is-unlocked' : 'is-locked',
          props.selected ? 'is-selected' : undefined,
        ],
        type: 'button',
        'data-gallery-entry-id': props.entry.id,
        'aria-selected': props.selected ? 'true' : 'false',
        style: skin.skinStyle.value,
        'data-skin-kind': 'button',
        'data-skin-reference': skin.skinReference.value || undefined,
        'data-skin-state': skin.skinState.value,
        ...createSkinButtonHandlers(skin),
        onClick: () => actions.requestPluginEvent(GalleryRenderToLogicEvents.SELECT_ENTRY_REQUEST, {
          entryId: props.entry.id,
        }),
      }, [
        h('div', { class: 'qua-gallery-entry-preview' }, [
          preview.value
            ? h(GalleryAssetFrame, {
                asset: preview.value,
                alt: props.entry.title,
                variant: 'card',
              })
            : h('span', { class: 'qua-gallery-entry-placeholder' }, props.entry.unlocked ? 'Open' : 'Locked'),
        ]),
        h('div', { class: 'qua-gallery-entry-body' }, [
          h('strong', { class: 'qua-gallery-entry-title' }, props.entry.title),
          props.entry.summary ? h('p', { class: 'qua-gallery-entry-summary' }, props.entry.summary) : null,
          h('div', { class: 'qua-gallery-entry-badges' }, [
            h('span', {
              class: ['qua-gallery-entry-state', props.entry.unlocked ? 'is-unlocked' : 'is-locked'],
            }, props.entry.unlocked ? 'Unlocked' : 'Locked'),
            ...(props.entry.tags || []).map(tag => h('span', {
              key: tag,
              class: 'qua-gallery-entry-tag',
            }, tag)),
          ]),
        ]),
      ]),
    ])
  },
})

export const QuaGalleryContentTab = defineComponent({
  name: 'QuaGalleryContentTab',
  props: {
    content: {
      type: Object as PropType<GalleryContentBlock>,
      required: true,
    },
    selected: Boolean,
  },
  setup(props) {
    const actions = useRendererActions()
    const skin = useUiControlSkin({
      kind: 'tab',
      selected: () => props.selected,
    })
    return () => h('button', {
      class: ['qua-gallery-content-tab', props.selected ? 'is-selected' : undefined],
      type: 'button',
      'data-gallery-content-id': props.content.id,
      'aria-selected': props.selected ? 'true' : 'false',
      style: skin.skinStyle.value,
      'data-skin-kind': 'tab',
      'data-skin-reference': skin.skinReference.value || undefined,
      'data-skin-state': skin.skinState.value,
      ...createSkinButtonHandlers(skin),
      onClick: () => actions.requestPluginEvent(GalleryRenderToLogicEvents.SELECT_CONTENT_REQUEST, {
        contentId: props.content.id,
      }),
    }, props.content.title || props.content.kind)
  },
})

export const GalleryAssetFrame = defineComponent({
  name: 'GalleryAssetFrame',
  props: {
    asset: {
      type: Object as PropType<{ type: AssetType, name: string, runtimePackageId?: string, alt?: string }>,
      required: true,
    },
    poster: {
      type: Object as PropType<{ type: AssetType, name: string, runtimePackageId?: string, alt?: string } | undefined>,
      required: false,
      default: undefined,
    },
    alt: {
      type: String,
      default: '',
    },
    variant: {
      type: String as PropType<'card' | 'detail'>,
      default: 'detail',
    },
  },
  setup(props) {
    const assetType = computed(() => props.asset.type)
    const asset = useAssetUrl(assetType, () => props.asset.name, () => props.asset.runtimePackageId)
    const poster = useAssetUrl('images', () => props.poster?.name, () => props.poster?.runtimePackageId)

    return () => {
      switch (props.asset.type) {
        case 'images':
          return h('img', {
            class: [
              'qua-gallery-asset-preview',
              'qua-gallery-asset-preview--image',
              props.variant === 'card' ? 'is-card' : 'is-detail',
            ],
            src: asset.url.value,
            alt: props.alt || props.asset.alt || '',
            'aria-hidden': 'true',
          })
        case 'video':
          return h('video', {
            class: [
              'qua-gallery-asset-preview',
              'qua-gallery-asset-preview--video',
              props.variant === 'card' ? 'is-card' : 'is-detail',
            ],
            src: asset.url.value,
            poster: poster.url.value,
            autoplay: props.variant === 'card',
            controls: props.variant !== 'card',
            playsinline: true,
            muted: props.variant === 'card',
            loop: true,
            preload: 'metadata',
            'aria-label': props.alt || props.asset.alt || '',
          })
        case 'audio':
          return props.variant === 'card'
            ? h('div', {
                class: [
                  'qua-gallery-asset-preview',
                  'qua-gallery-asset-preview--placeholder',
                  'qua-gallery-asset-preview--audio',
                  'is-card',
                ],
              }, props.alt || props.asset.alt || props.asset.name)
            : h('div', { class: 'qua-gallery-content-audio' }, [
                props.poster ? h('img', {
                  class: 'qua-gallery-content-audio-poster',
                  src: poster.url.value,
                  alt: props.alt || props.poster.alt || props.asset.alt || '',
                }) : null,
                h('audio', {
                  class: 'qua-gallery-asset-preview qua-gallery-asset-preview--audio',
                  src: asset.url.value,
                  controls: true,
                  preload: 'metadata',
                  'aria-label': props.alt || props.asset.alt || '',
                }),
              ])
        default:
          return h('div', {
            class: [
              'qua-gallery-asset-preview',
              'qua-gallery-asset-preview--placeholder',
              props.variant === 'card' ? 'is-card' : 'is-detail',
            ],
          }, props.alt || props.asset.alt || props.asset.name)
      }
    }
  },
})

export const QuaGalleryContentBlockView = defineComponent({
  name: 'QuaGalleryContentBlockView',
  props: {
    content: {
      type: Object as PropType<GalleryContentBlock>,
      required: true,
    },
    entry: {
      type: Object as PropType<GalleryEntryProjectionItem>,
      required: true,
    },
  },
  setup(props) {
    return () => renderGalleryContentBlock(props.content, props.entry)
  },
})

export function createGalleryRendererPlugin(options: GalleryRendererPluginOptions = {}): QuaVueRendererPlugin {
  return defineVueRendererPlugin({
    name: '@quajs/renderer-vue/gallery',
    setup() {},
    layers: [{
      id: 'gallery',
      slot: 'overlay',
      component: QuaGalleryLayer,
      order: 97,
      plane: 'safe',
      props: { ...options },
    }],
  })
}

export const galleryRendererPlugin = createGalleryRendererPlugin()

function renderGalleryDefault(input: {
  gallery: GalleryProjectionModel
  actions: RendererActions
  closeSkin: ReturnType<typeof useUiControlSkin>
  inputSkin: ReturnType<typeof useUiControlSkin>
  toggleSkin: ReturnType<typeof useUiControlSkin>
}) {
  const { gallery, actions, closeSkin, inputSkin, toggleSkin } = input
  return [
    h('header', { class: 'qua-gallery-header' }, [
      h('div', { class: 'qua-gallery-heading' }, [
        h('h2', { class: 'qua-gallery-title' }, gallery.selectedCatalog?.title || 'Gallery'),
        h('p', { class: 'qua-gallery-meta' }, `${gallery.entries.filter((entry: GalleryEntryProjectionItem) => entry.unlocked).length}/${gallery.entries.length}`),
      ]),
      h('button', {
        class: 'qua-gallery-close',
        type: 'button',
        style: closeSkin.skinStyle.value,
        'data-skin-kind': 'button',
        'data-skin-reference': closeSkin.skinReference.value || undefined,
        'data-skin-state': closeSkin.skinState.value,
        ...createSkinButtonHandlers(closeSkin),
        onClick: () => actions.requestPluginEvent(GalleryRenderToLogicEvents.CLOSE_REQUEST),
      }, 'Close'),
    ]),
    h('div', { class: 'qua-gallery-toolbar' }, [
      h('label', { class: 'qua-gallery-search' }, [
        h('span', { class: 'qua-gallery-search-label' }, 'Search'),
        h('input', {
          class: 'qua-gallery-search-input',
          type: 'search',
          value: gallery.projection.filter.search || '',
          placeholder: 'Search',
          style: inputSkin.skinStyle.value,
          'data-skin-kind': 'input',
          'data-skin-reference': inputSkin.skinReference.value || undefined,
          'data-skin-state': inputSkin.skinState.value,
          ...createSkinButtonHandlers(inputSkin),
          onInput: (event: Event) => {
            const target = event.target as HTMLInputElement
            void actions.requestPluginEvent(GalleryRenderToLogicEvents.UPDATE_FILTER_REQUEST, {
              filter: {
                search: target.value,
              },
            })
          },
        }),
      ]),
      h('button', {
        class: ['qua-gallery-toolbar-toggle', gallery.projection.filter.unlockedOnly ? 'is-active' : undefined],
        type: 'button',
        style: toggleSkin.skinStyle.value,
        'data-skin-kind': 'toggle',
        'data-skin-reference': toggleSkin.skinReference.value || undefined,
        'data-skin-state': toggleSkin.skinState.value,
        ...createSkinButtonHandlers(toggleSkin),
        onClick: () => actions.requestPluginEvent(GalleryRenderToLogicEvents.UPDATE_FILTER_REQUEST, {
          filter: {
            unlockedOnly: !gallery.projection.filter.unlockedOnly,
          },
        }),
      }, 'Unlocked'),
      h('div', { class: 'qua-gallery-toolbar-counter' }, `${gallery.filteredEntries.length}/${gallery.entries.length}`),
    ]),
    h('div', { class: 'qua-gallery-body' }, [
      h('aside', { class: 'qua-gallery-catalog-pane' }, [
        h('h3', { class: 'qua-gallery-section-title' }, 'Catalogs'),
        gallery.catalogs.length > 0
          ? h('div', { class: 'qua-gallery-catalog-list' }, gallery.catalogs.map((catalog: GalleryCatalogProjectionItem) =>
              h(QuaGalleryCatalogButton, {
                key: catalog.id,
                catalog,
                selected: gallery.projection.selectedCatalogId === catalog.id,
              }),
            ))
          : h('p', { class: 'qua-gallery-empty' }, 'No catalogs'),
      ]),
      h('section', { class: 'qua-gallery-entry-pane' }, [
        h('h3', { class: 'qua-gallery-section-title' }, 'Entries'),
        gallery.filteredEntries.length > 0
          ? h('ol', { class: 'qua-gallery-entry-grid' }, gallery.filteredEntries.map((entry: GalleryEntryProjectionItem) =>
              h(QuaGalleryEntryCard, {
                key: entry.id,
                entry,
                selected: gallery.projection.selectedEntryId === entry.id,
              }),
            ))
          : h('p', { class: 'qua-gallery-empty' }, 'No entries'),
      ]),
      h('section', { class: 'qua-gallery-detail-pane' }, [
        h('h3', { class: 'qua-gallery-section-title' }, 'Detail'),
        gallery.selectedEntry
          ? renderGalleryDetail({
              gallery,
              entry: gallery.selectedEntry,
            })
          : h('p', { class: 'qua-gallery-empty' }, 'No entry selected'),
      ]),
    ]),
  ]
}

function renderGalleryDetail(input: {
  gallery: GalleryProjectionModel
  entry: GalleryEntryProjectionItem
}) {
  const { gallery, entry } = input
  const content = gallery.selectedContent || entry.contents[0]
  return [
    h('header', { class: 'qua-gallery-detail-header' }, [
      h('div', { class: 'qua-gallery-detail-heading' }, [
        h('h4', { class: 'qua-gallery-detail-title' }, entry.title),
        entry.summary ? h('p', { class: 'qua-gallery-detail-summary' }, entry.summary) : null,
      ]),
      h('span', {
        class: ['qua-gallery-detail-state', entry.unlocked ? 'is-unlocked' : 'is-locked'],
      }, entry.unlocked ? 'Unlocked' : 'Locked'),
    ]),
    entry.description ? h('p', { class: 'qua-gallery-detail-description' }, entry.description) : null,
    renderGalleryDetailPreview(entry, content),
    entry.contents.length > 0
      ? h('div', { class: 'qua-gallery-content-tabs' }, entry.contents.map(block =>
          h(QuaGalleryContentTab, {
            key: block.id,
            content: block,
            selected: gallery.selectedContent?.id === block.id,
          }),
        ))
      : null,
    entry.contents.length > 0
      ? h('div', { class: 'qua-gallery-content-panel' }, [
          h(QuaGalleryContentBlockView, {
            content,
            entry,
          }),
        ])
      : null,
  ]
}

function renderGalleryDetailPreview(
  entry: GalleryEntryProjectionItem,
  content: GalleryContentBlock | undefined,
) {
  const asset = resolveGalleryContentPreviewAsset(content) || resolveGalleryEntryPreviewAsset(entry)
  if (!asset) {
    return null
  }
  return h('div', { class: 'qua-gallery-detail-preview' }, [
    h(GalleryAssetFrame, {
      asset,
      poster: content && ('poster' in content ? content.poster : undefined) || undefined,
      alt: entry.title,
      variant: 'detail',
    }),
  ])
}

function renderGalleryContentBlock(
  content: GalleryContentBlock,
  entry: GalleryEntryProjectionItem,
): VNode | VNode[] | null {
  switch (content.kind) {
    case 'image': {
      const image = content as GalleryImageContentBlock
      return h(GalleryAssetFrame, {
        asset: image.asset,
        alt: image.title || image.asset.alt || entry.title,
        variant: 'detail',
      })
    }
    case 'video':
      return h(GalleryAssetFrame, {
        asset: (content as GalleryVideoContentBlock).asset,
        poster: (content as GalleryVideoContentBlock).poster,
        alt: content.title || entry.title,
        variant: 'detail',
      })
    case 'audio':
      return h(GalleryAssetFrame, {
        asset: (content as GalleryAudioContentBlock).asset,
        poster: (content as GalleryAudioContentBlock).poster,
        alt: content.title || entry.title,
        variant: 'detail',
      })
    case 'text':
      return h('p', { class: 'qua-gallery-content-text' }, (content as GalleryTextContentBlock).text)
    default:
      return h('pre', { class: 'qua-gallery-content-custom' }, JSON.stringify((content as GalleryCustomContentBlock).data, null, 2))
  }
}

function createSkinButtonHandlers(
  skin: Pick<ReturnType<typeof useUiControlSkin>, 'setInteractiveState'>,
): Record<string, (event: Event) => void> {
  return {
    onMouseenter: () => skin.setInteractiveState('hover'),
    onMouseleave: () => skin.setInteractiveState('default'),
    onMousedown: (event: Event) => {
      if ((event as MouseEvent).button === 0) {
        skin.setInteractiveState('pressed')
      }
    },
    onMouseup: () => skin.setInteractiveState('hover'),
    onFocus: () => skin.setInteractiveState('hover'),
    onBlur: () => skin.setInteractiveState('default'),
  }
}
