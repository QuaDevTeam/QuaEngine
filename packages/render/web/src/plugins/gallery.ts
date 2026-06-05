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
import type { QuaViewProjection } from '@quajs/render-core'
import type { QuaWebDomLayerContext, QuaWebDomRendererPlugin } from './core'
import { GALLERY_PLUGIN_ID, GalleryRenderToLogicEvents } from '@quajs/plugin-gallery/contracts'
import { runtimePackageCandidatesFromMetadata } from '../assets'
import { bindUiControlSkin } from '../ui-skin'
import { defineWebRendererPlugin } from './core'
import { dispatchRendererIntent } from './shared'

type GalleryAssetRef = NonNullable<GalleryEntryProjectionItem['thumbnail']>

export interface GalleryProjectionModel {
  projection: GalleryProjection
  catalogs: readonly GalleryCatalogProjectionItem[]
  entries: readonly GalleryEntryProjectionItem[]
  filteredEntries: readonly GalleryEntryProjectionItem[]
  selectedCatalog?: GalleryCatalogProjectionItem
  selectedEntry?: GalleryEntryProjectionItem
  selectedContent?: GalleryContentBlock
  selectedContentIndex: number
  selectedContentCount: number
}

interface GalleryLightboxState {
  entryId?: string
  contentId?: string
}

export function getGalleryProjectionFromView(view: Readonly<QuaViewProjection>): GalleryProjection | undefined {
  return view.plugins[GALLERY_PLUGIN_ID] as GalleryProjection | undefined
}

export function createGalleryProjectionModel(
  projection: GalleryProjection | undefined,
): GalleryProjectionModel | undefined {
  if (!projection) {
    return undefined
  }

  const catalogs = [...projection.catalogs]
  const entries = [...projection.entries]
  const catalogById = new Map(catalogs.map(catalog => [catalog.id, catalog]))
  const entryById = new Map(entries.map(entry => [entry.id, entry]))
  const filteredEntries = projection.filteredEntryIds
    .map(entryId => entryById.get(entryId))
    .filter((entry): entry is GalleryEntryProjectionItem => Boolean(entry))

  const selectedCatalog = projection.selectedCatalogId
    ? catalogById.get(projection.selectedCatalogId) || catalogs[0]
    : catalogs[0]
  const selectedEntry = projection.selectedEntryId
    ? entryById.get(projection.selectedEntryId) || filteredEntries[0]
    : filteredEntries[0]
  const selectedContent = selectedEntry
    ? selectedEntry.contents.find(content => content.id === projection.selectedContentId) || selectedEntry.contents[0]
    : undefined
  const selectedContentIndex = selectedEntry && selectedContent
    ? Math.max(0, selectedEntry.contents.findIndex(content => content.id === selectedContent.id))
    : -1

  return {
    projection,
    catalogs,
    entries,
    filteredEntries,
    selectedCatalog,
    selectedEntry,
    selectedContent,
    selectedContentIndex,
    selectedContentCount: selectedEntry?.contents.length || 0,
  }
}

export function resolveGalleryEntryPreviewAsset(
  entry: GalleryEntryProjectionItem | undefined,
): GalleryAssetRef | undefined {
  if (!entry) {
    return undefined
  }
  if (entry.thumbnail) {
    return entry.thumbnail
  }
  if (entry.poster) {
    return entry.poster
  }

  for (const content of entry.contents) {
    const asset = resolveGalleryContentPreviewAsset(content)
    if (asset) {
      return asset
    }
  }

  return undefined
}

export function resolveGalleryContentPreviewAsset(
  content: GalleryContentBlock | undefined,
): GalleryAssetRef | undefined {
  if (!content) {
    return undefined
  }

  switch (content.kind) {
    case 'image':
      return (content as GalleryImageContentBlock).asset
    case 'video':
      return (content as GalleryVideoContentBlock).poster || (content as GalleryVideoContentBlock).asset
    case 'audio':
      return (content as GalleryAudioContentBlock).poster || (content as GalleryAudioContentBlock).asset
    case 'text':
      return undefined
    default:
      return undefined
  }
}

