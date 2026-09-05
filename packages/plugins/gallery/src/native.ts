import type { NativeRendererFeatureSurfaceContext, NativeRendererFeatureSurfaceEntry } from '@quajs/engine-native'
import type {
  NativePackageProvenance,
  NativeUiSurfaceNodeProjection,
  NativeUiSurfaceRect,
} from '@quajs/native-ui-compiler'
import type {
  GalleryContentBlock,
  GalleryEntryProjectionItem,
  GalleryProjection,
} from './contracts'
import { RenderToLogicEvents } from '@quajs/engine'
import { GALLERY_PLUGIN_ID, GalleryRenderToLogicEvents } from './contracts'

export const GALLERY_NATIVE_RENDERER_ENTRY = '@quajs/plugin-gallery/native' as const
export const GALLERY_NATIVE_SURFACE_KEY = 'plugin-gallery/native' as const

const ACTIONS = {
  close: 'gallery-close',
  closePreview: 'gallery-close-preview',
  selectCatalog: 'gallery-select-catalog',
  selectContent: 'gallery-select-content',
  selectEntry: 'gallery-select-entry',
  toggleUnlocked: 'gallery-toggle-unlocked',
} as const
const MAX_CATALOGS = 5
export interface GalleryNativeRendererOptions {
  /** Logical stage panel size; content overflows through native Scroll nodes. */
  maxWidth?: number
  maxHeight?: number
  layout?: 'grid' | 'split'
}


export function createGalleryNativeRendererFeature(options: GalleryNativeRendererOptions = {}): NativeRendererFeatureSurfaceEntry {
  return {
    pluginId: GALLERY_PLUGIN_ID,
    createOverlays: context => createGalleryNativeOverlay(context, options),
    intentActions: [
      {
        action: ACTIONS.closePreview,
        event: RenderToLogicEvents.UI_REQUEST_CLOSE,
        createPayload: () => ({ elementId: 'gallery-preview' }),
      },
      {
        action: ACTIONS.close,
        event: GalleryRenderToLogicEvents.CLOSE_REQUEST,
        createPayload: () => ({}),
      },
      {
        action: ACTIONS.selectCatalog,
        event: GalleryRenderToLogicEvents.SELECT_CATALOG_REQUEST,
        createPayload: payload => ({ catalogId: requiredString(payload.catalogId, 'catalogId') }),
      },
      {
        action: ACTIONS.selectEntry,
        event: GalleryRenderToLogicEvents.SELECT_ENTRY_REQUEST,
        createPayload: payload => ({ entryId: requiredString(payload.entryId, 'entryId') }),
      },
      {
        action: ACTIONS.selectContent,
        event: GalleryRenderToLogicEvents.SELECT_CONTENT_REQUEST,
        createPayload: payload => ({ contentId: requiredString(payload.contentId, 'contentId') }),
      },
      {
        action: ACTIONS.toggleUnlocked,
        event: GalleryRenderToLogicEvents.UPDATE_FILTER_REQUEST,
        createPayload: payload => ({
          filter: { unlockedOnly: payload.unlockedOnly === true },
          replace: false,
        }),
      },
    ],
  }
}

function createGalleryNativeOverlay(context: NativeRendererFeatureSurfaceContext, options: GalleryNativeRendererOptions) {
  const projection = context.projection as unknown as GalleryProjection & Record<string, unknown>
  if (projection.sceneActive !== true) {
    return undefined
  }
  const provenance = normalizeProvenance(
    stringValue(projection.contentPackageId),
    projection.requiredRuntimePackages || [],
  )
  return {
    elementId: GALLERY_PLUGIN_ID,
    visible: true,
    renderMode: 'render-only' as const,
    interactive: true,
    overlayStack: stringValue(projection.overlayStack) || 'overlay',
    stackPriority: finiteInteger(projection.stackPriority),
    zIndex: finiteInteger(projection.zIndex) ?? 70,
    surface: {
      key: GALLERY_NATIVE_SURFACE_KEY,
      root: createGalleryRoot(context, projection, provenance, options),
    },
    ...provenance,
  }
}

