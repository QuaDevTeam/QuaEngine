import type { NativeUiSurfaceNodeProjection } from '@quajs/native-ui-compiler'
import {
  createNativeRendererJsonFrameInput,
  resolveNativeRendererFeatureIntent,
} from '@quajs/engine-native'
import { describe, expect, it } from 'vitest'
import { GalleryRenderToLogicEvents } from '../src/contracts'
import {
  createGalleryNativeRendererFeature,
  GALLERY_NATIVE_SURFACE_KEY,
} from '../src/native'

describe('gallery native renderer feature', () => {
  it('does not create a surface outside the engine-owned gallery scene', () => {
    const feature = createGalleryNativeRendererFeature()
    expect(feature.createOverlays({
      logicalHeight: 1080,
      logicalWidth: 1920,
      projection: { sceneActive: false },
      safeArea: { x: 96, y: 0, width: 1728, height: 1080 },
      view: {},
    })).toBeUndefined()
  })

  it('renders spoiler-safe projection data and package-aware selected media', () => {
    const frame = createNativeRendererJsonFrameInput({
      layout: { width: 1920, height: 1080, aspectRatio: 16 / 9, minAspectRatio: 16 / 10 },
      plugins: {
        gallery: {
          catalogs: [{
            id: 'main',
            title: 'Main CG',
            entryIds: ['locked', 'arrival'],
            totalEntries: 2,
            unlockedEntries: 1,
            lockedEntries: 1,
          }],
          entries: [
            {
              id: 'locked',
              catalogId: 'main',
              title: 'Locked Record',
              contents: [],
              unlocked: false,
            },
            {
              id: 'arrival',
              catalogId: 'main',
              title: 'Arrival',
              summary: 'Recovered scene',
              thumbnail: { type: 'images', name: 'cg/arrival-thumb.jpg', runtimePackageId: 'runtime.gallery' },
              contents: [{
                id: 'image',
                kind: 'image',
                asset: { type: 'images', name: 'cg/arrival.jpg', runtimePackageId: 'runtime.gallery' },
                contentPackageId: 'runtime.gallery',
                requiredRuntimePackages: ['runtime.images'],
              }],
              unlocked: true,
              contentPackageId: 'runtime.gallery',
              requiredRuntimePackages: ['runtime.gallery'],
            },
          ],
          filter: {},
          filteredEntryIds: ['locked', 'arrival'],
          profileId: 'default',
          requiredRuntimePackages: ['runtime.gallery'],
          revision: 1,
          sceneActive: true,
          selectedCatalogId: 'main',
          selectedContentId: 'image',
          selectedEntryId: 'arrival',
        },
      },
    }, { featureSurfaces: [createGalleryNativeRendererFeature()] })

    const overlay = (frame.view.ui as { overlays: Array<Record<string, unknown>> }).overlays[0]
    const surface = overlay.surface as { key: string, root: NativeUiSurfaceNodeProjection }
    const locked = findNode(surface.root, 'gallery-entry-0-title')
    const media = findNode(surface.root, 'gallery-preview-media')
    const panel = findNode(surface.root, 'gallery-panel')
    const title = findNode(surface.root, 'gallery-title')

    expect(surface.key).toBe(GALLERY_NATIVE_SURFACE_KEY)
    expect(locked?.text).toBe('Locked Record')
    expect(locked?.image).toBeUndefined()
    expect(media?.image).toEqual({ assetName: 'cg/arrival.jpg', assetType: 'images' })
    expect(media?.provenance).toEqual({
      contentPackageId: 'runtime.gallery',
      requiredRuntimePackages: ['runtime.gallery', 'runtime.images'],
    })
    expect(panel?.style?.boxShadow).toEqual(expect.objectContaining({ blurRadius: 120, offsetY: 32 }))
    expect(title?.style?.textShadow).toEqual(expect.objectContaining({ blurRadius: 10, offsetY: 2 }))
  })

  it('keeps all content tabs reachable and renders only image resources', () => {
    const contents = Array.from({ length: 9 }, (_, i) => ({
      id: `content-${i}`, kind: 'image', asset: { type: 'images', name: `cg/${i}.png` },
    }))
    const projection = {
      sceneActive: true, catalogs: [], filter: {}, filteredEntryIds: ['safe'],
      selectedEntryId: 'safe', selectedContentId: 'content-8',
      entries: [{ id: 'safe', title: 'Safe locked preview', unlocked: false,
        thumbnail: { type: 'images', name: 'safe.png' }, contents }],
    }
    const feature = createGalleryNativeRendererFeature()
    const render = () => {
      const result = feature.createOverlays({ projection, view: {}, logicalWidth: 1920,
        logicalHeight: 1080, safeArea: { x: 0, y: 0, width: 1920, height: 1080 } })
      return (result as { surface: { root: NativeUiSurfaceNodeProjection } }).surface.root
    }
    let root = render()
    expect(findNode(root, 'gallery-content-scroll')?.clipChildren).toBe(true)
    expect(findNode(root, 'gallery-content-8')?.intent?.metadata).toEqual({ contentId: 'content-8' })
    expect(findNode(root, 'gallery-preview-media')?.image?.assetName).toBe('cg/8.png')
    expect(findNode(root, 'gallery-entry-0-title')?.text).toBe('Safe locked preview')
    expect(findNode(root, 'gallery-panel')?.bounds).toEqual(expect.objectContaining({ x: 370, width: 1180, height: 760 }))
    expect(findNode(root, 'gallery-panel')?.bounds.y).toBeCloseTo(160)
    // A movie without a poster must never be submitted to the image decoder.
    contents[8] = { id: 'content-8', kind: 'video', asset: { type: 'video', name: 'movie.mp4' } }
    projection.entries[0].thumbnail = { type: 'images', name: 'safe.png' }
    root = render()
    expect(findNode(root, 'gallery-preview-media')?.image?.assetName).toBe('safe.png')
  })

  it('projects the demo grid and an explicitly opened image preview through UI intents', () => {
    const feature = createGalleryNativeRendererFeature({ layout: 'grid' })
    const result = feature.createOverlays({ logicalWidth: 1920, logicalHeight: 1080,
      safeArea: { x: 96, y: 0, width: 1728, height: 1080 },
      view: { ui: { overlays: { 'gallery-preview': { open: true } } } },
      projection: { sceneActive: true, catalogs: [], filter: {}, filteredEntryIds: ['image'],
        selectedEntryId: 'image', entries: [{ id: 'image', title: 'Image', unlocked: true,
          contents: [{ id: 'cg', kind: 'image', asset: {
            type: 'images', name: 'cg.png', runtimePackageId: 'image-owner',
          } }], requiredRuntimePackages: ['catalog-owner'] }] },
    }) as { surface: { root: NativeUiSurfaceNodeProjection } }
    const root = result.surface.root
    expect(findNode(root, 'gallery-preview')).toBeUndefined()
    expect(findNode(root, 'gallery-lightbox')?.kind).toBe('Layer')
    expect(findNode(root, 'gallery-lightbox-media')?.image?.assetName).toBe('cg.png')
    expect(findNode(root, 'gallery-lightbox-media')?.provenance?.requiredRuntimePackages)
      .toEqual(['catalog-owner', 'image-owner'])
    expect(findNode(root, 'gallery-lightbox-close')?.intent?.action).toBe('gallery-close-preview')
  })

  it('maps only allowlisted actions to gallery-owned events', () => {
    const entries = [createGalleryNativeRendererFeature()]
    expect(resolveNativeRendererFeatureIntent(entries, 'gallery-close', {})).toEqual({
      event: GalleryRenderToLogicEvents.CLOSE_REQUEST,
      payload: {},
    })
    expect(resolveNativeRendererFeatureIntent(entries, 'gallery-select-entry', { entryId: 'arrival' })).toEqual({
      event: GalleryRenderToLogicEvents.SELECT_ENTRY_REQUEST,
      payload: { entryId: 'arrival' },
    })
    expect(resolveNativeRendererFeatureIntent(entries, 'gallery-select-content', { contentId: 'image' })).toEqual({
      event: GalleryRenderToLogicEvents.SELECT_CONTENT_REQUEST,
      payload: { contentId: 'image' },
    })
    expect(resolveNativeRendererFeatureIntent(entries, 'gallery-toggle-unlocked', { unlockedOnly: true })).toEqual({
      event: GalleryRenderToLogicEvents.UPDATE_FILTER_REQUEST,
      payload: { filter: { unlockedOnly: true }, replace: false },
    })
    expect(resolveNativeRendererFeatureIntent(entries, 'gallery/unlock', {})).toBeUndefined()
  })
})

function findNode(root: NativeUiSurfaceNodeProjection, id: string): NativeUiSurfaceNodeProjection | undefined {
  if (root.id === id) {
    return root
  }
  for (const child of root.children || []) {
    const found = findNode(child, id)
    if (found) {
      return found
    }
  }
  return undefined
}
