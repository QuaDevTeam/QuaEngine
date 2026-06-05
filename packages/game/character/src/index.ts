import type { CharacterIntent, DialogueIntent, QuaEngineInterface } from '@quajs/engine'
import type { RichTextContent, RichTextStyleProjection } from '@quajs/render-core'
import { RenderToLogicEvents, richTextToPlainText } from '@quajs/render-core'

export const CHARACTER_WEB_RENDERER_ENTRY = '@quajs/renderer-web/plugins/character' as const
export const CHARACTER_VUE_RENDERER_ENTRY = '@quajs/renderer-vue/plugins/character' as const
export const CHARACTER_COCOS_RENDERER_ENTRY = '@quajs/renderer-cocos/plugins/character' as const
export const CHARACTER_RENDERER_ENTRY = CHARACTER_WEB_RENDERER_ENTRY

export type CharacterRef = string | QuaCharacter

export interface CharacterSpriteResolution {
  sprite?: string
  expression?: string
}

export interface CharacterProfile {
  id: string
  displayName?: string
  name?: string
  aliases?: readonly string[]
  speaker?: RichTextContent
  speakerStyle?: RichTextStyleProjection
  spriteBase?: string
  spriteManifest?: string
  sprites?: Readonly<Record<string, string | CharacterSpriteResolution>>
  expressions?: Readonly<Record<string, string | CharacterSpriteResolution>>
  sprite?: string
  expression?: string
  position?: CharacterIntent['position']
  layer?: number
  metadata?: Record<string, unknown>
  visible?: boolean
}

export interface CharacterRuntimeOptions {
  engine: QuaEngineInterface
  waitForAdvance?: boolean
}

export interface CharacterOptions {
  id?: string
  name?: string
  displayName?: string
  aliases?: readonly string[]
  speaker?: RichTextContent
  speakerStyle?: RichTextStyleProjection
  spriteBase?: string
  spriteManifest?: string
  sprites?: Readonly<Record<string, string | CharacterSpriteResolution>>
  expressions?: Readonly<Record<string, string | CharacterSpriteResolution>>
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
  characterName?: string
  speaker?: RichTextContent
  speakerStyle?: RichTextStyleProjection
  typewriter?: DialogueIntent['typewriter']
}

export interface CharacterShowOptions extends Omit<CharacterOptions, 'id' | 'name' | 'displayName' | 'aliases'> {}

export interface CharacterStageOptions {
  autoScale?: boolean
  centerX?: number
  y?: number
  spacing?: number
  scale?: number
  scaleByCount?: Readonly<Record<number, number>>
  positions?: readonly CharacterIntent['position'][]
}

let runtime: CharacterRuntimeOptions | undefined
const characterProfiles = new Map<string, CharacterProfile>()

export function configureCharacterRuntime(options: CharacterRuntimeOptions): void {
  runtime = options
}

export function clearCharacterRuntime(): void {
  runtime = undefined
}

export function createCharacter(name: string, options: CharacterOptions = {}): QuaCharacter {
  const profile = normalizeCharacterProfile({
    ...options,
    id: options.id || name,
    displayName: options.displayName || options.name || name,
  })
  if (options.id || options.name || options.displayName || options.aliases || options.speaker || options.speakerStyle || options.spriteBase || options.spriteManifest || options.sprites || options.expressions) {
    registerCharacter(profile)
  }
  return new QuaCharacter(profile.id, profile.displayName || profile.name || profile.id, profile)
}

export function registerCharacter(profile: CharacterProfile): QuaCharacter {
  const normalized = normalizeCharacterProfile(profile)
  characterProfiles.set(normalized.id, normalized)
  return new QuaCharacter(normalized.id, normalized.displayName || normalized.name || normalized.id, normalized)
}

export function registerCharacters(profiles: readonly CharacterProfile[]): QuaCharacter[] {
  return profiles.map(profile => registerCharacter(profile))
}

export function clearCharacterRegistry(): void {
  characterProfiles.clear()
}

export function getCharacterProfiles(): CharacterProfile[] {
  return Array.from(characterProfiles.values()).map(profile => cloneCharacterProfile(profile))
}

