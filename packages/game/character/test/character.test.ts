import { RenderToLogicEvents } from '@quajs/render-core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  clearCharacterRuntime,
  configureCharacterRuntime,
  createCharacter,
  expressionWithEngine,
  hide,
  hideWithEngine,
  move,
  moveWithEngine,
  setCurrentSprite,
  showWithEngine,
  speakWithEngine,
  spriteWithEngine,
  useCharacter,
} from '../src'

describe('@quajs/character', () => {
  afterEach(() => {
    clearCharacterRuntime()
  })

  it('updates engine-owned dialogue state and waits for user advance', async () => {
    const engine = createEngine()
    await speakWithEngine(engine as any, 'Alice', 'Hello')

    expect(engine.showDialogue).toHaveBeenCalledWith({
      characterId: 'Alice',
      characterName: 'Alice',
      text: 'Hello',
      mode: 'say',
    })
    expect(engine.waitFor).toHaveBeenCalledWith(RenderToLogicEvents.USER_ADVANCE)
  })

  it('routes character show/hide/move/sprite through engine APIs only', async () => {
    const engine = createEngine()
    configureCharacterRuntime({ engine: engine as any, waitForAdvance: false })
    const alice = createCharacter('Alice', {
      sprite: 'alice.png',
      position: { x: 50 },
    })

    await alice.show({ expression: 'happy' })
    await move(alice, { x: 70, y: 80 })
    await hide(alice)
    await spriteWithEngine(engine as any, 'Alice', 'alice-smile.png')

    expect(engine.showCharacter).toHaveBeenCalledWith(expect.objectContaining({
      id: 'Alice',
      name: 'Alice',
      sprite: 'alice.png',
      expression: 'happy',
      visible: true,
    }))
    expect(engine.moveCharacter).toHaveBeenCalledWith('Alice', { x: 70, y: 80 })
    expect(engine.hideCharacter).toHaveBeenCalledWith('Alice')
    expect(engine.setCharacterSprite).toHaveBeenCalledWith('Alice', 'alice-smile.png')
  })

  it('provides engine-injected helpers for all character intents', async () => {
    const engine = createEngine()

    await showWithEngine(engine as any, 'Alice', { sprite: 'alice.png', expression: 'idle', position: { x: 40 } })
    await moveWithEngine(engine as any, 'Alice', { x: 60, y: 20 })
    await expressionWithEngine(engine as any, 'Alice', 'happy')
    await hideWithEngine(engine as any, 'Alice')

    expect(engine.showCharacter).toHaveBeenCalledWith(expect.objectContaining({
      id: 'Alice',
      name: 'Alice',
      sprite: 'alice.png',
      expression: 'idle',
      position: { x: 40 },
      visible: true,
    }))
    expect(engine.moveCharacter).toHaveBeenCalledWith('Alice', { x: 60, y: 20 })
    expect(engine.setCharacterExpression).toHaveBeenCalledWith('Alice', 'happy')
    expect(engine.hideCharacter).toHaveBeenCalledWith('Alice')
  })

  it('creates characters from sprite calls when no character projection exists yet', async () => {
    const engine = createEngine()

    await spriteWithEngine(engine as any, 'Alice', 'alice.png')

    expect(engine.showCharacter).toHaveBeenCalledWith(expect.objectContaining({
      id: 'Alice',
      name: 'Alice',
      sprite: 'alice.png',
      visible: true,
    }))
    expect(engine.setCharacterSprite).not.toHaveBeenCalled()
  })

  it('supports useCharacter helpers and current-dialogue sprite updates', async () => {
    const engine = createEngine({
      dialogue: {
        visible: true,
        characterId: 'Alice',
        characterName: 'Alice',
        text: 'Hello',
        mode: 'say',
      },
    })
    configureCharacterRuntime({ engine: engine as any, waitForAdvance: false })
    const { Alice } = useCharacter('Alice')

    await Alice.speak('Hello')
    await setCurrentSprite('alice-smile.png')

    expect(engine.showDialogue).toHaveBeenCalledWith(expect.objectContaining({
      characterId: 'Alice',
      characterName: 'Alice',
      text: 'Hello',
    }))
    expect(engine.showCharacter).toHaveBeenCalledWith(expect.objectContaining({
      id: 'Alice',
      sprite: 'alice-smile.png',
    }))
  })

  it('fails fast when no engine runtime is configured', async () => {
    await expect(hide('Alice')).rejects.toThrow('Character runtime is not configured')
  })

  it('requires an explicit character for setCurrentSprite when no dialogue character is active', async () => {
    const engine = createEngine()
    configureCharacterRuntime({ engine: engine as any, waitForAdvance: false })

    await expect(setCurrentSprite('alice.png')).rejects.toThrow('setCurrentSprite requires an explicit character')
  })
})

function createEngine(viewPatch: Record<string, unknown> = {}) {
  const view = {
    background: undefined,
    characters: [] as any[],
    dialogue: {
      visible: false,
      text: '',
    },
    choices: [],
    ui: {
      visible: true,
      overlays: {},
    },
    effects: [],
    animations: [],
    plugins: {},
    ...viewPatch,
  }
  const engine = {
    showDialogue: vi.fn().mockResolvedValue(undefined),
    waitFor: vi.fn().mockResolvedValue(undefined),
    showCharacter: vi.fn(async (payload: any) => {
      const index = view.characters.findIndex(character => character.id === payload.id)
      const next = {
        ...(index === -1 ? {} : view.characters[index]),
        ...payload,
        name: payload.name || payload.id,
        visible: payload.visible !== false,
      }
      if (index === -1) {
        view.characters.push(next)
      }
      else {
        view.characters[index] = next
      }
    }),
    hideCharacter: vi.fn(async (id: string) => {
      view.characters = view.characters.map(character =>
        character.id === id ? { ...character, visible: false } : character,
      )
    }),
    moveCharacter: vi.fn(async (id: string, position: any) => {
      view.characters = view.characters.map(character =>
        character.id === id ? { ...character, position } : character,
      )
    }),
    setCharacterExpression: vi.fn(async (id: string, expression: string | undefined) => {
      view.characters = view.characters.map(character =>
        character.id === id ? { ...character, expression } : character,
      )
    }),
    setCharacterSprite: vi.fn(async (id: string, sprite: string | undefined) => {
      view.characters = view.characters.map(character =>
        character.id === id ? { ...character, sprite } : character,
      )
    }),
    getViewState: vi.fn(() => view),
  }

  return engine
}
