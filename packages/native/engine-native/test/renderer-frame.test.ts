import { describe, expect, it } from 'vitest'
import { createNativeRendererJsonFrameInput } from '../src'

describe('native renderer frame serialization', () => {
  it('passes engine-owned audio plugin projections to native JSON', () => {
    const frame = createNativeRendererJsonFrameInput({
      plugins: {
        audio: {
          requiredRuntimePackages: ['runtime.audio', 'runtime.audio'],
          buses: {
            master: { gainDb: -6 },
            bgm: { gainDb: -6 },
            voice: { gainDb: 0 },
            sfx: { gainDb: -3 },
            ambient: { gainDb: -12 },
          },
          bgm: {
            id: 'bgm-main',
            assetKey: 'audio/bgm/opening.ogg',
            state: 'playing',
            loop: true,
            gainDb: 6,
            durationMs: 2400,
            fadeInMs: 150,
            fadeOutMs: 300,
            crossfadeMs: 450,
            playAt: 1_700_000_000_750,
            delayMs: 750,
            seekMs: 1200,
            offsetMs: 50,
            contentPackageId: 'runtime.audio',
            metadata: {
              requiredRuntimePackages: ['base.audio'],
            },
          },
          voices: [
            {
              id: 'voice-1',
              assetKey: 'voice/ch01/mira-001.ogg',
              state: 'paused',
            },
          ],
          sfx: [
            {
              id: 'broken-sfx',
              state: 'playing',
            },
          ],
          ambients: [
            {
              id: 'rain',
              assetKey: 'audio/ambient/rain.ogg',
              state: 'stopping',
              loadMode: 'streamed',
              assetType: 'ambient',
            },
          ],
        },
      },
    })

    expect(frame.view.audio).toEqual({
      tracks: [
        {
          id: 'bgm-main',
          kind: 'bgm',
          assetName: 'audio/bgm/opening.ogg',
          assetType: 'bgm',
          playbackState: 'playing',
          looped: true,
          volume: 0.5011872336272722,
          durationMs: 2400,
          fadeInMs: 150,
          fadeOutMs: 300,
          crossfadeMs: 450,
          playAt: 1_700_000_000_750,
          delayMs: 750,
          seekMs: 1200,
          offsetMs: 50,
          provenance: {
            contentPackageId: 'runtime.audio',
            requiredRuntimePackages: ['base.audio', 'runtime.audio'],
          },
        },
        {
          id: 'voice-1',
          kind: 'voice',
          assetName: 'voice/ch01/mira-001.ogg',
          assetType: 'voice',
          playbackState: 'paused',
          volume: 0.5011872336272722,
          provenance: {
            requiredRuntimePackages: ['runtime.audio'],
          },
        },
        {
          id: 'rain',
          kind: 'ambient',
          assetName: 'audio/ambient/rain.ogg',
          assetType: 'ambient',
          loadMode: 'streamed',
          playbackState: 'stopping',
          volume: 0.12589254117941673,
          provenance: {
            requiredRuntimePackages: ['runtime.audio'],
          },
        },
      ],
    })
  })

  it('passes engine-owned font plugin projections to native JSON', () => {
    const frame = createNativeRendererJsonFrameInput({
      plugins: {
        fonts: {
          revision: 7,
          requiredRuntimePackages: ['runtime.fonts', 'runtime.fonts'],
          faces: [
            {
              id: 'noto-serif-jp-regular',
              family: 'Noto Serif JP',
              assetName: 'fonts/noto-serif-jp.woff2',
              weight: 500,
              style: 'normal',
              unicodeRange: 'U+3000-9FFF',
              contentPackageId: 'runtime.fonts',
              metadata: {
                requiredRuntimePackages: ['base'],
              },
            },
            {
              family: 'Broken',
            },
          ],
        },
      },
    })

    expect(frame.view.plugins).toEqual({
      fonts: {
        revision: 7,
        requiredRuntimePackages: ['runtime.fonts'],
        faces: [
          {
            id: 'noto-serif-jp-regular',
            family: 'Noto Serif JP',
            assetName: 'fonts/noto-serif-jp.woff2',
            assetType: 'fonts',
            weight: 500,
            style: 'normal',
            unicodeRange: 'U+3000-9FFF',
            provenance: {
              contentPackageId: 'runtime.fonts',
              requiredRuntimePackages: ['base'],
            },
          },
        ],
      },
    })
  })
})