function createGalleryRoot(
  context: NativeRendererFeatureSurfaceContext,
  projection: GalleryProjection,
  provenance: NativePackageProvenance,
  options: GalleryNativeRendererOptions,
): NativeUiSurfaceNodeProjection {
  const edge = 28
  const available = inset(context.safeArea, edge)
  const width = Math.min(available.width, positiveSize(options.maxWidth, 1180))
  const height = Math.min(available.height, positiveSize(options.maxHeight, 760))
  const panel = { x: available.x + (available.width - width) / 2,
    y: available.y + (available.height - height) / 2, width, height }
  const grid = options.layout === 'grid'
  const headerHeight = grid ? 122 : Math.max(118, panel.height * 0.14)
  const bodyTop = panel.y + headerHeight
  const bodyHeight = panel.height - headerHeight - edge
  const listWidth = grid ? panel.width - edge * 0.5 : panel.width * 0.56
  const previewX = panel.x + listWidth + edge * 0.5
  const previewWidth = panel.x + panel.width - previewX - edge
  const filteredEntries = projection.filteredEntryIds
    .map(id => projection.entries.find(entry => entry.id === id))
    .filter((entry): entry is GalleryEntryProjectionItem => Boolean(entry))
  const selectedEntry = projection.entries.find(entry => entry.id === projection.selectedEntryId)
    || filteredEntries[0]
  const selectedContent = selectedEntry?.contents.find(content => content.id === projection.selectedContentId)
    || selectedEntry?.contents[0]
  const entryGap = 10
  const entriesWidth = listWidth - edge * 1.5 - (grid ? 32 : 0)
  const columns = Math.max(1, Math.floor((entriesWidth + entryGap) / 220))
  const entryWidth = (entriesWidth - (columns - 1) * entryGap) / columns
  const entryHeight = entryWidth * 9 / 16 + 92
  const catalogWidth = Math.min(190, (listWidth - edge) / Math.max(1, Math.min(MAX_CATALOGS, projection.catalogs.length)))

  return node('gallery-root', 'Fragment', stage(context), {
    provenance,
    children: [
      node('gallery-backdrop', 'Backdrop', stage(context), {
        intent: uiIntent(ACTIONS.close),
        style: { backgroundColor: '#05070a', opacity: 0.88 },
        provenance,
      }),
      node('gallery-panel', 'Panel', panel, {
        provenance,
        style: {
          backgroundColor: 'rgba(6,7,11,0.96)',
          backgroundGradient: {
            kind: 'linear',
            angleDegrees: 180,
            stops: [
              { color: 'rgba(18,20,28,0.97)', position: 0 },
              { color: 'rgba(5,6,10,0.97)', position: 1 },
            ],
          },
          borderColor: 'rgba(245,226,190,0.32)',
          borderRadius: 2,
          borderWidth: 1,
          boxShadow: panelShadow(),
        },
        children: [
          node('gallery-title', 'Text', {
            x: panel.x + edge,
            y: panel.y + edge,
            width: listWidth - edge * 2 - (grid ? 220 : 0),
            height: 42,
          }, {
            text: projection.catalogs.find(item => item.id === projection.selectedCatalogId)?.title || 'Gallery',
            style: {
              color: '#fff8ea',
              fontSize: 38,
              fontFamily: ['Noto Serif'],
              fontWeight: 700,
              textShadow: titleShadow(),
            },
            provenance,
          }),
          node('gallery-count-badge', 'Panel', {
            x: panel.x + panel.width - edge - 182, y: panel.y + edge + 5,
            width: 130, height: 34,
          }, { provenance, style: { backgroundColor: 'rgba(229,193,111,0.18)',
            borderColor: 'rgba(229,193,111,0.34)', borderWidth: 1 } }),
          node('gallery-count', 'Text', {
            x: panel.x + panel.width - edge - 250,
            y: panel.y + edge + 4,
            width: 190,
            height: 36,
          }, {
            text: `UNLOCKED  ${filteredEntries.filter(entry => entry.unlocked).length}/${filteredEntries.length}`,
            style: { color: 'rgba(255,226,166,0.82)', fontSize: 13, textAlign: 'right', letterSpacing: 1 },
            provenance,
          }),
          ...(!grid ? [node('gallery-unlocked-filter', 'Button', {
            x: panel.x + panel.width - edge - 360,
            y: panel.y + edge * 0.45,
            width: 104,
            height: 44,
          }, {
            text: projection.filter.unlockedOnly ? 'All' : 'Unlocked',
            intent: uiIntent(ACTIONS.toggleUnlocked, { unlockedOnly: projection.filter.unlockedOnly !== true }),
            style: glassButtonStyle(false),
            provenance,
          })] : []),
          node('gallery-close', 'Button', {
            x: panel.x + panel.width - edge - 44,
            y: panel.y + edge,
            width: 44,
            height: 44,
          }, {
            text: '×',
            intent: uiIntent(ACTIONS.close),
            style: closeButtonStyle(),
            provenance,
          }),
          ...(!grid ? [node('gallery-catalogs-scroll', 'Scroll', {
            x: panel.x + edge,
            y: panel.y + 68,
            width: listWidth - edge,
            height: 50,
          }, {
            clipChildren: true,
            provenance,
            children: projection.catalogs.map((catalog, index) => node(
              `gallery-catalog-${index}`,
              'Button',
              {
                x: panel.x + edge + index * catalogWidth,
                y: panel.y + 68,
                width: catalogWidth - 8,
                height: 42,
              },
              {
                text: `${catalog.title} ${catalog.unlockedEntries}/${catalog.totalEntries}`,
                intent: uiIntent(ACTIONS.selectCatalog, { catalogId: catalog.id }),
                style: catalogButtonStyle(catalog.id === projection.selectedCatalogId),
                provenance: mergeProvenance(provenance, itemProvenance(catalog)),
              },
            )),
          })] : []),
          ...(grid ? [node('gallery-entry-pane', 'Panel', {
            x: panel.x + edge + 1, y: panel.y + 87, width: panel.width - edge * 2 - 2,
            height: panel.height - 87 - edge - 1,
          }, { provenance, style: { backgroundColor: 'rgba(6,7,11,0.8)',
            borderColor: 'rgba(245,226,190,0.16)', borderWidth: 1 } })] : []),
          ...(grid ? [node('gallery-entries-label', 'Text', {
            x: panel.x + edge + 12, y: panel.y + 96, width: 200, height: 16,
          }, { text: 'ENTRIES', provenance, style: { color: '#ffe3a0', fontSize: 10, letterSpacing: 1.2 } })] : []),
          node('gallery-entries-scroll', 'Scroll', {
            x: panel.x + edge + (grid ? 14 : 0),
            y: bodyTop,
            width: entriesWidth,
            height: bodyHeight - (grid ? 14 : 0),
          }, {
            clipChildren: true,
            provenance,
            children: filteredEntries.length > 0
              ? filteredEntries.map((entry, index) => createEntryButton(entry, index, {
                  x: panel.x + edge + (grid ? 14 : 0) + (index % columns) * (entryWidth + entryGap),
                  y: bodyTop + Math.floor(index / columns) * (entryHeight + entryGap),
                  width: entryWidth,
                  height: entryHeight,
                }, entry.id === selectedEntry?.id, provenance))
              : [node('gallery-entries-empty', 'Text', {
                  x: panel.x + edge,
                  y: bodyTop,
                  width: listWidth - edge * 1.5,
                  height: bodyHeight,
                }, {
                  text: 'No gallery entries',
                  style: { color: '#9ea8b4', fontSize: 22, textAlign: 'center' },
                  provenance,
                })],
          }),
          ...(!grid ? [createPreview(selectedEntry, selectedContent, {
            x: previewX,
            y: bodyTop,
            width: previewWidth,
            height: bodyHeight,
          }, provenance)] : []),
        ],
      }),
      ...(grid && previewVisible(context.view)
        ? [createLightbox(context, selectedEntry, selectedContent, provenance)] : []),
    ],
  })
}