export function resolveGalleryContentAsset(
  content: GalleryContentBlock | undefined,
): GalleryAssetRef | undefined {
  if (!content) {
    return undefined
  }

  switch (content.kind) {
    case 'image':
      return (content as GalleryImageContentBlock).asset
    case 'video':
      return (content as GalleryVideoContentBlock).asset
    case 'audio':
      return (content as GalleryAudioContentBlock).asset
    case 'text':
      return undefined
    default:
      return undefined
  }
}

export function createGalleryWebRendererPlugin(): QuaWebDomRendererPlugin {
  const lightbox: GalleryLightboxState = {}
  return defineWebRendererPlugin({
    name: '@quajs/renderer-web/gallery',
    setup() {},
    layers: [{
      id: 'gallery',
      order: 97,
      plane: 'safe',
      render: context => renderGalleryLayer(context, lightbox),
    }],
  })
}

export const galleryWebRendererPlugin = createGalleryWebRendererPlugin()

function renderGalleryLayer(context: QuaWebDomLayerContext, lightbox: GalleryLightboxState): Node | undefined {
  const projection = getGalleryProjectionFromView(context.view)
  if (!projection?.sceneActive) {
    lightbox.entryId = undefined
    lightbox.contentId = undefined
    return undefined
  }

  const model = createGalleryProjectionModel(projection)
  if (!model) {
    return undefined
  }

  const layer = context.document.createElement('div')
  layer.className = 'qua-gallery-layer'
  layer.setAttribute('data-qua-capture-role', 'overlay')
  layer.addEventListener('click', event => event.stopPropagation())

  const panel = context.document.createElement('section')
  panel.className = 'qua-gallery-panel'
  panel.setAttribute('role', 'dialog')
  panel.setAttribute('aria-modal', 'true')
  bindUiControlSkin(context, panel, {
    kind: 'panel',
  })

  panel.append(renderGalleryHeader(context, model))
  panel.append(renderGalleryToolbar(context, model))
  panel.append(renderGalleryBody(context, model, lightbox))
  layer.append(panel)
  const lightboxNode = renderGalleryLightbox(context, model, lightbox)
  if (lightboxNode) {
    layer.append(lightboxNode)
  }
  return layer
}

function renderGalleryHeader(context: QuaWebDomLayerContext, model: GalleryProjectionModel): Node {
  const header = context.document.createElement('header')
  header.className = 'qua-gallery-header'

  const heading = context.document.createElement('div')
  heading.className = 'qua-gallery-heading'

  const title = context.document.createElement('h2')
  title.className = 'qua-gallery-title'
  title.textContent = model.selectedCatalog?.title || 'Gallery'
  heading.append(title)

  const meta = context.document.createElement('p')
  meta.className = 'qua-gallery-meta'
  meta.textContent = gallerySummaryText(model)
  heading.append(meta)

  const close = context.document.createElement('button')
  close.className = 'qua-gallery-close'
  close.type = 'button'
  close.textContent = 'Close'
  bindUiControlSkin(context, close, {
    kind: 'button',
  })
  close.addEventListener('click', () => {
    dispatchRendererIntent(context, () => context.actions.requestPluginEvent(GalleryRenderToLogicEvents.CLOSE_REQUEST), {
      phase: 'gallery:close',
    })
  })

  header.append(heading, close)
  return header
}

