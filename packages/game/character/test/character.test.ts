import { RenderToLogicEvents } from '@quajs/render-core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  clearCharacterRegistry,
  clearCharacterRuntime,
  configureCharacterRuntime,
  createCharacter,
  expressionWithEngine,
  hide,
  hideWithEngine,
  move,
  moveWithEngine,
  narrateWithEngine,
  registerCharacter,
  registerCharacters,
  setCurrentSprite,
  showWithEngine,
  speakWithEngine,
  spriteWithEngine,
  stageCharactersWithEngine,
  useCharacter,
} from '../src'

describe('@quajs/character', () => {
  afterEach(() => {
    clearCharacterRuntime()
    clearCharacterRegistry()
  })

  it('updates engine-owned dialogue state and waits for user advance', async () => {
    const engine = createEngine()
    await speakWithEngine(engine as any, 'Alice', 'Hello')

    expect(engine.showDialogue).toHaveBeenCalledWith(expect.objectContaining({
      characterId: 'Alice',
      characterName: 'Alice',
      text: 'Hello',
      mode: 'say',
    }))
    expect(engine.waitFor).toHaveBeenCalledWith(RenderToLogicEvents.USER_ADVANCE)
  })

  it('applies optional dialogue avatars from profiles and one-line overrides', async () => {
    const engine = createEngine()
    registerCharacter({
      id: 'lin.child',
      displayName: '林',
      avatar: { type: 'characters', name: 'lin/avatar.png', runtimePackageId: 'runtime.lin' },
    })

    await speakWithEngine(engine as any, 'lin.child', 'One')
    await speakWithEngine(engine as any, 'lin.child', 'Two', { avatar: 'ui/lin-closeup.png' })

    expect(engine.showDialogue).toHaveBeenNthCalledWith(1, expect.objectContaining({
      characterId: 'lin.child',
      avatar: { type: 'characters', name: 'lin/avatar.png', runtimePackageId: 'runtime.lin' },
      text: 'One',
    }))
    expect(engine.showDialogue).toHaveBeenNthCalledWith(2, expect.objectContaining({
      characterId: 'lin.child',
      avatar: { type: 'images', name: 'ui/lin-closeup.png' },
      text: 'Two',
    }))
  })

  it('shows narration without character identity or avatar', async () => {
    const engine = createEngine()

    await narrateWithEngine(engine as any, 'Rain folds over the station roof.')

    const payload = engine.showDialogue.mock.calls[0]?.[0]
    expect(payload).toEqual(expect.objectContaining({
      text: 'Rain folds over the station roof.',
      mode: 'narration',
    }))
    expect(payload).not.toHaveProperty('characterId')
    expect(payload).not.toHaveProperty('characterName')
    expect(payload).not.toHaveProperty('avatar')
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

  it('stages multiple characters by position without auto-scaling by default', async () => {
    const engine = createEngine({
      characters: [
        { id: 'Alice', name: 'Alice', visible: true },
        { id: 'Mara', name: 'Mara', visible: true },
        { id: 'Unit-7', name: 'Unit-7', visible: true },
      ],
    })

    await stageCharactersWithEngine(engine as any, ['Alice', 'Mara', 'Unit-7'], { y: 650, spacing: 340 })

    expect(engine.moveCharacter).toHaveBeenNthCalledWith(1, 'Alice', { x: 620, y: 650 })
    expect(engine.moveCharacter).toHaveBeenNthCalledWith(2, 'Mara', { x: 960, y: 650 })
    expect(engine.moveCharacter).toHaveBeenNthCalledWith(3, 'Unit-7', { x: 1300, y: 650 })

    await stageCharactersWithEngine(engine as any, ['Alice', 'Mara', 'Unit-7'], { y: 650, spacing: 340, autoScale: true })

    expect(engine.moveCharacter).toHaveBeenLastCalledWith('Unit-7', { x: 1300, y: 650, scale: 0.96 })
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

  it('requires explicit ids when display names are ambiguous', async () => {
    const engine = createEngine()
    registerCharacters([
      { id: 'lin.child', displayName: '林', aliases: ['lin'] },
      { id: 'lin.adult', displayName: '林' },
    ])

    await expect(speakWithEngine(engine as any, '林', 'Hello')).rejects.toThrow('ambiguous')
    await speakWithEngine(engine as any, 'lin.child', 'Hello')

    expect(engine.showDialogue).toHaveBeenCalledWith(expect.objectContaining({
      characterId: 'lin.child',
      characterName: '林',
      text: 'Hello',
    }))
  })

  it('applies speaker rich text and style overrides to one dialogue line', async () => {
    const engine = createEngine()
    registerCharacter({ id: 'lin.child', displayName: '林' })
    const speaker = {
      kind: 'rich-text' as const,
      blocks: [{
        id: 'name',
        type: 'line',
        spans: [{ text: '小林', color: '#7cc7ff' }],
      }],
    }

    await speakWithEngine(engine as any, 'lin.child', 'One', {
      speaker,
      speakerStyle: { color: '#7cc7ff', fontSize: 28, fontFamily: 'Qua Serif' },
    })
    await speakWithEngine(engine as any, 'lin.child', 'Two')

    expect(engine.showDialogue).toHaveBeenNthCalledWith(1, expect.objectContaining({
      characterId: 'lin.child',
      characterName: '小林',
      speaker,
      speakerStyle: { color: '#7cc7ff', fontSize: 28, fontFamily: 'Qua Serif' },
      text: 'One',
    }))
    expect(engine.showDialogue).toHaveBeenNthCalledWith(2, expect.objectContaining({
      characterId: 'lin.child',
      characterName: '林',
      speaker: undefined,
      speakerStyle: undefined,
      text: 'Two',
    }))
  })

  it('resolves sprite short keys through registered character metadata', async () => {
    const engine = createEngine()
    registerCharacter({
      id: 'lin.child',
      displayName: '林',
      spriteBase: 'lin',
      sprites: {
        idle: 'lin/base.png',
      },
    })
    registerCharacter({
      id: 'mio',
      displayName: '澪',
      spriteManifest: 'mio/base.png',
    })

    await showWithEngine(engine as any, 'lin.child', { sprite: 'sad' })
    await showWithEngine(engine as any, 'lin.child', { sprite: 'lin/custom.webp' })
    await showWithEngine(engine as any, 'lin.child', { sprite: 'idle' })
    await showWithEngine(engine as any, 'mio', { sprite: 'sad' })

    expect(engine.showCharacter).toHaveBeenNthCalledWith(1, expect.objectContaining({
      id: 'lin.child',
      sprite: 'lin/sad.png',
    }))
    expect(engine.showCharacter).toHaveBeenNthCalledWith(2, expect.objectContaining({
      id: 'lin.child',
      sprite: 'lin/custom.webp',
    }))
    expect(engine.showCharacter).toHaveBeenNthCalledWith(3, expect.objectContaining({
      id: 'lin.child',
      sprite: 'lin/base.png',
    }))
    expect(engine.showCharacter).toHaveBeenNthCalledWith(4, expect.objectContaining({
      id: 'mio',
      sprite: 'mio/base.png',
      expression: 'sad',
    }))
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