function previewVisible(view: Readonly<Record<string, unknown>>): boolean {
  const ui = view.ui as { overlays?: Record<string, { open?: boolean, visible?: boolean }> } | undefined
  const preview = ui?.overlays?.['gallery-preview']
  return !!preview && preview.open !== false && preview.visible !== false
}

function createLightbox(
  context: NativeRendererFeatureSurfaceContext,
  entry: GalleryEntryProjectionItem | undefined,
  content: GalleryContentBlock | undefined,
  inherited: NativePackageProvenance,
): NativeUiSurfaceNodeProjection {
  const asset = contentAsset(content) || entry?.poster || entry?.thumbnail
  const image = assetImage(asset)
  const provenance = mergeProvenance(itemProvenance(asset), itemProvenance(content), itemProvenance(entry), inherited)
  const bounds = { x: 64, y: 36, width: context.logicalWidth - 128, height: context.logicalHeight - 72 }
  const caption = content?.title || entry?.title || ''
  const captionWidth = Math.min(720, Array.from(caption).length * 15 + 32)
  // Layer propagates its z-index to every descendant. A Panel only lifts its
  // own fill, leaving image/controls below the gallery cards and the backdrop.
  return node('gallery-lightbox', 'Layer', stage(context), {
    zIndex: 1000, provenance,
    children: [
      node('gallery-lightbox-backdrop', 'Backdrop', stage(context), {
        provenance, intent: uiIntent(ACTIONS.closePreview),
        style: { backgroundColor: 'rgba(0,0,0,0.78)' },
      }),
      node('gallery-lightbox-media', image ? 'Image' : 'Text', bounds, {
        image, text: image ? undefined : entry ? previewText(content, entry) : '', provenance,
        style: { objectFit: 'contain', color: '#fff8ea', fontSize: 20, whiteSpace: 'pre-wrap' },
      }),
      node('gallery-lightbox-close', 'Button', { x: bounds.x + bounds.width - 66,
        y: bounds.y + 22, width: 42, height: 42 }, {
        text: '×', intent: uiIntent(ACTIONS.closePreview), provenance, style: closeButtonStyle(),
      }),
      node('gallery-lightbox-caption-panel', 'Panel', {
        x: context.logicalWidth / 2 - captionWidth / 2, y: bounds.y + bounds.height - 66,
        width: captionWidth, height: 36,
      }, { provenance, style: { backgroundColor: 'rgba(229,193,111,0.22)',
        borderColor: 'rgba(245,226,190,0.22)', borderWidth: 1 }, children: [
        node('gallery-lightbox-caption', 'Text', {
          x: context.logicalWidth / 2 - captionWidth / 2, y: bounds.y + bounds.height - 66,
          width: captionWidth, height: 36,
        }, { text: caption, provenance, style: { color: '#fff8ea', fontSize: 15, textAlign: 'center' } }),
      ] }),
    ],
  })
}