function renderGalleryToolbar(context: QuaWebDomLayerContext, model: GalleryProjectionModel): Node {
  const toolbar = context.document.createElement('div')
  toolbar.className = 'qua-gallery-toolbar'

  const searchLabel = context.document.createElement('label')
  searchLabel.className = 'qua-gallery-search'

  const search = context.document.createElement('input')
  search.type = 'search'
  search.className = 'qua-gallery-search-input'
  search.placeholder = 'Search'
  search.value = model.projection.filter.search || ''
  bindUiControlSkin(context, search, {
    kind: 'input',
  })
  search.addEventListener('input', () => {
    dispatchRendererIntent(context, () => context.actions.requestPluginEvent(GalleryRenderToLogicEvents.UPDATE_FILTER_REQUEST, {
      filter: {
        search: search.value,
      },
    }), {
      phase: 'gallery:update-filter',
      metadata: { field: 'search' },
    })
  })

  const searchText = context.document.createElement('span')
  searchText.className = 'qua-gallery-search-label'
  searchText.textContent = 'Search'

  searchLabel.append(searchText, search)

  const unlocked = context.document.createElement('button')
  unlocked.type = 'button'
  unlocked.className = [
    'qua-gallery-toolbar-toggle',
    model.projection.filter.unlockedOnly ? 'is-active' : '',
  ].filter(Boolean).join(' ')
  unlocked.textContent = 'Unlocked'
  bindUiControlSkin(context, unlocked, {
    kind: 'toggle',
    selected: Boolean(model.projection.filter.unlockedOnly),
  })
  unlocked.addEventListener('click', () => {
    dispatchRendererIntent(context, () => context.actions.requestPluginEvent(GalleryRenderToLogicEvents.UPDATE_FILTER_REQUEST, {
      filter: {
        unlockedOnly: !model.projection.filter.unlockedOnly,
      },
    }), {
      phase: 'gallery:update-filter',
      metadata: { field: 'unlockedOnly' },
    })
  })

  const counter = context.document.createElement('div')
  counter.className = 'qua-gallery-toolbar-counter'
  counter.textContent = `${model.filteredEntries.length}/${model.entries.length}`

  toolbar.append(searchLabel, unlocked, counter)
  return toolbar
}

function renderGalleryBody(
  context: QuaWebDomLayerContext,
  model: GalleryProjectionModel,
  lightbox: GalleryLightboxState,
): Node {
  const body = context.document.createElement('div')
  body.className = 'qua-gallery-body'

  const catalogs = renderGalleryCatalogPane(context, model)
  const entries = renderGalleryEntryPane(context, model, lightbox)
  const detail = renderGalleryDetailPane(context, model)

  body.append(catalogs, entries, detail)
  return body
}

function renderGalleryCatalogPane(context: QuaWebDomLayerContext, model: GalleryProjectionModel): Node {
  const pane = context.document.createElement('aside')
  pane.className = 'qua-gallery-catalog-pane'

  const title = context.document.createElement('h3')
  title.className = 'qua-gallery-section-title'
  title.textContent = 'Catalogs'
  pane.append(title)

  if (model.catalogs.length === 0) {
    pane.append(renderGalleryEmptyState(context, 'No catalogs'))
    return pane
  }

  const list = context.document.createElement('div')
  list.className = 'qua-gallery-catalog-list'
  for (const catalog of model.catalogs) {
    list.append(renderGalleryCatalogButton(context, model, catalog))
  }
  pane.append(list)
  return pane
}

function renderGalleryCatalogButton(
  context: QuaWebDomLayerContext,
  model: GalleryProjectionModel,
  catalog: GalleryCatalogProjectionItem,
): Node {
  const button = context.document.createElement('button')
  button.type = 'button'
  button.className = [
    'qua-gallery-catalog-button',
    model.projection.selectedCatalogId === catalog.id ? 'is-selected' : '',
  ].filter(Boolean).join(' ')
  button.setAttribute('data-gallery-catalog-id', catalog.id)
  button.setAttribute('aria-selected', model.projection.selectedCatalogId === catalog.id ? 'true' : 'false')
  bindUiControlSkin(context, button, {
    kind: 'tab',
    selected: model.projection.selectedCatalogId === catalog.id,
  })

  const heading = context.document.createElement('span')
  heading.className = 'qua-gallery-catalog-title'
  heading.textContent = catalog.title

  const meta = context.document.createElement('span')
  meta.className = 'qua-gallery-catalog-count'
  meta.textContent = `${catalog.unlockedEntries}/${catalog.totalEntries}`

  button.append(heading, meta)
  button.addEventListener('click', () => {
    dispatchRendererIntent(context, () => context.actions.requestPluginEvent(GalleryRenderToLogicEvents.SELECT_CATALOG_REQUEST, {
      catalogId: catalog.id,
    }), {
      phase: 'gallery:select-catalog',
      metadata: { catalogId: catalog.id },
    })
  })

  return button
}

