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
    const locked = findNode(surface.root, 'gallery-entry-0')
    const media = findNode(surface.root, 'gallery-preview-media')

    expect(surface.key).toBe(GALLERY_NATIVE_SURFACE_KEY)
    expect(locked?.text).toBe('Locked Record')
    expect(locked?.image).toBeUndefined()
    expect(media?.image).toEqual({ assetName: 'cg/arrival.jpg', assetType: 'images' })
    expect(media?.provenance).toEqual({
      contentPackageId: 'runtime.gallery',
      requiredRuntimePackages: ['runtime.gallery', 'runtime.images'],
    })
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