function createEntryButton(
  entry: GalleryEntryProjectionItem,
  index: number,
  bounds: NativeUiSurfaceRect,
  selected: boolean,
  inherited: NativePackageProvenance,
): NativeUiSurfaceNodeProjection {
  const provenance = mergeProvenance(inherited, itemProvenance(entry))
  // The plugin has already applied lockedPresentation. Never replace its safe
  // placeholders or opt-in content with renderer-owned unlock policy.
  const thumbnail = assetImage(entry.thumbnail)
  const previewHeight = bounds.width * 9 / 16
  return node(`gallery-entry-${index}`, 'Button', bounds, {
    intent: uiIntent(ACTIONS.selectEntry, { entryId: entry.id }),
    provenance,
    style: entryButtonStyle(selected),
    children: [
      node(`gallery-entry-${index}-preview-background`, 'Panel', { ...bounds, height: previewHeight }, {
        provenance, style: { backgroundColor: 'rgba(3,4,7,0.58)' },
      }),
      node(`gallery-entry-${index}-thumbnail`, thumbnail ? 'Image' : 'Text', {
        ...bounds, height: previewHeight,
      }, {
        image: thumbnail,
        text: thumbnail ? undefined : entry.unlocked ? 'No preview' : 'LOCKED',
        provenance: mergeProvenance(itemProvenance(entry.thumbnail), provenance),
        style: { objectFit: 'cover', color: '#ffe3a0', fontSize: 11, letterSpacing: 1.98, textAlign: 'center', backgroundColor: 'rgba(3,4,7,0.58)' },
      }),
      node(`gallery-entry-${index}-title`, 'Text', {
        x: bounds.x + 11, y: bounds.y + previewHeight + 5,
        width: bounds.width - 22, height: 28,
      }, { text: entry.title, provenance,
        style: { color: '#fff8ea', fontSize: 14, fontWeight: 700, textOverflow: 'ellipsis' } }),
      node(`gallery-entry-${index}-summary`, 'Text', {
        x: bounds.x + 11, y: bounds.y + previewHeight + 28,
        width: bounds.width - 22, height: 30,
      }, { text: entry.summary || '', provenance,
        style: { color: 'rgba(247,242,234,0.56)', fontSize: 12, textOverflow: 'ellipsis' } }),
      node(`gallery-entry-${index}-badge`, 'Panel', {
        x: bounds.x + 11, y: bounds.y + previewHeight + 59, width: 60, height: 20,
      }, { provenance, style: { borderColor: 'rgba(245,226,190,0.18)', borderWidth: 1 } }),
      node(`gallery-entry-${index}-state`, 'Text', {
        x: bounds.x + 11, y: bounds.y + previewHeight + 61, width: 60, height: 18,
      }, { text: entry.unlocked ? (entry.tags || []).join(' · ').toUpperCase() : 'LOCKED', provenance,
        style: { color: '#ffe3a0', fontSize: 10, letterSpacing: 1.2 } }),
    ],
  })
}

