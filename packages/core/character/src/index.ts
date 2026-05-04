import type { CharacterIntent, QuaEngineInterface } from '@quajs/engine'
import { RenderToLogicEvents } from '@quajs/render-core'

export type CharacterRef = string | QuaCharacter

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
  visible?: boolean
}

export interface CharacterSpeakOptions {
  wait?: boolean
  mode?: 'say' | 'narration'
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

export function useCharacter<const T extends readonly string[]>(
  ...names: T
): { [K in T[number]]: QuaCharacter } {
  return Object.fromEntries(
    names.map(name => [name, createCharacter(name)]),
  ) as { [K in T[number]]: QuaCharacter }
}

export class QuaCharacter {
  readonly id: string
  readonly name: string

  constructor(id: string, name: string = id, private defaults: CharacterOptions = {}) {
    this.id = id
    this.name = name
  }

  configure(defaults: CharacterOptions): this {
    const { id: _id, name: _name, ...nextDefaults } = defaults
    this.defaults = {
      ...this.defaults,
      ...nextDefaults,
    }
    return this
  }

  getDefaults(): Readonly<CharacterOptions> {
    return { ...this.defaults }
  }

  async speak(text: string, options: CharacterSpeakOptions = {}): Promise<void> {
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
    await getEngine().showCharacter(this.createIntent(options, true))
  }

  async hide(): Promise<void> {
    await getEngine().hideCharacter(this.id)
  }

  async move(position: CharacterIntent['position']): Promise<void> {
    const engine = getEngine()
    if (!hasCharacter(engine, this.id) && this.defaults.sprite) {
      await engine.showCharacter(this.createIntent({ position }, this.defaults.visible !== false))
      return
    }
    await engine.moveCharacter(this.id, position)
  }

  async expression(nextExpression?: string): Promise<void> {
    const engine = getEngine()
    if (!hasCharacter(engine, this.id) && this.defaults.sprite) {
      await engine.showCharacter(this.createIntent({ expression: nextExpression }, this.defaults.visible !== false))
      return
    }
    await engine.setCharacterExpression(this.id, nextExpression)
  }

  async sprite(nextSprite?: string): Promise<void> {
    const engine = getEngine()
    if (!hasCharacter(engine, this.id) && nextSprite !== undefined) {
      await engine.showCharacter(this.createIntent({ sprite: nextSprite }, true))
      return
    }
    await engine.setCharacterSprite(this.id, nextSprite)
  }

  private createIntent(options: CharacterOptions = {}, defaultVisible: boolean): CharacterIntent {
    return {
      id: this.id,
      name: this.name,
      sprite: options.sprite ?? this.defaults.sprite,
      expression: options.expression ?? this.defaults.expression,
      position: options.position ?? this.defaults.position,
      layer: options.layer ?? this.defaults.layer,
      metadata: mergeMetadata(this.defaults.metadata, options.metadata),
      visible: options.visible ?? this.defaults.visible ?? defaultVisible,
    }
  }
}

export async function speak(character: CharacterRef, text: string, options?: CharacterSpeakOptions): Promise<void> {
  await resolveCharacter(character).speak(text, options)
}

export async function speakWithEngine(
  engine: QuaEngineInterface,
  character: CharacterRef,
  text: string,
  options?: CharacterSpeakOptions,
): Promise<void> {
  await withEngine(engine, () => speak(character, text, options))
}

export async function show(character: CharacterRef, options?: CharacterOptions): Promise<void> {
  await resolveCharacter(character).show(options)
}

export async function showWithEngine(
  engine: QuaEngineInterface,
  character: CharacterRef,
  options?: CharacterOptions,
): Promise<void> {
  await withEngine(engine, () => show(character, options))
}

export async function hide(character: CharacterRef): Promise<void> {
  await resolveCharacter(character).hide()
}

export async function hideWithEngine(engine: QuaEngineInterface, character: CharacterRef): Promise<void> {
  await withEngine(engine, () => hide(character))
}

export async function move(character: CharacterRef, position: CharacterIntent['position']): Promise<void> {
  await resolveCharacter(character).move(position)
}

export async function moveWithEngine(
  engine: QuaEngineInterface,
  character: CharacterRef,
  position: CharacterIntent['position'],
): Promise<void> {
  await withEngine(engine, () => move(character, position))
}

export async function expression(character: CharacterRef, nextExpression?: string): Promise<void> {
  await resolveCharacter(character).expression(nextExpression)
}

export async function expressionWithEngine(
  engine: QuaEngineInterface,
  character: CharacterRef,
  nextExpression?: string,
): Promise<void> {
  await withEngine(engine, () => expression(character, nextExpression))
}

export async function sprite(character: CharacterRef, nextSprite?: string): Promise<void> {
  await resolveCharacter(character).sprite(nextSprite)
}

export async function spriteWithEngine(
  engine: QuaEngineInterface,
  character: CharacterRef,
  nextSprite?: string,
): Promise<void> {
  await withEngine(engine, () => sprite(character, nextSprite))
}

export async function setCurrentSprite(spriteAsset: string, character?: CharacterRef): Promise<void> {
  await sprite(character ?? getCurrentDialogueCharacter(), spriteAsset)
}

function resolveCharacter(character: CharacterRef): QuaCharacter {
  return typeof character === 'string' ? createCharacter(character) : character
}

async function withEngine<T>(engine: QuaEngineInterface, operation: () => Promise<T>): Promise<T> {
  const previous = runtime
  runtime = { engine, waitForAdvance: previous?.waitForAdvance }
  try {
    return await operation()
  }
  finally {
    runtime = previous
  }
}

function getEngine(): QuaEngineInterface {
  if (!runtime) {
    throw new Error('Character runtime is not configured. Call configureCharacterRuntime({ engine }) first.')
  }
  return runtime.engine
}

function getCurrentDialogueCharacter(): CharacterRef {
  const dialogue = getEngine().getViewState().dialogue
  const character = dialogue.characterId || dialogue.characterName
  if (!character) {
    throw new Error('setCurrentSprite requires an explicit character when no current dialogue character is active.')
  }
  return character
}

function hasCharacter(engine: QuaEngineInterface, id: string): boolean {
  return engine.getViewState().characters.some(character => character.id === id)
}

function mergeMetadata(
  defaults?: Record<string, unknown>,
  next?: Record<string, unknown>,
): Record<string, unknown> | undefined {
  if (!defaults && !next)
    return undefined
  return {
    ...(defaults || {}),
    ...(next || {}),
  }
}
