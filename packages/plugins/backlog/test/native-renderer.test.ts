import type { NativeUiSurfaceNodeProjection } from '@quajs/native-ui-compiler'
import {
  createNativeRendererJsonFrameInput,
  resolveNativeRendererFeatureIntent,
} from '@quajs/engine-native'
import { describe, expect, it } from 'vitest'
import { BacklogRenderToLogicEvents } from '../src/contracts'
import {
  BACKLOG_NATIVE_SURFACE_KEY,
  createBacklogNativeRendererFeature,
} from '../src/native'

describe('backlog native renderer feature', () => {
  it('does not create a native overlay while the engine-owned projection is hidden', () => {
    const feature = createBacklogNativeRendererFeature()
    const result = feature.createOverlays({
      logicalWidth: 1920,
      logicalHeight: 1080,
      projection: { visible: false, entries: [] },
      safeArea: { x: 96, y: 0, width: 1728, height: 1080 },
      view: {},
    })

    expect(result).toBeUndefined()
  })

  it('serializes recent entries in logical safe-area coordinates with package provenance', () => {
    const feature = createBacklogNativeRendererFeature()
    const frame = createNativeRendererJsonFrameInput({
      layout: {
        width: 1920,
        height: 1080,
        aspectRatio: 16 / 9,
        minAspectRatio: 16 / 10,
      },
      plugins: {
        backlog: {
          contentPackageId: 'runtime.backlog',
          entries: [{
            id: 'line-1',
            kind: 'dialogue',
            gameTimeMs: 3_723_000,
            recordedAt: 1,
            rewindable: true,
            voiceReplay: true,
            speaker: 'Mira',
            text: 'Remember this line.',
            point: {
              stepId: 'step-1',
              contentPackageId: 'runtime.story',
              requiredRuntimePackages: ['runtime.characters'],
            },
            requiredRuntimePackages: ['runtime.story'],
            voice: {
              assetKey: 'voice/mira-1.ogg',
              contentPackageId: 'runtime.voice',
              requiredRuntimePackages: ['runtime.audio'],
            },
          }],
          requiredRuntimePackages: ['runtime.base'],
          visible: true,
        },
      },
    }, { featureSurfaces: [feature] })

    const overlay = (frame.view.ui as { overlays: Array<Record<string, unknown>> }).overlays[0]
    const surface = overlay.surface as { key: string, root: NativeUiSurfaceNodeProjection }
    const panel = findNode(surface.root, 'backlog-panel')
    const title = findNode(surface.root, 'backlog-title')
    const entry = findNode(surface.root, 'backlog-entry-0')
    const jump = findNode(surface.root, 'backlog-entry-0-jump')
    const voice = findNode(surface.root, 'backlog-entry-0-voice')

    expect(surface.key).toBe(BACKLOG_NATIVE_SURFACE_KEY)
    expect(overlay.provenance).toEqual({
      contentPackageId: 'runtime.backlog',
      requiredRuntimePackages: ['runtime.base'],
    })
    expect(panel?.bounds.x).toBeGreaterThanOrEqual(96)
    expect((panel?.bounds.x || 0) + (panel?.bounds.width || 0)).toBeLessThanOrEqual(1824)
    expect(panel?.style?.boxShadow).toEqual(expect.objectContaining({ blurRadius: 48, offsetY: 18 }))
    expect(title?.style?.textShadow).toEqual(expect.objectContaining({ blurRadius: 10, offsetY: 2 }))
    expect(entry?.provenance).toEqual({
      contentPackageId: 'runtime.backlog',
      requiredRuntimePackages: [
        'runtime.audio',
        'runtime.base',
        'runtime.characters',
        'runtime.story',
      ],
    })
    expect(entry?.bounds.height).toBeLessThanOrEqual(140)
    expect(jump?.intent).toEqual({
      action: 'backlog-jump',
      event: 'ui/intent',
      metadata: { entryId: 'line-1' },
    })
    expect(voice?.intent).toEqual({
      action: 'backlog-replay-voice',
      event: 'ui/intent',
      metadata: { entryId: 'line-1' },
    })
  })

  it('allowlists native actions to existing backlog pipeline events', () => {
    const entries = [createBacklogNativeRendererFeature()]

    expect(resolveNativeRendererFeatureIntent(entries, 'backlog-close', {})).toEqual({
      event: BacklogRenderToLogicEvents.CLOSE_REQUEST,
      payload: { source: 'native' },
    })
    expect(resolveNativeRendererFeatureIntent(entries, 'backlog-jump', { entryId: 'line-1' })).toEqual({
      event: BacklogRenderToLogicEvents.JUMP_REQUEST,
      payload: { entryId: 'line-1' },
    })
    expect(resolveNativeRendererFeatureIntent(entries, 'backlog-replay-voice', { entryId: 'line-1' })).toEqual({
      event: BacklogRenderToLogicEvents.REPLAY_VOICE_REQUEST,
      payload: { entryId: 'line-1' },
    })
    expect(resolveNativeRendererFeatureIntent(entries, 'arbitrary-event', {})).toBeUndefined()
  })
})

function findNode(
  root: NativeUiSurfaceNodeProjection,
  id: string,
): NativeUiSurfaceNodeProjection | undefined {
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