function renderGalleryEntryPane(
  context: QuaWebDomLayerContext,
  model: GalleryProjectionModel,
  lightbox: GalleryLightboxState,
): Node {
  const pane = context.document.createElement('section')
  pane.className = 'qua-gallery-entry-pane'

  const title = context.document.createElement('h3')
  title.className = 'qua-gallery-section-title'
  title.textContent = 'Entries'
  pane.append(title)

  if (model.filteredEntries.length === 0) {
    pane.append(renderGalleryEmptyState(context, 'No entries'))
    return pane
  }

  const list = context.document.createElement('ol')
  list.className = 'qua-gallery-entry-grid'
  for (const entry of model.filteredEntries) {
    list.append(renderGalleryEntryCard(context, model, entry, lightbox))
  }
  pane.append(list)
  return pane
}

function renderGalleryEntryCard(
  context: QuaWebDomLayerContext,
  model: GalleryProjectionModel,
  entry: GalleryEntryProjectionItem,
  lightbox: GalleryLightboxState,
): Node {
  const item = context.document.createElement('li')
  item.className = 'qua-gallery-entry-item'

  const button = context.document.createElement('button')
  button.type = 'button'
  button.className = [
    'qua-gallery-entry-card',
    entry.unlocked ? 'is-unlocked' : 'is-locked',
    model.projection.selectedEntryId === entry.id ? 'is-selected' : '',
  ].filter(Boolean).join(' ')
  button.setAttribute('data-gallery-entry-id', entry.id)
  button.setAttribute('aria-selected', model.projection.selectedEntryId === entry.id ? 'true' : 'false')
  bindUiControlSkin(context, button, {
    kind: 'button',
    selected: model.projection.selectedEntryId === entry.id,
  })

  const preview = context.document.createElement('div')
  preview.className = 'qua-gallery-entry-preview'
  const previewAsset = resolveGalleryEntryPreviewAsset(entry)
  if (previewAsset) {
    preview.append(renderGalleryAssetPreview(context, previewAsset, entry.title))
  }
  else {
    const placeholder = context.document.createElement('span')
    placeholder.className = 'qua-gallery-entry-placeholder'
    placeholder.textContent = entry.unlocked ? 'Open' : 'Locked'
    preview.append(placeholder)
  }

  const body = context.document.createElement('div')
  body.className = 'qua-gallery-entry-body'

  const heading = context.document.createElement('strong')
  heading.className = 'qua-gallery-entry-title'
  heading.textContent = entry.title
  body.append(heading)

  if (entry.summary) {
    const summary = context.document.createElement('p')
    summary.className = 'qua-gallery-entry-summary'
    summary.textContent = entry.summary
    body.append(summary)
  }

  const badges = context.document.createElement('div')
  badges.className = 'qua-gallery-entry-badges'

  const state = context.document.createElement('span')
  state.className = [
    'qua-gallery-entry-state',
    entry.unlocked ? 'is-unlocked' : 'is-locked',
  ].join(' ')
  state.textContent = entry.unlocked ? 'Unlocked' : 'Locked'
  badges.append(state)

  for (const tag of entry.tags || []) {
    const tagNode = context.document.createElement('span')
    tagNode.className = 'qua-gallery-entry-tag'
    tagNode.textContent = tag
    badges.append(tagNode)
  }
  body.append(badges)

  button.append(preview, body)
  button.addEventListener('click', () => {
    dispatchRendererIntent(context, () => context.actions.requestPluginEvent(GalleryRenderToLogicEvents.SELECT_ENTRY_REQUEST, {
      entryId: entry.id,
    }), {
      phase: 'gallery:select-entry',
      metadata: { entryId: entry.id },
    })
    if (entry.unlocked && entry.contents.length > 0) {
      lightbox.entryId = entry.id
      lightbox.contentId = entry.contents[0]?.id
      context.renderer.render()
    }
  })

  item.append(button)
  return item
}

