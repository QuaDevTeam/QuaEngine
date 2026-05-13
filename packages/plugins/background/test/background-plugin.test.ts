import type { QuaEngineInterface } from '@quajs/engine'
import { createViewLayoutProjection } from '@quajs/render-core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  addBackgroundLayerWithEngine,
  backgroundDecoratorMappings,
  BackgroundPlugin,
  clearBackgroundLayersWithEngine,
  clearBackgroundWithEngine,
  removeBackgroundLayerWithEngine,
  setBackgroundWithEngine,
  setLayeredBackgroundWithEngine,
  setVideoBackgroundWithEngine,
  transitionBackgroundLayerWithEngine,
  transitionBackgroundWithEngine,
  updateBackgroundLayerWithEngine,
} from '../src'
import { createBackgroundMotionTimeline, fadeZoom, kenBurns } from '../src/animation'

describe('@quajs/plugin-background', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('registers APIs and QuaScript decorators', () => {
    const plugin = new BackgroundPlugin()
    const registration = plugin.registerAPIs()

    expect(registration.pluginName).toBe('@quajs/plugin-background')
    expect(registration.apis.map(api => api.name)).toEqual(expect.arrayContaining([
      'setBackgroundWithEngine',
      'setVideoBackgroundWithEngine',
      'setLayeredBackgroundWithEngine',
      'addBackgroundLayerWithEngine',
      'transitionBackgroundWithEngine',
      'transitionBackgroundLayerWithEngine',
    ]))
    expect(registration.decorators).toEqual(backgroundDecoratorMappings)
  })

  it('writes image and clear intents through engine projection API', async () => {
    const engine = createEngine()

    await setBackgroundWithEngine(engine, 'classroom.png', {
      fit: 'cover',
      origin: 'center center',
      composition: { filter: { brightness: 1.1 } },
    })
    expect(engine.setBackgroundProjection).toHaveBeenLastCalledWith({
      mode: 'image',
      assetName: 'classroom.png',
      fit: 'cover',
      origin: 'center center',
      transition: undefined,
      composition: { filter: { brightness: 1.1 } },
      video: undefined,
      layers: undefined,
      metadata: undefined,
    })

    await clearBackgroundWithEngine(engine)
    expect(engine.setBackgroundProjection).toHaveBeenLastCalledWith(undefined)
  })

  it('writes video background projection state', async () => {
    const engine = createEngine()

    await setVideoBackgroundWithEngine(engine, 'rain.mp4', {
      loop: true,
      muted: false,
      volume: 0.8,
      playbackRate: 1.25,
      poster: 'rain.png',
      fit: 'cover',
    })

    expect(engine.getViewState().background).toEqual({
      mode: 'video',
      assetName: 'rain.mp4',
      fit: 'cover',
      transition: undefined,
      video: {
        assetName: 'rain.mp4',
        loop: true,
        muted: false,
        volume: 0.8,
        playbackRate: 1.25,
        poster: 'rain.png',
        transition: undefined,
        metadata: undefined,
      },
      layers: undefined,
      composition: undefined,
      metadata: undefined,
    })
  })

  it('replaces backgrounds through animation timelines when transition is requested', async () => {
    vi.useFakeTimers()
    const engine = createEngine()
    await setBackgroundWithEngine(engine, 'old-room.png')

    const pending = setBackgroundWithEngine(engine, 'new-room.png', {
      transition: { type: 'fade', duration: 120 },
    })
    await vi.advanceTimersByTimeAsync(0)

    expect(engine.setAnimationProjection).toHaveBeenCalledWith(expect.objectContaining({
      duration: 120,
      resolvedTracks: expect.arrayContaining([
        expect.objectContaining({
          target: 'backgroundLayer:__qua_transition_old_main',
          property: 'opacity',
        }),
        expect.objectContaining({
          target: 'backgroundLayer:__qua_transition_new_main',
          property: 'opacity',
        }),
      ]),
    }))
    expect(engine.getViewState().background).toEqual(expect.objectContaining({
      mode: 'layered',
      layers: expect.arrayContaining([
        expect.objectContaining({ id: '__qua_transition_old_main', assetName: 'old-room.png' }),
        expect.objectContaining({ id: '__qua_transition_new_main', assetName: 'new-room.png', opacity: 0 }),
      ]),
    }))

    await vi.advanceTimersByTimeAsync(120)
    await pending

    expect(engine.getViewState().background).toEqual(expect.objectContaining({
      mode: 'image',
      assetName: 'new-room.png',
      transition: undefined,
    }))
  })

  it('supports layered backgrounds and deterministic layer ordering', async () => {
    const engine = createEngine()

    await setLayeredBackgroundWithEngine(engine, [{
      id: 'sky',
      assetName: 'sky.png',
      fit: 'cover',
      origin: 'center center',
      zIndex: 10,
      composition: {
        blendMode: 'normal',
        filter: { brightness: 1 },
      },
    }])
    await addBackgroundLayerWithEngine(engine, {
      id: 'clouds',
      assetName: 'clouds.png',
      opacity: 0.7,
      zIndex: 5,
      composition: {
        blendMode: 'screen',
        filter: { blur: 2, brightness: 1.2 },
        mask: { assetName: 'clouds-mask.png' },
      },
    })
    await updateBackgroundLayerWithEngine(engine, 'clouds', {
      x: 20,
      y: 12,
      scale: 1.1,
      composition: {
        filter: { blur: 4 },
      },
    })

    expect(engine.getViewState().background).toEqual({
      mode: 'layered',
      layers: [
        expect.objectContaining({
          id: 'clouds',
          assetName: 'clouds.png',
          zIndex: 5,
          x: 20,
          y: 12,
          scale: 1.1,
          composition: {
            blendMode: 'screen',
            filter: { blur: 4, brightness: 1.2 },
            mask: { assetName: 'clouds-mask.png' },
          },
        }),
        expect.objectContaining({
          id: 'sky',
          assetName: 'sky.png',
          fit: 'cover',
          origin: 'center center',
          zIndex: 10,
          composition: {
            blendMode: 'normal',
            filter: { brightness: 1 },
          },
        }),
      ],
      video: undefined,
      transition: undefined,
      composition: undefined,
      metadata: undefined,
    })

    await removeBackgroundLayerWithEngine(engine, 'sky')
    expect(engine.getViewState().background?.layers).toEqual([
      expect.objectContaining({ id: 'clouds' }),
    ])

    await clearBackgroundLayersWithEngine(engine)
    expect(engine.getViewState().background?.layers).toEqual([])
  })

  it('plays current background visibility transitions through animation', async () => {
    vi.useFakeTimers()
    const engine = createEngine()

    await setBackgroundWithEngine(engine, 'room.png')
    const pending = transitionBackgroundWithEngine(engine, { type: 'fade-out', duration: 240, easing: 'ease-out' })
    await vi.advanceTimersByTimeAsync(0)

    expect(engine.setAnimationProjection).toHaveBeenCalledWith(expect.objectContaining({
      duration: 240,
      resolvedTracks: [
        expect.objectContaining({
          target: 'background:main',
          property: 'opacity',
        }),
      ],
    }))

    await vi.advanceTimersByTimeAsync(240)
    await pending

    expect(engine.getViewState().background).toEqual(expect.objectContaining({
      mode: 'image',
      assetName: 'room.png',
      opacity: 0,
    }))
  })

  it('plays single layered background transitions through animation', async () => {
    vi.useFakeTimers()
    const engine = createEngine()

    await addBackgroundLayerWithEngine(engine, { id: 'fog', assetName: 'fog.png' })
    const pending = transitionBackgroundLayerWithEngine(engine, 'fog', { type: 'fade-out', duration: 180 })
    await vi.advanceTimersByTimeAsync(0)

    expect(engine.setAnimationProjection).toHaveBeenCalledWith(expect.objectContaining({
      duration: 180,
      resolvedTracks: [
        expect.objectContaining({
          target: 'backgroundLayer:fog',
          property: 'opacity',
        }),
      ],
    }))

    await vi.advanceTimersByTimeAsync(180)
    await pending

    expect(engine.getViewState().background?.layers).toEqual([
      expect.objectContaining({ id: 'fog', opacity: 0 }),
    ])
  })

  it('creates background motion timelines through the animation sub-entry', () => {
    expect(createBackgroundMotionTimeline('backgroundLayer:fog', [
      { at: 0, x: 0, blur: 0 },
      { at: 1000, x: 40, blur: 6 },
    ], { duration: 1000 }).tracks).toEqual([
      expect.objectContaining({ target: 'backgroundLayer:fog', property: 'x' }),
      expect.objectContaining({ target: 'backgroundLayer:fog', property: 'composition.filter.blur' }),
    ])

    expect(kenBurns({ duration: 2000 }).tracks.map(track => track.property)).toEqual(['x', 'y', 'scale'])
    expect(fadeZoom({ opacityFrom: 0, opacityTo: 1 }).tracks.map(track => track.property)).toEqual(['scale', 'opacity'])
  })
})

function createEngine(): QuaEngineInterface {
  let background: ReturnType<QuaEngineInterface['getViewState']>['background']
  let animations: ReturnType<QuaEngineInterface['getViewState']>['animations'] = []
  return {
    setBackgroundProjection: vi.fn(async (next) => {
      background = next
    }),
    setAnimationProjection: vi.fn(async (animation) => {
      animations = [
        ...animations.filter(existing => existing.id !== animation.id),
        animation,
      ]
    }),
    removeAnimationProjection: vi.fn(async (id) => {
      animations = animations.filter(animation => animation.id !== id)
    }),
    getViewState: vi.fn(() => ({
      layout: createViewLayoutProjection(),
      background,
      characters: [],
      dialogue: { visible: false, text: '' },
      choices: [],
      ui: { visible: true },
      effects: [],
      animations,
      plugins: {},
    })),
  } as unknown as QuaEngineInterface
}
