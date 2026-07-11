import type { NativeUiSurfaceNodeProjection } from '@quajs/native-ui-compiler'
import {
  createNativeRendererJsonFrameInput,
  resolveNativeRendererFeatureIntent,
} from '@quajs/engine-native'
import { describe, expect, it } from 'vitest'
import { AchievementRenderToLogicEvents } from '../src/contracts'
import {
  ACHIEVEMENT_NATIVE_BOARD_SURFACE_KEY,
  ACHIEVEMENT_NATIVE_TOAST_SURFACE_KEY,
  createAchievementNativeRendererFeature,
} from '../src/native'

describe('achievement native renderer feature', () => {
  it('keeps notifications visible independently from the board scene', () => {
    const feature = createAchievementNativeRendererFeature()
    const overlays = feature.createOverlays({
      logicalHeight: 1080,
      logicalWidth: 1920,
      projection: {
        notifications: [{
          achievementId: 'first-contact',
          createdAt: 1,
          durationMs: 3200,
          id: 'toast-1',
          mode: 'toast',
          title: 'First Contact',
        }],
        requiredRuntimePackages: [],
        sceneActive: false,
      },
      safeArea: { x: 96, y: 0, width: 1728, height: 1080 },
      view: {},
    })

    expect(overlays).toEqual([
      expect.objectContaining({
        elementId: 'achievement-toast-0',
        overlayStack: 'toast',
        surface: expect.objectContaining({ key: ACHIEVEMENT_NATIVE_TOAST_SURFACE_KEY }),
      }),
    ])
  })

  it('separates board and toast surfaces while masking locked hidden details', () => {
    const frame = createNativeRendererJsonFrameInput({
      layout: { width: 1920, height: 1080, aspectRatio: 16 / 9, minAspectRatio: 16 / 10 },
      plugins: {
        achievement: {
          achievements: [{
            id: 'secret',
            title: 'Secret Ending',
            summary: 'A hidden route',
            description: 'Spoiler text',
            hidden: true,
            unlocked: false,
            icon: { type: 'images', name: 'achievement/secret.png' },
            requiredRuntimePackages: ['runtime.achievements'],
          }],
          filter: { includeHidden: true },
          filteredAchievementIds: ['secret'],
          groups: [],
          notificationMode: 'toast',
          notifications: [{
            achievementId: 'visible',
            contentPackageId: 'runtime.toast',
            createdAt: 1,
            durationMs: 3200,
            icon: { type: 'images', name: 'achievement/visible.png' },
            id: 'toast-1',
            mode: 'toast',
            requiredRuntimePackages: ['runtime.icons'],
            title: 'Unlocked',
          }],
          profileId: 'default',
          requiredRuntimePackages: ['runtime.achievements'],
          revision: 1,
          sceneActive: true,
          selectedAchievementId: 'secret',
        },
      },
    }, { featureSurfaces: [createAchievementNativeRendererFeature()] })

    const overlays = (frame.view.ui as { overlays: Array<Record<string, unknown>> }).overlays
    const board = overlays.find(item => item.elementId === 'achievement-board')!
    const toast = overlays.find(item => item.elementId === 'achievement-toast-0')!
    const boardSurface = board.surface as { key: string, root: NativeUiSurfaceNodeProjection }
    const toastSurface = toast.surface as { key: string, root: NativeUiSurfaceNodeProjection }
    const item = findNode(boardSurface.root, 'achievement-item-0')
    const title = findNode(boardSurface.root, 'achievement-detail-title')
    const image = findNode(boardSurface.root, 'achievement-detail-image')

    expect(boardSurface.key).toBe(ACHIEVEMENT_NATIVE_BOARD_SURFACE_KEY)
    expect(toastSurface.key).toBe(ACHIEVEMENT_NATIVE_TOAST_SURFACE_KEY)
    expect(item?.text).toBe('Hidden Achievement  Locked')
    expect(item?.image).toBeUndefined()
    expect(title?.text).toBe('Hidden Achievement')
    expect(image).toBeUndefined()
    expect(toast.provenance).toEqual({
      contentPackageId: 'runtime.toast',
      requiredRuntimePackages: ['runtime.achievements', 'runtime.icons'],
    })
  })

  it('maps only allowlisted actions to achievement-owned events', () => {
    const entries = [createAchievementNativeRendererFeature()]
    expect(resolveNativeRendererFeatureIntent(entries, 'achievement-select-item', { achievementId: 'first' })).toEqual({
      event: AchievementRenderToLogicEvents.SELECT_ACHIEVEMENT_REQUEST,
      payload: { achievementId: 'first' },
    })
    expect(resolveNativeRendererFeatureIntent(entries, 'achievement-toggle-hidden', { includeHidden: true })).toEqual({
      event: AchievementRenderToLogicEvents.UPDATE_FILTER_REQUEST,
      payload: { filter: { includeHidden: true }, replace: false },
    })
    expect(resolveNativeRendererFeatureIntent(entries, 'achievement-dismiss-notification', {
      achievementId: 'first',
      notificationId: 'toast-1',
    })).toEqual({
      event: AchievementRenderToLogicEvents.DISMISS_NOTIFICATION_REQUEST,
      payload: { achievementId: 'first', notificationId: 'toast-1' },
    })
    expect(resolveNativeRendererFeatureIntent(entries, 'achievement-unlock', {})).toBeUndefined()
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