function createPreview(
  entry: GalleryEntryProjectionItem | undefined,
  content: GalleryContentBlock | undefined,
  bounds: NativeUiSurfaceRect,
  inherited: NativePackageProvenance,
): NativeUiSurfaceNodeProjection {
  if (!entry) {
    return node('gallery-preview-empty', 'Text', bounds, {
      text: 'No gallery entries',
      style: { color: '#9ea8b4', fontSize: 24, textAlign: 'center' },
      provenance: inherited,
    })
  }
  const provenance = mergeProvenance(inherited, itemProvenance(entry), itemProvenance(content))
  const contentButtons = entry.contents
  const tabsHeight = contentButtons.length > 1 ? 48 : 0
  const titleHeight = 92
  const mediaBounds = {
    x: bounds.x,
    y: bounds.y + titleHeight + tabsHeight,
    width: bounds.width,
    height: Math.max(0, bounds.height - titleHeight - tabsHeight),
  }
  const previewRef = contentAsset(content) || entry.poster || entry.thumbnail
  const previewAsset = assetImage(previewRef)
  return node('gallery-preview', 'Panel', bounds, {
    provenance,
    style: {
      backgroundColor: 'rgba(18,22,31,0.74)',
      backgroundGradient: {
        kind: 'linear',
        angleDegrees: 180,
        stops: [
          { color: 'rgba(18,22,31,0.74)', position: 0 },
          { color: 'rgba(6,7,11,0.80)', position: 1 },
        ],
      },
      borderColor: 'rgba(245,226,190,0.16)',
      borderRadius: 2,
      borderWidth: 1,
    },
    children: [
      node('gallery-preview-title', 'Text', {
        x: bounds.x + 18,
        y: bounds.y + 14,
        width: bounds.width - 36,
        height: 30,
      }, {
        text: entry.title,
        style: { color: '#fff8ea', fontSize: 20, fontWeight: 700 },
        provenance,
      }),
      node('gallery-preview-summary', 'Text', {
        x: bounds.x + 18,
        y: bounds.y + 48,
        width: bounds.width - 36,
        height: 28,
      }, {
        text: entry.summary || '',
        style: { color: 'rgba(247,242,234,0.56)', fontSize: 14, textOverflow: 'ellipsis' },
        provenance,
      }),
      node('gallery-content-scroll', 'Scroll', {
        x: bounds.x, y: bounds.y + titleHeight, width: bounds.width, height: tabsHeight,
      }, { clipChildren: true, provenance, children: contentButtons.length > 1 ? contentButtons.map((item, index) => node(`gallery-content-${index}`, 'Button', {
        x: bounds.x + index * 128,
        y: bounds.y + titleHeight,
        width: 120,
        height: 40,
      }, {
        text: item.title || item.kind,
        intent: uiIntent(ACTIONS.selectContent, { contentId: item.id }),
        style: contentTabStyle(item.id === content?.id),
        provenance: mergeProvenance(provenance, itemProvenance(item)),
      })) : [] }),
      node('gallery-preview-media', previewAsset ? 'Image' : 'Text', mediaBounds, {
        image: previewAsset,
        text: previewAsset ? undefined : previewText(content, entry),
        style: previewAsset
          ? { objectFit: 'contain', backgroundColor: 'rgba(0,0,0,0.48)' }
          : { color: 'rgba(255,250,242,0.88)', fontSize: 16, textAlign: 'center', whiteSpace: 'pre-wrap' },
        provenance: mergeProvenance(itemProvenance(previewRef), provenance),
      }),
    ],
  })
}

