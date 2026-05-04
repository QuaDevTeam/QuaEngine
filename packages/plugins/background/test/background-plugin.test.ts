import type { QuaEngineInterface } from '@quajs/engine'
import { describe, expect, it, vi } from 'vitest'
import {
  BackgroundPlugin,
  addBackgroundLayerWithEngine,
  backgroundDecoratorMappings,
  clearBackgroundLayersWithEngine,
  clearBackgroundWithEngine,
  removeBackgroundLayerWithEngine,
  setBackgroundWithEngine,
  setLayeredBackgroundWithEngine,
  setVideoBackgroundWithEngine,
  transitionBackgroundWithEngine,
  transitionBackgroundLayerWithEngine,
  updateBackgroundLayerWithEngine,
} from '../src'

describe('@quajs/plugin-background', () => {
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

    await setBackgroundWithEngine(engine, 'classroom.png', { type: 'fade', duration: 300 })
    expect(engine.setBackgroundProjection).toHaveBeenLastCalledWith({
      mode: 'image',
      assetName: 'classroom.png',
      transition: { type: 'fade', duration: 300 },
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
      transition: { type: 'fade', duration: 500 },
    })

    expect(engine.getViewState().background).toEqual({
      mode: 'video',
      assetName: 'rain.mp4',
      transition: { type: 'fade', duration: 500 },
      video: {
        assetName: 'rain.mp4',
        loop: true,
        muted: false,
        volume: 0.8,
        playbackRate: 1.25,
        poster: 'rain.png',
        transition: { type: 'fade', duration: 500 },
      },
      metadata: undefined,
    })
  })

  it('supports layered backgrounds and deterministic layer ordering', async () => {
    const engine = createEngine()

    await setLayeredBackgroundWithEngine(engine, [{
      id: 'sky',
      assetName: 'sky.png',
      zIndex: 10,
    }])
    await addBackgroundLayerWithEngine(engine, {
      id: 'clouds',
      assetName: 'clouds.png',
      opacity: 0.7,
      zIndex: 5,
    })
    await updateBackgroundLayerWithEngine(engine, 'clouds', {
      x: 20,
      y: 12,
      scale: 1.1,
    })

    expect(engine.getViewState().background).toEqual({
      mode: 'layered',
      layers: [
        expect.objectContaining({ id: 'clouds', assetName: 'clouds.png', zIndex: 5, x: 20, y: 12, scale: 1.1 }),
        expect.objectContaining({ id: 'sky', assetName: 'sky.png', zIndex: 10 }),
      ],
      transition: undefined,
      metadata: undefined,
    })

    await removeBackgroundLayerWithEngine(engine, 'sky')
    expect(engine.getViewState().background?.layers).toEqual([
      expect.objectContaining({ id: 'clouds' }),
    ])

    await clearBackgroundLayersWithEngine(engine)
    expect(engine.getViewState().background?.layers).toEqual([])
  })

  it('patches transitions without renderer-owned state', async () => {
    const engine = createEngine()

    await setBackgroundWithEngine(engine, 'room.png')
    await transitionBackgroundWithEngine(engine, { type: 'wipe', duration: 240, easing: 'ease-out' })

    expect(engine.getViewState().background).toEqual({
      mode: 'image',
      assetName: 'room.png',
      transition: { type: 'wipe', duration: 240, easing: 'ease-out' },
      video: undefined,
    })
  })

  it('patches a single layered background transition', async () => {
    const engine = createEngine()

    await addBackgroundLayerWithEngine(engine, { id: 'fog', assetName: 'fog.png' })
    await transitionBackgroundLayerWithEngine(engine, 'fog', { type: 'fade', duration: 180 })

    expect(engine.getViewState().background?.layers).toEqual([
      expect.objectContaining({
        id: 'fog',
        transition: { type: 'fade', duration: 180 },
      }),
    ])
  })
})

function createEngine(): QuaEngineInterface {
  let background: ReturnType<QuaEngineInterface['getViewState']>['background']
  return {
    setBackgroundProjection: vi.fn(async (next) => {
      background = next
    }),
    getViewState: vi.fn(() => ({
      background,
      characters: [],
      dialogue: { visible: false, text: '' },
      choices: [],
      ui: { visible: true },
      effects: [],
      audio: {
        volumeSettings: { master: 1, bgm: 1, sound: 1, voice: 1 },
        sounds: [],
        voices: [],
      },
    })),
  } as unknown as QuaEngineInterface
}