function renderGalleryLightbox(
  context: QuaWebDomLayerContext,
  model: GalleryProjectionModel,
  lightbox: GalleryLightboxState,
): Node | undefined {
  const entry = lightbox.entryId
    ? model.entries.find(item => item.id === lightbox.entryId)
    : undefined
  if (!entry?.unlocked) {
    lightbox.entryId = undefined
    lightbox.contentId = undefined
    return undefined
  }

  const content = lightbox.contentId
    ? entry.contents.find(item => item.id === lightbox.contentId) || entry.contents[0]
    : entry.contents[0]
  const asset = resolveGalleryContentAsset(content) || resolveGalleryEntryPreviewAsset(entry)
  if (!content && !asset) {
    return undefined
  }

  const closeLightbox = () => {
    lightbox.entryId = undefined
    lightbox.contentId = undefined
    context.renderer.render()
  }

  const overlay = context.document.createElement('div')
  overlay.className = 'qua-gallery-lightbox'
  overlay.setAttribute('role', 'dialog')
  overlay.setAttribute('aria-modal', 'true')
  overlay.setAttribute('aria-label', entry.title)
  overlay.addEventListener('click', closeLightbox)

  const frame = context.document.createElement('figure')
  frame.className = 'qua-gallery-lightbox-frame'
  frame.addEventListener('click', event => event.stopPropagation())

  const close = context.document.createElement('button')
  close.className = 'qua-gallery-lightbox-close'
  close.type = 'button'
  close.textContent = 'Close'
  bindUiControlSkin(context, close, {
    kind: 'button',
  })
  close.addEventListener('click', closeLightbox)

  const media = context.document.createElement('div')
  media.className = 'qua-gallery-lightbox-media'
  media.append(renderGalleryLightboxContent(context, entry, content, asset))

  const caption = context.document.createElement('figcaption')
  caption.className = 'qua-gallery-lightbox-caption'
  caption.textContent = content?.title || entry.title

  frame.append(close, media, caption)
  overlay.append(frame)
  return overlay
}

function renderGalleryLightboxContent(
  context: QuaWebDomLayerContext,
  entry: GalleryEntryProjectionItem,
  content: GalleryContentBlock | undefined,
  asset: GalleryAssetRef | undefined,
): Node {
  if (asset) {
    return renderGalleryMediaElement(context, mediaElementTagForAsset(asset), {
      className: [
        'qua-gallery-lightbox-asset',
        `qua-gallery-lightbox-asset--${asset.type}`,
      ].join(' '),
      asset,
      poster: content && 'poster' in content ? content.poster : undefined,
      controls: true,
      playsInline: true,
      muted: false,
      alt: content?.title || entry.title,
    })
  }

  if (content?.kind === 'text') {
    const text = context.document.createElement('p')
    text.className = 'qua-gallery-lightbox-text qua-gallery-content-text'
    text.textContent = (content as GalleryTextContentBlock).text
    return text
  }

  if (content) {
    const custom = context.document.createElement('pre')
    custom.className = 'qua-gallery-lightbox-custom qua-gallery-content-custom'
    custom.textContent = JSON.stringify('data' in content ? (content as GalleryCustomContentBlock).data : content, null, 2)
    return custom
  }

  return renderGalleryEmptyState(context, 'No content')
}

function renderGalleryDetailPane(context: QuaWebDomLayerContext, model: GalleryProjectionModel): Node {
  const pane = context.document.createElement('section')
  pane.className = 'qua-gallery-detail-pane'

  const title = context.document.createElement('h3')
  title.className = 'qua-gallery-section-title'
  title.textContent = 'Detail'
  pane.append(title)

  if (!model.selectedEntry) {
    pane.append(renderGalleryEmptyState(context, 'No entry selected'))
    return pane
  }

  const entry = model.selectedEntry
  const header = context.document.createElement('header')
  header.className = 'qua-gallery-detail-header'

  const heading = context.document.createElement('div')
  heading.className = 'qua-gallery-detail-heading'

  const entryTitle = context.document.createElement('h4')
  entryTitle.className = 'qua-gallery-detail-title'
  entryTitle.textContent = entry.title
  heading.append(entryTitle)

  if (entry.summary) {
    const summary = context.document.createElement('p')
    summary.className = 'qua-gallery-detail-summary'
    summary.textContent = entry.summary
    heading.append(summary)
  }

  const state = context.document.createElement('span')
  state.className = [
    'qua-gallery-detail-state',
    entry.unlocked ? 'is-unlocked' : 'is-locked',
  ].join(' ')
  state.textContent = entry.unlocked ? 'Unlocked' : 'Locked'

  header.append(heading, state)
  pane.append(header)

  if (entry.description) {
    const description = context.document.createElement('p')
    description.className = 'qua-gallery-detail-description'
    description.textContent = entry.description
    pane.append(description)
  }

  const previewAsset = resolveGalleryContentPreviewAsset(model.selectedContent) || resolveGalleryEntryPreviewAsset(entry)
  if (previewAsset) {
    const hero = context.document.createElement('div')
    hero.className = 'qua-gallery-detail-preview'
    hero.append(renderGalleryAssetPreview(context, previewAsset, entry.title))
    pane.append(hero)
  }

  if (entry.contents.length > 0) {
    const contentTabs = context.document.createElement('div')
    contentTabs.className = 'qua-gallery-content-tabs'
    for (const content of entry.contents) {
      contentTabs.append(renderGalleryContentTab(context, model, content))
    }
    pane.append(contentTabs)

    const content = model.selectedContent || entry.contents[0]
    const contentPanel = context.document.createElement('div')
    contentPanel.className = 'qua-gallery-content-panel'
    contentPanel.append(renderGalleryContentNode(context, content, entry))
    pane.append(contentPanel)
  }

  return pane
}