function previewText(content: GalleryContentBlock | undefined, entry: GalleryEntryProjectionItem): string {
  if (content?.kind === 'text' && 'text' in content) {
    return content.text
  }
  return content ? `${content.kind} preview` : entry.unlocked ? 'No preview' : 'Locked'
}

function contentAsset(content: GalleryContentBlock | undefined) {
  if (!content) {
    return undefined
  }
  if ('poster' in content) {
    const poster = content.poster
    if (poster) {
      return poster
    }
  }
  return content.kind === 'image' && 'asset' in content
    ? content.asset
    : undefined
}

function assetImage(asset: { name: string, type: string } | undefined) {
  return asset && asset.name && asset.type === 'images'
    ? { assetName: asset.name, assetType: asset.type }
    : undefined
}

function itemProvenance(item: { runtimePackageId?: string, contentPackageId?: string, requiredRuntimePackages?: readonly string[] } | undefined) {
  return normalizeProvenance(item?.runtimePackageId || item?.contentPackageId, item?.requiredRuntimePackages || [])
}

function node(
  id: string,
  kind: NativeUiSurfaceNodeProjection['kind'],
  bounds: NativeUiSurfaceRect,
  options: Omit<NativeUiSurfaceNodeProjection, 'bounds' | 'id' | 'kind' | 'visible'> = {},
): NativeUiSurfaceNodeProjection {
  return { id, kind, bounds, visible: true, ...options }
}

function uiIntent(action: string, metadata?: Record<string, boolean | string>) {
  return { action, event: 'ui/intent' as const, metadata }
}

function entryButtonStyle(selected: boolean) {
  return {
    backgroundColor: 'rgba(20,24,33,0.90)',
    backgroundGradient: {
      kind: 'linear' as const,
      angleDegrees: 180,
      stops: selected
        ? [{ color: 'rgba(20,24,33,0.90)', position: 0 }, { color: 'rgba(7,8,12,0.94)', position: 1 }]
        : [{ color: 'rgba(20,24,33,0.90)', position: 0 }, { color: 'rgba(7,8,12,0.94)', position: 1 }],
    },
    borderColor: selected ? 'rgba(129,229,255,0.62)' : 'rgba(245,226,190,0.20)',
    borderRadius: 2,
    borderWidth: 1,
    color: '#fff8ea',
    fontSize: 14,
    textAlign: 'left' as const,
  }
}