export function resolveCharacterRef(character: CharacterRef): QuaCharacter {
  return resolveCharacter(character)
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

  async speak(text: RichTextContent, options: CharacterSpeakOptions = {}): Promise<void> {
    const engine = getEngine()
    const speaker = options.speaker ?? this.defaults.speaker
    const characterName = options.characterName
      ?? (speaker !== undefined ? richTextToPlainText(speaker) : undefined)
      ?? this.defaults.displayName
      ?? this.defaults.name
      ?? this.name
    await engine.showDialogue({
      characterId: this.id,
      characterName,
      speaker,
      speakerStyle: mergeSpeakerStyle(this.defaults.speakerStyle, options.speakerStyle),
      text,
      mode: options.mode || 'say',
      typewriter: options.typewriter,
    })
    if (options.wait ?? runtime?.waitForAdvance ?? true) {
      await engine.waitFor(RenderToLogicEvents.USER_ADVANCE)
    }
  }

  async show(options: CharacterShowOptions = {}): Promise<void> {
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
    const resolved = this.resolveSpriteKey(nextExpression, 'expression')
    if (!hasCharacter(engine, this.id) && this.defaults.sprite) {
      await engine.showCharacter(this.createIntent(resolved, this.defaults.visible !== false))
      return
    }
    if (resolved.sprite !== undefined) {
      await this.sprite(resolved.sprite)
    }
    await engine.setCharacterExpression(this.id, resolved.expression)
  }

  async sprite(nextSprite?: string): Promise<void> {
    const engine = getEngine()
    const resolved = this.resolveSpriteKey(nextSprite, 'sprite')
    if (!hasCharacter(engine, this.id) && nextSprite !== undefined) {
      await engine.showCharacter(this.createIntent(resolved, true))
      return
    }
    if (resolved.expression !== undefined) {
      await engine.setCharacterExpression(this.id, resolved.expression)
    }
    if (resolved.sprite !== undefined || nextSprite === undefined) {
      await engine.setCharacterSprite(this.id, resolved.sprite)
    }
  }

  private createIntent(options: CharacterShowOptions = {}, defaultVisible: boolean): CharacterIntent {
    const resolved = this.resolveSpriteOptions(options)
    return {
      id: this.id,
      name: this.name,
      sprite: resolved.sprite ?? this.defaults.sprite,
      expression: resolved.expression ?? this.defaults.expression,
      position: options.position ?? this.defaults.position,
      layer: options.layer ?? this.defaults.layer,
      metadata: mergeMetadata(this.defaults.metadata, options.metadata),
      visible: options.visible ?? this.defaults.visible ?? defaultVisible,
    }
  }

  private resolveSpriteOptions(options: CharacterShowOptions): CharacterSpriteResolution {
    const sprite = this.resolveSpriteKey(options.sprite, 'sprite')
    const expression = this.resolveSpriteKey(options.expression, 'expression')
    return {
      sprite: sprite.sprite ?? (sprite.expression !== undefined ? undefined : options.sprite),
      expression: expression.expression ?? sprite.expression ?? options.expression,
    }
  }

  private resolveSpriteKey(value: string | undefined, kind: 'sprite' | 'expression'): CharacterSpriteResolution {
    if (value === undefined) {
      return {}
    }
    const profile = getProfileForCharacter(this)
    const map = kind === 'sprite' ? profile?.sprites : profile?.expressions
    const direct = map?.[value]
    if (direct !== undefined) {
      return normalizeSpriteResolution(direct, kind)
    }
    const opposite = kind === 'sprite' ? profile?.expressions?.[value] : profile?.sprites?.[value]
    if (opposite !== undefined) {
      return normalizeSpriteResolution(opposite, kind === 'sprite' ? 'expression' : 'sprite')
    }
    const fallback = resolveSpriteKeyFromProfile(profile, value, kind)
    if (fallback) {
      return fallback
    }
    if (kind === 'sprite') {
      return { sprite: value }
    }
    return { expression: value }
  }
}

export async function speak(character: CharacterRef, text: RichTextContent, options?: CharacterSpeakOptions): Promise<void> {
  await resolveCharacter(character).speak(text, options)
}

export async function speakWithEngine(
  engine: QuaEngineInterface,
  character: CharacterRef,
  text: RichTextContent,
  options?: CharacterSpeakOptions,
): Promise<void> {
  await withEngine(engine, () => speak(character, text, options))
}

export async function show(character: CharacterRef, options?: CharacterShowOptions): Promise<void> {
  await resolveCharacter(character).show(options)
}

