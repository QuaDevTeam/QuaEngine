import { describe, expect, it } from 'vitest'
import { createNativeRendererJsonFrameInput } from '../src'

describe('native renderer frame serialization', () => {
  it('serializes rich text font families as native string arrays', () => {
    const frame = createNativeRendererJsonFrameInput({
      dialogue: {
        visible: true,
        mode: 'say',
        speaker: 'Mira',
        speakerStyle: { fontFamily: 'Noto Sans' },
        text: {
          blocks: [{
            spans: [{
              text: 'High resolution text',
              fontFamily: ['Noto Sans', 'Noto Serif'],
            }],
          }],
        },
      },
    })

    expect(frame.view.dialogue).toEqual(expect.objectContaining({
      speakerStyle: expect.objectContaining({ fontFamily: ['Noto Sans'] }),
      text: {
        blocks: [{
          spans: [{
            text: 'High resolution text',
            style: { fontFamily: ['Noto Sans', 'Noto Serif'] },
          }],
        }],
        style: {},
      },
    }))
  })

  it('serializes a transient scene transition without mutating engine view state', () => {
    const view = { layout: { width: 1920, height: 1080 } }
    const frame = createNativeRendererJsonFrameInput(view, {
      sceneTransition: {
        active: true,
        type: 'wipe',
        fromScene: 'intro',
        toScene: 'chapter-1',
        duration: 320,
        startedAt: 1_000,
        progress: 0.5,
        easedProgress: 0.5,
      },
    })

    expect(frame.view.sceneTransition).toEqual(expect.objectContaining({
      active: true,
      type: 'wipe',
      toScene: 'chapter-1',
      progress: 0.5,
    }))
    expect(view).toEqual({ layout: { width: 1920, height: 1080 } })
  })

  it('merges registered feature surfaces from engine-owned plugin projections', () => {
    const view = {
      layout: {
        width: 1920,
        height: 1080,
        aspectRatio: 16 / 9,
        minAspectRatio: 16 / 10,
      },
      ui: {
        visible: true,
        overlays: {
          menu: { visible: true, zIndex: 10 },
        },
      },
      plugins: {
        backlog: {
          visible: true,
          entries: [{ id: 'line-1', text: 'Remember this.' }],
        },
      },
    }
    const frame = createNativeRendererJsonFrameInput(view, {
      featureSurfaces: [{
        pluginId: 'backlog',
        createOverlays: context => ({
          elementId: 'backlog',
          visible: context.projection.visible === true,
          renderMode: 'render-only',
          interactive: true,
          zIndex: 50,
          surface: {
            key: '@quajs/plugin-backlog/native',
            root: {
              id: 'backlog-root',
              kind: 'Panel',
              visible: true,
              bounds: context.safeArea,
              text: (context.projection.entries as Array<{ text: string }>)[0]?.text,
            },
          },
        }),
      }],
    })

    expect(frame.view.ui).toEqual(expect.objectContaining({
      overlays: [
        expect.objectContaining({ elementId: 'menu', zIndex: 10 }),
        expect.objectContaining({
          elementId: 'backlog',
          renderMode: 'render-only',
          surface: expect.objectContaining({
            key: '@quajs/plugin-backlog/native',
            root: expect.objectContaining({
              bounds: { x: 96, y: 0, width: 1728, height: 1080 },
              text: 'Remember this.',
            }),
          }),
        }),
      ],
    }))
    expect(view.ui.overlays).toEqual({ menu: { visible: true, zIndex: 10 } })
  })

  it('projects engine-owned animation timelines at a deterministic native frame time', () => {
    const view = {
      background: {
        mode: 'image',
        assetName: 'bg/station.png',
        scale: 1,
      },
      characters: [{
        id: 'mira',
        name: 'Mira',
        visible: true,
        sprite: 'mira/pose.png',
        opacity: 0,
        position: { x: 800, y: 640, scale: 1 },
      }],
      ui: {
        visible: true,
        overlays: {
          settings: {
            visible: true,
            zIndex: 10,
          },
        },
      },
      plugins: {
        audio: {
          buses: {
            master: { gainDb: 0 },
            bgm: { gainDb: -12 },
          },
          bgm: {
            id: 'theme',
            assetKey: 'audio/theme.ogg',
            state: 'playing',
          },
        },
      },
      animations: [{
        id: 'native-mid-frame',
        state: 'running',
        startedAt: 1_000,
        duration: 1_000,
        playbackRate: 1,
        resolvedTracks: [
          {
            target: 'effect:alarm',
            property: 'opacity',
            keyframes: [{ at: 0, value: 0 }, { at: 1_000, value: 0.6, easing: 'linear' }],
          },
          {
            target: 'character:mira',
            property: 'position.x',
            keyframes: [{ at: 0, value: 800 }, { at: 1_000, value: 1_200, easing: 'linear' }],
          },
          {
            target: 'character:mira',
            property: 'opacity',
            keyframes: [{ at: 0, value: 0 }, { at: 1_000, value: 1, easing: 'linear' }],
          },
          {
            target: 'background:main',
            property: 'scale',
            keyframes: [{ at: 0, value: 1 }, { at: 1_000, value: 1.2, easing: 'linear' }],
          },
          {
            target: 'audioBus:bgm',
            property: 'gainDb',
            keyframes: [{ at: 0, value: -12 }, { at: 1_000, value: -6, easing: 'linear' }],
          },
          {
            target: 'ui:settings',
            property: 'zIndex',
            keyframes: [{ at: 0, value: 10 }, { at: 1_000, value: 30, easing: 'linear' }],
          },
        ],
      }],
      effects: [{
        id: 'alarm',
        type: 'flash',
        intensity: 0.8,
        options: {
          color: '#ffffff',
          contentPackageId: 'runtime.effects',
          requiredRuntimePackages: ['base.effects'],
        },
      }],
    }

    const frame = createNativeRendererJsonFrameInput(view, { now: 1_500 })

    expect(frame.view.background).toEqual(expect.objectContaining({ scale: 1.1 }))
    expect(frame.view.effects).toEqual([
      expect.objectContaining({
        id: 'alarm',
        type: 'flash',
        opacity: 0.3,
        color: '#ffffff',
        provenance: {
          contentPackageId: 'runtime.effects',
          requiredRuntimePackages: ['base.effects'],
        },
      }),
    ])
    expect(frame.view.characters).toEqual([
      expect.objectContaining({
        id: 'mira',
        opacity: 0.5,
        position: expect.objectContaining({ x: 1_000, y: 640 }),
      }),
    ])
    expect(frame.view.ui).toEqual(expect.objectContaining({
      overlays: [expect.objectContaining({ elementId: 'settings', zIndex: 20 })],
    }))
    expect((frame.view.audio as any).tracks[0].volume).toBeCloseTo(10 ** (-9 / 20), 12)
    expect(view.background.scale).toBe(1)
    expect(view.characters[0].position.x).toBe(800)
    expect(view.ui.overlays.settings.zIndex).toBe(10)
  })

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
          bgmOutgoing: [
            {
              id: 'bgm-old',
              assetKey: 'audio/bgm/old.ogg',
              state: 'stopping',
              fadeOutMs: 450,
              crossfadeMs: 450,
              contentPackageId: 'runtime.audio.old',
              metadata: {
                requiredRuntimePackages: ['base.audio.old'],
              },
            },
          ],
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
          loadMode: 'buffered',
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
          id: 'bgm-old',
          kind: 'bgm',
          assetName: 'audio/bgm/old.ogg',
          assetType: 'bgm',
          loadMode: 'buffered',
          playbackState: 'stopping',
          volume: 0.251188643150958,
          fadeOutMs: 450,
          crossfadeMs: 450,
          provenance: {
            contentPackageId: 'runtime.audio.old',
            requiredRuntimePackages: ['base.audio.old', 'runtime.audio'],
          },
        },
        {
          id: 'voice-1',
          kind: 'voice',
          assetName: 'voice/ch01/mira-001.ogg',
          assetType: 'voice',
          loadMode: 'buffered',
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