function renderGalleryContentTab(
  context: QuaWebDomLayerContext,
  model: GalleryProjectionModel,
  content: GalleryContentBlock,
): Node {
  const button = context.document.createElement('button')
  button.type = 'button'
  button.className = [
    'qua-gallery-content-tab',
    model.selectedContent?.id === content.id ? 'is-selected' : '',
  ].filter(Boolean).join(' ')
  button.setAttribute('data-gallery-content-id', content.id)
  button.setAttribute('aria-selected', model.selectedContent?.id === content.id ? 'true' : 'false')
  bindUiControlSkin(context, button, {
    kind: 'tab',
    selected: model.selectedContent?.id === content.id,
  })
  button.textContent = content.title || content.kind
  button.addEventListener('click', () => {
    dispatchRendererIntent(context, () => context.actions.requestPluginEvent(GalleryRenderToLogicEvents.SELECT_CONTENT_REQUEST, {
      contentId: content.id,
    }), {
      phase: 'gallery:select-content',
      metadata: { contentId: content.id },
    })
  })
  return button
}

function renderGalleryContentNode(
  context: QuaWebDomLayerContext,
  content: GalleryContentBlock,
  entry: GalleryEntryProjectionItem,
): Node {
  switch (content.kind) {
    case 'image': {
      const image = content as GalleryImageContentBlock
      return renderGalleryMediaElement(context, 'img', {
        className: 'qua-gallery-content-media qua-gallery-content-media--image',
        asset: image.asset,
        alt: image.title || image.asset.alt || entry.title,
      })
    }
    case 'video': {
      const video = content as GalleryVideoContentBlock
      return renderGalleryMediaElement(context, 'video', {
        className: 'qua-gallery-content-media qua-gallery-content-media--video',
        asset: video.asset,
        poster: video.poster,
        controls: true,
        playsInline: true,
        muted: false,
        alt: video.title || entry.title,
      })
    }
    case 'audio':
      return renderGalleryAudioNode(context, content as GalleryAudioContentBlock, entry)
    case 'text': {
      const text = context.document.createElement('p')
      text.className = 'qua-gallery-content-text'
      text.textContent = (content as GalleryTextContentBlock).text
      return text
    }
    default: {
      const custom = content as GalleryCustomContentBlock
      const pre = context.document.createElement('pre')
      pre.className = 'qua-gallery-content-custom'
      pre.textContent = JSON.stringify(custom.data, null, 2)
      return pre
    }
  }
}

function renderGalleryMediaElement(
  context: QuaWebDomLayerContext,
  tag: 'img' | 'video' | 'audio',
  options: {
    className: string
    asset: GalleryAssetRef
    poster?: GalleryAssetRef
    alt?: string
    controls?: boolean
    playsInline?: boolean
    muted?: boolean
  },
): Node {
  if (tag === 'img') {
    const image = context.document.createElement('img')
    image.className = options.className
    image.alt = options.alt || ''
    image.setAttribute('aria-hidden', 'true')
    bindStoryAsset(context, image, options.asset, 'src')
    return image
  }

  if (tag === 'video') {
    const video = context.document.createElement('video')
    video.className = options.className
    video.controls = options.controls !== false
    video.playsInline = options.playsInline !== false
    video.muted = options.muted !== false
    video.loop = true
    video.preload = 'metadata'
    video.setAttribute('aria-label', options.alt || '')
    bindStoryAsset(context, video, options.asset, 'src')
    if (options.poster) {
      bindStoryAsset(context, video, options.poster, 'poster')
    }
    return video
  }

  const audio = context.document.createElement('audio')
  audio.className = options.className
  audio.controls = options.controls !== false
  audio.preload = 'metadata'
  audio.setAttribute('aria-label', options.alt || '')
  bindStoryAsset(context, audio, options.asset, 'src')
  return audio
}