export async function showWithEngine(
  engine: QuaEngineInterface,
  character: CharacterRef,
  options?: CharacterShowOptions,
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

export async function stageCharacters(
  characters: readonly CharacterRef[],
  options: CharacterStageOptions = {},
): Promise<void> {
  const engine = getEngine()
  const positions = resolveStageCharacterPositions(engine, characters.length, options)
  await Promise.all(characters.map((character, index) =>
    move(character, positions[index]),
  ))
}

export async function stageCharactersWithEngine(
  engine: QuaEngineInterface,
  characters: readonly CharacterRef[],
  options?: CharacterStageOptions,
): Promise<void> {
  await withEngine(engine, () => stageCharacters(characters, options))
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

export { characterDecoratorMappings, decorators } from './decorators'

function resolveCharacter(character: CharacterRef): QuaCharacter {
  if (typeof character !== 'string') {
    return character
  }
  const byId = characterProfiles.get(character)
  if (byId) {
    return new QuaCharacter(byId.id, byId.displayName || byId.name || byId.id, byId)
  }
  const matches = Array.from(characterProfiles.values()).filter(profile =>
    profile.displayName === character
    || profile.name === character
    || profile.aliases?.includes(character),
  )
  if (matches.length === 1) {
    const profile = matches[0]
    return new QuaCharacter(profile.id, profile.displayName || profile.name || profile.id, profile)
  }
  if (matches.length > 1) {
    const ids = matches.map(profile => profile.id).join(', ')
    throw new Error(`Character reference "${character}" is ambiguous. Use an explicit character id with @Speaker(...) or a QuaCharacter reference. Matching ids: ${ids}.`)
  }
  return createCharacter(character)
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

function resolveStageCharacterPositions(
  engine: QuaEngineInterface,
  count: number,
  options: CharacterStageOptions,
): CharacterIntent['position'][] {
  if (count <= 0) {
    return []
  }
  const layout = engine.getViewState().layout || { width: 1920, height: 1080 }
  const centerX = finiteNumber(options.centerX, layout.width / 2)
  const y = finiteNumber(options.y, Math.round(layout.height * 0.6))
  const spacing = finiteNumber(options.spacing, Math.min(360, layout.width / Math.max(2, count + 1)))
  const startX = centerX - spacing * (count - 1) / 2
  const scale = options.scale ?? (options.autoScale ? resolveStageAutoScale(count, options.scaleByCount) : undefined)
  return Array.from({ length: count }, (_, index) => ({
    x: Math.round(startX + spacing * index),
    y,
    ...(scale === undefined ? {} : { scale }),
    ...(options.positions?.[index] || {}),
  }))
}

function resolveStageAutoScale(count: number, scaleByCount: Readonly<Record<number, number>> | undefined): number {
  const explicit = scaleByCount?.[count]
  if (typeof explicit === 'number' && Number.isFinite(explicit) && explicit > 0) {
    return explicit
  }
  if (count <= 2) {
    return 1
  }
  if (count === 3) {
    return 0.96
  }
  if (count === 4) {
    return 0.9
  }
  return 0.86
}

function finiteNumber(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function normalizeCharacterProfile(profile: CharacterProfile): CharacterProfile {
  const displayName = profile.displayName || profile.name || profile.id
  return {
    ...profile,
    displayName,
    name: displayName,
    sprite: profile.sprite ?? profile.spriteManifest,
  }
}

function cloneCharacterProfile(profile: CharacterProfile): CharacterProfile {
  return {
    ...profile,
    aliases: profile.aliases ? [...profile.aliases] : undefined,
    metadata: profile.metadata ? { ...profile.metadata } : undefined,
  }
}

function getProfileForCharacter(character: QuaCharacter): CharacterProfile | undefined {
  return characterProfiles.get(character.id) || normalizeCharacterProfile({
    ...(character.getDefaults() as CharacterProfile),
    id: character.id,
    displayName: character.name,
  })
}

function normalizeSpriteResolution(
  value: string | CharacterSpriteResolution,
  kind: 'sprite' | 'expression',
): CharacterSpriteResolution {
  if (typeof value !== 'string') {
    return { ...value }
  }
  return kind === 'sprite'
    ? { sprite: value }
    : { expression: value }
}

function resolveSpriteKeyFromProfile(
  profile: CharacterProfile | undefined,
  value: string,
  kind: 'sprite' | 'expression',
): CharacterSpriteResolution | undefined {
  if (!profile || isExplicitSpriteReference(value)) {
    return undefined
  }
  if (kind === 'sprite' && profile.spriteBase) {
    return { sprite: `${profile.spriteBase.replace(/\/+$/, '')}/${value}.png` }
  }
  if (profile.spriteManifest) {
    return { sprite: profile.spriteManifest, expression: value }
  }
  return undefined
}

function isExplicitSpriteReference(value: string): boolean {
  return value.includes('/')
    || value.includes('\\')
    || /^[a-z][a-z0-9+.-]*:/i.test(value)
    || /\.[a-z0-9]+$/i.test(value)
}

function mergeSpeakerStyle(
  defaults?: RichTextStyleProjection,
  next?: RichTextStyleProjection,
): RichTextStyleProjection | undefined {
  if (!defaults && !next) {
    return undefined
  }
  return {
    ...(defaults || {}),
    ...(next || {}),
  }
}
