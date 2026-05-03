import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  clearCharacterRuntime,
  configureCharacterRuntime,
  createCharacter,
  hide,
  move,
  speakWithEngine,
  spriteWithEngine,
} from '../src'
import { RenderToLogicEvents } from '@quajs/render-core'

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

  it('fails fast when no engine runtime is configured', async () => {
    await expect(hide('Alice')).rejects.toThrow('Character runtime is not configured')
  })
})

function createEngine() {
  return {
    showDialogue: vi.fn().mockResolvedValue(undefined),
    waitFor: vi.fn().mockResolvedValue(undefined),
    showCharacter: vi.fn().mockResolvedValue(undefined),
    hideCharacter: vi.fn().mockResolvedValue(undefined),
    moveCharacter: vi.fn().mockResolvedValue(undefined),
    setCharacterExpression: vi.fn().mockResolvedValue(undefined),
    setCharacterSprite: vi.fn().mockResolvedValue(undefined),
  }
}