function mediaElementTagForAsset(asset: GalleryAssetRef): 'img' | 'video' | 'audio' {
  if (asset.type === 'video' || asset.type === 'audio') {
    return asset.type
  }
  return 'img'
}

function renderGalleryAudioNode(
  context: QuaWebDomLayerContext,
  content: GalleryAudioContentBlock,
  entry: GalleryEntryProjectionItem,
): Node {
  const wrapper = context.document.createElement('div')
  wrapper.className = 'qua-gallery-content-audio'

  if (content.poster) {
    const poster = context.document.createElement('img')
    poster.className = 'qua-gallery-content-audio-poster'
    poster.alt = content.title || content.poster.alt || entry.title
    bindStoryAsset(context, poster, content.poster, 'src')
    wrapper.append(poster)
  }

  wrapper.append(renderGalleryMediaElement(context, 'audio', {
    className: 'qua-gallery-content-media qua-gallery-content-media--audio',
    asset: content.asset,
    controls: true,
    alt: content.title || entry.title,
  }))

  return wrapper
}

function renderGalleryAssetPreview(
  context: QuaWebDomLayerContext,
  asset: GalleryAssetRef,
  alt: string,
): Node {
  switch (asset.type) {
    case 'images': {
      const image = context.document.createElement('img')
      image.className = 'qua-gallery-asset-preview qua-gallery-asset-preview--image'
      image.alt = alt || asset.alt || ''
      bindStoryAsset(context, image, asset, 'src')
      return image
    }
    case 'video': {
      const video = context.document.createElement('video')
      video.className = 'qua-gallery-asset-preview qua-gallery-asset-preview--video'
      video.autoplay = false
      video.controls = true
      video.muted = true
      video.loop = true
      video.playsInline = true
      video.preload = 'metadata'
      video.setAttribute('aria-label', alt || asset.alt || '')
      bindStoryAsset(context, video, asset, 'src')
      return video
    }
    case 'audio': {
      const audio = context.document.createElement('audio')
      audio.className = 'qua-gallery-asset-preview qua-gallery-asset-preview--audio'
      audio.controls = true
      audio.preload = 'metadata'
      audio.setAttribute('aria-label', alt || asset.alt || '')
      bindStoryAsset(context, audio, asset, 'src')
      return audio
    }
    default: {
      const placeholder = context.document.createElement('div')
      placeholder.className = 'qua-gallery-asset-preview qua-gallery-asset-preview--placeholder'
      placeholder.textContent = alt || asset.alt || asset.name
      return placeholder
    }
  }
}

function renderGalleryEmptyState(context: QuaWebDomLayerContext, label: string): Node {
  const empty = context.document.createElement('p')
  empty.className = 'qua-gallery-empty'
  empty.textContent = label
  return empty
}

function bindStoryAsset(
  context: QuaWebDomLayerContext,
  element: HTMLImageElement | HTMLVideoElement | HTMLAudioElement,
  asset: GalleryAssetRef,
  attribute: 'src' | 'poster',
): void {
  context.bindAssetUrl(element, asset.type as AssetType, asset.name, attribute, runtimePackageCandidatesFromGalleryAsset(asset))
}

function runtimePackageCandidatesFromGalleryAsset(asset: GalleryAssetRef): readonly string[] | undefined {
  return runtimePackageCandidatesFromMetadata({
    ...(asset.metadata || {}),
    ...(asset.runtimePackageId ? { contentPackageId: asset.runtimePackageId } : {}),
  })
}

function gallerySummaryText(model: GalleryProjectionModel): string {
  const unlocked = model.entries.filter(entry => entry.unlocked).length
  return `${unlocked}/${model.entries.length}`
}
