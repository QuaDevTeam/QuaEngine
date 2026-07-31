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
import { GALLERY_PLUGIN_ID, GalleryRenderToLogicEvents } from './contracts'

export const GALLERY_NATIVE_RENDERER_ENTRY = '@quajs/plugin-gallery/native' as const
export const GALLERY_NATIVE_SURFACE_KEY = 'plugin-gallery/native' as const

const ACTIONS = {
  close: 'gallery-close',
  selectCatalog: 'gallery-select-catalog',
  selectContent: 'gallery-select-content',
  selectEntry: 'gallery-select-entry',
  toggleUnlocked: 'gallery-toggle-unlocked',
} as const
const MAX_CATALOGS = 5
const MAX_ENTRIES = 6

export function createGalleryNativeRendererFeature(): NativeRendererFeatureSurfaceEntry {
  return {
    pluginId: GALLERY_PLUGIN_ID,
    createOverlays: createGalleryNativeOverlay,
    intentActions: [
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

function createGalleryNativeOverlay(context: NativeRendererFeatureSurfaceContext) {
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
      root: createGalleryRoot(context, projection, provenance),
    },
    ...provenance,
  }
}

function createGalleryRoot(
  context: NativeRendererFeatureSurfaceContext,
  projection: GalleryProjection,
  provenance: NativePackageProvenance,
): NativeUiSurfaceNodeProjection {
  const edge = Math.max(24, Math.min(context.safeArea.width, context.logicalHeight) * 0.03)
  const panel = inset(context.safeArea, edge)
  const headerHeight = Math.max(118, panel.height * 0.14)
  const bodyTop = panel.y + headerHeight
  const bodyHeight = panel.height - headerHeight - edge
  const listWidth = panel.width * 0.56
  const previewX = panel.x + listWidth + edge * 0.5
  const previewWidth = panel.x + panel.width - previewX - edge
  const filteredEntries = projection.filteredEntryIds
    .map(id => projection.entries.find(entry => entry.id === id))
    .filter((entry): entry is GalleryEntryProjectionItem => Boolean(entry))
  const selectedEntry = projection.entries.find(entry => entry.id === projection.selectedEntryId)
    || filteredEntries[0]
  const selectedContent = selectedEntry?.contents.find(content => content.id === projection.selectedContentId)
    || selectedEntry?.contents[0]
  const entryGap = 12
  const entryHeight = Math.max(72, (bodyHeight - entryGap * Math.max(0, Math.min(filteredEntries.length, MAX_ENTRIES) - 1)) / Math.max(1, Math.min(filteredEntries.length, MAX_ENTRIES)))
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
            y: panel.y + edge * 0.45,
            width: listWidth - edge * 2,
            height: 42,
          }, {
            text: projection.catalogs.find(item => item.id === projection.selectedCatalogId)?.title || 'Gallery',
            style: {
              color: '#fff8ea',
              fontSize: 34,
              fontWeight: 700,
              textShadow: titleShadow(),
            },
            provenance,
          }),
          node('gallery-count', 'Text', {
            x: panel.x + panel.width - edge - 250,
            y: panel.y + edge * 0.55,
            width: 130,
            height: 36,
          }, {
            text: `${filteredEntries.filter(entry => entry.unlocked).length} / ${filteredEntries.length}`,
            style: { color: 'rgba(255,226,166,0.82)', fontSize: 13, textAlign: 'right', letterSpacing: 1 },
            provenance,
          }),
          node('gallery-unlocked-filter', 'Button', {
            x: panel.x + panel.width - edge - 360,
            y: panel.y + edge * 0.45,
            width: 104,
            height: 44,
          }, {
            text: projection.filter.unlockedOnly ? 'All' : 'Unlocked',
            intent: uiIntent(ACTIONS.toggleUnlocked, { unlockedOnly: projection.filter.unlockedOnly !== true }),
            style: glassButtonStyle(false),
            provenance,
          }),
          node('gallery-close', 'Button', {
            x: panel.x + panel.width - edge - 44,
            y: panel.y + edge * 0.45,
            width: 44,
            height: 44,
          }, {
            text: '×',
            intent: uiIntent(ACTIONS.close),
            style: closeButtonStyle(),
            provenance,
          }),
          node('gallery-catalogs-scroll', 'Scroll', {
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
          }),
          node('gallery-entries-scroll', 'Scroll', {
            x: panel.x + edge,
            y: bodyTop,
            width: listWidth - edge * 1.5,
            height: bodyHeight,
          }, {
            clipChildren: true,
            provenance,
            children: filteredEntries.length > 0
              ? filteredEntries.map((entry, index) => createEntryButton(entry, index, {
                  x: panel.x + edge,
                  y: bodyTop + index * (entryHeight + entryGap),
                  width: listWidth - edge * 1.5,
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
          createPreview(selectedEntry, selectedContent, {
            x: previewX,
            y: bodyTop,
            width: previewWidth,
            height: bodyHeight,
          }, provenance),
        ],
      }),
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
  // When locked, suppress the real title and thumbnail unless the entry is unlocked.
  const thumbnail = entry.unlocked ? assetImage(entry.thumbnail) : undefined
  const displayTitle = entry.unlocked
    ? entry.title || 'Gallery entry'
    : 'Locked'
  return node(`gallery-entry-${index}`, 'Button', bounds, {
    text: displayTitle,
    image: thumbnail,
    intent: uiIntent(ACTIONS.selectEntry, { entryId: entry.id }),
    provenance,
    style: {
      ...entryButtonStyle(selected),
      objectFit: 'cover',
      textAlign: thumbnail ? 'right' : 'left',
    },
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
  const locked = !entry.unlocked
  // Suppress content tabs and media for locked entries.
  const contentButtons = locked ? [] : entry.contents.slice(0, 5)
  const tabsHeight = contentButtons.length > 1 ? 48 : 0
  const titleHeight = 92
  const mediaBounds = {
    x: bounds.x,
    y: bounds.y + titleHeight + tabsHeight,
    width: bounds.width,
    height: Math.max(0, bounds.height - titleHeight - tabsHeight),
  }
  const previewAsset = locked
    ? undefined
    : (contentAsset(content) || assetImage(entry.poster) || assetImage(entry.thumbnail))
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
        text: locked ? 'Locked' : entry.title,
        style: { color: '#fff8ea', fontSize: 20, fontWeight: 700 },
        provenance,
      }),
      node('gallery-preview-summary', 'Text', {
        x: bounds.x + 18,
        y: bounds.y + 48,
        width: bounds.width - 36,
        height: 28,
      }, {
        text: locked ? 'Unlock to view this entry.' : (entry.summary || ''),
        style: { color: 'rgba(247,242,234,0.56)', fontSize: 14, textOverflow: 'ellipsis' },
        provenance,
      }),
      ...contentButtons.map((item, index) => node(`gallery-content-${index}`, 'Button', {
        x: bounds.x + index * (bounds.width / contentButtons.length),
        y: bounds.y + titleHeight,
        width: bounds.width / contentButtons.length - 6,
        height: 40,
      }, {
        text: item.title || item.kind,
        intent: uiIntent(ACTIONS.selectContent, { contentId: item.id }),
        style: contentTabStyle(item.id === content?.id),
        provenance: mergeProvenance(provenance, itemProvenance(item)),
      })),
      node('gallery-preview-media', previewAsset ? 'Image' : 'Text', mediaBounds, {
        image: previewAsset,
        text: previewAsset ? undefined : previewText(content, entry),
        style: previewAsset
          ? { objectFit: 'contain', backgroundColor: 'rgba(0,0,0,0.48)' }
          : { color: 'rgba(255,250,242,0.88)', fontSize: 16, textAlign: 'center', whiteSpace: 'pre-wrap' },
        provenance,
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
    const poster = assetImage(content.poster)
    if (poster) {
      return poster
    }
  }
  return (content.kind === 'image' || content.kind === 'video') && 'asset' in content
    ? assetImage(content.asset)
    : undefined
}

function assetImage(asset: { name: string, type: string } | undefined) {
  return asset && asset.name && asset.type
    ? { assetName: asset.name, assetType: asset.type }
    : undefined
}

function itemProvenance(item: { contentPackageId?: string, requiredRuntimePackages?: readonly string[] } | undefined) {
  return normalizeProvenance(item?.contentPackageId, item?.requiredRuntimePackages || [])
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
    backgroundColor: selected ? 'rgba(40,28,14,0.90)' : 'rgba(20,24,33,0.90)',
    backgroundGradient: {
      kind: 'linear' as const,
      angleDegrees: 180,
      stops: selected
        ? [{ color: 'rgba(40,28,14,0.90)', position: 0 }, { color: 'rgba(14,10,5,0.94)', position: 1 }]
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
    items.flatMap(item => item.requiredRuntimePackages || []),
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
