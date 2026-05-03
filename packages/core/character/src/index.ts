import type { CharacterIntent, QuaEngineInterface } from '@quajs/engine'
import { RenderToLogicEvents } from '@quajs/render-core'

export interface CharacterRuntimeOptions {
  engine: QuaEngineInterface
  waitForAdvance?: boolean
}

export interface CharacterOptions {
  id?: string
  name?: string
  sprite?: string
  expression?: string
  position?: CharacterIntent['position']
  layer?: number
  metadata?: Record<string, unknown>
}

let runtime: CharacterRuntimeOptions | undefined

export function configureCharacterRuntime(options: CharacterRuntimeOptions): void {
  runtime = options
}

export function clearCharacterRuntime(): void {
  runtime = undefined
}

export function createCharacter(name: string, options: CharacterOptions = {}): QuaCharacter {
  return new QuaCharacter(options.id || name, options.name || name, options)
}

export class QuaCharacter {
  readonly id: string
  readonly name: string

  constructor(id: string, name: string = id, private defaults: CharacterOptions = {}) {
    this.id = id
    this.name = name
  }

  async speak(text: string, options: { wait?: boolean, mode?: 'say' | 'narration' } = {}): Promise<void> {
    const engine = getEngine()
    await engine.showDialogue({
      characterId: this.id,
      characterName: this.name,
      text,
      mode: options.mode || 'say',
    })
    if (options.wait ?? runtime?.waitForAdvance ?? true) {
      await engine.waitFor(RenderToLogicEvents.USER_ADVANCE)
    }
  }

  async show(options: CharacterOptions = {}): Promise<void> {
    await getEngine().showCharacter({
      id: this.id,
      name: this.name,
      sprite: options.sprite ?? this.defaults.sprite,
      expression: options.expression ?? this.defaults.expression,
      position: options.position ?? this.defaults.position,
      layer: options.layer ?? this.defaults.layer,
      metadata: options.metadata ?? this.defaults.metadata,
      visible: true,
    })
  }

  async hide(): Promise<void> {
    await getEngine().hideCharacter(this.id)
  }

  async move(position: CharacterIntent['position']): Promise<void> {
    await getEngine().moveCharacter(this.id, position)
  }

  async expression(expression?: string): Promise<void> {
    await getEngine().setCharacterExpression(this.id, expression)
  }

  async sprite(sprite?: string): Promise<void> {
    await getEngine().setCharacterSprite(this.id, sprite)
  }
}

export async function speak(character: string | QuaCharacter, text: string): Promise<void> {
  const instance = typeof character === 'string' ? createCharacter(character) : character
  await instance.speak(text)
}

export async function speakWithEngine(engine: QuaEngineInterface, character: string | QuaCharacter, text: string): Promise<void> {
  const previous = runtime
  runtime = { engine, waitForAdvance: previous?.waitForAdvance }
  try {
    await speak(character, text)
  }
  finally {
    runtime = previous
  }
}

export async function show(character: string | QuaCharacter, options?: CharacterOptions): Promise<void> {
  const instance = typeof character === 'string' ? createCharacter(character) : character
  await instance.show(options)
}

export async function hide(character: string | QuaCharacter): Promise<void> {
  const instance = typeof character === 'string' ? createCharacter(character) : character
  await instance.hide()
}

export async function move(character: string | QuaCharacter, position: CharacterIntent['position']): Promise<void> {
  const instance = typeof character === 'string' ? createCharacter(character) : character
  await instance.move(position)
}

export async function expression(character: string | QuaCharacter, nextExpression?: string): Promise<void> {
  const instance = typeof character === 'string' ? createCharacter(character) : character
  await instance.expression(nextExpression)
}

export async function sprite(character: string | QuaCharacter, nextSprite?: string): Promise<void> {
  const instance = typeof character === 'string' ? createCharacter(character) : character
  await instance.sprite(nextSprite)
}

export async function spriteWithEngine(engine: QuaEngineInterface, character: string | QuaCharacter, nextSprite?: string): Promise<void> {
  const previous = runtime
  runtime = { engine, waitForAdvance: previous?.waitForAdvance }
  try {
    await sprite(character, nextSprite)
  }
  finally {
    runtime = previous
  }
}

export async function useSprite(spriteAsset: string, character?: string): Promise<void> {
  if (!character) {
    await getEngine().setCharacterSprite('__current__', spriteAsset)
    return
  }
  await sprite(character, spriteAsset)
}

export const useCharacterSprite = useSprite

function getEngine(): QuaEngineInterface {
  if (!runtime) {
    throw new Error('Character runtime is not configured. Call configureCharacterRuntime({ engine }) first.')
  }
  return runtime.engine
}
