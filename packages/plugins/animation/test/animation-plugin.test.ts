import type { QuaEngineInterface } from '@quajs/engine'
import type { QuaViewProjection } from '@quajs/render-core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  animationDecoratorMappings,
  AnimationPlugin,
  pauseAnimationWithEngine,
  playAnimationWithEngine,
  playTimelineWithEngine,
  registerAnimationWithEngine,
  resumeAnimationWithEngine,
  seekAnimationWithEngine,
  stopAnimationWithEngine,
  waitAnimationWithEngine,
} from '../src'

describe('@quajs/plugin-animation', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(1000)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('registers APIs and QuaScript decorators', () => {
    const plugin = new AnimationPlugin()
    const registration = plugin.registerAPIs()

    expect(registration.pluginName).toBe('@quajs/plugin-animation')
    expect(registration.apis.map(api => api.name)).toEqual(expect.arrayContaining([
      'registerAnimationWithEngine',
      'playAnimationWithEngine',
      'playTimelineWithEngine',
      'pauseAnimationWithEngine',
      'resumeAnimationWithEngine',
      'stopAnimationWithEngine',
      'seekAnimationWithEngine',
      'waitAnimationWithEngine',
    ]))
    expect(registration.decorators).toEqual(animationDecoratorMappings)
  })

  it('plays named timelines, projects resolved tracks, waits, and commits final values', async () => {
    const engine = createEngine({
      characters: [{
        id: 'Alice',
        name: 'Alice',
        visible: true,
        position: { x: 0 },
      }],
    })

    await registerAnimationWithEngine(engine, {
      id: 'character.enter-left',
      duration: 100,
      tracks: [{
        target: 'actor',
        property: 'position.x',
        keyframes: [
          { at: 0, value: -180 },
          { at: 100, value: 40 },
        ],
      }],
    })

    const played = playAnimationWithEngine(engine, 'character.enter-left', {
      bindings: ['actor=character:Alice'],
      wait: true,
    })

    expect(engine.getViewState().animations).toEqual([
      expect.objectContaining({
        definitionId: 'character.enter-left',
        bindings: { actor: 'character:Alice' },
        resolvedTracks: [
          expect.objectContaining({
            target: 'character:Alice',
            property: 'position.x',
          }),
        ],
      }),
    ])

    await vi.advanceTimersByTimeAsync(100)
    await played

    expect(engine.getViewState().animations).toEqual([])
    expect(engine.getViewState().characters[0].position?.x).toBe(40)
    expect(engine.moveCharacter).toHaveBeenLastCalledWith('Alice', { x: 40 })
  })

  it('supports pause, resume, seek, stop, and wait controls', async () => {
    const engine = createEngine({
      background: { mode: 'image', assetName: 'room.png', x: 0 },
    })

    const playback = await playTimelineWithEngine(engine, {
      duration: 1000,
      tracks: [{
        target: 'background:main',
        property: 'x',
        keyframes: [
          { at: 0, value: 0 },
          { at: 1000, value: 100 },
        ],
      }],
    })

    await vi.advanceTimersByTimeAsync(250)
    await pauseAnimationWithEngine(engine, playback.id)
    expect(engine.getViewState().animations[0].state).toBe('paused')

    await vi.advanceTimersByTimeAsync(1000)
    expect(engine.getViewState().animations).toHaveLength(1)

    await seekAnimationWithEngine(engine, playback.id, 500)
    await resumeAnimationWithEngine(engine, playback.id)
    expect(engine.getViewState().animations[0]).toEqual(expect.objectContaining({
      state: 'running',
      pausedAt: undefined,
    }))

    const wait = waitAnimationWithEngine(engine, playback.id)
    await stopAnimationWithEngine(engine, playback.id)
    await expect(wait).resolves.toBeUndefined()
    expect(engine.getViewState().animations).toEqual([])
  })

  it('warns for missing adapters by default and supports strict adapter mode', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const engine = createEngine()

    await playTimelineWithEngine(engine, {
      duration: 100,
      tracks: [{
        target: 'futureThing:one',
        property: 'x',
        keyframes: [{ at: 0, value: 1 }],
      }],
    })
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('No animation target adapter registered'))
    await stopAnimationWithEngine(engine)

    await expect(playTimelineWithEngine(engine, {
      duration: 100,
      tracks: [{
        target: 'futureThing:two',
        property: 'x',
        keyframes: [{ at: 0, value: 1 }],
      }],
    }, { strictAdapters: true })).rejects.toThrow('No animation target adapter registered')
  })
})

function createEngine(viewPatch: Partial<QuaViewProjection> = {}) {
  const view: QuaViewProjection = {
    background: undefined,
    characters: [],
    dialogue: { visible: false, text: '' },
    choices: [],
    ui: { visible: true, overlays: {} },
    effects: [],
    animations: [],
    audio: {
      volumeSettings: { master: 1, bgm: 1, sound: 1, voice: 1 },
      sounds: [],
      voices: [],
    },
    ...viewPatch,
  }

  const engine = {
    getViewState: vi.fn(() => ({
      ...view,
      characters: view.characters.map(character => ({
        ...character,
        position: character.position ? { ...character.position } : undefined,
      })),
      animations: view.animations.map(animation => ({
        ...animation,
        resolvedTracks: animation.resolvedTracks.map(track => ({
          ...track,
          keyframes: track.keyframes.map(keyframe => ({ ...keyframe })),
        })),
      })),
    })),
    setAnimationProjection: vi.fn(async (animation) => {
      view.animations = [
        ...view.animations.filter(existing => existing.id !== animation.id),
        animation,
      ]
    }),
    removeAnimationProjection: vi.fn(async (id) => {
      view.animations = view.animations.filter(animation => animation.id !== id)
    }),
    clearAnimationProjections: vi.fn(async () => {
      view.animations = []
    }),
    moveCharacter: vi.fn(async (id: string, position: any) => {
      view.characters = view.characters.map(character =>
        character.id === id ? { ...character, position } : character,
      )
    }),
    setCharacterSprite: vi.fn(async (id: string, sprite: string | undefined) => {
      view.characters = view.characters.map(character =>
        character.id === id ? { ...character, sprite } : character,
      )
    }),
    setCharacterExpression: vi.fn(async (id: string, expression: string | undefined) => {
      view.characters = view.characters.map(character =>
        character.id === id ? { ...character, expression } : character,
      )
    }),
    showCharacter: vi.fn(async (character: any) => {
      view.characters = [
        ...view.characters.filter(existing => existing.id !== character.id),
        character,
      ]
    }),
    hideCharacter: vi.fn(async (id: string) => {
      view.characters = view.characters.map(character =>
        character.id === id ? { ...character, visible: false } : character,
      )
    }),
    setBackgroundProjection: vi.fn(async (background) => {
      view.background = background
    }),
    updateUI: vi.fn(async (elementId: string, config: Record<string, unknown>) => {
      view.ui = {
        ...view.ui,
        overlays: {
          ...(view.ui.overlays || {}),
          [elementId]: config,
        },
      }
    }),
    getStore: vi.fn(() => ({
      commit: vi.fn(),
    })),
  } as unknown as QuaEngineInterface & {
    moveCharacter: ReturnType<typeof vi.fn>
    setBackgroundProjection: ReturnType<typeof vi.fn>
  }

  return engine
}