function catalogButtonStyle(selected: boolean) {
  return {
    backgroundColor: selected ? 'rgba(17,48,62,0.76)' : 'rgba(9,12,18,0.90)',
    backgroundGradient: {
      kind: 'linear' as const,
      angleDegrees: 90,
      stops: selected
        ? [{ color: 'rgba(17,48,62,0.76)', position: 0 }, { color: 'rgba(10,12,18,0.84)', position: 1 }]
        : [{ color: 'rgba(9,12,18,0.90)', position: 0 }, { color: 'rgba(23,27,37,0.62)', position: 1 }],
    },
    borderColor: selected ? 'rgba(129,229,255,0.50)' : 'rgba(245,226,190,0.20)',
    borderRadius: 0,
    borderWidth: 1,
    color: selected ? '#d8f8ff' : 'rgba(255,250,242,0.84)',
    fontSize: 12,
    letterSpacing: 1,
    textAlign: 'center' as const,
  }
}

function glassButtonStyle(active: boolean) {
  return {
    backgroundColor: active ? 'rgba(20,54,66,0.82)' : 'rgba(9,12,18,0.82)',
    backgroundGradient: {
      kind: 'linear' as const,
      angleDegrees: 90,
      stops: active
        ? [{ color: 'rgba(20,54,66,0.82)', position: 0 }, { color: 'rgba(13,16,24,0.84)', position: 1 }]
        : [{ color: 'rgba(9,12,18,0.90)', position: 0 }, { color: 'rgba(23,27,37,0.66)', position: 1 }],
    },
    borderColor: active ? 'rgba(129,229,255,0.72)' : 'rgba(245,226,190,0.24)',
    borderRadius: 2,
    borderWidth: 1,
    color: active ? '#d8f8ff' : 'rgba(255,250,242,0.90)',
    fontSize: 13,
    textAlign: 'center' as const,
  }
}

function closeButtonStyle() {
  return {
    backgroundColor: 'rgba(255,248,234,0.92)',
    borderColor: 'rgba(245,226,190,0.28)',
    borderRadius: 2,
    borderWidth: 1,
    color: '#0d0d12',
    fontSize: 28,
    textAlign: 'center' as const,
  }
}

function contentTabStyle(selected: boolean) {
  return {
    backgroundColor: selected ? 'rgba(129,229,255,0.08)' : 'rgba(255,255,255,0.04)',
    borderColor: selected ? 'rgba(129,229,255,0.52)' : 'rgba(245,226,190,0.18)',
    borderRadius: 2,
    borderWidth: 1,
    color: selected ? '#d8f8ff' : 'rgba(247,242,234,0.68)',
    fontSize: 13,
    textAlign: 'center' as const,
  }
}

function panelShadow() {
  return {
    offsetX: 0,
    offsetY: 32,
    blurRadius: 120,
    spreadRadius: 0,
    color: 'rgba(0,0,0,0.72)',
    inset: false,
  }
}

function titleShadow() {
  return {
    offsetX: 0,
    offsetY: 2,
    blurRadius: 10,
    spreadRadius: 0,
    color: 'rgba(0,0,0,0.72)',
    inset: false,
  }
}

function stage(context: NativeRendererFeatureSurfaceContext): NativeUiSurfaceRect {
  return { x: 0, y: 0, width: context.logicalWidth, height: context.logicalHeight }
}

function inset(rect: NativeUiSurfaceRect, amount: number): NativeUiSurfaceRect {
  return {
    x: rect.x + amount,
    y: rect.y + amount,
    width: Math.max(0, rect.width - amount * 2),
    height: Math.max(0, rect.height - amount * 2),
  }
}

function mergeProvenance(...items: readonly NativePackageProvenance[]) {
  return normalizeProvenance(
    items.map(item => item.contentPackageId).find(Boolean),
    items.flatMap(item => [...(item.requiredRuntimePackages || []), ...(item.contentPackageId ? [item.contentPackageId] : [])]),
  )
}

function normalizeProvenance(contentPackageId: string | undefined, requiredRuntimePackages: readonly string[]) {
  const packages = [...new Set(requiredRuntimePackages.map(item => item.trim()).filter(Boolean))].sort()
  return {
    ...(contentPackageId ? { contentPackageId } : {}),
    ...(packages.length > 0 ? { requiredRuntimePackages: packages } : {}),
  }
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Native gallery intent requires string payload field "${field}".`)
  }
  return value
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function finiteInteger(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : undefined
}

function positiveSize(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) && value > 0 ? value : fallback
}
