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
  const visibleEntries = centeredWindow(filteredEntries, selectedEntry?.id, MAX_ENTRIES)
  const catalogWidth = Math.min(190, (listWidth - edge) / Math.max(1, Math.min(MAX_CATALOGS, projection.catalogs.length)))
  const entryGap = 12
  const entryHeight = Math.max(72, (bodyHeight - entryGap * Math.max(0, visibleEntries.length - 1)) / Math.max(1, visibleEntries.length))

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
        style: { backgroundColor: '#10151b', borderColor: '#596675', borderRadius: 6, borderWidth: 1 },
        children: [
          node('gallery-title', 'Text', {
            x: panel.x + edge,
            y: panel.y + edge * 0.45,
            width: listWidth - edge * 2,
            height: 42,
          }, {
            text: projection.catalogs.find(item => item.id === projection.selectedCatalogId)?.title || 'Gallery',
            style: { color: '#f5f7fa', fontSize: 34, fontWeight: 700 },
            provenance,
          }),
          node('gallery-count', 'Text', {
            x: panel.x + panel.width - edge - 250,
            y: panel.y + edge * 0.55,
            width: 130,
            height: 36,
          }, {
            text: `${filteredEntries.filter(entry => entry.unlocked).length}/${filteredEntries.length}`,
            style: { color: '#aeb8c4', fontSize: 20, textAlign: 'right' },
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
            style: buttonStyle('#263748'),
            provenance,
          }),
          node('gallery-close', 'Button', {
            x: panel.x + panel.width - edge - 104,
            y: panel.y + edge * 0.45,
            width: 104,
            height: 44,
          }, {
            text: 'Close',
            intent: uiIntent(ACTIONS.close),
            style: buttonStyle('#303843'),
            provenance,
          }),
          ...projection.catalogs.slice(0, MAX_CATALOGS).map((catalog, index) => node(
            `gallery-catalog-${catalog.id}`,
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
              style: buttonStyle(catalog.id === projection.selectedCatalogId ? '#735d35' : '#222a34'),
              provenance: mergeProvenance(provenance, itemProvenance(catalog)),
            },
          )),
          ...visibleEntries.map((entry, index) => createEntryButton(entry, {
            x: panel.x + edge,
            y: bodyTop + index * (entryHeight + entryGap),
            width: listWidth - edge * 1.5,
            height: entryHeight,
          }, entry.id === selectedEntry?.id, provenance)),
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
  bounds: NativeUiSurfaceRect,
  selected: boolean,
  inherited: NativePackageProvenance,
): NativeUiSurfaceNodeProjection {
  const provenance = mergeProvenance(inherited, itemProvenance(entry))
  const thumbnail = assetImage(entry.thumbnail)
  return node(`gallery-entry-${entry.id}`, 'Button', bounds, {
    text: entry.title || (entry.unlocked ? 'Gallery entry' : 'Locked'),
    image: thumbnail,
    intent: uiIntent(ACTIONS.selectEntry, { entryId: entry.id }),
    provenance,
    style: {
      ...buttonStyle(selected ? '#66502f' : '#1b222b'),
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
  const contentButtons = entry.contents.slice(0, 5)
  const tabsHeight = contentButtons.length > 1 ? 48 : 0
  const titleHeight = 92
  const mediaBounds = {
    x: bounds.x,
    y: bounds.y + titleHeight + tabsHeight,
    width: bounds.width,
    height: Math.max(0, bounds.height - titleHeight - tabsHeight),
  }
  const previewAsset = contentAsset(content) || assetImage(entry.poster) || assetImage(entry.thumbnail)
  return node('gallery-preview', 'Panel', bounds, {
    provenance,
    style: { backgroundColor: '#171d25', borderRadius: 4 },
    children: [
      node('gallery-preview-title', 'Text', {
        x: bounds.x + 18,
        y: bounds.y + 14,
        width: bounds.width - 36,
        height: 34,
      }, {
        text: entry.title,
        style: { color: '#f2f4f7', fontSize: 27, fontWeight: 700 },
        provenance,
      }),
      node('gallery-preview-summary', 'Text', {
        x: bounds.x + 18,
        y: bounds.y + 52,
        width: bounds.width - 36,
        height: 32,
      }, {
        text: entry.summary || (entry.unlocked ? '' : 'Locked'),
        style: { color: '#aab4c0', fontSize: 17, textOverflow: 'ellipsis' },
        provenance,
      }),
      ...contentButtons.map((item, index) => node(`gallery-content-${item.id}`, 'Button', {
        x: bounds.x + index * (bounds.width / contentButtons.length),
        y: bounds.y + titleHeight,
        width: bounds.width / contentButtons.length - 6,
        height: 40,
      }, {
        text: item.title || item.kind,
        intent: uiIntent(ACTIONS.selectContent, { contentId: item.id }),
        style: buttonStyle(item.id === content?.id ? '#5b4a31' : '#242d37'),
        provenance: mergeProvenance(provenance, itemProvenance(item)),
      })),
      node('gallery-preview-media', previewAsset ? 'Image' : 'Text', mediaBounds, {
        image: previewAsset,
        text: previewAsset ? undefined : previewText(content, entry),
        style: previewAsset
          ? { objectFit: 'contain', backgroundColor: '#090c10' }
          : { color: '#d8dde4', fontSize: 22, textAlign: 'center', whiteSpace: 'pre-wrap' },
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

function centeredWindow(entries: readonly GalleryEntryProjectionItem[], selectedId: string | undefined, size: number) {
  const selectedIndex = Math.max(0, entries.findIndex(entry => entry.id === selectedId))
  const start = Math.max(0, Math.min(selectedIndex - Math.floor(size / 2), entries.length - size))
  return entries.slice(start, start + size)
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

function buttonStyle(backgroundColor: string) {
  return {
    backgroundColor,
    borderColor: '#657180',
    borderRadius: 4,
    borderWidth: 1,
    color: '#f1f4f7',
    fontSize: 17,
    textAlign: 'center' as const,
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
