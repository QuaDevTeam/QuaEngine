import type { QuaEngineInterface } from '@quajs/engine'
import type { QuaViewProjection } from '@quajs/render-core'
import { createViewLayoutProjection } from '@quajs/render-core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  enterCharacterFromBottom,
  enterCharacterFromLeft,
  fadeOutCharacter,
  playCharacterEnterWithEngine,
} from '../src/animation'

describe('@quajs/character/animation', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('creates character motion timelines for opacity and position tracks', () => {
    expect(enterCharacterFromLeft({
      target: 'character:Alice',
      duration: 450,
      fromX: -240,
      toX: 480,
      y: 720,
    }).tracks).toEqual([
      expect.objectContaining({ target: 'character:Alice', property: 'position.x' }),
      expect.objectContaining({ target: 'character:Alice', property: 'position.y' }),
      expect.objectContaining({ target: 'character:Alice', property: 'opacity' }),
      expect.objectContaining({ target: 'character:Alice', property: 'visible', interpolation: 'discrete' }),
    ])

    expect(enterCharacterFromBottom({
      target: 'character:Alice',
      y: 760,
      offset: 320,
    }).tracks.find(track => track.property === 'position.y')?.keyframes).toEqual([
      expect.objectContaining({ value: 1080 }),
      expect.objectContaining({ value: 760 }),
    ])

    expect(fadeOutCharacter({ target: 'character:Alice' }).tracks).toEqual([
      expect.objectContaining({ property: 'opacity' }),
      expect.objectContaining({ property: 'visible', interpolation: 'discrete' }),
    ])
  })

  it('plays character presets through animation projections', async () => {
    vi.useFakeTimers()
    const engine = createEngine({
      characters: [{
        id: 'Alice',
        name: 'Alice',
        visible: true,
        position: { x: 0, y: 720 },
        opacity: 1,
      }],
    })

    const pending = playCharacterEnterWithEngine(engine, 'Alice', 'left', {
      duration: 120,
      fromX: -240,
      toX: 480,
      y: 720,
      wait: true,
    })
    await vi.advanceTimersByTimeAsync(0)

    expect(engine.setAnimationProjection).toHaveBeenCalledWith(expect.objectContaining({
      duration: 120,
      resolvedTracks: expect.arrayContaining([
        expect.objectContaining({ target: 'character:Alice', property: 'position.x' }),
        expect.objectContaining({ target: 'character:Alice', property: 'opacity' }),
      ]),
    }))

    await vi.advanceTimersByTimeAsync(120)
    await pending

    expect(engine.moveCharacter).toHaveBeenLastCalledWith('Alice', expect.objectContaining({
      x: 480,
      y: 720,
    }))
    expect(engine.showCharacter).toHaveBeenLastCalledWith(expect.objectContaining({
      id: 'Alice',
      visible: true,
      opacity: 1,
    }))
    expect(engine.getViewState().animations).toEqual([])
  })
})

function createEngine(viewPatch: Partial<QuaViewProjection> = {}) {
  const store = {}
  const view: any = {
    layout: createViewLayoutProjection(),
    background: undefined,
    characters: [],
    dialogue: { visible: false, text: '' },
    choices: [],
    ui: { visible: true, overlays: {} },
    effects: [],
    animations: [],
    plugins: {},
    ...viewPatch,
  }

  return {
    getStore: vi.fn(() => store),
    getViewState: vi.fn(() => view),
    setAnimationProjection: vi.fn(async (animation) => {
      view.animations = [
        ...view.animations.filter(existing => existing.id !== animation.id),
        animation,
      ]
    }),
    removeAnimationProjection: vi.fn(async (id) => {
      view.animations = view.animations.filter(animation => animation.id !== id)
    }),
    moveCharacter: vi.fn(async (id: string, position: any) => {
      view.characters = view.characters.map(character =>
        character.id === id ? { ...character, position } : character,
      )
    }),
    showCharacter: vi.fn(async (character: any) => {
      const index = view.characters.findIndex(existing => existing.id === character.id)
      if (index === -1) {
        view.characters = [...view.characters, character]
        return
      }
      view.characters = view.characters.map(existing =>
        existing.id === character.id ? { ...existing, ...character } : existing,
      )
    }),
    hideCharacter: vi.fn(async (id: string) => {
      view.characters = view.characters.map(character =>
        character.id === id ? { ...character, visible: false } : character,
      )
    }),
    setCharacterSprite: vi.fn(),
    setCharacterExpression: vi.fn(),
  } as unknown as QuaEngineInterface & {
    setAnimationProjection: ReturnType<typeof vi.fn>
    moveCharacter: ReturnType<typeof vi.fn>
    showCharacter: ReturnType<typeof vi.fn>
  }
}
